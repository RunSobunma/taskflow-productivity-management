/* Top bar: page title, global search, quick actions, theme, notifications. */
import { useEffect, useRef } from 'react';
import { DB } from '../lib/storage.js';
import { useActions } from '../hooks/useActions.js';
import { resolvedTheme } from '../hooks/useTheme.js';
import ActivityList from './ActivityList.jsx';

const ALERT_TYPES = ['reminder', 'overdue', 'recurring', 'import'];

export default function Topbar({ title, subtitle, search, onSearch, searchRef, onOpenSidebar, activityOpen, setActivityOpen, onNewTask }) {
  const actions = useActions();
  const panelRef = useRef(null);
  const bellRef = useRef(null);
  const { lastSeenActivity } = DB.state.settings;
  const activity = DB.state.activity;
  const unread = activity.filter(ev => ALERT_TYPES.includes(ev.type) && ev.at > lastSeenActivity).length;
  const dark = resolvedTheme() === 'dark';

  // Close the panel on outside click.
  useEffect(() => {
    if (!activityOpen) return undefined;
    const onDown = e => {
      if (panelRef.current && !panelRef.current.contains(e.target) && !bellRef.current.contains(e.target)) setActivityOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [activityOpen, setActivityOpen]);

  const toggleActivity = () => {
    if (!activityOpen) DB.updateSettings({ lastSeenActivity: Date.now() });
    setActivityOpen(!activityOpen);
  };

  return (
    <header className="topbar">
      <button type="button" className="icon-btn mobile-only" aria-label="Open menu" onClick={onOpenSidebar}><i className="fa-solid fa-bars" /></button>
      <div className="topbar-title">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="search-box">
        <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
        <input ref={searchRef} id="global-search" type="search" placeholder="Search tasks, tags, categories…" aria-label="Search tasks" autoComplete="off"
          value={search} onChange={e => onSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} />
        <kbd>/</kbd>
      </div>
      <div className="topbar-actions">
        <button type="button" className="icon-btn" aria-label="Quick actions" data-tip="Quick actions (Ctrl+K)" data-role="palette" onClick={actions.openPalette}><i className="fa-solid fa-bolt" /></button>
        <button type="button" className="icon-btn" aria-label="Keyboard shortcuts" data-tip="Shortcuts (Ctrl+/)" data-role="shortcuts" onClick={actions.openShortcuts}><i className="fa-regular fa-keyboard" /></button>
        <button type="button" className="icon-btn" aria-label="Toggle theme" data-tip="Toggle theme" onClick={() => DB.updateSettings({ theme: dark ? 'light' : 'dark' })}>
          <i className={`fa-solid ${dark ? 'fa-sun' : 'fa-moon'}`} />
        </button>
        <div className="activity-wrap">
          <button ref={bellRef} type="button" className="icon-btn" aria-label="Notifications and activity" aria-expanded={activityOpen} aria-controls="activity-panel"
            data-tip="Notifications" onClick={toggleActivity}>
            <i className="fa-regular fa-bell" />{unread > 0 && <span className="notif-dot">{unread > 9 ? '9+' : unread}</span>}
          </button>
          {activityOpen && (
            <div className="popover activity-panel" id="activity-panel" ref={panelRef}>
              <header className="popover-head">
                <h3>Notifications &amp; activity</h3>
                <button type="button" className="btn btn-link btn-sm" disabled={!activity.length} onClick={actions.clearActivity}>Clear</button>
              </header>
              <div className="popover-body"><ActivityList items={activity} limit={40} /></div>
            </div>
          )}
        </div>
        <button type="button" className="btn btn-primary new-task-btn" onClick={onNewTask}><i className="fa-solid fa-plus" /><span>New Task</span></button>
      </div>
    </header>
  );
}
