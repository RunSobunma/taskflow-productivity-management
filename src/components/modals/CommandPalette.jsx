/* Ctrl+K command palette: navigation, actions and live task search. */
import { useEffect, useRef, useState } from 'react';
import Modal from '../Modal.jsx';
import { DB } from '../../lib/storage.js';
import { Tasks } from '../../lib/tasks.js';
import { Categories } from '../../lib/categories.js';
import { Projects } from '../../lib/projects.js';
import { Utils } from '../../lib/utils.js';
import { useActions } from '../../hooks/useActions.js';
import { resolvedTheme } from '../../hooks/useTheme.js';
import { contextDefaults, parsePath } from '../../routes.js';
import { cx } from '../common.jsx';

export default function CommandPalette({ onClose }) {
  const actions = useActions();
  const closeRef = useRef(null);
  const listRef = useRef(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const defaults = contextDefaults(parsePath(window.location.hash.replace(/^#/, '') || '/'));

  const go = (label, route, icon, keywords = '') => ({ label: `Go to ${label}`, icon: `fa-solid ${icon}`, group: 'Navigation', keywords, run: () => actions.go(route) });
  const commands = [
    { label: 'New task', icon: 'fa-solid fa-plus', group: 'Actions', hint: 'Full form', keywords: 'create add', run: () => actions.newTask(defaults) },
    { label: 'Quick add task', icon: 'fa-solid fa-bolt', group: 'Actions', hint: 'N', keywords: 'create add', run: () => actions.quickAdd(defaults) },
    { label: 'New project', icon: 'fa-solid fa-folder-plus', group: 'Actions', run: () => actions.newCollection('project') },
    { label: 'New category', icon: 'fa-solid fa-tag', group: 'Actions', run: () => actions.newCollection('category') },
    { label: `Switch to ${resolvedTheme() === 'dark' ? 'light' : 'dark'} theme`, icon: 'fa-solid fa-circle-half-stroke', group: 'Actions', keywords: 'theme dark light mode',
      run: () => DB.updateSettings({ theme: resolvedTheme() === 'dark' ? 'light' : 'dark' }) },
    { label: 'Export backup (JSON)', icon: 'fa-solid fa-file-export', group: 'Actions', keywords: 'download', run: actions.exportJSON },
    { label: 'Export tasks (CSV)', icon: 'fa-solid fa-file-csv', group: 'Actions', keywords: 'download excel', run: actions.exportCSV },
    { label: 'Keyboard shortcuts', icon: 'fa-regular fa-keyboard', group: 'Actions', hint: 'Ctrl /', run: actions.openShortcuts },
    go('Dashboard', 'dashboard', 'fa-house', 'home'), go('My Tasks', 'tasks', 'fa-list-check'), go('Inbox', 'inbox', 'fa-inbox'),
    go('Today', 'today', 'fa-calendar-day'), go('Upcoming', 'upcoming', 'fa-calendar-week'), go('Calendar', 'calendar', 'fa-calendar'),
    go('Important', 'important', 'fa-star', 'starred'), go('Analytics', 'analytics', 'fa-chart-line', 'stats charts'),
    go('Completed', 'completed', 'fa-circle-check'), go('Archived', 'archived', 'fa-box-archive'), go('Trash', 'trash', 'fa-trash-can', 'deleted'),
    go('Categories & Projects', 'organize', 'fa-shapes'), go('Settings', 'settings', 'fa-gear', 'preferences'),
    ...Projects.list().map(p => ({ label: p.name, icon: `fa-solid ${p.icon}`, group: 'Projects', run: () => actions.go(`project/${p.id}`) })),
    ...Categories.list().map(c => ({ label: c.name, icon: `fa-solid ${c.icon}`, group: 'Categories', run: () => actions.go(`category/${c.id}`) })),
  ];

  const q = query.trim().toLowerCase();
  const taskItems = q ? Tasks.query('tasks', { search: q }, 'updated').slice(0, 6).map(t => ({
    label: t.title, icon: Tasks.isDone(t) ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle', group: 'Tasks',
    hint: t.dueDate ? Utils.friendlyDate(t.dueDate) : '', run: () => actions.openTask(t.id),
  })) : [];
  const items = [...taskItems, ...commands.filter(c => !q || c.label.toLowerCase().includes(q) || (c.keywords || '').includes(q))];
  const current = Math.min(active, Math.max(0, items.length - 1));

  useEffect(() => {
    const el = listRef.current && listRef.current.querySelector('.palette-item.active');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [current, query]);

  const run = i => {
    const item = items[i];
    if (!item) return;
    closeRef.current();
    item.run();
  };

  const onKeyDown = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((current + 1) % Math.max(1, items.length)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((current - 1 + items.length) % Math.max(1, items.length)); }
    if (e.key === 'Enter') { e.preventDefault(); run(current); }
  };

  let group = '';
  return (
    <Modal title="" size="md" className="modal-palette" onClose={onClose} closeRef={closeRef}>
      <div className="palette">
        <div className="palette-search">
          <i className="fa-solid fa-magnifying-glass" />
          <input type="text" placeholder="Type a command or search tasks…" aria-label="Search commands" autoFocus data-palette-input
            value={query} onChange={e => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKeyDown} />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-results" role="listbox" ref={listRef}>
          {!items.length && <p className="palette-empty">No results for “{query}”</p>}
          {items.map((item, i) => {
            const head = item.group !== group ? <div className="palette-group">{(group = item.group)}</div> : null;
            return (
              <div key={`${item.group}-${item.label}-${i}`}>
                {head}
                <button type="button" role="option" aria-selected={i === current} className={cx('palette-item', i === current && 'active')}
                  onClick={() => run(i)} onMouseMove={() => i !== current && setActive(i)}>
                  <i className={item.icon} /><span>{item.label}</span>{item.hint && <span className="palette-hint">{item.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
