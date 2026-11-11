/* Collapsible sidebar: navigation with live badges, projects, categories, profile. */
import { NavLink, Link } from 'react-router-dom';
import { DB } from '../lib/storage.js';
import { Tasks } from '../lib/tasks.js';
import { Categories } from '../lib/categories.js';
import { Projects } from '../lib/projects.js';
import { Utils } from '../lib/utils.js';
import { useActions } from '../hooks/useActions.js';
import { cx } from './common.jsx';

const MAIN = [
  ['dashboard', 'Dashboard', 'fa-solid fa-house'],
  ['tasks', 'My Tasks', 'fa-solid fa-list-check', 'tasks'],
  ['inbox', 'Inbox', 'fa-solid fa-inbox', 'inbox'],
  ['today', 'Today', 'fa-solid fa-calendar-day', 'today'],
  ['upcoming', 'Upcoming', 'fa-solid fa-calendar-week', 'upcoming'],
  ['calendar', 'Calendar', 'fa-regular fa-calendar'],
  ['important', 'Important', 'fa-solid fa-star', 'important'],
  ['analytics', 'Analytics', 'fa-solid fa-chart-line'],
];
const LIBRARY = [
  ['completed', 'Completed', 'fa-solid fa-circle-check', 'completed'],
  ['archived', 'Archived', 'fa-solid fa-box-archive', 'archived'],
  ['trash', 'Trash', 'fa-regular fa-trash-can', 'trash'],
];

function NavItem({ to, label, icon, count, muted, alert }) {
  return (
    <NavLink to={`/${to}`} className="nav-item" data-nav-tip={label}>
      <i className={icon} /><span className="nav-label">{label}</span>
      {count > 0 && <span className={cx('nav-badge', muted && 'muted-badge', alert && 'badge-alert')}>{count > 99 ? '99+' : count}</span>}
    </NavLink>
  );
}

function SubItem({ kind, item, count }) {
  return (
    <NavLink to={`/${kind}/${item.id}`} className="nav-item nav-sub" data-nav-tip={item.name}>
      <span className="nav-dot" style={{ '--chip': item.color }}><i className={`fa-solid ${item.icon}`} /></span>
      <span className="nav-label">{item.name}</span>
      {count > 0 && <span className="nav-count">{count}</span>}
    </NavLink>
  );
}

export default function Sidebar({ onClose }) {
  const actions = useActions();
  const counts = Tasks.counts();
  const { userName, sidebarCollapsed } = DB.state.settings;

  return (
    <aside className="sidebar" id="sidebar" aria-label="Sidebar">
      <div className="sidebar-top">
        <Link className="brand" to="/dashboard" aria-label="TaskFlow home">
          <img src="./logo.svg" alt="" width="30" height="30" />
          <span className="brand-name">TaskFlow</span>
        </Link>
        <button type="button" className="icon-btn collapse-btn desktop-only" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          data-tip={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => DB.updateSettings({ sidebarCollapsed: !sidebarCollapsed })}>
          <i className="fa-solid fa-angles-left" />
        </button>
        <button type="button" className="icon-btn mobile-only" aria-label="Close menu" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
      </div>

      <button type="button" className="btn btn-primary quick-add-btn" data-nav-tip="Quick add (N)" onClick={() => actions.quickAdd()}>
        <i className="fa-solid fa-plus" /><span className="nav-label">Quick Add Task</span><kbd className="nav-label">N</kbd>
      </button>

      <nav className="nav" aria-label="Main navigation">
        <div className="nav-section">
          {MAIN.map(([to, label, icon, countKey]) => (
            <NavItem key={to} to={to} label={label} icon={icon} count={countKey ? counts[countKey] : 0} alert={to === 'today' && counts.overdue > 0} />
          ))}
        </div>

        <div className="nav-section">
          <p className="nav-heading"><span className="nav-label">Library</span></p>
          {LIBRARY.map(([to, label, icon, countKey]) => <NavItem key={to} to={to} label={label} icon={icon} count={counts[countKey]} muted />)}
        </div>

        <div className="nav-section">
          <div className="nav-heading">
            <Link className="nav-label nav-heading-link" to="/organize">Projects</Link>
            <button type="button" className="icon-btn icon-btn-xs nav-label" aria-label="New project" data-tip="New project" onClick={() => actions.newCollection('project')}><i className="fa-solid fa-plus" /></button>
          </div>
          <div className="nav-group">
            {Projects.list().length
              ? Projects.list().map(p => <SubItem key={p.id} kind="project" item={p} count={Projects.taskCount(p.id)} />)
              : <p className="nav-empty">No projects yet</p>}
          </div>
          <div className="nav-heading">
            <Link className="nav-label nav-heading-link" to="/organize">Categories</Link>
            <button type="button" className="icon-btn icon-btn-xs nav-label" aria-label="New category" data-tip="New category" onClick={() => actions.newCollection('category')}><i className="fa-solid fa-plus" /></button>
          </div>
          <div className="nav-group">
            {Categories.list().length
              ? Categories.list().map(c => <SubItem key={c.id} kind="category" item={c} count={Categories.taskCount(c.id)} />)
              : <p className="nav-empty">No categories yet</p>}
          </div>
          <NavItem to="organize" label="Manage all" icon="fa-solid fa-shapes" />
        </div>
      </nav>

      <div className="sidebar-footer">
        <NavItem to="settings" label="Settings" icon="fa-solid fa-gear" />
        <Link className="profile" to="/settings" aria-label="Profile settings">
          <span className="avatar">{Utils.initials(userName || 'Guest')}</span>
          <span className="profile-text nav-label"><strong>{userName || 'Guest'}</strong><small>{Utils.plural(counts.tasks, 'open task')}</small></span>
        </Link>
      </div>
    </aside>
  );
}
