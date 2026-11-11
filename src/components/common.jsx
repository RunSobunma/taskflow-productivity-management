/* =========================================================================
   Small reusable presentational components.
   ========================================================================= */
import { Tasks } from '../lib/tasks.js';
import { Categories } from '../lib/categories.js';
import { Projects } from '../lib/projects.js';
import { Utils } from '../lib/utils.js';
import { useActions } from '../hooks/useActions.js';

export const cx = (...classes) => classes.filter(Boolean).join(' ');

/** Run a handler without triggering the parent row/card click. */
export const stop = fn => e => { e.stopPropagation(); fn(e); };

export function PriorityBadge({ priority }) {
  const meta = Tasks.PRIORITY[priority];
  return <span className={`badge prio-badge prio-${priority}`}><i className={`fa-solid ${meta.icon}`} />{meta.label}</span>;
}

export function StatusBadge({ status, small = false, label }) {
  const meta = Tasks.STATUS[status];
  return (
    <span className={cx('badge status-badge', `status-${status}`, small && 'badge-xs')}>
      {!small && <i className={meta.icon} />}{label || meta.label}
    </span>
  );
}

export function CategoryChip({ id }) {
  const c = Categories.get(id);
  if (!c) return null;
  return <span className="chip" style={{ '--chip': c.color }}><i className={`fa-solid ${c.icon}`} />{c.name}</span>;
}

export function ProjectChip({ id }) {
  const p = Projects.get(id);
  if (!p) return null;
  return <span className="chip chip-outline" style={{ '--chip': p.color }}><i className={`fa-solid ${p.icon}`} />{p.name}</span>;
}

export function DueChip({ task: t }) {
  if (!t.dueDate) return null;
  const diff = Utils.diffDays(Utils.parseDate(t.dueDate), new Date());
  let cls = '';
  if (Tasks.isOverdue(t)) cls = 'is-overdue';
  else if (!Tasks.isClosed(t) && diff === 0) cls = 'is-today';
  else if (!Tasks.isClosed(t) && diff > 0 && diff <= 2) cls = 'is-soon';
  return (
    <span className={cx('due', cls)} title={`Due ${Utils.formatDate(t.dueDate)}`}>
      <i className="fa-regular fa-calendar" />{Utils.friendlyDate(t.dueDate)}{t.dueTime && ` · ${Utils.formatTime(t.dueTime)}`}
    </span>
  );
}

export const TagList = ({ tags }) => tags.map(tag => <span className="tag" key={tag}>#{tag}</span>);

export function ProgressBar({ pct, size = '', label }) {
  return (
    <div className={cx('progress', size)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function CheckButton({ task: t, className = '' }) {
  const actions = useActions();
  const done = Tasks.isDone(t);
  if (t.deleted) return <span className={cx('check is-static', done && 'checked', className)} aria-hidden="true"><i className="fa-solid fa-check" /></span>;
  return (
    <button type="button" className={cx('check', `prio-${t.priority}`, done && 'checked', className)} role="checkbox" aria-checked={done}
      aria-label={`${done ? 'Mark as not completed' : 'Mark as completed'}: ${t.title}`} onClick={stop(() => actions.toggleComplete(t.id))}>
      <i className="fa-solid fa-check" />
    </button>
  );
}

export function IconBtn({ icon, tip, onClick, className = '', label, ...rest }) {
  return (
    <button type="button" className={cx('icon-btn', className)} aria-label={label || tip} data-tip={tip} onClick={onClick ? stop(onClick) : undefined} {...rest}>
      <i className={icon} />
    </button>
  );
}

export function EmptyState({ icon = 'fa-inbox', title, text, action, secondary, compact = false }) {
  const btn = (a, cls) => a && (
    <button type="button" className={`btn ${cls}`} onClick={a.onClick}>{a.icon && <i className={`fa-solid ${a.icon}`} />}{a.label}</button>
  );
  return (
    <div className={cx('empty', compact && 'empty-compact')}>
      <div className="empty-art"><i className={`fa-solid ${icon}`} /></div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {(action || secondary) && <div className="empty-actions">{btn(action, 'btn-primary')}{btn(secondary, 'btn-ghost')}</div>}
    </div>
  );
}

export function CollectionIcon({ item, size = '' }) {
  return <span className={cx('collection-icon', size)} style={{ '--chip': item.color }}><i className={`fa-solid ${item.icon}`} /></span>;
}

/** Keyboard support for clickable non-button elements (rows, cards). */
export const activateOnKey = fn => e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); fn(); }
};
