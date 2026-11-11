/* =========================================================================
   TaskFlow — calendar.js
   Month & week calendar rendering. Tasks appear on their due dates,
   empty space adds a task on that date, chips can be dragged to reschedule.
   ========================================================================= */
'use strict';

const CalendarView = (() => {
  const state = { mode: 'month', cursor: new Date() };
  const MAX_CHIPS = 3;

  function title() {
    const c = state.cursor;
    if (state.mode === 'month') return `${Utils.MONTHS[c.getMonth()]} ${c.getFullYear()}`;
    const start = Utils.startOfWeek(c);
    const end = Utils.addDays(start, 6);
    const sameMonth = start.getMonth() === end.getMonth();
    return `${Utils.MONTHS_SHORT[start.getMonth()]} ${start.getDate()} – ${sameMonth ? '' : `${Utils.MONTHS_SHORT[end.getMonth()]} `}${end.getDate()}, ${end.getFullYear()}`;
  }

  /** Map of ISO date → tasks sorted by time then priority. */
  function groupByDate(tasks) {
    const map = {};
    tasks.filter(t => t.dueDate).forEach(t => { (map[t.dueDate] = map[t.dueDate] || []).push(t); });
    Object.values(map).forEach(list => list.sort((a, b) =>
      (a.dueTime || '99').localeCompare(b.dueTime || '99') || Tasks.PRIORITY[b.priority].rank - Tasks.PRIORITY[a.priority].rank));
    return map;
  }

  function chipColor(t) {
    const cat = Categories.get(t.categoryId);
    return cat ? cat.color : 'var(--accent)';
  }

  function chip(t) {
    const classes = ['cal-chip', `prio-${t.priority}`, Tasks.isClosed(t) ? 'is-done' : '', Tasks.isOverdue(t) ? 'is-overdue' : ''].join(' ');
    const time = t.dueTime ? `<span class="cal-chip-time">${esc(Utils.formatTime(t.dueTime))}</span>` : '';
    return `<button type="button" class="${classes}" draggable="true" data-drag-task="${t.id}" data-action="open-task" data-id="${t.id}"
      style="--chip-color:${chipColor(t)}" title="${esc(t.title)}">${time}<span class="cal-chip-title">${esc(t.title)}</span></button>`;
  }

  function toolbar() {
    const modeBtn = (mode, label) => `<button type="button" class="seg-btn ${state.mode === mode ? 'active' : ''}" data-action="cal-mode" data-mode="${mode}" aria-pressed="${state.mode === mode}">${label}</button>`;
    return `
      <div class="cal-toolbar">
        <div class="cal-nav">
          <button type="button" class="icon-btn" data-action="cal-prev" aria-label="Previous" data-tip="Previous"><i class="fa-solid fa-chevron-left"></i></button>
          <button type="button" class="icon-btn" data-action="cal-next" aria-label="Next" data-tip="Next"><i class="fa-solid fa-chevron-right"></i></button>
          <h2 class="cal-title">${esc(title())}</h2>
          <button type="button" class="btn btn-ghost btn-sm" data-action="cal-today">Today</button>
        </div>
        <div class="segmented">${modeBtn('month', 'Month')}${modeBtn('week', 'Week')}</div>
      </div>`;
  }

  function renderMonth(byDate) {
    const first = Utils.startOfMonth(state.cursor);
    const gridStart = Utils.startOfWeek(first);
    const todayIso = Utils.todayISO();
    const head = Utils.weekdayOrder().map(d => `<div class="cal-head">${d}</div>`).join('');
    const cells = Array.from({ length: 42 }, (_, i) => {
      const date = Utils.addDays(gridStart, i);
      const iso = Utils.toISODate(date);
      const list = byDate[iso] || [];
      const extra = list.length - MAX_CHIPS;
      const classes = ['cal-cell', date.getMonth() !== first.getMonth() ? 'is-outside' : '', iso === todayIso ? 'is-today' : ''].join(' ');
      return `
        <div class="${classes}" data-action="calendar-add" data-date="${iso}" data-drop-date="${iso}" role="gridcell" aria-label="${esc(Utils.formatDate(iso))}, ${Utils.plural(list.length, 'task')}">
          <div class="cal-cell-top">
            <span class="cal-day">${date.getDate()}</span>
            <span class="cal-add" aria-hidden="true"><i class="fa-solid fa-plus"></i></span>
          </div>
          <div class="cal-chips">
            ${list.slice(0, MAX_CHIPS).map(chip).join('')}
            ${extra > 0 ? `<button type="button" class="cal-more" data-action="calendar-day" data-date="${iso}">+${extra} more</button>` : ''}
          </div>
        </div>`;
    }).join('');
    return `<div class="cal-month" role="grid">${head}${cells}</div>`;
  }

  function renderWeek(byDate) {
    const start = Utils.startOfWeek(state.cursor);
    const todayIso = Utils.todayISO();
    const cols = Array.from({ length: 7 }, (_, i) => {
      const date = Utils.addDays(start, i);
      const iso = Utils.toISODate(date);
      const list = byDate[iso] || [];
      const items = list.map(t => {
        const cat = Categories.get(t.categoryId);
        const p = Tasks.progress(t);
        return `
          <button type="button" class="week-task prio-${t.priority} ${Tasks.isClosed(t) ? 'is-done' : ''} ${Tasks.isOverdue(t) ? 'is-overdue' : ''}"
            draggable="true" data-drag-task="${t.id}" data-action="open-task" data-id="${t.id}" style="--chip-color:${chipColor(t)}">
            <span class="week-task-time">${t.dueTime ? esc(Utils.formatTime(t.dueTime)) : 'All day'}</span>
            <span class="week-task-title">${esc(t.title)}</span>
            <span class="week-task-meta">
              ${cat ? `<span><i class="fa-solid ${cat.icon}"></i> ${esc(cat.name)}</span>` : ''}
              ${p.total ? `<span><i class="fa-solid fa-list-check"></i> ${p.done}/${p.total}</span>` : ''}
            </span>
          </button>`;
      }).join('');
      return `
        <div class="week-col ${iso === todayIso ? 'is-today' : ''}" data-drop-date="${iso}">
          <div class="week-col-head">
            <span class="week-dow">${Utils.DAYS_SHORT[date.getDay()]}</span>
            <span class="week-date">${date.getDate()}</span>
          </div>
          <div class="week-col-body">
            ${items || '<p class="week-empty">No tasks</p>'}
          </div>
          <button type="button" class="week-add" data-action="calendar-add" data-date="${iso}"><i class="fa-solid fa-plus"></i> Add task</button>
        </div>`;
    }).join('');
    return `<div class="cal-week">${cols}</div>`;
  }

  /** Full calendar markup for the supplied (already filtered) tasks. */
  function render(tasks) {
    const byDate = groupByDate(tasks);
    const undated = tasks.filter(t => !t.dueDate && !Tasks.isClosed(t)).length;
    return `
      <div class="calendar card">
        ${toolbar()}
        ${state.mode === 'month' ? renderMonth(byDate) : renderWeek(byDate)}
        ${undated ? `<p class="cal-footnote"><i class="fa-regular fa-calendar-xmark"></i> ${Utils.plural(undated, 'open task')} without a due date ${undated === 1 ? 'is' : 'are'} not shown.</p>` : ''}
      </div>`;
  }

  function navigate(direction) {
    state.cursor = state.mode === 'month'
      ? Utils.addMonths(Utils.startOfMonth(state.cursor), direction)
      : Utils.addDays(state.cursor, 7 * direction);
  }
  const goToday = () => { state.cursor = new Date(); };
  const setMode = mode => { if (mode === 'month' || mode === 'week') state.mode = mode; };

  return { state, render, navigate, goToday, setMode, groupByDate };
})();
