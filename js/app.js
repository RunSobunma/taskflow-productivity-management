/* =========================================================================
   TaskFlow — app.js
   Application controller: routing, page rendering, global event delegation,
   keyboard shortcuts, drag & drop, reminders and settings.
   ========================================================================= */
'use strict';

const App = (() => {
  const { $, $$ } = UI;
  const settings = () => DB.state.settings;
  const emptyFilters = () => ({ search: '', priority: '', status: '', category: '', project: '', due: '', completion: '', important: false, overdue: false });

  const ui = {
    route: { name: 'dashboard', id: '' },
    view: 'list',
    sort: 'newest',
    filters: emptyFilters(),
    filtersOpen: false,
    refocusQuickAdd: false,
    activityOpen: false,
    lastRenderedDay: Utils.todayISO(),
  };

  /* =====================================================================
     Route definitions
     ===================================================================== */
  const TASK_PAGES = {
    tasks: { title: 'My Tasks', icon: 'fa-list-check', empty: { icon: 'fa-list-check', title: 'No tasks yet', text: 'Create your first task to get organised.' } },
    inbox: { title: 'Inbox', icon: 'fa-inbox', empty: { icon: 'fa-inbox', title: 'Inbox zero', text: 'Open tasks without a category or project land here.' } },
    today: { title: 'Today', icon: 'fa-calendar-day', empty: { icon: 'fa-mug-hot', title: 'Nothing due today', text: 'Enjoy your day — or plan something new.' } },
    upcoming: { title: 'Upcoming', icon: 'fa-calendar-week', sort: 'due', empty: { icon: 'fa-calendar-week', title: 'No upcoming tasks', text: 'Tasks with future due dates appear here.' } },
    important: { title: 'Important', icon: 'fa-star', empty: { icon: 'fa-star', title: 'No starred tasks', text: 'Star a task to keep it front and centre.' } },
    completed: { title: 'Completed', icon: 'fa-circle-check', noQuickAdd: true, sort: 'updated', empty: { icon: 'fa-circle-check', title: 'Nothing completed yet', text: 'Completed tasks are collected here.' } },
    archived: { title: 'Archived', icon: 'fa-box-archive', noQuickAdd: true, empty: { icon: 'fa-box-archive', title: 'Archive is empty', text: 'Archive tasks you want to keep but hide from your lists.' } },
    trash: { title: 'Trash', icon: 'fa-trash-can', noQuickAdd: true, empty: { icon: 'fa-trash-can', title: 'Trash is empty', text: 'Deleted tasks stay here until you remove them permanently.' } },
    calendar: { title: 'Calendar', icon: 'fa-calendar', noQuickAdd: true, forceView: 'calendar', sort: 'due' },
  };

  function pageConfig(route = ui.route) {
    const { name, id } = route;
    if (TASK_PAGES[name]) return { ...TASK_PAGES[name], kind: 'tasks', scope: name };
    if (name === 'category') {
      const c = Categories.get(id);
      return c && { title: c.name, icon: c.icon, color: c.color, kind: 'tasks', scope: `category:${id}`, item: c,
        empty: { icon: c.icon, title: `No tasks in ${c.name}`, text: 'Add a task to this category to see it here.' } };
    }
    if (name === 'project') {
      const p = Projects.get(id);
      return p && { title: p.name, icon: p.icon, color: p.color, kind: 'tasks', scope: `project:${id}`, item: p,
        empty: { icon: p.icon, title: 'This project has no tasks', text: 'Break the project down into tasks to track progress.' } };
    }
    return {
      dashboard: { title: 'Dashboard', kind: 'dashboard' },
      analytics: { title: 'Analytics', kind: 'analytics' },
      organize: { title: 'Categories & Projects', kind: 'organize' },
      settings: { title: 'Settings', kind: 'settings' },
    }[name] || null;
  }

  const routeKey = (r = ui.route) => (r.id ? `${r.name}/${r.id}` : r.name);

  function parseHash() {
    const [name = 'dashboard', id = ''] = location.hash.replace(/^#\/?/, '').split('/');
    return { name: name || 'dashboard', id: decodeURIComponent(id) };
  }

  function navigate(path, { keepSearch = false } = {}) {
    ui.keepSearch = keepSearch;
    if (location.hash === `#/${path}`) onRouteChange();
    else location.hash = `#/${path}`;
  }

  function onRouteChange() {
    const route = parseHash();
    if (!pageConfig(route)) { location.replace('#/dashboard'); return; }
    const changed = routeKey(route) !== routeKey(ui.route);
    ui.route = route;
    if (changed || !ui.keepSearch) {
      const search = ui.keepSearch ? ui.filters.search : '';
      ui.filters = { ...emptyFilters(), search };
      $('#global-search').value = search;
      ui.sort = pageConfig().sort || 'newest';
    }
    ui.keepSearch = false;
    closeSidebar();
    UI.closeMenu();
    render({ animate: true });
    $('#view').scrollTop = 0;
    window.scrollTo(0, 0);
  }

  /* =====================================================================
     Rendering
     ===================================================================== */
  function render({ animate = false } = {}) {
    const page = pageConfig();
    if (!page) { location.replace('#/dashboard'); return; }
    UI.renderSidebar(routeKey());
    $('#page-title').textContent = page.title;
    $('#page-subtitle').textContent = subtitle(page);
    document.title = `${page.title} · TaskFlow`;
    updateActivityDot();
    if (ui.activityOpen) renderActivityPanel();

    const view = $('#view');
    const pendingTitle = $('[data-quick-add] input[name="title"]');
    const keptTitle = !animate && pendingTitle ? pendingTitle.value : '';
    Analytics.destroyCharts();
    const renderers = { dashboard: renderDashboard, tasks: renderTaskPage, analytics: Analytics.renderPage, organize: renderOrganize, settings: renderSettings };
    view.innerHTML = renderers[page.kind](page);
    if (keptTitle && !ui.refocusQuickAdd) { const input = $('[data-quick-add] input[name="title"]'); if (input) input.value = keptTitle; }
    if (animate) { view.classList.remove('view-enter'); void view.offsetWidth; view.classList.add('view-enter'); }

    if (page.kind === 'tasks') renderResults();
    if (page.kind === 'analytics') Analytics.renderCharts();
    if (ui.refocusQuickAdd) {
      ui.refocusQuickAdd = false;
      const input = $('[data-quick-add] input[name="title"]');
      if (input) input.focus();
    }
    UI.refreshModals();
  }

  function subtitle(page) {
    const c = Tasks.counts();
    const now = new Date();
    switch (page.kind) {
      case 'dashboard': return `${Utils.DAYS[now.getDay()]}, ${Utils.formatDate(Utils.todayISO())}`;
      case 'analytics': return 'Your productivity at a glance';
      case 'organize': {
        const n = Categories.list().length;
        return `${n} ${n === 1 ? 'category' : 'categories'} · ${Utils.plural(Projects.list().length, 'project')}`;
      }
      case 'settings': return 'Personalise TaskFlow';
      default: break;
    }
    const scope = page.scope;
    if (scope === 'today') return `${Utils.DAYS[now.getDay()]}, ${Utils.formatDate(Utils.todayISO())}${c.overdue ? ` · ${c.overdue} overdue` : ''}`;
    if (scope === 'trash') return 'Items in Trash can be restored or deleted forever';
    if (scope === 'archived') return 'Hidden from your lists, kept for reference';
    if (scope === 'calendar') return 'Plan your tasks by due date';
    const list = Tasks.query(scope);
    const open = list.filter(t => !Tasks.isClosed(t)).length;
    return `${open} open · ${list.length - open} closed`;
  }

  /* ---------------- Dashboard ---------------- */
  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }

  function clockParts() {
    const d = new Date();
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const text = Utils.formatTime(hhmm);
    const [time, suffix = ''] = text.split(' ');
    return { time, suffix };
  }

  function ring(pct, size = 92) {
    const r = (size - 10) / 2;
    const c = 2 * Math.PI * r;
    return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${pct}% complete">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-track"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fill" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}"/>
      <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle">${pct}%</text></svg>`;
  }

  function statCard({ icon, tone, label, value, sub, route, pct = null }) {
    return `
      <button type="button" class="stat-card is-link" data-action="go" data-route="${route}">
        <div class="stat-icon tone-${tone}"><i class="fa-solid ${icon}"></i></div>
        <div class="stat-body"><span class="stat-label">${label}</span><strong class="stat-value">${value}</strong>
          ${pct !== null ? UI.progressBar(pct, { size: 'sm' }) : ''}<span class="stat-sub">${sub}</span></div>
      </button>`;
  }

  function renderDashboard() {
    const s = Analytics.summary();
    const name = settings().userName;
    const hasTasks = DB.state.tasks.some(t => !t.deleted);
    const { time, suffix } = clockParts();
    const todayList = Tasks.query('today', {}, 'due').sort((a, b) => Number(Tasks.isClosed(a)) - Number(Tasks.isClosed(b))).slice(0, 7);
    const upcoming = Tasks.query('upcoming', {}, 'due').slice(0, 6);
    const week = Analytics.weekOverview();
    const weekMax = Math.max(1, ...week.map(d => Math.max(d.completed, d.due)));
    const projects = Projects.list().map(p => ({ p, prog: Projects.progress(p.id) })).filter(x => x.prog.total).slice(0, 4);
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

    const summaryText = !hasTasks ? 'Let’s set up your workspace — add your first task to get started.'
      : s.dueToday || s.overdue
        ? `You have ${Utils.plural(s.dueToday, 'task')} due today${s.overdue ? ` and ${s.overdue} overdue` : ''}.`
        : 'You’re all caught up for today. 🎉';

    return `
      <div class="page-stack">
        <section class="hero">
          <div class="hero-text">
            <p class="hero-date" data-live-date>${Utils.DAYS[new Date().getDay()]}, ${esc(Utils.formatDate(Utils.todayISO()))}</p>
            <h2>${greeting()}${name ? `, ${esc(name)}` : ''} <span class="wave" aria-hidden="true">👋</span></h2>
            <p class="hero-sub">${summaryText}</p>
            <div class="hero-actions">
              <button type="button" class="btn btn-light" data-action="new-task"><i class="fa-solid fa-plus"></i> New task</button>
              <button type="button" class="btn btn-glass" data-action="go" data-route="today"><i class="fa-solid fa-calendar-day"></i> Today’s plan</button>
            </div>
          </div>
          <div class="hero-side">
            <div class="hero-clock" aria-live="off"><span data-live-clock>${time}</span><small data-live-suffix>${suffix}</small></div>
            <div class="hero-ring">${ring(s.completionRate)}<span>Completion</span></div>
          </div>
        </section>

        ${!hasTasks ? `
        <section class="card onboarding">
          <div class="onboarding-art"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
          <div><h3>Welcome to TaskFlow</h3><p>Create your first task, or add a small set of starter tasks you can edit or delete — a quick way to explore views, calendar and analytics.</p></div>
          <div class="onboarding-actions">
            <button type="button" class="btn btn-primary" data-action="new-task"><i class="fa-solid fa-plus"></i> Create a task</button>
            <button type="button" class="btn btn-ghost" data-action="load-starter"><i class="fa-solid fa-seedling"></i> Add starter tasks</button>
          </div>
        </section>` : ''}

        <div class="stat-grid stat-grid-6">
          ${statCard({ icon: 'fa-layer-group', tone: 'indigo', label: 'Total tasks', value: s.total, sub: `${s.inProgress} in progress`, route: 'tasks' })}
          ${statCard({ icon: 'fa-circle-check', tone: 'green', label: 'Completed', value: s.completed, sub: `${s.completedToday} today`, route: 'completed', pct: pct(s.completed, s.total) })}
          ${statCard({ icon: 'fa-hourglass-half', tone: 'blue', label: 'Pending', value: s.pending, sub: 'Open tasks', route: 'tasks', pct: pct(s.pending, s.total) })}
          ${statCard({ icon: 'fa-triangle-exclamation', tone: 'red', label: 'Overdue', value: s.overdue, sub: s.overdue ? 'Needs attention' : 'All on track', route: 'today' })}
          ${statCard({ icon: 'fa-calendar-day', tone: 'amber', label: 'Due today', value: s.dueToday, sub: `${s.dueTodayDone}/${s.dueTodayTotal} done`, route: 'today', pct: pct(s.dueTodayDone, s.dueTodayTotal) })}
          ${statCard({ icon: 'fa-bullseye', tone: 'violet', label: 'Productivity', value: `${s.completionRate}%`, sub: 'Completion rate', route: 'analytics', pct: s.completionRate })}
        </div>

        <div class="dash-grid">
          <div class="dash-col">
            <section class="card">
              <header class="card-head"><div><h3><i class="fa-solid fa-calendar-day"></i> Today’s tasks</h3><p>${s.dueTodayDone} of ${s.dueTodayTotal} completed${s.overdue ? ` · ${s.overdue} overdue included` : ''}</p></div>
                <button type="button" class="btn btn-ghost btn-sm" data-action="go" data-route="today">View all</button></header>
              ${todayList.length ? `<div class="mini-list">${todayList.map(t => UI.miniRow(t)).join('')}</div>`
                : UI.emptyState({ icon: 'fa-mug-hot', title: 'Nothing due today', text: 'Add a task for today to start planning.', action: { label: 'Add task for today', action: 'quick-add-today', icon: 'fa-plus' }, compact: true })}
            </section>
            <section class="card">
              <header class="card-head"><div><h3><i class="fa-solid fa-hourglass-start"></i> Upcoming deadlines</h3><p>Next tasks by due date</p></div>
                <button type="button" class="btn btn-ghost btn-sm" data-action="go" data-route="upcoming">View all</button></header>
              ${upcoming.length ? `<div class="mini-list">${upcoming.map(t => UI.miniRow(t)).join('')}</div>`
                : UI.emptyState({ icon: 'fa-calendar-week', title: 'No upcoming deadlines', text: 'Tasks with future due dates will show here.', compact: true })}
            </section>
          </div>
          <div class="dash-col">
            <section class="card">
              <header class="card-head"><div><h3><i class="fa-solid fa-chart-column"></i> This week</h3><p>${Utils.plural(s.completedWeek, 'task')} completed · ${s.weekChange >= 0 ? '+' : ''}${s.weekChange}% vs last week</p></div>
                <button type="button" class="btn btn-ghost btn-sm" data-action="go" data-route="analytics">Analytics</button></header>
              <div class="week-bars">
                ${week.map(d => `
                  <div class="week-bar-col ${d.isToday ? 'is-today' : ''}" title="${d.label}: ${d.completed} completed, ${d.due} due">
                    <span class="week-bar-value">${d.completed}</span>
                    <div class="week-bar"><span class="week-bar-due" style="height:${(d.due / weekMax) * 100}%"></span><span class="week-bar-done" style="height:${(d.completed / weekMax) * 100}%"></span></div>
                    <span class="week-bar-label">${d.label}</span>
                  </div>`).join('')}
              </div>
              <div class="legend"><span><i class="legend-dot done"></i>Completed</span><span><i class="legend-dot due"></i>Due</span></div>
            </section>
            ${projects.length ? `
            <section class="card">
              <header class="card-head"><div><h3><i class="fa-solid fa-folder-open"></i> Projects</h3><p>Progress across active projects</p></div>
                <button type="button" class="btn btn-ghost btn-sm" data-action="go" data-route="organize">Manage</button></header>
              <div class="project-mini-list">${projects.map(({ p, prog }) => `
                <a class="project-mini" href="#/project/${p.id}">
                  <span class="collection-icon sm" style="--chip:${p.color}"><i class="fa-solid ${p.icon}"></i></span>
                  <div><div class="project-mini-top"><strong>${esc(p.name)}</strong><span>${prog.pct}%</span></div>${UI.progressBar(prog.pct, { size: 'sm' })}</div>
                </a>`).join('')}</div>
            </section>` : ''}
            <section class="card">
              <header class="card-head"><div><h3><i class="fa-solid fa-clock-rotate-left"></i> Recent activity</h3><p>Latest changes in your workspace</p></div></header>
              ${UI.activityList(DB.state.activity, { limit: 6 })}
            </section>
          </div>
        </div>
      </div>`;
  }

  /* ---------------- Task pages ---------------- */
  const activeFilterCount = () => Object.entries(ui.filters).filter(([k, v]) => k !== 'search' && v).length;
  const currentView = page => page.forceView || ui.view;

  function filterSelect(key, label, options) {
    return `<label class="filter-field"><span>${label}</span><select class="input input-sm" data-filter="${key}">${options}</select></label>`;
  }

  function filterPanel() {
    const f = ui.filters;
    const opt = UI.option;
    const scope = pageConfig().scope;
    return `
      <div class="filter-panel ${ui.filtersOpen ? 'open' : ''}" id="filter-panel">
        ${filterSelect('priority', 'Priority', opt('', 'Any priority', f.priority) + UI.priorityOptions(f.priority))}
        ${filterSelect('status', 'Status', opt('', 'Any status', f.status) + UI.statusOptions(f.status))}
        ${scope.startsWith('category:') ? '' : filterSelect('category', 'Category', UI.categoryOptions(f.category, 'Any category') + opt('__none', 'Uncategorised', f.category))}
        ${scope.startsWith('project:') ? '' : filterSelect('project', 'Project', UI.projectOptions(f.project, 'Any project') + opt('__none', 'No project', f.project))}
        ${filterSelect('due', 'Due date', [['', 'Any date'], ['today', 'Due today'], ['tomorrow', 'Due tomorrow'], ['week', 'This week'], ['next7', 'Next 7 days'], ['month', 'This month'], ['overdue', 'Overdue'], ['nodate', 'No due date']].map(([v, l]) => opt(v, l, f.due)).join(''))}
        ${filterSelect('completion', 'Completion', [['', 'All'], ['pending', 'Pending'], ['completed', 'Completed']].map(([v, l]) => opt(v, l, f.completion)).join(''))}
        <div class="filter-toggles">
          <label class="chip-toggle"><input type="checkbox" data-filter="important" ${f.important ? 'checked' : ''}><span><i class="fa-solid fa-star"></i> Important</span></label>
          <label class="chip-toggle"><input type="checkbox" data-filter="overdue" ${f.overdue ? 'checked' : ''}><span><i class="fa-solid fa-triangle-exclamation"></i> Overdue</span></label>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" data-action="clear-filters" data-clear-filters ${activeFilterCount() || f.search ? '' : 'disabled'}><i class="fa-solid fa-filter-circle-xmark"></i> Clear filters</button>
      </div>`;
  }

  function toolbar(page) {
    const views = [['list', 'fa-list', 'List'], ['board', 'fa-table-columns', 'Board'], ['grid', 'fa-grip', 'Grid'], ['calendar', 'fa-calendar', 'Calendar']];
    const count = activeFilterCount();
    return `
      <div class="toolbar">
        <div class="toolbar-left">
          ${page.forceView ? '' : `<div class="segmented" role="group" aria-label="View">${views.map(([v, icon, label]) => `
            <button type="button" class="seg-btn ${ui.view === v ? 'active' : ''}" data-action="set-view" data-view="${v}" aria-pressed="${ui.view === v}" data-tip="${label} view">
              <i class="fa-solid ${icon}"></i><span class="seg-label">${label}</span></button>`).join('')}</div>`}
          <button type="button" class="btn btn-ghost btn-sm ${ui.filtersOpen ? 'is-active' : ''}" data-action="toggle-filters" aria-expanded="${ui.filtersOpen}" aria-controls="filter-panel">
            <i class="fa-solid fa-sliders"></i> Filters <span class="pill" data-filter-count ${count ? '' : 'hidden'}>${count}</span></button>
          <span class="result-count" data-result-count></span>
        </div>
        <div class="toolbar-right">
          ${currentView(page) === 'calendar' ? '' : `<label class="sort-select" data-tip="Sort tasks"><i class="fa-solid fa-arrow-down-wide-short"></i>
            <select data-sort aria-label="Sort by">${Object.entries(Tasks.SORT_LABELS).map(([k, l]) => UI.option(k, l, ui.sort)).join('')}</select></label>`}
          ${page.scope === 'trash' ? `<button type="button" class="btn btn-danger-soft btn-sm" data-action="empty-trash" ${Tasks.counts().trash ? '' : 'disabled'}><i class="fa-solid fa-trash"></i> Empty Trash</button>` : ''}
          ${page.item ? `<button type="button" class="btn btn-ghost btn-sm" data-action="edit-${page.scope.split(':')[0]}" data-id="${page.item.id}"><i class="fa-regular fa-pen-to-square"></i> Edit</button>` : ''}
        </div>
      </div>
      ${filterPanel()}`;
  }

  function scopeHeader(page) {
    if (page.scope.startsWith('project:')) {
      const p = page.item;
      const prog = Projects.progress(p.id);
      return `
        <section class="card scope-card">
          <span class="collection-icon lg" style="--chip:${p.color}"><i class="fa-solid ${p.icon}"></i></span>
          <div class="scope-info"><h2>${esc(p.name)}</h2><p>${esc(p.description) || 'No description'}</p></div>
          <div class="scope-progress"><div class="progress-label"><span>${prog.done}/${prog.total} tasks done${prog.overdue ? ` · <span class="text-danger">${prog.overdue} overdue</span>` : ''}</span><strong>${prog.pct}%</strong></div>${UI.progressBar(prog.pct)}</div>
        </section>`;
    }
    if (page.scope.startsWith('category:')) {
      const c = page.item;
      return `<section class="card scope-card scope-card-sm"><span class="collection-icon" style="--chip:${c.color}"><i class="fa-solid ${c.icon}"></i></span>
        <div class="scope-info"><h2>${esc(c.name)}</h2><p>${Utils.plural(Categories.taskCount(c.id), 'open task')}</p></div></section>`;
    }
    return '';
  }

  function quickAddBar(page) {
    if (page.noQuickAdd) return '';
    return `
      <form class="quick-add-bar card" data-quick-add novalidate>
        ${UI.quickAddFields(contextDefaults())}
        <button type="submit" class="btn btn-primary btn-sm"><i class="fa-solid fa-plus"></i> Add</button>
        <p class="field-error" data-error-for="title" aria-live="polite"></p>
      </form>`;
  }

  function renderTaskPage(page) {
    return `<div class="page-stack">${scopeHeader(page)}${quickAddBar(page)}${toolbar(page)}<div id="task-results" class="task-results"></div></div>`;
  }

  /** Re-renders only the results area (used for search / filter / sort changes). */
  function renderResults() {
    const page = pageConfig();
    const box = $('#task-results');
    if (!page || page.kind !== 'tasks' || !box) return;
    const tasks = Tasks.query(page.scope, ui.filters, ui.sort);
    const view = currentView(page);
    const filtered = activeFilterCount() > 0 || !!ui.filters.search;

    const countEl = $('[data-result-count]');
    if (countEl) countEl.textContent = Utils.plural(tasks.length, 'task');
    const fc = $('[data-filter-count]');
    if (fc) { fc.textContent = activeFilterCount(); fc.hidden = !activeFilterCount(); }
    const clearBtn = $('[data-clear-filters]');
    if (clearBtn) clearBtn.disabled = !filtered;

    if (view === 'calendar') { box.innerHTML = CalendarView.render(tasks); return; }
    if (!tasks.length && (view !== 'board' || filtered || page.noQuickAdd)) {
      box.innerHTML = filtered
        ? UI.emptyState({ icon: 'fa-magnifying-glass', title: 'No matching tasks', text: 'Try a different search or clear your filters.', action: { label: 'Clear filters', action: 'clear-filters', icon: 'fa-filter-circle-xmark' } })
        : UI.emptyState({ ...page.empty, action: page.noQuickAdd ? null : { label: 'New task', action: 'new-task', icon: 'fa-plus' } });
      return;
    }
    box.innerHTML = { list: UI.renderList, board: UI.renderBoard, grid: UI.renderGrid }[view](tasks);
  }

  /* ---------------- Categories & projects page ---------------- */
  function renderOrganize() {
    const catCard = c => {
      const open = Categories.taskCount(c.id);
      const total = Categories.taskCount(c.id, { openOnly: false });
      const pct = total ? Math.round(((total - open) / total) * 100) : 0;
      return `
        <article class="collection-card">
          <a class="collection-main" href="#/category/${c.id}">
            <span class="collection-icon" style="--chip:${c.color}"><i class="fa-solid ${c.icon}"></i></span>
            <div><h4>${esc(c.name)}</h4><p>${Utils.plural(open, 'open task')} · ${total - open} done</p></div>
          </a>
          ${UI.progressBar(pct, { size: 'sm', label: `${c.name} completion` })}
          <div class="collection-actions">
            <button type="button" class="icon-btn icon-btn-sm" data-action="edit-category" data-id="${c.id}" aria-label="Edit ${esc(c.name)}" data-tip="Edit"><i class="fa-regular fa-pen-to-square"></i></button>
            <button type="button" class="icon-btn icon-btn-sm danger" data-action="delete-category" data-id="${c.id}" aria-label="Delete ${esc(c.name)}" data-tip="Delete"><i class="fa-regular fa-trash-can"></i></button>
          </div>
        </article>`;
    };
    const projCard = p => {
      const prog = Projects.progress(p.id);
      return `
        <article class="collection-card project-card">
          <a class="collection-main" href="#/project/${p.id}">
            <span class="collection-icon" style="--chip:${p.color}"><i class="fa-solid ${p.icon}"></i></span>
            <div><h4>${esc(p.name)}</h4><p>${esc(p.description) || 'No description'}</p></div>
          </a>
          <div class="progress-label"><span>${prog.done}/${prog.total} done${prog.overdue ? ` · <span class="text-danger">${prog.overdue} overdue</span>` : ''}</span><strong>${prog.pct}%</strong></div>
          ${UI.progressBar(prog.pct, { label: `${p.name} progress` })}
          <div class="collection-actions">
            <button type="button" class="icon-btn icon-btn-sm" data-action="edit-project" data-id="${p.id}" aria-label="Edit ${esc(p.name)}" data-tip="Edit"><i class="fa-regular fa-pen-to-square"></i></button>
            <button type="button" class="icon-btn icon-btn-sm danger" data-action="delete-project" data-id="${p.id}" aria-label="Delete ${esc(p.name)}" data-tip="Delete"><i class="fa-regular fa-trash-can"></i></button>
          </div>
        </article>`;
    };
    return `
      <div class="page-stack">
        <section>
          <div class="section-head"><div><h2>Projects</h2><p>Group related tasks and track progress toward a goal.</p></div>
            <button type="button" class="btn btn-primary btn-sm" data-action="new-project"><i class="fa-solid fa-plus"></i> New project</button></div>
          ${Projects.list().length ? `<div class="collection-grid">${Projects.list().map(projCard).join('')}</div>`
            : UI.emptyState({ icon: 'fa-folder-open', title: 'No projects yet', text: 'Create a project to group tasks and see progress.', action: { label: 'New project', action: 'new-project', icon: 'fa-plus' }, compact: true })}
        </section>
        <section>
          <div class="section-head"><div><h2>Categories</h2><p>Colour-coded areas of your life and work.</p></div>
            <button type="button" class="btn btn-primary btn-sm" data-action="new-category"><i class="fa-solid fa-plus"></i> New category</button></div>
          ${Categories.list().length ? `<div class="collection-grid">${Categories.list().map(catCard).join('')}</div>`
            : UI.emptyState({ icon: 'fa-tags', title: 'No categories', text: 'Categories help you organise tasks by area.', action: { label: 'New category', action: 'new-category', icon: 'fa-plus' }, compact: true })}
        </section>
      </div>`;
  }

  /* ---------------- Settings ---------------- */
  function renderSettings() {
    const s = settings();
    const seg = (key, options) => `<div class="segmented" role="group">${options.map(([value, label, icon]) => `
      <button type="button" class="seg-btn ${String(s[key]) === String(value) ? 'active' : ''}" data-action="set-setting" data-key="${key}" data-value="${value}" aria-pressed="${String(s[key]) === String(value)}">
        ${icon ? `<i class="fa-solid ${icon}"></i>` : ''}<span>${label}</span></button>`).join('')}</div>`;
    const row = (title, desc, control) => `<div class="setting-row"><div class="setting-text"><h4>${title}</h4><p>${desc}</p></div><div class="setting-control">${control}</div></div>`;
    const select = (key, options) => `<select class="input input-sm" data-setting="${key}" aria-label="${key}">${options.map(([v, l]) => UI.option(v, l, s[key])).join('')}</select>`;
    const toggle = key => `<label class="switch"><input type="checkbox" data-setting="${key}" ${s[key] ? 'checked' : ''}><span class="switch-ui"></span></label>`;
    const permission = 'Notification' in window ? Notification.permission : 'unsupported';
    const permText = { granted: 'Browser notifications are enabled.', denied: 'Blocked in browser settings — in-app notifications will be used.', default: 'Not yet enabled.', unsupported: 'Not supported in this browser — in-app notifications will be used.' }[permission];
    const sample = Utils.todayISO();

    return `
      <div class="settings">
        <section class="card settings-card">
          <header class="card-head"><div><h3><i class="fa-regular fa-user"></i> Profile</h3><p>How TaskFlow greets you</p></div></header>
          ${row('Display name', 'Shown in the greeting and sidebar.', `<input class="input input-sm" data-setting="userName" maxlength="40" placeholder="Your name" value="${esc(s.userName)}" aria-label="Display name">`)}
        </section>

        <section class="card settings-card">
          <header class="card-head"><div><h3><i class="fa-solid fa-palette"></i> Appearance</h3><p>Theme, colours and density</p></div></header>
          ${row('Theme', 'Choose light, dark, or follow your system.', seg('theme', [['light', 'Light', 'fa-sun'], ['dark', 'Dark', 'fa-moon'], ['system', 'System', 'fa-desktop']]))}
          ${row('Accent colour', 'Used for buttons, highlights and charts.', `<div class="accent-picker">${DB.ACCENTS.map(a => `
            <button type="button" class="accent-swatch accent-${a} ${s.accent === a ? 'active' : ''}" data-action="set-setting" data-key="accent" data-value="${a}" aria-label="${a}" aria-pressed="${s.accent === a}" data-tip="${a[0].toUpperCase() + a.slice(1)}"><i class="fa-solid fa-check"></i></button>`).join('')}</div>`)}
          ${row('Layout density', 'Compact shows more tasks on screen.', seg('density', [['comfortable', 'Comfortable', 'fa-expand'], ['compact', 'Compact', 'fa-compress']]))}
        </section>

        <section class="card settings-card">
          <header class="card-head"><div><h3><i class="fa-solid fa-list-check"></i> Tasks</h3><p>Defaults and formatting</p></div></header>
          ${row('Default priority', 'Applied to new tasks.', select('defaultPriority', Object.keys(Tasks.PRIORITY).map(p => [p, Tasks.PRIORITY[p].label])))}
          ${row('Default task view', 'The view used when TaskFlow opens.', select('defaultView', [['list', 'List'], ['board', 'Board'], ['grid', 'Grid'], ['calendar', 'Calendar']]))}
          ${row('Week starts on', 'Affects calendars and weekly stats.', seg('weekStart', [[1, 'Monday'], [0, 'Sunday']]))}
          ${row('Date format', `Preview: ${esc(Utils.formatDate(sample))}`, select('dateFormat', DB.DATE_FORMATS.map(f => [f, `${Utils.formatDate(sample, f)}  (${f})`])))}
          ${row('Time format', `Preview: ${esc(Utils.formatTime('14:30'))}`, seg('timeFormat', [['12', '12-hour'], ['24', '24-hour']]))}
        </section>

        <section class="card settings-card">
          <header class="card-head"><div><h3><i class="fa-regular fa-bell"></i> Reminders & notifications</h3><p>${permText}</p></div></header>
          ${row('Browser notifications', 'Show system notifications for reminders and overdue tasks.',
            `${toggle('notifications')}${permission === 'default' ? '<button type="button" class="btn btn-ghost btn-sm" data-action="enable-notifications">Allow</button>' : ''}`)}
          ${row('Overdue alerts', 'Notify once when a task becomes overdue.', toggle('overdueAlerts'))}
          ${row('Default reminder', 'Applied to new tasks that have a due date.', select('defaultReminder', [['', 'None'], ['0', 'At due time'], ['15', '15 minutes before'], ['60', '1 hour before'], ['1440', '1 day before']]))}
          ${row('Test', 'Send a sample notification.', '<button type="button" class="btn btn-ghost btn-sm" data-action="test-notification"><i class="fa-regular fa-paper-plane"></i> Send test</button>')}
        </section>

        <section class="card settings-card">
          <header class="card-head"><div><h3><i class="fa-solid fa-database"></i> Data management</h3><p>${Utils.plural(DB.state.tasks.length, 'task')} stored locally in this browser${DB.available ? '' : ' (storage unavailable)'}</p></div></header>
          ${row('Export backup', 'Download everything as a JSON file.', '<button type="button" class="btn btn-ghost btn-sm" data-action="export-json"><i class="fa-solid fa-file-export"></i> Export JSON</button>')}
          ${row('Import backup', 'Replace current data with a TaskFlow JSON export.', '<button type="button" class="btn btn-ghost btn-sm" data-action="import-json"><i class="fa-solid fa-file-import"></i> Import JSON</button>')}
          ${row('Export to spreadsheet', 'Download tasks as CSV (Excel, Sheets, Numbers).', '<button type="button" class="btn btn-ghost btn-sm" data-action="export-csv"><i class="fa-solid fa-file-csv"></i> Export CSV</button>')}
          ${row('Clear all data', 'Permanently delete all tasks, projects and history.', '<button type="button" class="btn btn-danger-soft btn-sm" data-action="clear-data"><i class="fa-solid fa-trash"></i> Clear data</button>')}
        </section>

        <section class="card settings-card">
          <header class="card-head"><div><h3><i class="fa-regular fa-keyboard"></i> Keyboard</h3><p>Work faster with shortcuts</p></div>
            <button type="button" class="btn btn-ghost btn-sm" data-action="show-shortcuts">View shortcuts</button></header>
        </section>
      </div>`;
  }

  /* =====================================================================
     Context helpers
     ===================================================================== */
  function contextDefaults() {
    const { name, id } = ui.route;
    if (name === 'category') return { categoryId: id };
    if (name === 'project') return { projectId: id };
    if (name === 'today') return { dueDate: Utils.todayISO() };
    if (name === 'upcoming') return { dueDate: Utils.toISODate(Utils.addDays(new Date(), 1)) };
    if (name === 'important') return { important: true };
    return {};
  }

  const currentFilters = () => ({ ...ui.filters });

  /* =====================================================================
     Feedback helpers
     ===================================================================== */
  function undoable(message, undo, title = '') {
    UI.toast(message, { title, action: { label: 'Undo', onClick: undo } });
  }

  function safely(fn) {
    try { return fn(); }
    catch (err) {
      if (!(err instanceof ValidationError)) console.error(err);
      UI.toast(err.message || 'Something went wrong', { type: 'error' });
      return null;
    }
  }

  function closeDetailsFor(id) {
    const entry = UI.topModal();
    if (entry && entry.taskId === id) UI.closeModal(entry);
  }

  /* =====================================================================
     Actions (event delegation via data-action)
     ===================================================================== */
  const Actions = {
    'go': el => navigate(el.dataset.route),
    'open-task': el => UI.openTaskDetails(el.dataset.id),
    'edit-task': el => { const t = Tasks.get(el.dataset.id); if (t) UI.openTaskForm(t); },
    'new-task': () => UI.openTaskForm(null, contextDefaults()),
    'quick-add': () => UI.openQuickAdd(contextDefaults()),
    'quick-add-today': () => UI.openQuickAdd({ dueDate: Utils.todayISO() }),
    'board-add': el => UI.openQuickAdd({ ...contextDefaults(), status: el.dataset.status }),
    'calendar-add': el => UI.openQuickAdd({ ...contextDefaults(), dueDate: el.dataset.date }),
    'calendar-day': el => UI.openDayTasks(el.dataset.date),

    'toggle-complete': el => safely(() => {
      const before = Tasks.get(el.dataset.id);
      if (!before) return;
      const prevStatus = before.status;
      const t = Tasks.toggleComplete(el.dataset.id);
      if (Tasks.isDone(t)) {
        const recurring = t.recurring !== 'none' && t.spawnedNext;
        undoable(recurring ? 'Next occurrence has been scheduled.' : `“${t.title}”`, () => safely(() => Tasks.setStatus(t.id, prevStatus)), 'Task completed 🎉');
      } else UI.toast(`“${t.title}” marked as not completed.`, { type: 'info' });
    }),
    'set-status': el => safely(() => {
      const t = Tasks.setStatus(el.dataset.id, el.dataset.status);
      if (t) UI.toast(`Status changed to ${Tasks.STATUS[t.status].label}.`, { type: 'info' });
    }),
    'toggle-important': el => { const t = Tasks.toggleImportant(el.dataset.id); if (t) UI.toast(t.important ? 'Marked as important.' : 'Removed from important.', { type: 'info' }); },
    'toggle-pin': el => { const t = Tasks.togglePin(el.dataset.id); if (t) UI.toast(t.pinned ? 'Pinned to the top of your lists.' : 'Task unpinned.', { type: 'info' }); },
    'duplicate-task': el => {
      const copy = Tasks.duplicate(el.dataset.id);
      if (copy) UI.toast(`“${copy.title}” created.`, { title: 'Task duplicated', action: { label: 'Open', onClick: () => UI.openTaskDetails(copy.id) } });
    },
    'archive-task': el => {
      const t = Tasks.archive(el.dataset.id);
      if (t) { closeDetailsFor(t.id); undoable(`“${t.title}” archived.`, () => Tasks.unarchive(t.id)); }
    },
    'unarchive-task': el => { const t = Tasks.unarchive(el.dataset.id); if (t) UI.toast(`“${t.title}” restored from archive.`); },
    'trash-task': el => {
      const t = Tasks.trash(el.dataset.id);
      if (t) { closeDetailsFor(t.id); undoable(`“${t.title}” moved to Trash.`, () => Tasks.restore(t.id), 'Task deleted'); }
    },
    'restore-task': el => { const t = Tasks.restore(el.dataset.id); if (t) UI.toast(`“${t.title}” restored.`); },
    'destroy-task': async el => {
      const t = Tasks.get(el.dataset.id);
      if (!t) return;
      const ok = await UI.confirm({ title: 'Delete permanently?', message: `“${t.title}” will be deleted forever. This cannot be undone.`, confirmLabel: 'Delete forever', danger: true });
      if (ok) { closeDetailsFor(t.id); Tasks.destroy(t.id); UI.toast('Task permanently deleted.', { type: 'info' }); }
    },
    'empty-trash': async () => {
      const n = Tasks.counts().trash;
      if (!n) return;
      const ok = await UI.confirm({ title: 'Empty Trash?', message: `${Utils.plural(n, 'task')} will be permanently deleted. This cannot be undone.`, confirmLabel: 'Empty Trash', danger: true });
      if (ok) { Tasks.emptyTrash(); UI.toast(`${Utils.plural(n, 'task')} permanently deleted.`, { type: 'info' }); }
    },
    'task-menu': el => { const t = Tasks.get(el.dataset.id); if (t) UI.openMenu(el, UI.taskMenuItems(t)); },
    'start-timer': el => { const t = Tasks.startTimer(el.dataset.id); if (t) UI.toast(`Tracking time on “${t.title}”.`, { type: 'info' }); },
    'stop-timer': el => { const t = Tasks.stopTimer(el.dataset.id); if (t) UI.toast(`Time logged. Total: ${Utils.formatMinutes(t.timeSpent)}.`); },

    'subtask-toggle': el => Tasks.toggleSubtask(el.dataset.id, el.dataset.sub),
    'subtask-edit': el => UI.editSubtaskInline(el.dataset.id, el.dataset.sub),
    'subtask-delete': el => { Tasks.deleteSubtask(el.dataset.id, el.dataset.sub); UI.toast('Subtask removed.', { type: 'info' }); },

    'set-view': el => { ui.view = el.dataset.view; render(); },
    'toggle-filters': () => {
      ui.filtersOpen = !ui.filtersOpen;
      $('#filter-panel')?.classList.toggle('open', ui.filtersOpen);
      const btn = $('[data-action="toggle-filters"]');
      if (btn) { btn.classList.toggle('is-active', ui.filtersOpen); btn.setAttribute('aria-expanded', ui.filtersOpen); }
    },
    'clear-filters': () => {
      ui.filters = emptyFilters();
      $('#global-search').value = '';
      render();
    },
    'cal-prev': () => { CalendarView.navigate(-1); renderResults(); },
    'cal-next': () => { CalendarView.navigate(1); renderResults(); },
    'cal-today': () => { CalendarView.goToday(); renderResults(); },
    'cal-mode': el => { CalendarView.setMode(el.dataset.mode); renderResults(); },

    'new-category': () => UI.openCollectionForm('category'),
    'new-project': () => UI.openCollectionForm('project'),
    'edit-category': el => UI.openCollectionForm('category', Categories.get(el.dataset.id)),
    'edit-project': el => UI.openCollectionForm('project', Projects.get(el.dataset.id)),
    'delete-category': el => deleteCollection(Categories, 'category', el.dataset.id),
    'delete-project': el => deleteCollection(Projects, 'project', el.dataset.id),

    'toggle-sidebar': () => DB.updateSettings({ sidebarCollapsed: !settings().sidebarCollapsed }),
    'open-sidebar': () => { $('#app').classList.add('sidebar-open'); },
    'close-sidebar': () => closeSidebar(),
    'toggle-theme': () => DB.updateSettings({ theme: UI.resolvedTheme() === 'dark' ? 'light' : 'dark' }),
    'toggle-activity': () => (ui.activityOpen ? closeActivity() : openActivity()),
    'clear-activity': async () => {
      const ok = await UI.confirm({ title: 'Clear activity history?', message: 'Your tasks are not affected.', confirmLabel: 'Clear history', danger: true });
      if (ok) { DB.state.activity.length = 0; DB.save('activity'); render(); UI.toast('Activity history cleared.', { type: 'info' }); }
    },
    'command-palette': () => openPalette(),
    'show-shortcuts': () => UI.openShortcuts(),

    'set-setting': el => {
      const { key, value } = el.dataset;
      DB.updateSettings({ [key]: value });
      if (key === 'theme') UI.toast(`Theme set to ${value}.`, { type: 'info' });
    },
    'enable-notifications': () => requestNotificationPermission(),
    'test-notification': () => notify('Test notification', 'Reminders will look like this.', null, 'info'),
    'export-json': () => {
      Utils.download(`taskflow-backup-${Utils.todayISO()}.json`, DB.exportData());
      UI.toast('Backup downloaded.', { title: 'Export complete' });
    },
    'export-csv': () => {
      const list = DB.state.tasks.filter(t => !t.deleted);
      if (!list.length) { UI.toast('There are no tasks to export yet.', { type: 'warning' }); return; }
      Utils.download(`taskflow-tasks-${Utils.todayISO()}.csv`, Tasks.toCSV(list), 'text/csv');
      UI.toast(`${Utils.plural(list.length, 'task')} exported to CSV.`, { title: 'Export complete' });
    },
    'import-json': () => $('#import-file').click(),
    'clear-data': async () => {
      const ok = await UI.confirm({ title: 'Clear all data?', message: 'All tasks, categories, projects and activity will be permanently deleted. Consider exporting a backup first.', confirmLabel: 'Delete everything', danger: true });
      if (!ok) return;
      UI.closeAllModals();
      DB.clearAll();
      UI.applyTheme();
      render();
      UI.toast('All data has been cleared.', { type: 'info' });
    },
    'load-starter': el => {
      el.disabled = true;
      el.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Adding…';
      setTimeout(() => {
        const n = safely(() => Tasks.createStarterTasks());
        if (n) UI.toast(`${n} starter tasks added. Edit or delete them any time.`, { title: 'Workspace ready' });
      }, 250);
    },
  };

  async function deleteCollection(Store, label, id) {
    const item = Store.get(id);
    if (!item) return;
    const linked = Store.taskCount(id, { openOnly: false });
    const ok = await UI.confirm({
      title: `Delete ${label} “${item.name}”?`,
      message: linked ? `${Utils.plural(linked, 'task')} will be kept but no longer belong to this ${label}.` : `This ${label} has no tasks.`,
      confirmLabel: `Delete ${label}`, danger: true,
    });
    if (!ok) return;
    UI.closeAllModals();
    Store.remove(id);
    if (ui.route.id === id) navigate('organize');
    UI.toast(`${label[0].toUpperCase() + label.slice(1)} deleted.`, { type: 'info' });
  }

  /* =====================================================================
     Command palette
     ===================================================================== */
  function openPalette() {
    const go = (label, route, icon, keywords = '') => ({ label: `Go to ${label}`, icon: `fa-solid ${icon}`, group: 'Navigation', keywords, run: () => navigate(route) });
    const commands = [
      { label: 'New task', icon: 'fa-solid fa-plus', group: 'Actions', hint: 'Full form', keywords: 'create add', run: () => UI.openTaskForm(null, contextDefaults()) },
      { label: 'Quick add task', icon: 'fa-solid fa-bolt', group: 'Actions', hint: 'N', keywords: 'create add', run: () => UI.openQuickAdd(contextDefaults()) },
      { label: 'New project', icon: 'fa-solid fa-folder-plus', group: 'Actions', run: () => UI.openCollectionForm('project') },
      { label: 'New category', icon: 'fa-solid fa-tag', group: 'Actions', run: () => UI.openCollectionForm('category') },
      { label: `Switch to ${UI.resolvedTheme() === 'dark' ? 'light' : 'dark'} theme`, icon: 'fa-solid fa-circle-half-stroke', group: 'Actions', keywords: 'theme dark light mode', run: () => Actions['toggle-theme']() },
      { label: 'Export backup (JSON)', icon: 'fa-solid fa-file-export', group: 'Actions', keywords: 'download', run: () => Actions['export-json']() },
      { label: 'Export tasks (CSV)', icon: 'fa-solid fa-file-csv', group: 'Actions', keywords: 'download excel', run: () => Actions['export-csv']() },
      { label: 'Keyboard shortcuts', icon: 'fa-regular fa-keyboard', group: 'Actions', hint: 'Ctrl /', run: () => UI.openShortcuts() },
      go('Dashboard', 'dashboard', 'fa-house', 'home'), go('My Tasks', 'tasks', 'fa-list-check'), go('Inbox', 'inbox', 'fa-inbox'),
      go('Today', 'today', 'fa-calendar-day'), go('Upcoming', 'upcoming', 'fa-calendar-week'), go('Calendar', 'calendar', 'fa-calendar'),
      go('Important', 'important', 'fa-star', 'starred'), go('Analytics', 'analytics', 'fa-chart-line', 'stats charts'),
      go('Completed', 'completed', 'fa-circle-check'), go('Archived', 'archived', 'fa-box-archive'), go('Trash', 'trash', 'fa-trash-can', 'deleted'),
      go('Categories & Projects', 'organize', 'fa-shapes'), go('Settings', 'settings', 'fa-gear', 'preferences'),
      ...Projects.list().map(p => ({ label: p.name, icon: `fa-solid ${p.icon}`, group: 'Projects', run: () => navigate(`project/${p.id}`) })),
      ...Categories.list().map(c => ({ label: c.name, icon: `fa-solid ${c.icon}`, group: 'Categories', run: () => navigate(`category/${c.id}`) })),
    ];
    UI.openCommandPalette(commands);
  }

  /* =====================================================================
     Activity panel
     ===================================================================== */
  const ALERT_TYPES = ['reminder', 'overdue', 'recurring', 'import'];

  function updateActivityDot() {
    const seen = settings().lastSeenActivity;
    const unread = DB.state.activity.filter(ev => ALERT_TYPES.includes(ev.type) && ev.at > seen).length;
    const dot = $('#activity-dot');
    dot.hidden = !unread;
    dot.textContent = unread > 9 ? '9+' : unread || '';
  }

  function renderActivityPanel() {
    $('#activity-panel-body').innerHTML = UI.activityList(DB.state.activity, { limit: 40 });
    $('#activity-clear').disabled = !DB.state.activity.length;
  }

  function openActivity() {
    ui.activityOpen = true;
    renderActivityPanel();
    $('#activity-panel').hidden = false;
    $('[data-action="toggle-activity"]').setAttribute('aria-expanded', 'true');
    DB.updateSettings({ lastSeenActivity: Date.now() });
  }

  function closeActivity() {
    if (!ui.activityOpen) return false;
    ui.activityOpen = false;
    $('#activity-panel').hidden = true;
    $('[data-action="toggle-activity"]').setAttribute('aria-expanded', 'false');
    return true;
  }

  function closeSidebar() {
    const app = $('#app');
    if (!app.classList.contains('sidebar-open')) return false;
    app.classList.remove('sidebar-open');
    return true;
  }

  /* =====================================================================
     Notifications & reminders
     ===================================================================== */
  function requestNotificationPermission() {
    if (!('Notification' in window)) { UI.toast('This browser does not support notifications. In-app alerts will be used.', { type: 'warning' }); return; }
    Notification.requestPermission().then(result => {
      if (result === 'granted') { DB.updateSettings({ notifications: true }); UI.toast('Browser notifications enabled.'); }
      else UI.toast('Permission not granted — TaskFlow will use in-app notifications.', { type: 'warning' });
      render();
    });
  }

  /** Browser notification when allowed; in-app toast always as a fallback / complement. */
  function notify(title, body, taskId = null, type = 'warning') {
    let shown = false;
    if (settings().notifications && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const n = new Notification(title, { body, tag: taskId || undefined, icon: 'assets/icons/logo.svg' });
        n.onclick = () => { window.focus(); if (taskId) UI.openTaskDetails(taskId); n.close(); };
        shown = true;
      } catch (e) { shown = false; }
    }
    if (!shown || !document.hidden) {
      UI.toast(body, { title, type, duration: 7000, action: taskId ? { label: 'View', onClick: () => UI.openTaskDetails(taskId) } : null });
    }
  }

  function checkReminders() {
    const now = Date.now();
    let changed = false;
    const reminders = [];
    const overdue = [];
    DB.state.tasks.forEach(t => {
      if (!Tasks.isActive(t) || Tasks.isClosed(t)) return;
      const at = Tasks.reminderTime(t);
      if (at && !t.reminded && at.getTime() <= now) {
        t.reminded = true;
        changed = true;
        if (now - at.getTime() < 12 * 3600000) reminders.push(t);   // skip very stale reminders
      }
      if (settings().overdueAlerts && !t.overdueNotified && Tasks.isOverdue(t)) {
        t.overdueNotified = true;
        changed = true;
        overdue.push(t);
      }
    });
    if (!changed) return;
    DB.save('tasks');
    reminders.forEach(t => {
      const when = t.dueDate ? `Due ${Utils.friendlyDate(t.dueDate).toLowerCase()}${t.dueTime ? ` at ${Utils.formatTime(t.dueTime)}` : ''}` : 'Reminder';
      DB.logActivity('reminder', `Reminder: “${t.title}”`, t.id);
      notify(`Reminder: ${t.title}`, when, t.id, 'info');
    });
    if (overdue.length === 1) {
      DB.logActivity('overdue', `“${overdue[0].title}” is overdue`, overdue[0].id);
      notify('Task overdue', `“${overdue[0].title}” is past its due date.`, overdue[0].id, 'warning');
    } else if (overdue.length > 1) {
      DB.logActivity('overdue', `${overdue.length} tasks are overdue`);
      notify(`${overdue.length} tasks are overdue`, 'Open Today to review them.', null, 'warning');
    }
    render();
  }

  /* =====================================================================
     Global listeners
     ===================================================================== */
  const isTyping = el => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const submitForm = form => (form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })));

  function bindEvents() {
    document.addEventListener('click', e => {
      const menuWasOpen = UI.closeMenu();
      const el = e.target.closest('[data-action]');
      if (ui.activityOpen && !e.target.closest('#activity-panel') && !(el && el.dataset.action === 'toggle-activity')) closeActivity();
      if (!el || el.disabled) return;
      const handler = Actions[el.dataset.action];
      if (!handler) return;
      if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();
      if (menuWasOpen && el.dataset.action === 'task-menu') return;   // second click closes
      handler(el, e);
    });

    // Enter / Space on focusable rows & cards opens details.
    document.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof Element && e.target.matches('[data-action="open-task"][tabindex]')) {
        e.preventDefault();
        UI.openTaskDetails(e.target.dataset.id);
      }
    });

    document.addEventListener('submit', e => {
      const form = e.target;
      if (!form.matches('[data-quick-add]')) return;
      e.preventDefault();
      ui.refocusQuickAdd = true;
      if (!UI.submitQuickAdd(form)) ui.refocusQuickAdd = false;
    });

    document.addEventListener('change', e => {
      const el = e.target;
      if (el.dataset.filter) {
        ui.filters[el.dataset.filter] = el.type === 'checkbox' ? el.checked : el.value;
        renderResults();
      } else if (el.matches('[data-sort]')) {
        ui.sort = el.value;
        renderResults();
      } else if (el.dataset.setting) {
        const value = el.type === 'checkbox' ? el.checked : el.value;
        if (el.dataset.setting === 'notifications' && value && 'Notification' in window && Notification.permission === 'default') requestNotificationPermission();
        if (el.dataset.setting === 'defaultView') ui.view = value;
        DB.updateSettings({ [el.dataset.setting]: value });
        if (el.dataset.setting === 'userName') UI.toast('Profile updated.');
      }
    });

    const onSearch = Utils.debounce(value => {
      ui.filters.search = value;
      if (pageConfig().kind !== 'tasks' && value.trim()) { navigate('tasks', { keepSearch: true }); return; }
      renderResults();
    }, 150);
    $('#global-search').addEventListener('input', e => onSearch(e.target.value));
    $('#global-search').addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });

    $('#import-file').addEventListener('change', async e => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) { UI.toast('That file is too large to import.', { type: 'error' }); return; }
      const ok = await UI.confirm({ title: 'Import backup?', message: `Importing “${file.name}” will replace all current data. Export a backup first if you want to keep it.`, confirmLabel: 'Replace & import', icon: 'fa-file-import' });
      if (!ok) return;
      const loader = UI.toast('Importing data…', { type: 'info', duration: 10000 });
      try {
        const text = await Utils.readFile(file);
        const result = DB.importData(text);
        loader();
        UI.applyTheme();
        ui.view = settings().defaultView;
        render();
        UI.toast(`${Utils.plural(result.tasks, 'task')}, ${Utils.plural(result.projects, 'project')} imported${result.skipped ? ` (${result.skipped} invalid skipped)` : ''}.`, { title: 'Import complete' });
      } catch (err) {
        loader();
        UI.toast(err.message, { type: 'error', title: 'Import failed' });
      }
    });

    /* ---------------- Drag & drop (board columns, calendar days) ---------------- */
    let dragId = null;
    document.addEventListener('dragstart', e => {
      const el = e.target.closest && e.target.closest('[data-drag-task]');
      if (!el) return;
      dragId = el.dataset.dragTask;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
      requestAnimationFrame(() => el.classList.add('is-dragging'));
    });
    document.addEventListener('dragend', () => {
      dragId = null;
      $$('.is-dragging, .is-drop-target').forEach(el => el.classList.remove('is-dragging', 'is-drop-target'));
    });
    document.addEventListener('dragover', e => {
      if (!dragId) return;
      const target = e.target.closest('[data-drop-status], [data-drop-date]');
      if (!target) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      $$('.is-drop-target').forEach(el => el !== target && el.classList.remove('is-drop-target'));
      target.classList.add('is-drop-target');
    });
    document.addEventListener('drop', e => {
      const target = e.target.closest('[data-drop-status], [data-drop-date]');
      if (!dragId || !target) return;
      e.preventDefault();
      const id = dragId;
      dragId = null;
      const t = Tasks.get(id);
      if (!t) return;
      if (target.dataset.dropStatus && target.dataset.dropStatus !== t.status) {
        safely(() => { Tasks.setStatus(id, target.dataset.dropStatus); UI.toast(`Moved to ${Tasks.STATUS[target.dataset.dropStatus].label}.`, { type: 'info' }); });
      } else if (target.dataset.dropDate && target.dataset.dropDate !== t.dueDate) {
        const prev = t.dueDate;
        safely(() => {
          Tasks.update(id, { dueDate: target.dataset.dropDate }, { activity: { type: 'updated', message: `Rescheduled “${t.title}” to ${Utils.formatDate(target.dataset.dropDate)}` } });
          undoable(`Rescheduled to ${Utils.formatDate(target.dataset.dropDate)}.`, () => safely(() => Tasks.update(id, { dueDate: prev })));
        });
      }
    });

    /* ---------------- Keyboard shortcuts ---------------- */
    let gPending = false;
    let gTimer = null;
    document.addEventListener('keydown', e => {
      const typing = isTyping(e.target);
      const mod = e.ctrlKey || e.metaKey;

      if (e.key === 'Escape') {
        if (UI.closeMenu() || closeActivity()) { e.preventDefault(); return; }
        if (UI.hasModal()) { e.preventDefault(); UI.closeModal(); return; }
        if (closeSidebar()) return;
        if (typing) e.target.blur();
        return;
      }
      if (mod && e.key === 'Enter') {
        const top = UI.topModal();
        const form = (top && top.layer.querySelector('form#task-form, form#quick-add-form, form#collection-form')) || (typing && e.target.closest('form[data-quick-add]'));
        if (form) { e.preventDefault(); submitForm(form); }
        return;
      }
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
      if (mod && e.key === '/') { e.preventDefault(); UI.openShortcuts(); return; }
      if (typing || mod || e.altKey || UI.hasModal()) return;

      const key = e.key.toLowerCase();
      if (gPending) {
        gPending = false;
        clearTimeout(gTimer);
        const routes = { d: 'dashboard', t: 'tasks', i: 'inbox', c: 'calendar', a: 'analytics', s: 'settings', u: 'upcoming' };
        if (routes[key]) { e.preventDefault(); navigate(routes[key]); }
        return;
      }
      if (key === 'n') { e.preventDefault(); UI.openQuickAdd(contextDefaults()); }
      else if (e.key === '/') { e.preventDefault(); $('#global-search').focus(); $('#global-search').select(); }
      else if (e.key === '?') { e.preventDefault(); UI.openShortcuts(); }
      else if (key === 'g') { gPending = true; gTimer = setTimeout(() => { gPending = false; }, 1200); }
    });

    window.addEventListener('hashchange', onRouteChange);
    window.addEventListener('resize', Utils.debounce(() => UI.closeMenu(), 100));
    document.addEventListener('scroll', () => UI.closeMenu(), true);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReminders(); });

    /* ---------------- Data / settings events ---------------- */
    Bus.on('data:changed', () => render());
    Bus.on('activity:changed', () => { updateActivityDot(); if (ui.activityOpen) renderActivityPanel(); });
    Bus.on('settings:changed', patch => {
      UI.applyTheme();
      $('#app').classList.toggle('sidebar-collapsed', settings().sidebarCollapsed);
      if (patch && Object.keys(patch).every(k => k === 'lastSeenActivity')) { updateActivityDot(); return; }
      if (patch && Object.keys(patch).every(k => k === 'sidebarCollapsed')) return;
      render();
    });
    Bus.on('theme:changed', () => render());
    let lastStorageWarning = 0;
    Bus.on('storage:error', () => {
      if (Date.now() - lastStorageWarning < 5000) return;
      lastStorageWarning = Date.now();
      UI.toast('Browser storage is full — your latest change may not be saved. Remove large attachments or export and clear old data.', { type: 'error', title: 'Storage full', duration: 9000 });
    });
  }

  /* =====================================================================
     Timers: clock, reminders, day rollover
     ===================================================================== */
  function startTimers() {
    setInterval(() => {
      const clock = $('[data-live-clock]');
      if (clock) {
        const { time, suffix } = clockParts();
        if (clock.textContent !== time) { clock.textContent = time; $('[data-live-suffix]').textContent = suffix; }
      }
    }, 1000);
    setInterval(() => {
      checkReminders();
      const day = Utils.todayISO();
      const timerRunning = DB.state.tasks.some(t => t.timerStartedAt && !t.deleted);
      // Avoid re-rendering under the user's cursor while they type in the page.
      const typingInView = isTyping(document.activeElement) && $('#view').contains(document.activeElement);
      if ((day !== ui.lastRenderedDay || timerRunning) && !typingInView) { ui.lastRenderedDay = day; render(); }
    }, 30000);
  }

  /* =====================================================================
     Init
     ===================================================================== */
  function init() {
    DB.init();
    UI.applyTheme();
    ui.view = settings().defaultView;
    $('#app').classList.toggle('sidebar-collapsed', settings().sidebarCollapsed);
    bindEvents();
    onRouteChange();
    startTimers();
    DB.issues.forEach(msg => UI.toast(msg, { type: 'warning', title: 'Data notice', duration: 8000 }));
    setTimeout(checkReminders, 1200);
    const loader = $('#app-loader');
    if (loader) { loader.classList.add('done'); setTimeout(() => loader.remove(), 400); }
  }

  return { init, navigate, render, currentFilters, contextDefaults };
})();

document.addEventListener('DOMContentLoaded', App.init);
