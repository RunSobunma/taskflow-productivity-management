/* =========================================================================
   TaskFlow — tasks.js
   Task domain logic: CRUD, lifecycle, subtasks, timers, recurrence,
   querying (scopes + filters + sorting) and CSV export.
   ========================================================================= */
'use strict';

const Tasks = (() => {
  const PRIORITY = {
    low: { label: 'Low', rank: 1, icon: 'fa-arrow-down' },
    medium: { label: 'Medium', rank: 2, icon: 'fa-minus' },
    high: { label: 'High', rank: 3, icon: 'fa-arrow-up' },
    urgent: { label: 'Urgent', rank: 4, icon: 'fa-fire' },
  };
  const STATUS = {
    'todo': { label: 'To Do', icon: 'fa-regular fa-circle' },
    'in-progress': { label: 'In Progress', icon: 'fa-solid fa-circle-half-stroke' },
    'completed': { label: 'Completed', icon: 'fa-solid fa-circle-check' },
    'cancelled': { label: 'Cancelled', icon: 'fa-solid fa-ban' },
  };
  const RECURRENCE = { none: 'Does not repeat', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
  const REMINDER = { '': 'No reminder', '0': 'At due time', '15': '15 minutes before', '60': '1 hour before', '1440': '1 day before', 'custom': 'Custom date & time' };

  const all = () => DB.state.tasks;
  const get = id => all().find(t => t.id === id) || null;
  const today = () => Utils.todayISO();

  /* ---------------- State predicates ---------------- */
  const isActive = t => !t.deleted && !t.archived;
  const isDone = t => t.status === 'completed';
  const isClosed = t => t.status === 'completed' || t.status === 'cancelled';

  function dueDateTime(t) {
    const d = Utils.parseDate(t.dueDate);
    if (!d) return null;
    if (t.dueTime) { const [h, m] = t.dueTime.split(':').map(Number); d.setHours(h, m, 0, 0); }
    else d.setHours(23, 59, 59, 999);
    return d;
  }

  function isOverdue(t) {
    if (!t.dueDate || isClosed(t) || !isActive(t)) return false;
    return dueDateTime(t) < new Date();
  }

  /** When the reminder for a task should fire, or null. */
  function reminderTime(t) {
    if (t.reminder === 'custom') return t.reminderAt ? new Date(t.reminderAt) : null;
    if (t.reminder === '' || !t.dueDate) return null;
    const base = Utils.parseDate(t.dueDate);
    const [h, m] = (t.dueTime || '09:00').split(':').map(Number);
    base.setHours(h, m, 0, 0);
    return new Date(base.getTime() - Number(t.reminder) * 60000);
  }

  function progress(t) {
    const total = t.subtasks.length;
    const done = t.subtasks.filter(s => s.done).length;
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  /** Total minutes spent including a running timer. */
  const elapsed = t => t.timeSpent + (t.timerStartedAt ? Math.floor((Date.now() - t.timerStartedAt) / 60000) : 0);

  /* ---------------- Persistence helper ---------------- */
  function commit(activity, task) {
    DB.save('tasks');
    if (activity) DB.logActivity(activity.type, activity.message, task ? task.id : '');
    Bus.emit('data:changed');
  }

  /* ---------------- Validation ---------------- */
  function validate(data) {
    const errors = {};
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    if (!title) errors.title = 'Please enter a task title.';
    else if (title.length > 200) errors.title = 'Title must be 200 characters or fewer.';
    if (data.description && data.description.length > 5000) errors.description = 'Description is too long (5000 max).';
    if (data.dueDate && !Utils.parseDate(data.dueDate)) errors.dueDate = 'Enter a valid due date.';
    if (data.startDate && !Utils.parseDate(data.startDate)) errors.startDate = 'Enter a valid start date.';
    if (data.startDate && data.dueDate && data.startDate > data.dueDate) errors.startDate = 'Start date must be on or before the due date.';
    if (data.dueTime && !data.dueDate) errors.dueTime = 'Set a due date to use a due time.';
    if (data.dueTime && !Utils.isValidTime(data.dueTime)) errors.dueTime = 'Enter a valid time.';
    if (data.reminder === 'custom' && !data.reminderAt) errors.reminderAt = 'Pick a date and time for the reminder.';
    if (data.reminder && data.reminder !== 'custom' && !data.dueDate) errors.reminder = 'Relative reminders need a due date.';
    if (data.recurring && data.recurring !== 'none' && !data.dueDate) errors.recurring = 'Recurring tasks need a due date.';
    ['estimate', 'timeSpent'].forEach(k => {
      const v = Number(data[k] || 0);
      if (!Number.isFinite(v) || v < 0) errors[k] = 'Enter a positive number of minutes.';
    });
    if (data.categoryId && !Categories.get(data.categoryId)) errors.categoryId = 'Selected category no longer exists.';
    if (data.projectId && !Projects.get(data.projectId)) errors.projectId = 'Selected project no longer exists.';
    return errors;
  }

  function assertValid(data) {
    const errors = validate(data);
    if (Object.keys(errors).length) throw new ValidationError(errors);
  }

  /* ---------------- CRUD ---------------- */
  function create(data) {
    const settings = DB.state.settings;
    const draft = { priority: settings.defaultPriority, ...data };
    if (draft.reminder === undefined && draft.dueDate) draft.reminder = settings.defaultReminder;
    assertValid(draft);
    const now = Date.now();
    const task = DB.normalizeTask({ ...draft, id: null, createdAt: now, updatedAt: now });
    all().unshift(task);
    commit({ type: 'created', message: `Created “${task.title}”` }, task);
    return task;
  }

  /**
   * Apply a patch. `activity` overrides the logged event; pass false for none.
   */
  function update(id, patch, { activity } = {}) {
    const task = get(id);
    if (!task) return null;
    const merged = { ...task, ...patch };
    assertValid(merged);
    const wasDone = isDone(task);
    const next = DB.normalizeTask({ ...merged, updatedAt: Date.now() }, { keepId: true });

    if (!wasDone && next.status === 'completed') next.completedAt = Date.now();
    if (next.status !== 'completed') next.completedAt = null;
    if (['dueDate', 'dueTime', 'reminder', 'reminderAt'].some(k => k in patch && patch[k] !== task[k])) {
      next.reminded = false;
      next.overdueNotified = false;
    }
    if (next.status === 'completed' && next.timerStartedAt) {   // stop timer on completion
      next.timeSpent = elapsed(next);
      next.timerStartedAt = null;
    }
    Object.assign(task, next);

    let log = activity;
    if (log === undefined) {
      if (!wasDone && isDone(task)) log = { type: 'completed', message: `Completed “${task.title}”` };
      else if (wasDone && !isDone(task)) log = { type: 'reopened', message: `Reopened “${task.title}”` };
      else log = { type: 'updated', message: `Updated “${task.title}”` };
    }
    if (!wasDone && isDone(task)) spawnRecurrence(task);
    commit(log || null, task);
    return task;
  }

  const setStatus = (id, status) => update(id, { status });
  function toggleComplete(id) {
    const t = get(id);
    return t ? setStatus(id, isDone(t) ? 'todo' : 'completed') : null;
  }

  function cloneForCopy(t, overrides) {
    return DB.normalizeTask({
      ...t,
      id: null,
      subtasks: t.subtasks.map(s => ({ ...s, id: null })),
      attachments: t.attachments.map(a => ({ ...a, id: null })),
      timerStartedAt: null, reminded: false, overdueNotified: false, spawnedNext: false,
      createdAt: Date.now(), updatedAt: Date.now(),
      ...overrides,
    });
  }

  function duplicate(id) {
    const t = get(id);
    if (!t) return null;
    const copy = cloneForCopy(t, { title: `${t.title} (copy)`.slice(0, 200), deleted: false, archived: false, pinned: false });
    all().splice(all().indexOf(t), 0, copy);
    commit({ type: 'created', message: `Duplicated “${t.title}”` }, copy);
    return copy;
  }

  function advance(iso, rule) {
    const d = Utils.parseDate(iso);
    if (!d) return '';
    const next = {
      daily: () => Utils.addDays(d, 1), weekly: () => Utils.addDays(d, 7),
      monthly: () => Utils.addMonths(d, 1), yearly: () => Utils.addMonths(d, 12),
    }[rule]();
    return Utils.toISODate(next);
  }

  /** When a recurring task is completed, schedule its next occurrence once. */
  function spawnRecurrence(t) {
    if (t.recurring === 'none' || t.spawnedNext || !t.dueDate) return null;
    const shiftCustomReminder = () => {
      if (t.reminder !== 'custom' || !t.reminderAt) return '';
      const [date, time] = t.reminderAt.split('T');
      return `${advance(date, t.recurring)}T${time}`;
    };
    const next = cloneForCopy(t, {
      status: 'todo', completedAt: null, timeSpent: 0, pinned: t.pinned,
      dueDate: advance(t.dueDate, t.recurring),
      startDate: t.startDate ? advance(t.startDate, t.recurring) : '',
      reminderAt: shiftCustomReminder(),
      subtasks: t.subtasks.map(s => ({ ...s, id: null, done: false })),
    });
    t.spawnedNext = true;
    all().unshift(next);
    DB.logActivity('recurring', `Scheduled next “${t.title}” for ${Utils.formatDate(next.dueDate)}`, next.id);
    return next;
  }

  function flag(id, field, value, message) {
    const t = get(id);
    if (!t) return null;
    t[field] = value;
    t.updatedAt = Date.now();
    commit(message ? { type: field, message } : null, t);
    return t;
  }

  const toggleImportant = id => { const t = get(id); return t && flag(id, 'important', !t.important, `${t.important ? 'Unstarred' : 'Starred'} “${t.title}”`); };
  const togglePin = id => { const t = get(id); return t && flag(id, 'pinned', !t.pinned, null); };
  const archive = id => { const t = get(id); return t && flag(id, 'archived', true, `Archived “${t.title}”`); };
  const unarchive = id => { const t = get(id); return t && flag(id, 'archived', false, `Restored “${t.title}” from archive`); };

  function trash(id) {
    const t = get(id);
    if (!t) return null;
    if (t.timerStartedAt) { t.timeSpent = elapsed(t); t.timerStartedAt = null; }
    t.deleted = true;
    t.deletedAt = Date.now();
    t.pinned = false;
    commit({ type: 'trashed', message: `Moved “${t.title}” to Trash` }, t);
    return t;
  }

  function restore(id) {
    const t = get(id);
    if (!t) return null;
    t.deleted = false;
    t.deletedAt = null;
    t.updatedAt = Date.now();
    commit({ type: 'restored', message: `Restored “${t.title}”` }, t);
    return t;
  }

  function destroy(id) {
    const index = all().findIndex(t => t.id === id);
    if (index < 0) return false;
    const [t] = all().splice(index, 1);
    commit({ type: 'deleted', message: `Permanently deleted “${t.title}”` });
    return true;
  }

  function emptyTrash() {
    const count = all().filter(t => t.deleted).length;
    DB.state.tasks = all().filter(t => !t.deleted);
    commit(count ? { type: 'deleted', message: `Emptied Trash (${Utils.plural(count, 'task')})` } : null);
    return count;
  }

  /* ---------------- Time tracking ---------------- */
  function startTimer(id) {
    all().forEach(t => { if (t.timerStartedAt && t.id !== id) { t.timeSpent = elapsed(t); t.timerStartedAt = null; } });
    const t = get(id);
    if (!t || t.timerStartedAt) return t;
    t.timerStartedAt = Date.now();
    if (t.status === 'todo') t.status = 'in-progress';
    t.updatedAt = Date.now();
    commit({ type: 'timer', message: `Started timer on “${t.title}”` }, t);
    return t;
  }

  function stopTimer(id) {
    const t = get(id);
    if (!t || !t.timerStartedAt) return t;
    const minutes = Math.max(1, Math.round((Date.now() - t.timerStartedAt) / 60000));
    t.timeSpent += minutes;
    t.timerStartedAt = null;
    t.updatedAt = Date.now();
    commit({ type: 'timer', message: `Logged ${Utils.formatMinutes(minutes)} on “${t.title}”` }, t);
    return t;
  }

  /* ---------------- Subtasks ---------------- */
  function editSubtasks(taskId, mutate) {
    const t = get(taskId);
    if (!t) return null;
    mutate(t);
    t.updatedAt = Date.now();
    commit(null, t);
    return t;
  }

  function addSubtask(taskId, title) {
    const clean = String(title || '').trim();
    if (!clean) throw new ValidationError({ subtask: 'Subtask cannot be empty.' });
    if (clean.length > 200) throw new ValidationError({ subtask: 'Subtask must be 200 characters or fewer.' });
    return editSubtasks(taskId, t => t.subtasks.push({ id: DB.newId('s'), title: clean, done: false }));
  }

  const toggleSubtask = (taskId, subId) => editSubtasks(taskId, t => {
    const s = t.subtasks.find(x => x.id === subId);
    if (s) s.done = !s.done;
  });

  function updateSubtask(taskId, subId, title) {
    const clean = String(title || '').trim();
    if (!clean) throw new ValidationError({ subtask: 'Subtask cannot be empty.' });
    return editSubtasks(taskId, t => {
      const s = t.subtasks.find(x => x.id === subId);
      if (s) s.title = clean.slice(0, 200);
    });
  }

  const deleteSubtask = (taskId, subId) => editSubtasks(taskId, t => { t.subtasks = t.subtasks.filter(s => s.id !== subId); });

  /* ---------------- Querying ---------------- */
  const SCOPES = {
    tasks: t => isActive(t),
    inbox: t => isActive(t) && !t.categoryId && !t.projectId && !isClosed(t),
    today: t => isActive(t) && !!t.dueDate && (t.dueDate === today() || (t.dueDate < today() && !isClosed(t))),
    upcoming: t => isActive(t) && !isClosed(t) && !!t.dueDate && t.dueDate > today(),
    important: t => isActive(t) && t.important,
    completed: t => isActive(t) && isDone(t),
    archived: t => !t.deleted && t.archived,
    trash: t => t.deleted,
    calendar: t => isActive(t),
  };

  function scopeFilter(scope) {
    const [kind, id] = String(scope).split(':');
    if (kind === 'category') return t => isActive(t) && t.categoryId === id;
    if (kind === 'project') return t => isActive(t) && t.projectId === id;
    return SCOPES[kind] || SCOPES.tasks;
  }

  function matchesDue(t, due) {
    if (!due) return true;
    if (due === 'nodate') return !t.dueDate;
    if (due === 'overdue') return isOverdue(t);
    if (!t.dueDate) return false;
    const now = new Date();
    if (due === 'today') return t.dueDate === today();
    if (due === 'tomorrow') return t.dueDate === Utils.toISODate(Utils.addDays(now, 1));
    if (due === 'week') {
      const start = Utils.startOfWeek(now);
      return t.dueDate >= Utils.toISODate(start) && t.dueDate <= Utils.toISODate(Utils.addDays(start, 6));
    }
    if (due === 'next7') return t.dueDate >= today() && t.dueDate <= Utils.toISODate(Utils.addDays(now, 7));
    if (due === 'month') return t.dueDate.slice(0, 7) === today().slice(0, 7);
    return true;
  }

  function searchText(t) {
    const cat = Categories.get(t.categoryId);
    const proj = Projects.get(t.projectId);
    return [t.title, t.description, cat && cat.name, proj && proj.name, ...t.tags, ...t.tags.map(x => `#${x}`)]
      .filter(Boolean).join(' ').toLowerCase();
  }

  function matchesFilters(t, f = {}) {
    if (f.search) {
      const text = searchText(t);
      const terms = f.search.toLowerCase().trim().split(/\s+/).filter(Boolean);
      if (!terms.every(term => text.includes(term))) return false;
    }
    if (f.priority && t.priority !== f.priority) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.category === '__none' ? !!t.categoryId : f.category && t.categoryId !== f.category) return false;
    if (f.project === '__none' ? !!t.projectId : f.project && t.projectId !== f.project) return false;
    if (f.completion === 'pending' && isClosed(t)) return false;
    if (f.completion === 'completed' && !isDone(t)) return false;
    if (f.important && !t.important) return false;
    if (f.overdue && !isOverdue(t)) return false;
    return matchesDue(t, f.due);
  }

  const dueValue = t => (t.dueDate ? dueDateTime(t).getTime() : Number.MAX_SAFE_INTEGER);
  const SORTS = {
    newest: (a, b) => b.createdAt - a.createdAt,
    oldest: (a, b) => a.createdAt - b.createdAt,
    due: (a, b) => dueValue(a) - dueValue(b) || PRIORITY[b.priority].rank - PRIORITY[a.priority].rank,
    priority: (a, b) => PRIORITY[b.priority].rank - PRIORITY[a.priority].rank || dueValue(a) - dueValue(b),
    alpha: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }),
    updated: (a, b) => b.updatedAt - a.updatedAt,
  };
  const SORT_LABELS = { newest: 'Newest first', oldest: 'Oldest first', due: 'Due date', priority: 'Priority', alpha: 'Alphabetical', updated: 'Recently updated' };

  /** Scope + filters + sort; pinned tasks always float to the top. */
  function query(scope = 'tasks', filters = {}, sort = 'newest') {
    const compare = SORTS[sort] || SORTS.newest;
    return all()
      .filter(scopeFilter(scope))
      .filter(t => matchesFilters(t, filters))
      .sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || compare(a, b));
  }

  /** Badge counts for the sidebar (open tasks unless noted). */
  function counts() {
    const open = t => !isClosed(t);
    const n = (scope, extra = () => true) => all().filter(scopeFilter(scope)).filter(extra).length;
    return {
      tasks: n('tasks', open), inbox: n('inbox'), today: n('today', open), upcoming: n('upcoming'),
      important: n('important', open), completed: n('completed'), archived: n('archived'), trash: n('trash'),
      overdue: all().filter(isOverdue).length,
    };
  }

  /* ---------------- CSV ---------------- */
  function toCSV(list = all().filter(t => !t.deleted)) {
    const cell = v => {
      const s = String(v == null ? '' : v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['ID', 'Title', 'Description', 'Status', 'Priority', 'Category', 'Project', 'Tags', 'Start Date', 'Due Date', 'Due Time',
      'Recurring', 'Subtasks Done', 'Subtasks Total', 'Estimate (min)', 'Time Spent (min)', 'Important', 'Pinned', 'Archived', 'Created', 'Updated', 'Completed'];
    const iso = ts => (ts ? new Date(ts).toISOString() : '');
    const rows = list.map(t => {
      const p = progress(t);
      return [t.id, t.title, t.description, STATUS[t.status].label, PRIORITY[t.priority].label,
        (Categories.get(t.categoryId) || {}).name || '', (Projects.get(t.projectId) || {}).name || '', t.tags.join('; '),
        t.startDate, t.dueDate, t.dueTime, t.recurring, p.done, p.total, t.estimate, elapsed(t),
        t.important ? 'Yes' : 'No', t.pinned ? 'Yes' : 'No', t.archived ? 'Yes' : 'No',
        iso(t.createdAt), iso(t.updatedAt), iso(t.completedAt)].map(cell).join(',');
    });
    return '﻿' + [header.join(','), ...rows].join('\r\n');
  }

  /* ---------------- Getting-started content ---------------- */
  /** Creates a small, editable starter workspace (real tasks, not mock-ups). */
  function createStarterTasks() {
    const d = n => Utils.toISODate(Utils.addDays(new Date(), n));
    const cat = name => (Categories.list().find(c => c.name === name) || {}).id || '';
    let project = Projects.list().find(p => p.name === 'Website Launch');
    if (!project) project = Projects.create({ name: 'Website Launch', description: 'Ship the new marketing site', color: '#8b5cf6', icon: 'fa-rocket' });
    const items = [
      { title: 'Prepare quarterly report', description: 'Summarise Q4 results and key metrics for the leadership meeting.', priority: 'high', status: 'in-progress', dueDate: d(0), dueTime: '16:00', categoryId: cat('Work'), tags: ['report', 'q4'], important: true, estimate: 120,
        subtasks: [{ title: 'Collect sales numbers', done: true }, { title: 'Draft summary', done: true }, { title: 'Create charts' }, { title: 'Review with team' }] },
      { title: 'Design homepage hero section', priority: 'urgent', dueDate: d(1), categoryId: cat('Work'), projectId: project.id, tags: ['design'], estimate: 180 },
      { title: 'Write launch announcement', priority: 'medium', dueDate: d(4), projectId: project.id, categoryId: cat('Work'), tags: ['copy'] },
      { title: 'Grocery run', priority: 'low', dueDate: d(0), categoryId: cat('Shopping'), subtasks: [{ title: 'Milk' }, { title: 'Eggs' }, { title: 'Coffee beans' }] },
      { title: 'Morning workout', priority: 'medium', dueDate: d(1), dueTime: '07:00', categoryId: cat('Health'), recurring: 'daily', tags: ['habit'] },
      { title: 'Pay credit card bill', priority: 'high', dueDate: d(-1), categoryId: cat('Finance'), important: true },
      { title: 'Read chapter 5 of “Deep Work”', priority: 'low', dueDate: d(3), categoryId: cat('Study'), tags: ['reading'] },
      { title: 'Plan weekend trip', description: 'Look at train times and book a place to stay.', priority: 'medium', categoryId: cat('Personal') },
    ];
    items.forEach(item => create(item));
    return items.length;
  }

  return {
    PRIORITY, STATUS, RECURRENCE, REMINDER, SORT_LABELS, all, get, isActive, isDone, isClosed, isOverdue, dueDateTime,
    reminderTime, progress, elapsed, validate, create, update, setStatus, toggleComplete, duplicate, archive, unarchive,
    trash, restore, destroy, emptyTrash, toggleImportant, togglePin, startTimer, stopTimer, addSubtask, toggleSubtask,
    updateSubtask, deleteSubtask, matchesFilters, query, counts, toCSV, createStarterTasks,
  };
})();
