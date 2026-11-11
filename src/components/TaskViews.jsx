/* =========================================================================
   Task views: list rows, grid cards, kanban board, compact rows,
   per-task quick actions and the "more" context menu.
   ========================================================================= */
import { Tasks } from '../lib/tasks.js';
import { Utils } from '../lib/utils.js';
import { useActions } from '../hooks/useActions.js';
import { useUI } from '../context/AppContext.jsx';
import { drag } from '../lib/dnd.js';
import {
  CategoryChip, CheckButton, DueChip, IconBtn, PriorityBadge, ProgressBar, ProjectChip, StatusBadge, TagList,
  activateOnKey, cx,
} from './common.jsx';

/* ---------------- Menu items & quick actions ---------------- */
export function taskMenuItems(t, actions) {
  if (t.deleted) {
    return [
      { label: 'Restore', icon: 'fa-solid fa-rotate-left', onSelect: () => actions.restore(t.id) },
      { label: 'Delete forever', icon: 'fa-solid fa-trash', onSelect: () => actions.destroy(t.id), danger: true },
    ];
  }
  const statusItems = Object.keys(Tasks.STATUS).filter(s => s !== t.status).map(s => ({
    label: `Mark ${Tasks.STATUS[s].label.toLowerCase()}`, icon: Tasks.STATUS[s].icon, onSelect: () => actions.setStatus(t.id, s),
  }));
  return [
    { label: 'View details', icon: 'fa-regular fa-eye', onSelect: () => actions.openTask(t.id) },
    { label: 'Edit', icon: 'fa-regular fa-pen-to-square', onSelect: () => actions.editTask(t.id) },
    { label: 'Duplicate', icon: 'fa-regular fa-copy', onSelect: () => actions.duplicate(t.id) },
    { label: t.pinned ? 'Unpin' : 'Pin to top', icon: 'fa-solid fa-thumbtack', onSelect: () => actions.togglePin(t.id) },
    { label: t.important ? 'Remove star' : 'Mark important', icon: t.important ? 'fa-regular fa-star' : 'fa-solid fa-star', onSelect: () => actions.toggleImportant(t.id) },
    '-',
    ...statusItems,
    '-',
    t.archived
      ? { label: 'Unarchive', icon: 'fa-solid fa-box-open', onSelect: () => actions.unarchive(t.id) }
      : { label: 'Archive', icon: 'fa-solid fa-box-archive', onSelect: () => actions.archive(t.id) },
    { label: 'Move to Trash', icon: 'fa-regular fa-trash-can', onSelect: () => actions.trash(t.id), danger: true },
  ];
}

function MenuButton({ task }) {
  const actions = useActions();
  const { openMenu } = useUI();
  return <IconBtn className="icon-btn-sm" icon="fa-solid fa-ellipsis" tip="More actions" aria-haspopup="menu"
    onClick={e => openMenu(e.currentTarget, taskMenuItems(task, actions))} />;
}

export function QuickActions({ task: t }) {
  const actions = useActions();
  if (t.deleted) {
    return (
      <div className="row-actions">
        <IconBtn className="icon-btn-sm" icon="fa-solid fa-rotate-left" tip="Restore" onClick={() => actions.restore(t.id)} />
        <IconBtn className="icon-btn-sm danger" icon="fa-solid fa-trash" tip="Delete forever" onClick={() => actions.destroy(t.id)} />
      </div>
    );
  }
  if (t.archived) {
    return (
      <div className="row-actions">
        <IconBtn className="icon-btn-sm" icon="fa-solid fa-box-open" tip="Unarchive" onClick={() => actions.unarchive(t.id)} />
        <IconBtn className="icon-btn-sm danger" icon="fa-regular fa-trash-can" tip="Move to Trash" onClick={() => actions.trash(t.id)} />
      </div>
    );
  }
  return (
    <div className="row-actions">
      <IconBtn className={cx('icon-btn-sm', t.important && 'is-starred')} icon={t.important ? 'fa-solid fa-star' : 'fa-regular fa-star'}
        tip={t.important ? 'Unstar' : 'Mark important'} onClick={() => actions.toggleImportant(t.id)} />
      <IconBtn className="icon-btn-sm" icon="fa-regular fa-pen-to-square" tip="Edit" data-role="edit" onClick={() => actions.editTask(t.id)} />
      <IconBtn className="icon-btn-sm danger" icon="fa-regular fa-trash-can" tip="Delete" onClick={() => actions.trash(t.id)} />
      <MenuButton task={t} />
    </div>
  );
}

