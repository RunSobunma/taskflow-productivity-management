/* Settings: profile, appearance, task defaults, notifications, data management. */
import { useEffect, useRef, useState } from 'react';
import { DB } from '../lib/storage.js';
import { Tasks } from '../lib/tasks.js';
import { Utils } from '../lib/utils.js';
import { useUI } from '../context/AppContext.jsx';
import { useActions } from '../hooks/useActions.js';
import { cx } from '../components/common.jsx';

function Row({ title, desc, children }) {
  return (
    <div className="setting-row">
      <div className="setting-text"><h4>{title}</h4><p>{desc}</p></div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function Card({ icon, title, desc, action, children }) {
  return (
    <section className="card settings-card">
      <header className="card-head"><div><h3><i className={icon} /> {title}</h3><p>{desc}</p></div>{action}</header>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const s = DB.state.settings;
  const actions = useActions();
  const { toast } = useUI();
  const fileRef = useRef(null);
  const [name, setName] = useState(s.userName);
  useEffect(() => setName(s.userName), [s.userName]);   // stay in sync after import / clear
  const update = patch => DB.updateSettings(patch);

  const seg = (key, options) => (
    <div className="segmented" role="group">
      {options.map(([value, label, icon]) => {
        const active = String(s[key]) === String(value);
        return (
          <button key={value} type="button" className={cx('seg-btn', active && 'active')} aria-pressed={active} data-setting={`${key}:${value}`}
            onClick={() => update({ [key]: value })}>
            {icon && <i className={`fa-solid ${icon}`} />}<span>{label}</span>
          </button>
        );
      })}
    </div>
  );
  const select = (key, options) => (
    <select className="input input-sm" aria-label={key} value={s[key]} data-setting={key} onChange={e => update({ [key]: e.target.value })}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  const toggle = (key, onChange) => (
    <label className="switch">
      <input type="checkbox" checked={!!s[key]} data-setting={key} onChange={e => (onChange ? onChange(e.target.checked) : update({ [key]: e.target.checked }))} />
      <span className="switch-ui" />
    </label>
  );

  const permission = 'Notification' in window ? Notification.permission : 'unsupported';
  const permText = {
    granted: 'Browser notifications are enabled.',
    denied: 'Blocked in browser settings — in-app notifications will be used.',
    default: 'Not yet enabled.',
    unsupported: 'Not supported in this browser — in-app notifications will be used.',
  }[permission];
  const sample = Utils.todayISO();

  const saveName = () => {
    if (name.trim() === DB.state.settings.userName) return;
    update({ userName: name });
    toast('Profile updated.');
  };

  return (
    <div className="settings">
      <Card icon="fa-regular fa-user" title="Profile" desc="How TaskFlow greets you">
        <Row title="Display name" desc="Shown in the greeting and sidebar.">
          <input className="input input-sm" maxLength={40} placeholder="Your name" aria-label="Display name" data-setting="userName"
            value={name} onChange={e => setName(e.target.value)} onBlur={saveName} onKeyDown={e => { if (e.key === 'Enter') { saveName(); e.currentTarget.blur(); } }} />
        </Row>
      </Card>

      <Card icon="fa-solid fa-palette" title="Appearance" desc="Theme, colours and density">
        <Row title="Theme" desc="Choose light, dark, or follow your system.">
          {seg('theme', [['light', 'Light', 'fa-sun'], ['dark', 'Dark', 'fa-moon'], ['system', 'System', 'fa-desktop']])}
        </Row>
        <Row title="Accent colour" desc="Used for buttons, highlights and charts.">
          <div className="accent-picker">
            {DB.ACCENTS.map(a => (
              <button key={a} type="button" className={cx('accent-swatch', `accent-${a}`, s.accent === a && 'active')} aria-label={a} aria-pressed={s.accent === a}
                data-tip={a[0].toUpperCase() + a.slice(1)} data-setting={`accent:${a}`} onClick={() => update({ accent: a })}><i className="fa-solid fa-check" /></button>
            ))}
          </div>
        </Row>
        <Row title="Layout density" desc="Compact shows more tasks on screen.">
          {seg('density', [['comfortable', 'Comfortable', 'fa-expand'], ['compact', 'Compact', 'fa-compress']])}
        </Row>
      </Card>

      <Card icon="fa-solid fa-list-check" title="Tasks" desc="Defaults and formatting">
        <Row title="Default priority" desc="Applied to new tasks.">{select('defaultPriority', Object.keys(Tasks.PRIORITY).map(p => [p, Tasks.PRIORITY[p].label]))}</Row>
        <Row title="Default task view" desc="The view used when TaskFlow opens.">{select('defaultView', [['list', 'List'], ['board', 'Board'], ['grid', 'Grid'], ['calendar', 'Calendar']])}</Row>
        <Row title="Week starts on" desc="Affects calendars and weekly stats.">{seg('weekStart', [[1, 'Monday'], [0, 'Sunday']])}</Row>
        <Row title="Date format" desc={`Preview: ${Utils.formatDate(sample)}`}>{select('dateFormat', DB.DATE_FORMATS.map(f => [f, `${Utils.formatDate(sample, f)}  (${f})`]))}</Row>
        <Row title="Time format" desc={`Preview: ${Utils.formatTime('14:30')}`}>{seg('timeFormat', [['12', '12-hour'], ['24', '24-hour']])}</Row>
      </Card>

      <Card icon="fa-regular fa-bell" title="Reminders & notifications" desc={permText}>
        <Row title="Browser notifications" desc="Show system notifications for reminders and overdue tasks.">
          {toggle('notifications', checked => {
            update({ notifications: checked });
            if (checked && permission === 'default') actions.requestNotificationPermission();
          })}
          {permission === 'default' && <button type="button" className="btn btn-ghost btn-sm" onClick={actions.requestNotificationPermission}>Allow</button>}
        </Row>
        <Row title="Overdue alerts" desc="Notify once when a task becomes overdue.">{toggle('overdueAlerts')}</Row>
        <Row title="Default reminder" desc="Applied to new tasks that have a due date.">
          {select('defaultReminder', [['', 'None'], ['0', 'At due time'], ['15', '15 minutes before'], ['60', '1 hour before'], ['1440', '1 day before']])}
        </Row>
        <Row title="Test" desc="Send a sample notification.">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => actions.notify('Test notification', 'Reminders will look like this.', null, 'info')}>
            <i className="fa-regular fa-paper-plane" /> Send test
          </button>
        </Row>
      </Card>

      <Card icon="fa-solid fa-database" title="Data management"
        desc={`${Utils.plural(DB.state.tasks.length, 'task')} stored locally in this browser${DB.available ? '' : ' (storage unavailable)'}`}>
        <Row title="Export backup" desc="Download everything as a JSON file.">
          <button type="button" className="btn btn-ghost btn-sm" onClick={actions.exportJSON}><i className="fa-solid fa-file-export" /> Export JSON</button>
        </Row>
        <Row title="Import backup" desc="Replace current data with a TaskFlow JSON export.">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current.click()}><i className="fa-solid fa-file-import" /> Import JSON</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e => { const file = e.target.files[0]; e.target.value = ''; actions.importJSON(file); }} />
        </Row>
        <Row title="Export to spreadsheet" desc="Download tasks as CSV (Excel, Sheets, Numbers).">
          <button type="button" className="btn btn-ghost btn-sm" onClick={actions.exportCSV}><i className="fa-solid fa-file-csv" /> Export CSV</button>
        </Row>
        <Row title="Clear all data" desc="Permanently delete all tasks, projects and history.">
          <button type="button" className="btn btn-danger-soft btn-sm" onClick={actions.clearData}><i className="fa-solid fa-trash" /> Clear data</button>
        </Row>
      </Card>

      <Card icon="fa-regular fa-keyboard" title="Keyboard" desc="Work faster with shortcuts"
        action={<button type="button" className="btn btn-ghost btn-sm" onClick={actions.openShortcuts}>View shortcuts</button>} />
    </div>
  );
}
