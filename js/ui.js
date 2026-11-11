/* =========================================================================
   TaskFlow — ui.js
   Presentation layer: reusable components, task views (list / board / grid),
   toasts, modals, menus, forms, task details, command palette, sidebar.
   ========================================================================= */
'use strict';

const UI = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const settings = () => DB.state.settings;
  const MAX_INLINE_ATTACHMENT = 1.5 * 1024 * 1024;

  /* =====================================================================
     Small components
     ===================================================================== */
  function priorityBadge(p) {
    const meta = Tasks.PRIORITY[p];
    return `<span class="badge prio-badge prio-${p}"><i class="fa-solid ${meta.icon}"></i>${meta.label}</span>`;
  }

  function statusBadge(s) {
    const meta = Tasks.STATUS[s];
    return `<span class="badge status-badge status-${s}"><i class="${meta.icon}"></i>${meta.label}</span>`;
  }

  function categoryChip(id) {
    const c = Categories.get(id);
    return c ? `<span class="chip" style="--chip:${c.color}"><i class="fa-solid ${c.icon}"></i>${esc(c.name)}</span>` : '';
  }

  function projectChip(id) {
    const p = Projects.get(id);
    return p ? `<span class="chip chip-outline" style="--chip:${p.color}"><i class="fa-solid ${p.icon}"></i>${esc(p.name)}</span>` : '';
  }

  function dueChip(t) {
    if (!t.dueDate) return '';
    const diff = Utils.diffDays(Utils.parseDate(t.dueDate), new Date());
    let cls = '';
    if (Tasks.isOverdue(t)) cls = 'is-overdue';
    else if (!Tasks.isClosed(t) && diff === 0) cls = 'is-today';
    else if (!Tasks.isClosed(t) && diff > 0 && diff <= 2) cls = 'is-soon';
    const time = t.dueTime ? ` · ${esc(Utils.formatTime(t.dueTime))}` : '';
    return `<span class="due ${cls}" title="Due ${esc(Utils.formatDate(t.dueDate))}"><i class="fa-regular fa-calendar"></i>${esc(Utils.friendlyDate(t.dueDate))}${time}</span>`;
  }

  const tagList = tags => tags.map(tag => `<span class="tag">#${esc(tag)}</span>`).join('');

  function progressBar(pct, { size = '', label = '' } = {}) {
    return `<div class="progress ${size}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" ${label ? `aria-label="${esc(label)}"` : ''}><span style="width:${pct}%"></span></div>`;
  }

  function checkbox(t) {
    const done = Tasks.isDone(t);
    if (t.deleted) return `<span class="check is-static ${done ? 'checked' : ''}" aria-hidden="true"><i class="fa-solid fa-check"></i></span>`;
    return `<button type="button" class="check prio-${t.priority} ${done ? 'checked' : ''}" data-action="toggle-complete" data-id="${t.id}"
      role="checkbox" aria-checked="${done}" aria-label="${done ? 'Mark as not completed' : 'Mark as completed'}: ${esc(t.title)}"><i class="fa-solid fa-check"></i></button>`;
  }

  function emptyState({ icon = 'fa-inbox', title, text = '', action = null, secondary = null, compact = false }) {
    const btn = (a, cls) => (a ? `<button type="button" class="btn ${cls}" data-action="${a.action}" ${a.data || ''}>${a.icon ? `<i class="fa-solid ${a.icon}"></i>` : ''}${esc(a.label)}</button>` : '');
    return `
      <div class="empty ${compact ? 'empty-compact' : ''}">
        <div class="empty-art"><i class="fa-solid ${icon}"></i></div>
        <h3>${esc(title)}</h3>
        ${text ? `<p>${esc(text)}</p>` : ''}
        ${action || secondary ? `<div class="empty-actions">${btn(action, 'btn-primary')}${btn(secondary, 'btn-ghost')}</div>` : ''}
      </div>`;
  }

  function taskMeta(t) {
    const p = Tasks.progress(t);
    const parts = [];
    if (t.pinned) parts.push('<span class="meta meta-pin" data-tip="Pinned"><i class="fa-solid fa-thumbtack"></i></span>');
    if (t.projectId) parts.push(projectChip(t.projectId));
    if (p.total) parts.push(`<span class="meta ${p.done === p.total ? 'is-complete' : ''}" data-tip="Subtasks"><i class="fa-solid fa-list-check"></i>${p.done}/${p.total}</span>`);
    if (t.attachments.length) parts.push(`<span class="meta" data-tip="Attachments"><i class="fa-solid fa-paperclip"></i>${t.attachments.length}</span>`);
    if (t.recurring !== 'none') parts.push(`<span class="meta" data-tip="Repeats ${Tasks.RECURRENCE[t.recurring].toLowerCase()}"><i class="fa-solid fa-repeat"></i></span>`);
    if (t.reminder) parts.push('<span class="meta" data-tip="Reminder set"><i class="fa-regular fa-bell"></i></span>');
    if (t.timerStartedAt) parts.push(`<span class="meta meta-timer" data-tip="Timer running"><i class="fa-solid fa-circle"></i>${Utils.formatMinutes(Tasks.elapsed(t))}</span>`);
    if (t.tags.length) parts.push(tagList(t.tags.slice(0, 3)) + (t.tags.length > 3 ? `<span class="tag">+${t.tags.length - 3}</span>` : ''));
    return parts.join('');
  }

  function iconBtn(action, id, icon, tip, extra = '') {
    return `<button type="button" class="icon-btn icon-btn-sm ${extra}" data-action="${action}" data-id="${id}" aria-label="${esc(tip)}" data-tip="${esc(tip)}"><i class="${icon}"></i></button>`;
  }

  /** Quick actions shown on rows / cards depending on the task's lifecycle. */
  function quickActions(t) {
    if (t.deleted) {
      return iconBtn('restore-task', t.id, 'fa-solid fa-rotate-left', 'Restore')
        + iconBtn('destroy-task', t.id, 'fa-solid fa-trash', 'Delete forever', 'danger');
    }
    if (t.archived) {
      return iconBtn('unarchive-task', t.id, 'fa-solid fa-box-open', 'Unarchive')
        + iconBtn('trash-task', t.id, 'fa-regular fa-trash-can', 'Move to Trash', 'danger');
    }
    return iconBtn('toggle-important', t.id, t.important ? 'fa-solid fa-star' : 'fa-regular fa-star', t.important ? 'Unstar' : 'Mark important', t.important ? 'is-starred' : '')
      + iconBtn('edit-task', t.id, 'fa-regular fa-pen-to-square', 'Edit')
      + iconBtn('trash-task', t.id, 'fa-regular fa-trash-can', 'Delete', 'danger')
      + iconBtn('task-menu', t.id, 'fa-solid fa-ellipsis', 'More actions');
  }

  /* =====================================================================
     Task views
     ===================================================================== */
  function taskRow(t) {
    const cls = ['task-row', Tasks.isDone(t) ? 'is-done' : '', t.status === 'cancelled' ? 'is-cancelled' : '', Tasks.isOverdue(t) ? 'is-overdue' : ''].join(' ');
    return `
      <div class="${cls}" data-action="open-task" data-id="${t.id}" tabindex="0" role="listitem" aria-label="${esc(t.title)}">
        <span class="prio-bar prio-${t.priority}" aria-hidden="true"></span>
        ${checkbox(t)}
        <div class="task-main">
          <div class="task-title">${t.important ? '<i class="fa-solid fa-star star-inline" aria-label="Important"></i>' : ''}${esc(t.title)}
            ${t.status === 'in-progress' ? '<span class="badge status-badge status-in-progress badge-xs">In progress</span>' : ''}
            ${t.status === 'cancelled' ? '<span class="badge status-badge status-cancelled badge-xs">Cancelled</span>' : ''}</div>
          <div class="task-meta">${taskMeta(t)}</div>
        </div>
        <div class="col col-cat">${categoryChip(t.categoryId)}</div>
        <div class="col col-due">${dueChip(t) || '<span class="muted">—</span>'}</div>
        <div class="col col-prio">${priorityBadge(t.priority)}</div>
        <div class="row-actions">${quickActions(t)}</div>
      </div>`;
  }

  function renderList(tasks) {
    return `
      <div class="task-list card" role="list">
        <div class="task-list-head" aria-hidden="true">
          <span></span><span></span><span>Task</span><span class="col col-cat">Category</span><span class="col col-due">Due</span><span class="col col-prio">Priority</span><span></span>
        </div>
        ${tasks.map(taskRow).join('')}
      </div>`;
  }

  function taskCard(t) {
    const p = Tasks.progress(t);
    const cls = ['task-card', Tasks.isDone(t) ? 'is-done' : '', Tasks.isOverdue(t) ? 'is-overdue' : ''].join(' ');
    return `
      <article class="${cls}" data-action="open-task" data-id="${t.id}" tabindex="0" aria-label="${esc(t.title)}">
        <header class="task-card-head">
          ${priorityBadge(t.priority)}${statusBadge(t.status)}
          <span class="spacer"></span>
          ${t.pinned ? '<i class="fa-solid fa-thumbtack pin-icon" aria-label="Pinned"></i>' : ''}
        </header>
        <div class="task-card-title">${checkbox(t)}<h3>${esc(t.title)}</h3></div>
        ${t.description ? `<p class="task-card-desc">${esc(t.description)}</p>` : ''}
        ${p.total ? `<div class="task-card-progress"><div class="progress-label"><span>Checklist</span><span>${p.done}/${p.total}</span></div>${progressBar(p.pct, { size: 'sm' })}</div>` : ''}
        ${t.tags.length ? `<div class="tag-row">${tagList(t.tags)}</div>` : ''}
        <footer class="task-card-foot">
          <div class="task-card-chips">${dueChip(t)}${categoryChip(t.categoryId)}${projectChip(t.projectId)}</div>
          <div class="row-actions">${quickActions(t)}</div>
        </footer>
      </article>`;
  }

  const renderGrid = tasks => `<div class="task-grid">${tasks.map(taskCard).join('')}</div>`;

  function boardCard(t) {
    const p = Tasks.progress(t);
    return `
      <article class="board-card ${Tasks.isOverdue(t) ? 'is-overdue' : ''} ${Tasks.isClosed(t) ? 'is-done' : ''}" draggable="${!t.deleted}" data-drag-task="${t.id}"
        data-action="open-task" data-id="${t.id}" tabindex="0" aria-label="${esc(t.title)}">
        <div class="board-card-top">${priorityBadge(t.priority)}<span class="spacer"></span>${t.important ? '<i class="fa-solid fa-star star-inline"></i>' : ''}
          ${iconBtn('task-menu', t.id, 'fa-solid fa-ellipsis', 'More actions')}</div>
        <h4>${esc(t.title)}</h4>
        ${p.total ? `<div class="board-progress">${progressBar(p.pct, { size: 'sm' })}<span>${p.done}/${p.total}</span></div>` : ''}
        <div class="board-card-foot">${dueChip(t)}${categoryChip(t.categoryId)}</div>
      </article>`;
  }

  function renderBoard(tasks) {
    const columns = [
      { status: 'todo', label: 'To Do', icon: 'fa-regular fa-circle' },
      { status: 'in-progress', label: 'In Progress', icon: 'fa-solid fa-circle-half-stroke' },
      { status: 'completed', label: 'Completed', icon: 'fa-solid fa-circle-check' },
      { status: 'cancelled', label: 'Cancelled', icon: 'fa-solid fa-ban' },
    ];
    return `
      <div class="board">
        ${columns.map(col => {
          const list = tasks.filter(t => t.status === col.status);
          return `
            <section class="board-col status-col-${col.status}" data-drop-status="${col.status}" aria-label="${col.label}">
              <header class="board-col-head"><i class="${col.icon}"></i><h3>${col.label}</h3><span class="count">${list.length}</span>
                ${col.status !== 'cancelled' ? `<button type="button" class="icon-btn icon-btn-sm" data-action="board-add" data-status="${col.status}" aria-label="Add task to ${col.label}" data-tip="Add task"><i class="fa-solid fa-plus"></i></button>` : ''}</header>
              <div class="board-col-body">
                ${list.map(boardCard).join('') || '<div class="board-empty">Drop tasks here</div>'}
              </div>
            </section>`;
        }).join('')}
      </div>`;
  }

  /** Compact row used on the dashboard and in day lists. */
  function miniRow(t, { showDate = true } = {}) {
    return `
      <div class="mini-row ${Tasks.isDone(t) ? 'is-done' : ''}" data-action="open-task" data-id="${t.id}" tabindex="0">
        ${checkbox(t)}
        <div class="mini-main"><span class="mini-title">${esc(t.title)}</span>
          <span class="mini-meta">${showDate ? dueChip(t) : (t.dueTime ? `<span class="due"><i class="fa-regular fa-clock"></i>${esc(Utils.formatTime(t.dueTime))}</span>` : '')}${categoryChip(t.categoryId)}</span></div>
        <span class="prio-dot prio-${t.priority}" title="${Tasks.PRIORITY[t.priority].label} priority"></span>
      </div>`;
  }

  /* =====================================================================
     Activity
     ===================================================================== */
  const ACTIVITY_ICONS = {
    created: ['fa-plus', 'indigo'], updated: ['fa-pen', 'blue'], completed: ['fa-check', 'green'], reopened: ['fa-rotate-left', 'slate'],
    deleted: ['fa-trash', 'red'], trashed: ['fa-trash-can', 'red'], restored: ['fa-rotate-left', 'green'], archived: ['fa-box-archive', 'slate'],
    important: ['fa-star', 'amber'], timer: ['fa-stopwatch', 'violet'], recurring: ['fa-repeat', 'violet'], reminder: ['fa-bell', 'amber'],
    overdue: ['fa-triangle-exclamation', 'red'], categories: ['fa-tag', 'indigo'], projects: ['fa-folder', 'violet'], import: ['fa-file-import', 'blue'],
  };

  function activityList(items, { limit = 8 } = {}) {
    if (!items.length) return emptyState({ icon: 'fa-clock-rotate-left', title: 'No activity yet', text: 'Your task history will appear here.', compact: true });
    return `<ol class="timeline">${items.slice(0, limit).map(ev => {
      const [icon, tone] = ACTIVITY_ICONS[ev.type] || ['fa-circle-info', 'slate'];
      const linkable = ev.taskId && Tasks.get(ev.taskId);
      return `<li class="timeline-item ${linkable ? 'is-link' : ''}" ${linkable ? `data-action="open-task" data-id="${ev.taskId}" tabindex="0"` : ''}>
        <span class="timeline-icon tone-${tone}"><i class="fa-solid ${icon}"></i></span>
        <div class="timeline-body"><p>${esc(ev.message)}</p><time datetime="${new Date(ev.at).toISOString()}">${Utils.relativeTime(ev.at)}</time></div>
      </li>`;
    }).join('')}</ol>`;
  }

  /* =====================================================================
     Toasts
     ===================================================================== */
  const TOAST_ICONS = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info', warning: 'fa-triangle-exclamation' };

  function toast(message, { type = 'success', title = '', action = null, duration = 4000 } = {}) {
    const root = $('#toast-root');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `
      <i class="fa-solid ${TOAST_ICONS[type] || TOAST_ICONS.info} toast-icon"></i>
      <div class="toast-body">${title ? `<strong>${esc(title)}</strong>` : ''}<span>${esc(message)}</span></div>
      ${action ? `<button type="button" class="toast-action">${esc(action.label)}</button>` : ''}
      <button type="button" class="toast-close" aria-label="Dismiss"><i class="fa-solid fa-xmark"></i></button>
      <span class="toast-timer" style="animation-duration:${duration}ms"></span>`;
    root.appendChild(el);
    while (root.children.length > 4) root.firstElementChild.remove();
    requestAnimationFrame(() => el.classList.add('show'));
    let timer = setTimeout(dismiss, duration);
    function dismiss() {
      clearTimeout(timer);
      el.classList.remove('show');
      el.classList.add('hide');
      setTimeout(() => el.remove(), 250);
    }
    el.querySelector('.toast-close').addEventListener('click', dismiss);
    if (action) el.querySelector('.toast-action').addEventListener('click', () => { action.onClick(); dismiss(); });
    el.addEventListener('mouseenter', () => { clearTimeout(timer); el.classList.add('paused'); });
    el.addEventListener('mouseleave', () => { el.classList.remove('paused'); timer = setTimeout(dismiss, 1500); });
    return dismiss;
  }

  /* =====================================================================
     Modals
     ===================================================================== */
  const stack = [];
  let modalSeq = 0;

  function openModal({ title, body, footer = '', size = 'md', className = '', onClose = null, refresh = null, onOpen = null }) {
    const id = `modal-${++modalSeq}`;
    const layer = document.createElement('div');
    layer.className = `modal-layer ${className}`;
    layer.innerHTML = `
      <div class="modal modal-${size}" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
        <header class="modal-head"><h2 id="${id}-title">${title}</h2>
          <button type="button" class="icon-btn" data-modal-close aria-label="Close dialog"><i class="fa-solid fa-xmark"></i></button></header>
        <div class="modal-body">${body}</div>
        ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}
      </div>`;
    $('#modal-root').appendChild(layer);
    const entry = { layer, onClose, refresh, returnFocus: document.activeElement };
    stack.push(entry);
    document.body.classList.add('modal-open');

    layer.addEventListener('mousedown', e => { if (e.target === layer) closeModal(entry); });
    layer.addEventListener('click', e => { if (e.target.closest('[data-modal-close]')) closeModal(entry); });
    layer.addEventListener('keydown', e => trapFocus(e, layer));

    requestAnimationFrame(() => {
      layer.classList.add('open');
      const focusTarget = layer.querySelector('[autofocus]') || layer.querySelector('.modal-body input:not([type=hidden]), .modal-body textarea, .modal-body select, .modal-body button') || layer.querySelector('.modal');
      if (focusTarget) focusTarget.focus({ preventScroll: true });
    });
    if (onOpen) onOpen(layer);
    return entry;
  }

  function trapFocus(e, layer) {
    if (e.key !== 'Tab') return;
    const focusables = $$('button:not([disabled]), [href], input:not([disabled]):not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])', layer)
      .filter(el => el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function closeModal(entry = stack[stack.length - 1]) {
    if (!entry) return false;
    const index = stack.indexOf(entry);
    if (index < 0) return false;
    stack.splice(index, 1);
    entry.layer.classList.remove('open');
    setTimeout(() => entry.layer.remove(), 200);
    if (!stack.length) document.body.classList.remove('modal-open');
    if (entry.onClose) entry.onClose();
    if (entry.returnFocus && document.contains(entry.returnFocus)) entry.returnFocus.focus({ preventScroll: true });
    return true;
  }

  const closeAllModals = () => { while (stack.length) closeModal(); };
  const hasModal = () => stack.length > 0;
  const topModal = () => stack[stack.length - 1] || null;
  const refreshModals = () => stack.forEach(entry => entry.refresh && entry.refresh());

  function confirm({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', danger = false, icon = null }) {
    return new Promise(resolve => {
      let answered = false;
      const entry = openModal({
        title: '', size: 'sm', className: 'modal-confirm',
        body: `<div class="confirm">
            <div class="confirm-icon ${danger ? 'tone-red' : 'tone-indigo'}"><i class="fa-solid ${icon || (danger ? 'fa-triangle-exclamation' : 'fa-circle-question')}"></i></div>
            <h3>${esc(title)}</h3><p>${esc(message)}</p></div>`,
        footer: `<button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm autofocus>${esc(confirmLabel)}</button>`,
        onClose: () => { if (!answered) resolve(false); },
      });
      entry.layer.querySelector('[data-confirm]').addEventListener('click', () => { answered = true; resolve(true); closeModal(entry); });
    });
  }

  /* =====================================================================
     Context menu
     ===================================================================== */
  let menuEl = null;

  function openMenu(anchor, items) {
    closeMenu();
    menuEl = document.createElement('div');
    menuEl.className = 'menu';
    menuEl.setAttribute('role', 'menu');
    menuEl.innerHTML = items.map(item => (item === '-' ? '<div class="menu-sep" role="separator"></div>'
      : `<button type="button" role="menuitem" class="menu-item ${item.danger ? 'danger' : ''}" data-action="${item.action}" ${item.id ? `data-id="${item.id}"` : ''} ${item.data || ''}>
          <i class="${item.icon}"></i><span>${esc(item.label)}</span></button>`)).join('');
    document.body.appendChild(menuEl);
    const r = anchor.getBoundingClientRect();
    const m = menuEl.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - m.width - 8, r.right - m.width));
    const top = r.bottom + m.height + 8 > window.innerHeight ? Math.max(8, r.top - m.height - 6) : r.bottom + 6;
    Object.assign(menuEl.style, { left: `${left}px`, top: `${top}px` });
    requestAnimationFrame(() => menuEl && menuEl.classList.add('open'));
    const firstItem = menuEl.querySelector('.menu-item');
    if (firstItem) firstItem.focus({ preventScroll: true });
    menuEl.addEventListener('keydown', e => {
      const list = $$('.menu-item', menuEl);
      const i = list.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    });
  }

  function closeMenu() {
    if (!menuEl) return false;
    menuEl.remove();
    menuEl = null;
    return true;
  }

  function taskMenuItems(t) {
    if (t.deleted) {
      return [
        { label: 'Restore', icon: 'fa-solid fa-rotate-left', action: 'restore-task', id: t.id },
        { label: 'Delete forever', icon: 'fa-solid fa-trash', action: 'destroy-task', id: t.id, danger: true },
      ];
    }
    const statusItems = Object.keys(Tasks.STATUS).filter(s => s !== t.status)
      .map(s => ({ label: `Mark ${Tasks.STATUS[s].label.toLowerCase()}`, icon: Tasks.STATUS[s].icon, action: 'set-status', id: t.id, data: `data-status="${s}"` }));
    return [
      { label: 'View details', icon: 'fa-regular fa-eye', action: 'open-task', id: t.id },
      { label: 'Edit', icon: 'fa-regular fa-pen-to-square', action: 'edit-task', id: t.id },
      { label: 'Duplicate', icon: 'fa-regular fa-copy', action: 'duplicate-task', id: t.id },
      { label: t.pinned ? 'Unpin' : 'Pin to top', icon: 'fa-solid fa-thumbtack', action: 'toggle-pin', id: t.id },
      { label: t.important ? 'Remove star' : 'Mark important', icon: t.important ? 'fa-regular fa-star' : 'fa-solid fa-star', action: 'toggle-important', id: t.id },
      '-',
      ...statusItems,
      '-',
      t.archived
        ? { label: 'Unarchive', icon: 'fa-solid fa-box-open', action: 'unarchive-task', id: t.id }
        : { label: 'Archive', icon: 'fa-solid fa-box-archive', action: 'archive-task', id: t.id },
      { label: 'Move to Trash', icon: 'fa-regular fa-trash-can', action: 'trash-task', id: t.id, danger: true },
    ];
  }

  /* =====================================================================
     Form helpers
     ===================================================================== */
  const option = (value, label, selected) => `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`;
  const priorityOptions = selected => Object.keys(Tasks.PRIORITY).map(p => option(p, Tasks.PRIORITY[p].label, selected)).join('');
  const statusOptions = selected => Object.keys(Tasks.STATUS).map(s => option(s, Tasks.STATUS[s].label, selected)).join('');
  const categoryOptions = (selected, empty = 'No category') => option('', empty, selected) + Categories.list().map(c => option(c.id, c.name, selected)).join('');
  const projectOptions = (selected, empty = 'No project') => option('', empty, selected) + Projects.list().map(p => option(p.id, p.name, selected)).join('');

  function clearErrors(form) {
    $$('.field-error', form).forEach(el => { el.textContent = ''; });
    $$('.has-error', form).forEach(el => el.classList.remove('has-error'));
  }

  function showErrors(form, errors) {
    clearErrors(form);
    let first = null;
    Object.entries(errors).forEach(([field, message]) => {
      const holder = form.querySelector(`[data-error-for="${field}"]`);
      if (holder) holder.textContent = message;
      const input = form.querySelector(`[name="${field}"]`);
      if (input) {
        input.closest('.field')?.classList.add('has-error');
        first = first || input;
      }
    });
    if (first) first.focus();
    else toast(Object.values(errors)[0], { type: 'error' });
  }

  const fieldError = name => `<p class="field-error" data-error-for="${name}" aria-live="polite"></p>`;

  /** Read a form into a plain object (checkboxes → booleans). */
  function formValues(form) {
    const data = {};
    $$('input[name], select[name], textarea[name]', form).forEach(el => {
      if (el.type === 'checkbox') data[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; }
      else if (el.type !== 'file') data[el.name] = el.value.trim();
    });
    return data;
  }

  /** Run a save function and route validation errors back to the form. */
  function handleSave(form, saveFn) {
    try {
      clearErrors(form);
      return saveFn();
    } catch (err) {
      if (err instanceof ValidationError) showErrors(form, err.errors);
      else { console.error(err); toast(err.message || 'Something went wrong', { type: 'error' }); }
      return null;
    }
  }

  /* =====================================================================
     Quick add (inline bar + modal share the same fields & handler)
     ===================================================================== */
  function quickAddFields(defaults = {}, { autofocus = false } = {}) {
    return `
      <div class="qa-title field">
        <i class="fa-solid fa-plus qa-icon" aria-hidden="true"></i>
        <input name="title" class="input" placeholder="Add a task… press Enter to save" maxlength="200" autocomplete="off" aria-label="Task title" ${autofocus ? 'autofocus' : ''} value="${esc(defaults.title || '')}">
      </div>
      <div class="qa-options">
        <label class="qa-opt" data-tip="Priority"><i class="fa-solid fa-flag"></i>
          <select name="priority" aria-label="Priority">${priorityOptions(defaults.priority || settings().defaultPriority)}</select></label>
        <label class="qa-opt" data-tip="Due date"><i class="fa-regular fa-calendar"></i>
          <input type="date" name="dueDate" aria-label="Due date" value="${esc(defaults.dueDate || '')}"></label>
        <label class="qa-opt" data-tip="Category"><i class="fa-solid fa-tag"></i>
          <select name="categoryId" aria-label="Category">${categoryOptions(defaults.categoryId || '')}</select></label>
      </div>
      <input type="hidden" name="projectId" value="${esc(defaults.projectId || '')}">
      <input type="hidden" name="status" value="${esc(defaults.status || 'todo')}">
      <input type="hidden" name="important" value="${defaults.important ? '1' : ''}">`;
  }

  /** Returns the created task or null. Shared by the inline bar and the modal. */
  function submitQuickAdd(form) {
    const v = formValues(form);
    return handleSave(form, () => {
      const task = Tasks.create({ ...v, important: v.important === '1' });
      toast(`“${task.title}” added`, { title: 'Task created', action: { label: 'Open', onClick: () => openTaskDetails(task.id) } });
      return task;
    });
  }

  function openQuickAdd(defaults = {}) {
    const entry = openModal({
      title: '<i class="fa-solid fa-bolt title-icon"></i> Quick add task', size: 'sm', className: 'modal-quick',
      body: `<form id="quick-add-form" class="quick-add-modal" novalidate>${quickAddFields(defaults, { autofocus: true })}${fieldError('title')}</form>`,
      footer: `<button type="button" class="btn btn-link" data-more-options><i class="fa-solid fa-sliders"></i> More options</button>
        <span class="spacer"></span>
        <button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
        <button type="submit" class="btn btn-primary" form="quick-add-form">Save <kbd>↵</kbd></button>`,
    });
    const form = $('#quick-add-form', entry.layer);
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (submitQuickAdd(form)) closeModal(entry);
    });
    $('[data-more-options]', entry.layer).addEventListener('click', () => {
      const v = formValues(form);
      closeModal(entry);
      openTaskForm(null, { ...defaults, ...v, important: v.important === '1' });
    });
  }

  /* =====================================================================
     Full task form (create / edit)
     ===================================================================== */
  function openTaskForm(task = null, defaults = {}) {
    const isEdit = !!task;
    const src = task || {
      title: '', description: '', status: 'todo', priority: settings().defaultPriority, categoryId: '', projectId: '',
      startDate: '', dueDate: '', dueTime: '', reminder: '', reminderAt: '', recurring: 'none', estimate: 0, timeSpent: 0,
      important: false, pinned: false, tags: [], subtasks: [], attachments: [], ...defaults,
    };
    if (!task && defaults.dueDate && defaults.reminder === undefined) src.reminder = settings().defaultReminder;
    const draft = {
      tags: [...(src.tags || [])],
      subtasks: (src.subtasks || []).map(s => ({ ...s })),
      attachments: (src.attachments || []).map(a => ({ ...a })),
    };
    const field = (label, name, control, extra = '') => `<div class="field ${extra}"><label for="tf-${name}">${label}</label>${control}${fieldError(name)}</div>`;
    const select = (name, opts) => `<select id="tf-${name}" name="${name}" class="input">${opts}</select>`;
    const input = (name, type, value, attrs = '') => `<input id="tf-${name}" name="${name}" type="${type}" class="input" value="${esc(value ?? '')}" ${attrs}>`;

    const body = `
      <form id="task-form" class="task-form" novalidate>
        <div class="field">
          <label for="tf-title">Title <span class="req" aria-hidden="true">*</span></label>
          <input id="tf-title" name="title" class="input input-lg" maxlength="200" required autocomplete="off" placeholder="What needs to be done?" value="${esc(src.title)}" autofocus>
          ${fieldError('title')}
        </div>
        ${field('Description', 'description', `<textarea id="tf-description" name="description" class="input" rows="3" maxlength="5000" placeholder="Add details, links or notes…">${esc(src.description)}</textarea>`)}

        <div class="form-section-title">Details</div>
        <div class="form-grid">
          ${field('Status', 'status', select('status', statusOptions(src.status)))}
          ${field('Priority', 'priority', select('priority', priorityOptions(src.priority)))}
          ${field('Category', 'categoryId', select('categoryId', categoryOptions(src.categoryId)))}
          ${field('Project', 'projectId', select('projectId', projectOptions(src.projectId)))}
        </div>

        <div class="form-section-title">Schedule</div>
        <div class="form-grid">
          ${field('Start date', 'startDate', input('startDate', 'date', src.startDate))}
          ${field('Due date', 'dueDate', input('dueDate', 'date', src.dueDate))}
          ${field('Due time', 'dueTime', input('dueTime', 'time', src.dueTime))}
          ${field('Repeat', 'recurring', select('recurring', Object.keys(Tasks.RECURRENCE).map(r => option(r, Tasks.RECURRENCE[r], src.recurring)).join('')))}
          ${field('Reminder', 'reminder', select('reminder', Object.keys(Tasks.REMINDER).map(r => option(r, Tasks.REMINDER[r], src.reminder)).join('')))}
          ${field('Remind me at', 'reminderAt', input('reminderAt', 'datetime-local', src.reminderAt), `reminder-at ${src.reminder === 'custom' ? '' : 'is-hidden'}`)}
        </div>

        <div class="form-section-title">Time</div>
        <div class="form-grid">
          ${field('Estimated time (minutes)', 'estimate', input('estimate', 'number', src.estimate || '', 'min="0" step="5" placeholder="e.g. 45"'))}
          ${field('Actual time spent (minutes)', 'timeSpent', input('timeSpent', 'number', src.timeSpent || '', 'min="0" step="5" placeholder="0"'))}
        </div>

        <div class="form-section-title">Tags</div>
        <div class="tag-input" data-tag-input>
          <div class="tag-chips" data-tag-chips></div>
          <input type="text" class="tag-entry" placeholder="Type a tag and press Enter" maxlength="30" aria-label="Add tag" data-tag-entry>
        </div>

        <div class="form-section-title">Checklist <span class="muted" data-sub-count></span></div>
        <ul class="subtask-editor" data-subtasks></ul>
        <div class="inline-add">
          <input type="text" class="input" placeholder="Add a subtask and press Enter" maxlength="200" aria-label="New subtask" data-subtask-entry>
          <button type="button" class="btn btn-ghost" data-subtask-add><i class="fa-solid fa-plus"></i> Add</button>
        </div>

        <div class="form-section-title">Attachments</div>
        <label class="dropzone">
          <input type="file" multiple data-attach-input>
          <i class="fa-solid fa-cloud-arrow-up"></i>
          <span><strong>Choose files</strong> or drop them here</span>
          <small>Files up to 1.5 MB are stored in your browser; larger files keep their name and size only.</small>
        </label>
        <ul class="attachment-list" data-attachments></ul>

        <div class="toggle-row">
          <label class="switch"><input type="checkbox" name="important" ${src.important ? 'checked' : ''}><span class="switch-ui"></span><span>Mark as important</span></label>
          <label class="switch"><input type="checkbox" name="pinned" ${src.pinned ? 'checked' : ''}><span class="switch-ui"></span><span>Pin to top</span></label>
        </div>
      </form>`;

    const entry = openModal({
      title: isEdit ? 'Edit task' : 'New task', size: 'lg', body,
      footer: `${isEdit ? `<span class="foot-note">Last updated ${Utils.relativeTime(task.updatedAt)}</span>` : '<span class="foot-note"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> to save</span>'}
        <span class="spacer"></span>
        <button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
        <button type="submit" class="btn btn-primary" form="task-form"><i class="fa-solid fa-check"></i> ${isEdit ? 'Save changes' : 'Create task'}</button>`,
    });
    const root = entry.layer;
    const form = $('#task-form', root);
    form.dataset.taskForm = '1';

    /* ---- Tags ---- */
    const renderTags = () => {
      $('[data-tag-chips]', root).innerHTML = draft.tags.map((tag, i) => `<span class="tag tag-removable">#${esc(tag)}<button type="button" data-tag-remove="${i}" aria-label="Remove tag ${esc(tag)}"><i class="fa-solid fa-xmark"></i></button></span>`).join('');
    };
    const addTag = raw => {
      raw.split(',').map(t => t.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-')).filter(Boolean).forEach(tag => {
        if (tag.length > 30) return toast('Tags must be 30 characters or fewer', { type: 'warning' });
        if (draft.tags.includes(tag)) return;
        if (draft.tags.length >= 20) return toast('A task can have up to 20 tags', { type: 'warning' });
        draft.tags.push(tag);
      });
      renderTags();
    };
    const tagEntry = $('[data-tag-entry]', root);
    tagEntry.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ',') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); addTag(tagEntry.value); tagEntry.value = ''; }
      if (e.key === 'Backspace' && !tagEntry.value && draft.tags.length) { draft.tags.pop(); renderTags(); }
    });
    $('[data-tag-input]', root).addEventListener('click', e => {
      const btn = e.target.closest('[data-tag-remove]');
      if (btn) { draft.tags.splice(Number(btn.dataset.tagRemove), 1); renderTags(); }
      else tagEntry.focus();
    });

    /* ---- Subtasks ---- */
    const renderSubtasks = () => {
      $('[data-subtasks]', root).innerHTML = draft.subtasks.map((s, i) => `
        <li class="subtask-edit-row">
          <label class="mini-check"><input type="checkbox" data-sub-done="${i}" ${s.done ? 'checked' : ''} aria-label="Done"><span></span></label>
          <input type="text" class="input input-sm" value="${esc(s.title)}" maxlength="200" data-sub-title="${i}" aria-label="Subtask ${i + 1}">
          <button type="button" class="icon-btn icon-btn-sm danger" data-sub-remove="${i}" aria-label="Remove subtask"><i class="fa-solid fa-xmark"></i></button>
        </li>`).join('');
      const done = draft.subtasks.filter(s => s.done).length;
      $('[data-sub-count]', root).textContent = draft.subtasks.length ? `${done}/${draft.subtasks.length}` : '';
    };
    const subEntry = $('[data-subtask-entry]', root);
    const addSub = () => {
      const title = subEntry.value.trim();
      if (!title) return subEntry.focus();
      draft.subtasks.push({ id: null, title, done: false });
      subEntry.value = '';
      renderSubtasks();
      subEntry.focus();
    };
    subEntry.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); addSub(); } });
    $('[data-subtask-add]', root).addEventListener('click', addSub);
    $('[data-subtasks]', root).addEventListener('input', e => {
      if (e.target.dataset.subTitle !== undefined) draft.subtasks[e.target.dataset.subTitle].title = e.target.value;
    });
    $('[data-subtasks]', root).addEventListener('change', e => {
      if (e.target.dataset.subDone !== undefined) { draft.subtasks[e.target.dataset.subDone].done = e.target.checked; renderSubtasks(); }
    });
    $('[data-subtasks]', root).addEventListener('click', e => {
      const btn = e.target.closest('[data-sub-remove]');
      if (btn) { draft.subtasks.splice(Number(btn.dataset.subRemove), 1); renderSubtasks(); }
    });

    /* ---- Attachments ---- */
    const renderAttachments = () => {
      $('[data-attachments]', root).innerHTML = draft.attachments.map((a, i) => `
        <li class="attachment"><i class="fa-regular ${fileIcon(a)}"></i><span class="attachment-name">${esc(a.name)}</span>
          <span class="muted">${Utils.formatBytes(a.size)}${a.dataUrl ? '' : ' · name only'}</span>
          <button type="button" class="icon-btn icon-btn-sm danger" data-attach-remove="${i}" aria-label="Remove attachment"><i class="fa-solid fa-xmark"></i></button></li>`).join('');
    };
    const addFiles = async files => {
      for (const file of files) {
        if (draft.attachments.length >= 10) { toast('Up to 10 attachments per task', { type: 'warning' }); break; }
        let dataUrl = '';
        if (file.size <= MAX_INLINE_ATTACHMENT) {
          try { dataUrl = await Utils.readFile(file, 'dataURL'); } catch (e) { toast(`Could not read ${file.name}`, { type: 'error' }); continue; }
        } else {
          toast(`${file.name} is larger than 1.5 MB — only its name and size are saved.`, { type: 'warning' });
        }
        draft.attachments.push({ id: null, name: file.name, size: file.size, type: file.type, dataUrl, addedAt: Date.now() });
      }
      renderAttachments();
    };
    const fileInput = $('[data-attach-input]', root);
    fileInput.addEventListener('change', () => { addFiles(Array.from(fileInput.files)); fileInput.value = ''; });
    const dz = $('.dropzone', root);
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('is-over'); }));
    dz.addEventListener('drop', e => addFiles(Array.from(e.dataTransfer.files)));
    $('[data-attachments]', root).addEventListener('click', e => {
      const btn = e.target.closest('[data-attach-remove]');
      if (btn) { draft.attachments.splice(Number(btn.dataset.attachRemove), 1); renderAttachments(); }
    });

    /* ---- Reminder visibility ---- */
    const reminderSelect = $('#tf-reminder', root);
    reminderSelect.addEventListener('change', () => $('.reminder-at', root).classList.toggle('is-hidden', reminderSelect.value !== 'custom'));

    /* ---- Submit ---- */
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (tagEntry.value.trim()) { addTag(tagEntry.value); tagEntry.value = ''; }
      if (subEntry.value.trim()) addSub();
      const v = formValues(form);
      const data = {
        ...v,
        estimate: Number(v.estimate || 0), timeSpent: Number(v.timeSpent || 0),
        reminderAt: v.reminder === 'custom' ? v.reminderAt : '',
        tags: draft.tags,
        subtasks: draft.subtasks.filter(s => s.title.trim()),
        attachments: draft.attachments,
      };
      const saved = handleSave(form, () => (isEdit ? Tasks.update(task.id, data) : Tasks.create(data)));
      if (saved) {
        closeModal(entry);
        toast(isEdit ? 'Your changes have been saved.' : `“${saved.title}” was added.`, {
          title: isEdit ? 'Task updated' : 'Task created',
          action: isEdit ? null : { label: 'Open', onClick: () => openTaskDetails(saved.id) },
        });
      }
    });

    renderTags();
    renderSubtasks();
    renderAttachments();
  }

  function fileIcon(a) {
    const t = a.type || '';
    if (t.startsWith('image/')) return 'fa-file-image';
    if (t === 'application/pdf') return 'fa-file-pdf';
    if (t.startsWith('video/')) return 'fa-file-video';
    if (t.startsWith('audio/')) return 'fa-file-audio';
    if (/zip|compressed|tar/.test(t)) return 'fa-file-zipper';
    if (/sheet|excel|csv/.test(t)) return 'fa-file-excel';
    if (/word|document/.test(t)) return 'fa-file-word';
    if (t.startsWith('text/')) return 'fa-file-lines';
    return 'fa-file';
  }

  /* =====================================================================
     Task details
     ===================================================================== */
  function detailsBody(t) {
    const p = Tasks.progress(t);
    const reminder = Tasks.reminderTime(t);
    const item = (icon, label, value) => `<div class="detail-item"><span class="detail-label"><i class="${icon}"></i>${label}</span><span class="detail-value">${value || '<span class="muted">—</span>'}</span></div>`;
    const timer = t.timerStartedAt
      ? `<button type="button" class="btn btn-sm btn-danger-soft" data-action="stop-timer" data-id="${t.id}"><i class="fa-solid fa-stop"></i> Stop timer</button>`
      : `<button type="button" class="btn btn-sm btn-ghost" data-action="start-timer" data-id="${t.id}" ${t.deleted || Tasks.isClosed(t) ? 'disabled' : ''}><i class="fa-solid fa-play"></i> Start timer</button>`;
    const estimateVsSpent = t.estimate ? progressBar(Math.min(100, Math.round((Tasks.elapsed(t) / t.estimate) * 100)), { size: 'sm', label: 'Time used vs estimate' }) : '';

    return `
      <div class="details">
        ${t.deleted ? '<div class="notice notice-danger"><i class="fa-regular fa-trash-can"></i> This task is in the Trash.</div>' : ''}
        ${t.archived && !t.deleted ? '<div class="notice"><i class="fa-solid fa-box-archive"></i> This task is archived.</div>' : ''}
        <div class="details-title">
          ${checkbox(t)}
          <h3 class="${Tasks.isDone(t) ? 'is-done' : ''}">${esc(t.title)}</h3>
        </div>
        <div class="details-badges">
          ${statusBadge(t.status)}${priorityBadge(t.priority)}${categoryChip(t.categoryId)}${projectChip(t.projectId)}
          ${Tasks.isOverdue(t) ? '<span class="badge badge-danger"><i class="fa-solid fa-triangle-exclamation"></i>Overdue</span>' : ''}
          ${t.important ? '<span class="badge badge-amber"><i class="fa-solid fa-star"></i>Important</span>' : ''}
          ${t.pinned ? '<span class="badge"><i class="fa-solid fa-thumbtack"></i>Pinned</span>' : ''}
        </div>

        ${!t.deleted ? `<div class="details-status">
          <label for="detail-status">Status</label>
          <div class="segmented segmented-sm" id="detail-status">${Object.keys(Tasks.STATUS).map(s => `<button type="button" class="seg-btn ${t.status === s ? 'active' : ''}" data-action="set-status" data-id="${t.id}" data-status="${s}" aria-pressed="${t.status === s}">${Tasks.STATUS[s].label}</button>`).join('')}</div>
        </div>` : ''}

        <div class="detail-grid">
          ${item('fa-regular fa-calendar-plus', 'Start date', t.startDate ? esc(Utils.formatDate(t.startDate)) : '')}
          ${item('fa-regular fa-calendar', 'Due date', t.dueDate ? `${dueChip(t)}` : '')}
          ${item('fa-regular fa-bell', 'Reminder', reminder ? `${esc(Utils.formatDateTime(reminder.getTime()))}${t.reminded ? ' <span class="muted">(sent)</span>' : ''}` : '')}
          ${item('fa-solid fa-repeat', 'Repeats', t.recurring !== 'none' ? Tasks.RECURRENCE[t.recurring] : '')}
          ${item('fa-regular fa-clock', 'Estimate', t.estimate ? Utils.formatMinutes(t.estimate) : '')}
          ${item('fa-solid fa-stopwatch', 'Time spent', `<span class="time-spent">${Utils.formatMinutes(Tasks.elapsed(t))}${t.timerStartedAt ? ' <span class="live-dot"></span>' : ''}</span> ${timer}`)}
          ${item('fa-regular fa-square-plus', 'Created', esc(Utils.formatDateTime(t.createdAt)))}
          ${item('fa-regular fa-pen-to-square', 'Updated', esc(Utils.formatDateTime(t.updatedAt)))}
          ${t.completedAt ? item('fa-regular fa-circle-check', 'Completed', esc(Utils.formatDateTime(t.completedAt))) : ''}
        </div>
        ${estimateVsSpent ? `<div class="estimate-bar"><span class="muted">Time used vs estimate</span>${estimateVsSpent}</div>` : ''}

        <section class="detail-section">
          <h4>Description</h4>
          ${t.description ? `<p class="details-desc">${esc(t.description)}</p>` : '<p class="muted">No description.</p>'}
        </section>

        ${t.tags.length ? `<section class="detail-section"><h4>Tags</h4><div class="tag-row">${tagList(t.tags)}</div></section>` : ''}

        <section class="detail-section">
          <div class="detail-section-head"><h4>Checklist</h4>${p.total ? `<span class="muted">${p.done}/${p.total} completed · ${p.pct}%</span>` : ''}</div>
          ${p.total ? progressBar(p.pct, { label: 'Checklist progress' }) : ''}
          <ul class="subtasks">
            ${t.subtasks.map(s => `
              <li class="subtask ${s.done ? 'is-done' : ''}" data-subtask="${s.id}">
                <button type="button" class="check check-sm ${s.done ? 'checked' : ''}" data-action="subtask-toggle" data-id="${t.id}" data-sub="${s.id}" role="checkbox" aria-checked="${s.done}" aria-label="Toggle subtask" ${t.deleted ? 'disabled' : ''}><i class="fa-solid fa-check"></i></button>
                <span class="subtask-title">${esc(s.title)}</span>
                ${t.deleted ? '' : `<span class="subtask-actions">
                  <button type="button" class="icon-btn icon-btn-sm" data-action="subtask-edit" data-id="${t.id}" data-sub="${s.id}" aria-label="Edit subtask"><i class="fa-regular fa-pen-to-square"></i></button>
                  <button type="button" class="icon-btn icon-btn-sm danger" data-action="subtask-delete" data-id="${t.id}" data-sub="${s.id}" aria-label="Delete subtask"><i class="fa-regular fa-trash-can"></i></button>
                </span>`}
              </li>`).join('')}
          </ul>
          ${t.deleted ? '' : `<form class="inline-add" data-subtask-form="${t.id}" novalidate>
            <input type="text" class="input" name="subtask" placeholder="Add a subtask…" maxlength="200" aria-label="New subtask">
            <button type="submit" class="btn btn-ghost"><i class="fa-solid fa-plus"></i> Add</button>
          </form>`}
        </section>

        <section class="detail-section">
          <h4>Attachments</h4>
          ${t.attachments.length ? `<ul class="attachment-list">${t.attachments.map(a => `
            <li class="attachment"><i class="fa-regular ${fileIcon(a)}"></i><span class="attachment-name">${esc(a.name)}</span>
              <span class="muted">${Utils.formatBytes(a.size)}</span>
              ${a.dataUrl ? `<a class="icon-btn icon-btn-sm" href="${a.dataUrl}" download="${esc(a.name)}" aria-label="Download ${esc(a.name)}" data-tip="Download"><i class="fa-solid fa-download"></i></a>` : '<span class="muted small">name only</span>'}
            </li>`).join('')}</ul>` : '<p class="muted">No attachments. Add files by editing the task.</p>'}
        </section>
      </div>`;
  }

  function detailsFooter(t) {
    if (t.deleted) {
      return `<button type="button" class="btn btn-danger-soft" data-action="destroy-task" data-id="${t.id}"><i class="fa-solid fa-trash"></i> Delete forever</button>
        <span class="spacer"></span>
        <button type="button" class="btn btn-primary" data-action="restore-task" data-id="${t.id}"><i class="fa-solid fa-rotate-left"></i> Restore</button>`;
    }
    return `
      <button type="button" class="icon-btn" data-action="trash-task" data-id="${t.id}" aria-label="Move to Trash" data-tip="Move to Trash"><i class="fa-regular fa-trash-can"></i></button>
      <button type="button" class="icon-btn" data-action="${t.archived ? 'unarchive-task' : 'archive-task'}" data-id="${t.id}" aria-label="${t.archived ? 'Unarchive' : 'Archive'}" data-tip="${t.archived ? 'Unarchive' : 'Archive'}"><i class="fa-solid ${t.archived ? 'fa-box-open' : 'fa-box-archive'}"></i></button>
      <button type="button" class="icon-btn" data-action="duplicate-task" data-id="${t.id}" aria-label="Duplicate" data-tip="Duplicate"><i class="fa-regular fa-copy"></i></button>
      <button type="button" class="icon-btn ${t.pinned ? 'is-active' : ''}" data-action="toggle-pin" data-id="${t.id}" aria-label="${t.pinned ? 'Unpin' : 'Pin'}" data-tip="${t.pinned ? 'Unpin' : 'Pin to top'}"><i class="fa-solid fa-thumbtack"></i></button>
      <button type="button" class="icon-btn ${t.important ? 'is-starred' : ''}" data-action="toggle-important" data-id="${t.id}" aria-label="Toggle important" data-tip="${t.important ? 'Unstar' : 'Mark important'}"><i class="${t.important ? 'fa-solid' : 'fa-regular'} fa-star"></i></button>
      <span class="spacer"></span>
      <button type="button" class="btn btn-ghost" data-modal-close>Close</button>
      <button type="button" class="btn btn-primary" data-action="edit-task" data-id="${t.id}"><i class="fa-regular fa-pen-to-square"></i> Edit</button>`;
  }

  function openTaskDetails(id) {
    const t = Tasks.get(id);
    if (!t) { toast('That task no longer exists.', { type: 'error' }); return; }
    const existing = stack.find(e => e.taskId === id);
    if (existing) return;
    const entry = openModal({
      title: '<i class="fa-regular fa-file-lines title-icon"></i> Task details', size: 'drawer', className: 'modal-drawer',
      body: detailsBody(t), footer: detailsFooter(t),
      refresh: () => {
        const current = Tasks.get(id);
        if (!current) { closeModal(entry); return; }
        const bodyEl = $('.modal-body', entry.layer);
        const scroll = bodyEl.scrollTop;
        bodyEl.innerHTML = detailsBody(current);
        $('.modal-foot', entry.layer).innerHTML = detailsFooter(current);
        bodyEl.scrollTop = scroll;
      },
    });
    entry.taskId = id;
    entry.layer.addEventListener('submit', e => {
      const form = e.target.closest('[data-subtask-form]');
      if (!form) return;
      e.preventDefault();
      const input = form.elements.subtask;
      try {
        Tasks.addSubtask(id, input.value);
        $('[data-subtask-form] input', entry.layer)?.focus();
      } catch (err) { toast(err.message, { type: 'error' }); input.focus(); }
    });
  }

  /** Swap a subtask title for an inline input (Enter saves, Escape cancels). */
  function editSubtaskInline(taskId, subId) {
    const entry = stack.find(e => e.taskId === taskId);
    const li = entry && entry.layer.querySelector(`[data-subtask="${subId}"]`);
    const t = Tasks.get(taskId);
    const s = t && t.subtasks.find(x => x.id === subId);
    if (!li || !s) return;
    const span = li.querySelector('.subtask-title');
    const input = Object.assign(document.createElement('input'), { type: 'text', className: 'input input-sm', value: s.title, maxLength: 200 });
    input.setAttribute('aria-label', 'Edit subtask');
    span.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = save => {
      if (done) return;
      done = true;
      if (save && input.value.trim() && input.value.trim() !== s.title) {
        try { Tasks.updateSubtask(taskId, subId, input.value); } catch (err) { toast(err.message, { type: 'error' }); }
      } else entry.refresh();
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  }

  /* =====================================================================
     Day list (calendar "+N more")
     ===================================================================== */
  function openDayTasks(iso) {
    const render = () => {
      const list = Tasks.query('calendar', App.currentFilters(), 'due').filter(t => t.dueDate === iso);
      return list.length ? `<div class="mini-list">${list.map(t => miniRow(t, { showDate: false })).join('')}</div>`
        : emptyState({ icon: 'fa-calendar-check', title: 'Nothing scheduled', text: 'No tasks are due on this day.', compact: true });
    };
    const entry = openModal({
      title: esc(`${Utils.DAYS[Utils.parseDate(iso).getDay()]}, ${Utils.formatDate(iso)}`), size: 'sm', body: render(),
      footer: `<button type="button" class="btn btn-ghost" data-modal-close>Close</button><button type="button" class="btn btn-primary" data-action="calendar-add" data-date="${iso}"><i class="fa-solid fa-plus"></i> Add task</button>`,
      refresh: () => { $('.modal-body', entry.layer).innerHTML = render(); },
    });
  }

  /* =====================================================================
     Category / project form
     ===================================================================== */
  function openCollectionForm(kind, item = null) {
    const isProject = kind === 'project';
    const Store = isProject ? Projects : Categories;
    const label = isProject ? 'project' : 'category';
    const current = item || { name: '', description: '', color: Categories.COLORS[(Store.list().length) % Categories.COLORS.length], icon: isProject ? 'fa-folder' : 'fa-tag' };
    const body = `
      <form id="collection-form" class="collection-form" novalidate>
        <div class="collection-preview" data-preview><span class="collection-icon" style="--chip:${current.color}"><i class="fa-solid ${current.icon}"></i></span><strong>${esc(current.name || `New ${label}`)}</strong></div>
        <div class="field"><label for="cf-name">Name <span class="req">*</span></label>
          <input id="cf-name" name="name" class="input" maxlength="40" required autocomplete="off" value="${esc(current.name)}" placeholder="${isProject ? 'e.g. Website redesign' : 'e.g. Errands'}" autofocus>${fieldError('name')}</div>
        ${isProject ? `<div class="field"><label for="cf-desc">Description</label><textarea id="cf-desc" name="description" class="input" rows="2" maxlength="300" placeholder="What is this project about?">${esc(current.description || '')}</textarea></div>` : ''}
        <fieldset class="field"><legend>Color</legend><div class="swatches">
          ${Categories.COLORS.map(c => `<label class="swatch" style="--swatch:${c}"><input type="radio" name="color" value="${c}" ${c === current.color ? 'checked' : ''} aria-label="Color ${c}"><span></span></label>`).join('')}
        </div></fieldset>
        <fieldset class="field"><legend>Icon</legend><div class="icon-picker">
          ${Categories.ICONS.map(ic => `<label class="icon-choice"><input type="radio" name="icon" value="${ic}" ${ic === current.icon ? 'checked' : ''} aria-label="${ic.replace('fa-', '')}"><span><i class="fa-solid ${ic}"></i></span></label>`).join('')}
        </div></fieldset>
      </form>`;
    const entry = openModal({
      title: `${item ? 'Edit' : 'New'} ${label}`, size: 'sm', body,
      footer: `${item ? `<button type="button" class="btn btn-danger-soft" data-action="delete-${label}" data-id="${item.id}"><i class="fa-regular fa-trash-can"></i> Delete</button>` : ''}
        <span class="spacer"></span><button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
        <button type="submit" class="btn btn-primary" form="collection-form">${item ? 'Save' : `Create ${label}`}</button>`,
    });
    const form = $('#collection-form', entry.layer);
    const preview = () => {
      const v = formValues(form);
      $('[data-preview]', entry.layer).innerHTML = `<span class="collection-icon" style="--chip:${v.color}"><i class="fa-solid ${v.icon}"></i></span><strong>${esc(v.name || `New ${label}`)}</strong>`;
    };
    form.addEventListener('input', preview);
    form.addEventListener('change', preview);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const v = formValues(form);
      const saved = handleSave(form, () => (item ? Store.update(item.id, v) : Store.create(v)));
      if (saved) {
        closeModal(entry);
        toast(`${isProject ? 'Project' : 'Category'} “${saved.name}” ${item ? 'updated' : 'created'}.`);
      }
    });
  }

  /* =====================================================================
     Shortcuts & command palette
     ===================================================================== */
  const SHORTCUTS = [
    ['N', 'New task (quick add)'], ['/', 'Focus search'], ['Ctrl', 'K', 'Quick actions'], ['Ctrl', '/', 'Show keyboard shortcuts'],
    ['Ctrl', 'Enter', 'Save the open task form'], ['Esc', 'Close dialog, menu or panel'], ['G', 'D', 'Go to Dashboard'],
    ['G', 'T', 'Go to My Tasks'], ['G', 'C', 'Go to Calendar'], ['G', 'A', 'Go to Analytics'],
  ];

  function openShortcuts() {
    if (stack.some(e => e.kind === 'shortcuts')) return;
    const entry = openModal({
      title: '<i class="fa-regular fa-keyboard title-icon"></i> Keyboard shortcuts', size: 'sm',
      body: `<ul class="shortcut-list">${SHORTCUTS.map(s => {
        const keys = s.slice(0, -1);
        const joiner = keys[0] === 'G' ? '<span class="muted">then</span>' : '+';
        return `<li><span>${s[s.length - 1]}</span><span class="keys">${keys.map(k => `<kbd>${k}</kbd>`).join(joiner)}</span></li>`;
      }).join('')}</ul>`,
      footer: '<button type="button" class="btn btn-primary" data-modal-close>Got it</button>',
    });
    entry.kind = 'shortcuts';
  }

  /** commands: [{ label, icon, hint, group, run }] */
  function openCommandPalette(commands) {
    if (stack.some(e => e.kind === 'palette')) return;
    const entry = openModal({
      title: '', size: 'md', className: 'modal-palette',
      body: `<div class="palette">
        <div class="palette-search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" placeholder="Type a command or search tasks…" aria-label="Search commands" autofocus data-palette-input><kbd>Esc</kbd></div>
        <div class="palette-results" role="listbox" data-palette-results></div>
      </div>`,
    });
    entry.kind = 'palette';
    const input = $('[data-palette-input]', entry.layer);
    const results = $('[data-palette-results]', entry.layer);
    let items = [];
    let active = 0;

    const render = () => {
      const q = input.value.trim().toLowerCase();
      const cmds = commands.filter(c => !q || c.label.toLowerCase().includes(q) || (c.keywords || '').includes(q));
      const tasks = q ? Tasks.query('tasks', { search: q }, 'updated').slice(0, 6).map(t => ({
        label: t.title, icon: Tasks.isDone(t) ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle', group: 'Tasks',
        hint: t.dueDate ? Utils.friendlyDate(t.dueDate) : '', run: () => openTaskDetails(t.id),
      })) : [];
      items = [...tasks, ...cmds];
      active = Math.min(active, Math.max(0, items.length - 1));
      if (!items.length) { results.innerHTML = `<p class="palette-empty">No results for “${esc(input.value)}”</p>`; return; }
      let group = '';
      results.innerHTML = items.map((it, i) => {
        const head = it.group !== group ? `<div class="palette-group">${esc((group = it.group))}</div>` : '';
        return `${head}<button type="button" role="option" class="palette-item ${i === active ? 'active' : ''}" data-index="${i}" aria-selected="${i === active}">
          <i class="${it.icon}"></i><span>${esc(it.label)}</span>${it.hint ? `<span class="palette-hint">${esc(it.hint)}</span>` : ''}</button>`;
      }).join('');
      const activeEl = results.querySelector('.palette-item.active');
      if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
    };
    const run = i => { const it = items[i]; if (!it) return; closeModal(entry); it.run(); };

    input.addEventListener('input', () => { active = 0; render(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % Math.max(1, items.length); render(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % Math.max(1, items.length); render(); }
      if (e.key === 'Enter') { e.preventDefault(); run(active); }
    });
    results.addEventListener('click', e => { const btn = e.target.closest('[data-index]'); if (btn) run(Number(btn.dataset.index)); });
    render();
  }

  /* =====================================================================
     Sidebar & theme
     ===================================================================== */
  function renderSidebar(route) {
    const counts = Tasks.counts();
    $$('[data-count]').forEach(el => {
      const n = counts[el.dataset.count] || 0;
      el.textContent = n > 99 ? '99+' : n;
      el.hidden = n === 0;
      el.classList.toggle('badge-alert', el.dataset.count === 'today' && counts.overdue > 0);
    });

    const navItem = (kind, item, count) => `
      <a class="nav-item nav-sub" href="#/${kind}/${item.id}" data-route="${kind}/${item.id}" data-nav-tip="${esc(item.name)}">
        <span class="nav-dot" style="--chip:${item.color}"><i class="fa-solid ${item.icon}"></i></span>
        <span class="nav-label">${esc(item.name)}</span>
        ${count ? `<span class="nav-count">${count}</span>` : ''}
      </a>`;
    $('#nav-categories').innerHTML = Categories.list().map(c => navItem('category', c, Categories.taskCount(c.id))).join('')
      || '<p class="nav-empty">No categories yet</p>';
    $('#nav-projects').innerHTML = Projects.list().map(p => navItem('project', p, Projects.taskCount(p.id))).join('')
      || '<p class="nav-empty">No projects yet</p>';

    $$('.nav-item').forEach(el => {
      const isActive = el.dataset.route === route;
      el.classList.toggle('active', isActive);
      if (isActive) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    });

    const name = settings().userName || 'Guest';
    $('#profile-name').textContent = name;
    $('#profile-avatar').textContent = Utils.initials(settings().userName || 'Guest');
    $('#profile-meta').textContent = `${Utils.plural(counts.tasks, 'open task')}`;
  }

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  function resolvedTheme() {
    const t = settings().theme;
    return t === 'system' ? (media.matches ? 'dark' : 'light') : t;
  }

  function applyTheme() {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme();
    root.dataset.accent = settings().accent;
    root.dataset.density = settings().density;
    const icon = $('#theme-icon');
    if (icon) icon.className = `fa-solid ${resolvedTheme() === 'dark' ? 'fa-sun' : 'fa-moon'}`;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = resolvedTheme() === 'dark' ? '#0b0d12' : '#f7f8fa';
  }
  media.addEventListener('change', () => { if (settings().theme === 'system') { applyTheme(); Bus.emit('theme:changed'); } });

  return {
    $, $$, priorityBadge, statusBadge, categoryChip, projectChip, dueChip, tagList, progressBar, checkbox, emptyState,
    renderList, renderGrid, renderBoard, miniRow, activityList, toast, openModal, closeModal, closeAllModals, hasModal, topModal,
    refreshModals, confirm, openMenu, closeMenu, taskMenuItems, quickAddFields, submitQuickAdd, openQuickAdd, openTaskForm,
    openTaskDetails, editSubtaskInline, openDayTasks, openCollectionForm, openShortcuts, openCommandPalette, renderSidebar,
    applyTheme, resolvedTheme, priorityOptions, statusOptions, categoryOptions, projectOptions, option, handleSave, formValues,
  };
})();