/* ---------------- Meta line ---------------- */
export function TaskMeta({ task: t }) {
  const p = Tasks.progress(t);
  const hasAny = t.pinned || t.projectId || p.total || t.attachments.length || t.recurring !== 'none' || t.reminder || t.timerStartedAt || t.tags.length;
  if (!hasAny) return null;
  return (
    <div className="task-meta">
      {t.pinned && <span className="meta meta-pin" data-tip="Pinned"><i className="fa-solid fa-thumbtack" /></span>}
      <ProjectChip id={t.projectId} />
      {p.total > 0 && <span className={cx('meta', p.done === p.total && 'is-complete')} data-tip="Subtasks"><i className="fa-solid fa-list-check" />{p.done}/{p.total}</span>}
      {t.attachments.length > 0 && <span className="meta" data-tip="Attachments"><i className="fa-solid fa-paperclip" />{t.attachments.length}</span>}
      {t.recurring !== 'none' && <span className="meta" data-tip={`Repeats ${Tasks.RECURRENCE[t.recurring].toLowerCase()}`}><i className="fa-solid fa-repeat" /></span>}
      {t.reminder && <span className="meta" data-tip="Reminder set"><i className="fa-regular fa-bell" /></span>}
      {t.timerStartedAt && <span className="meta meta-timer" data-tip="Timer running"><i className="fa-solid fa-circle" />{Utils.formatMinutes(Tasks.elapsed(t))}</span>}
      <TagList tags={t.tags.slice(0, 3)} />
      {t.tags.length > 3 && <span className="tag">+{t.tags.length - 3}</span>}
    </div>
  );
}

/* ---------------- List ---------------- */
function TaskRow({ task: t }) {
  const actions = useActions();
  const open = () => actions.openTask(t.id);
  return (
    <div className={cx('task-row', Tasks.isDone(t) && 'is-done', t.status === 'cancelled' && 'is-cancelled', Tasks.isOverdue(t) && 'is-overdue')}
      onClick={open} onKeyDown={activateOnKey(open)} tabIndex={0} role="listitem" aria-label={t.title} data-task-id={t.id}>
      <span className={`prio-bar prio-${t.priority}`} aria-hidden="true" />
      <CheckButton task={t} />
      <div className="task-main">
        <div className="task-title">
          {t.important && <i className="fa-solid fa-star star-inline" aria-label="Important" />}
          {t.title}
          {t.status === 'in-progress' && <StatusBadge status="in-progress" small label="In progress" />}
          {t.status === 'cancelled' && <StatusBadge status="cancelled" small />}
        </div>
        <TaskMeta task={t} />
      </div>
      <div className="col col-cat"><CategoryChip id={t.categoryId} /></div>
      <div className="col col-due">{t.dueDate ? <DueChip task={t} /> : <span className="muted">—</span>}</div>
      <div className="col col-prio"><PriorityBadge priority={t.priority} /></div>
      <QuickActions task={t} />
    </div>
  );
}

export function TaskList({ tasks }) {
  return (
    <div className="task-list card" role="list">
      <div className="task-list-head" aria-hidden="true">
        <span /><span /><span>Task</span><span className="col col-cat">Category</span><span className="col col-due">Due</span><span className="col col-prio">Priority</span><span />
      </div>
      {tasks.map(t => <TaskRow key={t.id} task={t} />)}
    </div>
  );
}

