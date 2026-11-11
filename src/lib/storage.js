/* =========================================================================
   TaskFlow — storage.js
   Single source of truth (DB.state) + safe LocalStorage persistence,
   schema normalisation, unique ids, activity log, import / export.
   ========================================================================= */
import { Bus, Utils, ValidationError } from './utils.js';

export const DB = (() => {
  const PREFIX = 'taskflow:';
  const SCHEMA_VERSION = 1;
  const KEYS = ['tasks', 'categories', 'projects', 'settings', 'activity'];
  const MAX_ACTIVITY = 200;

  const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
  const STATUSES = ['todo', 'in-progress', 'completed', 'cancelled'];
  const RECURRENCES = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
  const REMINDERS = ['', '0', '15', '60', '1440', 'custom'];
  const ACCENTS = ['indigo', 'violet', 'blue', 'emerald', 'rose', 'amber'];
  const DATE_FORMATS = ['MMM D, YYYY', 'D MMM YYYY', 'MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'];
  const VIEWS = ['list', 'board', 'grid', 'calendar'];

  const DEFAULT_SETTINGS = {
    userName: '',
    theme: 'system',            // light | dark | system
    accent: 'indigo',
    density: 'comfortable',     // comfortable | compact
    defaultPriority: 'medium',
    defaultView: 'list',
    weekStart: 1,               // 0 = Sunday, 1 = Monday
    dateFormat: 'MMM D, YYYY',
    timeFormat: '12',           // 12 | 24
    notifications: true,        // browser notifications when permitted
    overdueAlerts: true,
    defaultReminder: '',        // '' | minutes-before-due
    sidebarCollapsed: false,
    lastSeenActivity: 0,
  };

  const DEFAULT_CATEGORIES = [
    { name: 'Work', color: '#6366f1', icon: 'fa-briefcase' },
    { name: 'Personal', color: '#ec4899', icon: 'fa-user' },
    { name: 'Study', color: '#f59e0b', icon: 'fa-graduation-cap' },
    { name: 'Shopping', color: '#10b981', icon: 'fa-cart-shopping' },
    { name: 'Health', color: '#f43f5e', icon: 'fa-heart-pulse' },
    { name: 'Finance', color: '#3b82f6', icon: 'fa-wallet' },
  ];

  const state = { tasks: [], categories: [], projects: [], settings: { ...DEFAULT_SETTINGS }, activity: [] };
  const usedIds = new Set();
  const issues = [];   // human readable notes about recovered / invalid data
  Utils.setSettingsSource(() => state.settings);

  /* ------------------------------------------------------------------ */
  /* Low level LocalStorage access                                       */
  /* ------------------------------------------------------------------ */
  function storageAvailable() {
    try { localStorage.setItem(`${PREFIX}__test`, '1'); localStorage.removeItem(`${PREFIX}__test`); return true; }
    catch (e) { return false; }
  }
  const available = storageAvailable();

  /** Returns undefined when the key is missing, null when the value is corrupt. */
  function read(key) {
    if (!available) return undefined;
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return undefined;
    try { return JSON.parse(raw); }
    catch (e) { issues.push(`Saved ${key} were unreadable and have been reset.`); return null; }
  }

  function write(key) {
    if (!available) return false;
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(state[key]));
      return true;
    } catch (err) {
      Bus.emit('storage:error', err);
      return false;
    }
  }

  function save(...keys) {
    (keys.length ? keys : KEYS).forEach(write);
    if (available) localStorage.setItem(`${PREFIX}version`, String(SCHEMA_VERSION));
  }

  /* ------------------------------------------------------------------ */
  /* Ids                                                                  */
  /* ------------------------------------------------------------------ */
  function newId(prefix = 'id') {
    let id;
    do { id = Utils.uid(prefix); } while (usedIds.has(id));
    usedIds.add(id);
    return id;
  }

  /** Accepts a stored id if valid and unused, otherwise issues a fresh one. */
  function claimId(id, prefix) {
    if (typeof id === 'string' && /^[\w-]{1,80}$/.test(id) && !usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
    return newId(prefix);
  }

  /* ------------------------------------------------------------------ */
  /* Normalisers — turn any untrusted object into a valid record          */
  /* ------------------------------------------------------------------ */
  const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
  const num = (v, min = 0, max = 1e7) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0; };
  const stamp = (v, fallback = null) => { const n = typeof v === 'number' ? v : Date.parse(v); return Number.isFinite(n) && n > 0 ? n : fallback; };
  const isoDate = v => (Utils.parseDate(v) ? v : '');
  const color = (v, fallback = '#6366f1') => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback);
  const icon = (v, fallback = 'fa-folder') => (typeof v === 'string' && /^fa-[a-z0-9-]{1,40}$/.test(v) ? v : fallback);
  const bool = v => v === true;
  const localDateTime = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) && !isNaN(Date.parse(v)) ? v : '');

  function normalizeSubtask(raw, { keepId = false } = {}) {
    if (!raw || typeof raw !== 'object') return null;
    const title = str(raw.title, 200);
    if (!title) return null;
    return { id: keepId && raw.id ? raw.id : claimId(raw.id, 's'), title, done: bool(raw.done) };
  }

  function normalizeAttachment(raw, { keepId = false } = {}) {
    if (!raw || typeof raw !== 'object' || !str(raw.name)) return null;
    const dataUrl = typeof raw.dataUrl === 'string' && raw.dataUrl.startsWith('data:') ? raw.dataUrl : '';
    return {
      id: keepId && raw.id ? raw.id : claimId(raw.id, 'a'), name: str(raw.name, 200), size: num(raw.size, 0, 1e10),
      type: str(raw.type, 100), dataUrl, addedAt: stamp(raw.addedAt, Date.now()),
    };
  }

  /**
   * keepId: true when updating an existing record in place (its id is already claimed).
   */
  function normalizeTask(raw, { keepId = false } = {}) {
    if (!raw || typeof raw !== 'object') return null;
    const title = str(raw.title, 200);
    if (!title) return null;
    const now = Date.now();
    const status = oneOf(raw.status, STATUSES, raw.completed === true ? 'completed' : 'todo');
    const tags = Array.isArray(raw.tags)
      ? [...new Set(raw.tags.map(t => str(String(t), 30).toLowerCase().replace(/^#/, '').replace(/\s+/g, '-')).filter(Boolean))].slice(0, 20)
      : [];
    const subtaskOpts = { keepId };
    return {
      id: keepId ? raw.id : claimId(raw.id, 't'),
      title,
      description: str(raw.description, 5000),
      startDate: isoDate(raw.startDate),
      dueDate: isoDate(raw.dueDate),
      dueTime: Utils.isValidTime(raw.dueTime) ? raw.dueTime : '',
      priority: oneOf(raw.priority, PRIORITIES, 'medium'),
      status,
      categoryId: str(raw.categoryId, 80),
      projectId: str(raw.projectId, 80),
      tags,
      subtasks: Array.isArray(raw.subtasks) ? raw.subtasks.map(s => normalizeSubtask(s, subtaskOpts)).filter(Boolean) : [],
      attachments: Array.isArray(raw.attachments) ? raw.attachments.map(a => normalizeAttachment(a, subtaskOpts)).filter(Boolean) : [],
      reminder: oneOf(String(raw.reminder ?? ''), REMINDERS, ''),
      reminderAt: localDateTime(raw.reminderAt),
      recurring: oneOf(raw.recurring, RECURRENCES, 'none'),
      estimate: Math.round(num(raw.estimate, 0, 100000)),
      timeSpent: Math.round(num(raw.timeSpent, 0, 1000000)),
      timerStartedAt: stamp(raw.timerStartedAt, null),
      important: bool(raw.important),
      pinned: bool(raw.pinned),
      archived: bool(raw.archived),
      deleted: bool(raw.deleted),
      deletedAt: stamp(raw.deletedAt, null),
      completedAt: status === 'completed' ? stamp(raw.completedAt, now) : null,
      createdAt: stamp(raw.createdAt, now),
      updatedAt: stamp(raw.updatedAt, now),
      reminded: bool(raw.reminded),
      overdueNotified: bool(raw.overdueNotified),
      spawnedNext: bool(raw.spawnedNext),
    };
  }

  function normalizeCategory(raw, { keepId = false } = {}) {
    if (!raw || typeof raw !== 'object' || !str(raw.name, 40)) return null;
    return {
      id: keepId ? raw.id : claimId(raw.id, 'c'),
      name: str(raw.name, 40), color: color(raw.color), icon: icon(raw.icon, 'fa-tag'),
      createdAt: stamp(raw.createdAt, Date.now()),
    };
  }

  function normalizeProject(raw, { keepId = false } = {}) {
    if (!raw || typeof raw !== 'object' || !str(raw.name, 40)) return null;
    return {
      id: keepId ? raw.id : claimId(raw.id, 'p'),
      name: str(raw.name, 40), description: str(raw.description, 300),
      color: color(raw.color, '#8b5cf6'), icon: icon(raw.icon, 'fa-folder'),
      createdAt: stamp(raw.createdAt, Date.now()),
    };
  }

  function normalizeActivity(raw) {
    if (!raw || typeof raw !== 'object' || !str(raw.message)) return null;
    return {
      id: claimId(raw.id, 'ev'), type: str(raw.type, 30) || 'info', message: str(raw.message, 300),
      taskId: str(raw.taskId, 80), at: stamp(raw.at, Date.now()),
    };
  }

  function normalizeSettings(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    const d = DEFAULT_SETTINGS;
    return {
      userName: str(s.userName, 40),
      theme: oneOf(s.theme, ['light', 'dark', 'system'], d.theme),
      accent: oneOf(s.accent, ACCENTS, d.accent),
      density: oneOf(s.density, ['comfortable', 'compact'], d.density),
      defaultPriority: oneOf(s.defaultPriority, PRIORITIES, d.defaultPriority),
      defaultView: oneOf(s.defaultView, VIEWS, d.defaultView),
      weekStart: [0, 1].includes(Number(s.weekStart)) ? Number(s.weekStart) : d.weekStart,
      dateFormat: oneOf(s.dateFormat, DATE_FORMATS, d.dateFormat),
      timeFormat: oneOf(String(s.timeFormat), ['12', '24'], d.timeFormat),
      notifications: typeof s.notifications === 'boolean' ? s.notifications : d.notifications,
      overdueAlerts: typeof s.overdueAlerts === 'boolean' ? s.overdueAlerts : d.overdueAlerts,
      defaultReminder: oneOf(String(s.defaultReminder ?? ''), ['', '0', '15', '60', '1440'], d.defaultReminder),
      sidebarCollapsed: bool(s.sidebarCollapsed),
      lastSeenActivity: stamp(s.lastSeenActivity, 0) || 0,
    };
  }

  const listOf = (value, normalizer) => (Array.isArray(value) ? value.map(v => normalizer(v)).filter(Boolean) : []);

  /** Drops references to categories / projects that no longer exist. */
  function repairReferences() {
    const cats = new Set(state.categories.map(c => c.id));
    const projs = new Set(state.projects.map(p => p.id));
    state.tasks.forEach(t => {
      if (t.categoryId && !cats.has(t.categoryId)) t.categoryId = '';
      if (t.projectId && !projs.has(t.projectId)) t.projectId = '';
    });
  }

  function defaultCategories() { return DEFAULT_CATEGORIES.map(c => normalizeCategory(c)); }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                            */
  /* ------------------------------------------------------------------ */
  function init() {
    usedIds.clear();
    if (!available) issues.push('Browser storage is unavailable — changes will not be saved after closing this tab.');

    const rawCategories = read('categories');
    state.categories = rawCategories === undefined ? defaultCategories() : listOf(rawCategories, normalizeCategory);
    state.projects = listOf(read('projects'), normalizeProject);
    const rawTasks = read('tasks');
    state.tasks = listOf(rawTasks, normalizeTask);
    if (Array.isArray(rawTasks) && rawTasks.length !== state.tasks.length) {
      issues.push(`${rawTasks.length - state.tasks.length} invalid task record(s) were skipped.`);
    }
    state.settings = normalizeSettings(read('settings'));
    state.activity = listOf(read('activity'), normalizeActivity).slice(0, MAX_ACTIVITY);
    repairReferences();
    save();   // persist the cleaned data (also writes defaults on first run)
  }

  function logActivity(type, message, taskId = '') {
    state.activity.unshift({ id: newId('ev'), type, message, taskId, at: Date.now() });
    if (state.activity.length > MAX_ACTIVITY) state.activity.length = MAX_ACTIVITY;
    write('activity');
    Bus.emit('activity:changed');
  }

  function updateSettings(patch) {
    state.settings = normalizeSettings({ ...state.settings, ...patch });
    write('settings');
    Bus.emit('settings:changed', patch);
  }

  /* ------------------------------------------------------------------ */
  /* Import / export                                                      */
  /* ------------------------------------------------------------------ */
  function exportData() {
    return JSON.stringify({
      app: 'TaskFlow', version: SCHEMA_VERSION, exportedAt: new Date().toISOString(),
      tasks: state.tasks, categories: state.categories, projects: state.projects,
      settings: state.settings, activity: state.activity,
    }, null, 2);
  }

  function importData(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('The file is not valid JSON.'); }
    if (!data || typeof data !== 'object' || !Array.isArray(data.tasks)) {
      throw new Error('This file does not look like a TaskFlow export (missing "tasks").');
    }
    usedIds.clear();
    const categories = Array.isArray(data.categories) ? listOf(data.categories, normalizeCategory) : defaultCategories();
    const projects = listOf(data.projects, normalizeProject);
    const tasks = listOf(data.tasks, normalizeTask);
    state.categories = categories;
    state.projects = projects;
    state.tasks = tasks;
    state.settings = normalizeSettings({ ...state.settings, ...(data.settings || {}) });
    state.activity = listOf(data.activity, normalizeActivity).slice(0, MAX_ACTIVITY);
    repairReferences();
    save();
    logActivity('import', `Imported ${Utils.plural(tasks.length, 'task')} from backup`);
    return { tasks: tasks.length, skipped: data.tasks.length - tasks.length, categories: categories.length, projects: projects.length };
  }

  function clearAll() {
    if (available) KEYS.forEach(k => localStorage.removeItem(PREFIX + k));
    usedIds.clear();
    state.tasks = [];
    state.projects = [];
    state.activity = [];
    state.categories = defaultCategories();
    state.settings = normalizeSettings({ theme: state.settings.theme, accent: state.settings.accent });
    save();
  }

  /* ------------------------------------------------------------------ */
  /* Generic named collection (used by Categories and Projects)           */
  /* ------------------------------------------------------------------ */
  function createCollection({ key, label, taskField, normalize }) {
    const list = () => state[key];
    const get = id => (id ? list().find(item => item.id === id) || null : null);

    function validate(data, id = null) {
      const errors = {};
      const name = str(data.name, 100);
      if (!name) errors.name = `${label} name is required.`;
      else if (name.length > 40) errors.name = `${label} name must be 40 characters or fewer.`;
      else if (list().some(item => item.id !== id && item.name.toLowerCase() === name.toLowerCase())) {
        errors.name = `A ${label.toLowerCase()} named “${name}” already exists.`;
      }
      return errors;
    }

    function create(data) {
      const errors = validate(data);
      if (Object.keys(errors).length) throw new ValidationError(errors);
      const item = normalize({ ...data, id: null, createdAt: Date.now() });
      list().push(item);
      write(key);
      logActivity(key, `Created ${label.toLowerCase()} “${item.name}”`);
      Bus.emit('data:changed');
      return item;
    }

    function update(id, patch) {
      const item = get(id);
      if (!item) return null;
      const errors = validate({ ...item, ...patch }, id);
      if (Object.keys(errors).length) throw new ValidationError(errors);
      Object.assign(item, normalize({ ...item, ...patch }, { keepId: true }));
      write(key);
      logActivity(key, `Updated ${label.toLowerCase()} “${item.name}”`);
      Bus.emit('data:changed');
      return item;
    }

    function remove(id) {
      const index = list().findIndex(item => item.id === id);
      if (index < 0) return false;
      const [item] = list().splice(index, 1);
      state.tasks.forEach(t => { if (t[taskField] === id) t[taskField] = ''; });
      save(key, 'tasks');
      logActivity(key, `Deleted ${label.toLowerCase()} “${item.name}”`);
      Bus.emit('data:changed');
      return true;
    }

    /** Count of active (non archived / deleted) tasks linked to the item. */
    function taskCount(id, { openOnly = true } = {}) {
      return state.tasks.filter(t => t[taskField] === id && !t.deleted && !t.archived
        && (!openOnly || (t.status !== 'completed' && t.status !== 'cancelled'))).length;
    }

    return { list, get, validate, create, update, remove, taskCount };
  }

  return {
    state, issues, available, PRIORITIES, STATUSES, RECURRENCES, ACCENTS, DATE_FORMATS, VIEWS, DEFAULT_SETTINGS,
    init, save, newId, normalizeTask, normalizeSubtask, normalizeAttachment, normalizeCategory, normalizeProject,
    logActivity, updateSettings, exportData, importData, clearAll, createCollection,
  };
})();
