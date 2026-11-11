/* Activity timeline used on the dashboard and in the notifications panel. */
import { Tasks } from '../lib/tasks.js';
import { Utils } from '../lib/utils.js';
import { useActions } from '../hooks/useActions.js';
import { EmptyState, activateOnKey, cx } from './common.jsx';

const ICONS = {
  created: ['fa-plus', 'indigo'], updated: ['fa-pen', 'blue'], completed: ['fa-check', 'green'], reopened: ['fa-rotate-left', 'slate'],
  deleted: ['fa-trash', 'red'], trashed: ['fa-trash-can', 'red'], restored: ['fa-rotate-left', 'green'], archived: ['fa-box-archive', 'slate'],
  important: ['fa-star', 'amber'], timer: ['fa-stopwatch', 'violet'], recurring: ['fa-repeat', 'violet'], reminder: ['fa-bell', 'amber'],
  overdue: ['fa-triangle-exclamation', 'red'], categories: ['fa-tag', 'indigo'], projects: ['fa-folder', 'violet'], import: ['fa-file-import', 'blue'],
};

export default function ActivityList({ items, limit = 8 }) {
  const actions = useActions();
  if (!items.length) return <EmptyState icon="fa-clock-rotate-left" title="No activity yet" text="Your task history will appear here." compact />;
  return (
    <ol className="timeline">
      {items.slice(0, limit).map(ev => {
        const [icon, tone] = ICONS[ev.type] || ['fa-circle-info', 'slate'];
        const linkable = ev.taskId && Tasks.get(ev.taskId);
        const open = () => actions.openTask(ev.taskId);
        return (
          <li key={ev.id} className={cx('timeline-item', linkable && 'is-link')}
            {...(linkable ? { onClick: open, onKeyDown: activateOnKey(open), tabIndex: 0 } : {})}>
            <span className={`timeline-icon tone-${tone}`}><i className={`fa-solid ${icon}`} /></span>
            <div className="timeline-body"><p>{ev.message}</p><time dateTime={new Date(ev.at).toISOString()}>{Utils.relativeTime(ev.at)}</time></div>
          </li>
        );
      })}
    </ol>
  );
}