/* ---------------- Grid ---------------- */
function TaskCard({ task: t }) {
  const actions = useActions();
  const p = Tasks.progress(t);
  const open = () => actions.openTask(t.id);
  return (
    <article className={cx('task-card', Tasks.isDone(t) && 'is-done', Tasks.isOverdue(t) && 'is-overdue')}
      onClick={open} onKeyDown={activateOnKey(open)} tabIndex={0} aria-label={t.title}>
      <header className="task-card-head">
        <PriorityBadge priority={t.priority} /><StatusBadge status={t.status} />
        <span className="spacer" />
        {t.pinned && <i className="fa-solid fa-thumbtack pin-icon" aria-label="Pinned" />}
      </header>
      <div className="task-card-title"><CheckButton task={t} /><h3>{t.title}</h3></div>
      {t.description && <p className="task-card-desc">{t.description}</p>}
      {p.total > 0 && (
        <div className="task-card-progress">
          <div className="progress-label"><span>Checklist</span><span>{p.done}/{p.total}</span></div>
          <ProgressBar pct={p.pct} size="sm" />
        </div>
      )}
      {t.tags.length > 0 && <div className="tag-row"><TagList tags={t.tags} /></div>}
      <footer className="task-card-foot">
        <div className="task-card-chips"><DueChip task={t} /><CategoryChip id={t.categoryId} /><ProjectChip id={t.projectId} /></div>
        <QuickActions task={t} />
      </footer>
    </article>
  );
}

export const TaskGrid = ({ tasks }) => <div className="task-grid">{tasks.map(t => <TaskCard key={t.id} task={t} />)}</div>;

/* ---------------- Board ---------------- */
const COLUMNS = [
  { status: 'todo', label: 'To Do', icon: 'fa-regular fa-circle' },
  { status: 'in-progress', label: 'In Progress', icon: 'fa-solid fa-circle-half-stroke' },
  { status: 'completed', label: 'Completed', icon: 'fa-solid fa-circle-check' },
  { status: 'cancelled', label: 'Cancelled', icon: 'fa-solid fa-ban' },
];

function BoardCard({ task: t }) {
  const actions = useActions();
  const p = Tasks.progress(t);
  const open = () => actions.openTask(t.id);
  return (
    <article className={cx('board-card', Tasks.isOverdue(t) && 'is-overdue', Tasks.isClosed(t) && 'is-done')}
      draggable={!t.deleted} {...drag.source(t.id)} onClick={open} onKeyDown={activateOnKey(open)} tabIndex={0} aria-label={t.title}>
      <div className="board-card-top">
        <PriorityBadge priority={t.priority} /><span className="spacer" />
        {t.important && <i className="fa-solid fa-star star-inline" />}
        <MenuButton task={t} />
      </div>
      <h4>{t.title}</h4>
      {p.total > 0 && <div className="board-progress"><ProgressBar pct={p.pct} size="sm" /><span>{p.done}/{p.total}</span></div>}
      <div className="board-card-foot"><DueChip task={t} /><CategoryChip id={t.categoryId} /></div>
    </article>
  );
}

export function TaskBoard({ tasks, onAdd }) {
  const actions = useActions();
  return (
    <div className="board">
      {COLUMNS.map(col => {
        const list = tasks.filter(t => t.status === col.status);
        return (
          <section key={col.status} className={`board-col status-col-${col.status}`} aria-label={col.label}
            {...drag.target(id => actions.moveToStatus(id, col.status))}>
            <header className="board-col-head">
              <i className={col.icon} /><h3>{col.label}</h3><span className="count">{list.length}</span>
              {col.status !== 'cancelled' && <IconBtn className="icon-btn-sm" icon="fa-solid fa-plus" tip="Add task" label={`Add task to ${col.label}`} onClick={() => onAdd(col.status)} />}
            </header>
            <div className="board-col-body">
              {list.length ? list.map(t => <BoardCard key={t.id} task={t} />) : <div className="board-empty">Drop tasks here</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ---------------- Compact row (dashboard, day list) ---------------- */
export function MiniRow({ task: t, showDate = true }) {
  const actions = useActions();
  const open = () => actions.openTask(t.id);
  return (
    <div className={cx('mini-row', Tasks.isDone(t) && 'is-done')} onClick={open} onKeyDown={activateOnKey(open)} tabIndex={0}>
      <CheckButton task={t} />
      <div className="mini-main">
        <span className="mini-title">{t.title}</span>
        <span className="mini-meta">
          {showDate ? <DueChip task={t} /> : t.dueTime && <span className="due"><i className="fa-regular fa-clock" />{Utils.formatTime(t.dueTime)}</span>}
          <CategoryChip id={t.categoryId} />
        </span>
      </div>
      <span className={`prio-dot prio-${t.priority}`} title={`${Tasks.PRIORITY[t.priority].label} priority`} />
    </div>
  );
}
