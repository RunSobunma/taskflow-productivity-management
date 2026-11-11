/* =========================================================================
   Month & week calendar. Tasks appear on their due dates; clicking empty
   space adds a task on that date; chips can be dragged to reschedule.
   ========================================================================= */
import { Tasks } from '../lib/tasks.js';
import { Categories } from '../lib/categories.js';
import { Utils } from '../lib/utils.js';
import { drag } from '../lib/dnd.js';
import { useAppState } from '../context/AppContext.jsx';
import { useActions } from '../hooks/useActions.js';
import { cx, stop } from './common.jsx';

const MAX_CHIPS = 3;

function groupByDate(tasks) {
  const map = {};
  tasks.filter(t => t.dueDate).forEach(t => { (map[t.dueDate] = map[t.dueDate] || []).push(t); });
  Object.values(map).forEach(list => list.sort((a, b) =>
    (a.dueTime || '99').localeCompare(b.dueTime || '99') || Tasks.PRIORITY[b.priority].rank - Tasks.PRIORITY[a.priority].rank));
  return map;
}

const chipColor = t => (Categories.get(t.categoryId) || {}).color || 'var(--accent)';

function title(mode, cursor) {
  if (mode === 'month') return `${Utils.MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
  const start = Utils.startOfWeek(cursor);
  const end = Utils.addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  return `${Utils.MONTHS_SHORT[start.getMonth()]} ${start.getDate()} – ${sameMonth ? '' : `${Utils.MONTHS_SHORT[end.getMonth()]} `}${end.getDate()}, ${end.getFullYear()}`;
}

function Chip({ task: t }) {
  const actions = useActions();
  return (
    <button type="button" className={cx('cal-chip', `prio-${t.priority}`, Tasks.isClosed(t) && 'is-done', Tasks.isOverdue(t) && 'is-overdue')}
      draggable {...drag.source(t.id)} onClick={stop(() => actions.openTask(t.id))} style={{ '--chip-color': chipColor(t) }} title={t.title}>
      {t.dueTime && <span className="cal-chip-time">{Utils.formatTime(t.dueTime)}</span>}
      <span className="cal-chip-title">{t.title}</span>
    </button>
  );
}

function MonthGrid({ byDate, cursor, onAdd }) {
  const actions = useActions();
  const first = Utils.startOfMonth(cursor);
  const gridStart = Utils.startOfWeek(first);
  const todayIso = Utils.todayISO();
  return (
    <div className="cal-month" role="grid">
      {Utils.weekdayOrder().map(d => <div className="cal-head" key={d}>{d}</div>)}
      {Array.from({ length: 42 }, (_, i) => {
        const date = Utils.addDays(gridStart, i);
        const iso = Utils.toISODate(date);
        const list = byDate[iso] || [];
        const extra = list.length - MAX_CHIPS;
        return (
          <div key={iso} className={cx('cal-cell', date.getMonth() !== first.getMonth() && 'is-outside', iso === todayIso && 'is-today')}
            role="gridcell" aria-label={`${Utils.formatDate(iso)}, ${Utils.plural(list.length, 'task')}`}
            onClick={() => onAdd(iso)} {...drag.target(id => actions.reschedule(id, iso))}>
            <div className="cal-cell-top">
              <span className="cal-day">{date.getDate()}</span>
              <span className="cal-add" aria-hidden="true"><i className="fa-solid fa-plus" /></span>
            </div>
            <div className="cal-chips">
              {list.slice(0, MAX_CHIPS).map(t => <Chip key={t.id} task={t} />)}
              {extra > 0 && <button type="button" className="cal-more" onClick={stop(() => actions.openDay(iso))}>+{extra} more</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekGrid({ byDate, cursor, onAdd }) {
  const actions = useActions();
  const start = Utils.startOfWeek(cursor);
  const todayIso = Utils.todayISO();
  return (
    <div className="cal-week">
      {Array.from({ length: 7 }, (_, i) => {
        const date = Utils.addDays(start, i);
        const iso = Utils.toISODate(date);
        const list = byDate[iso] || [];
        return (
          <div key={iso} className={cx('week-col', iso === todayIso && 'is-today')} {...drag.target(id => actions.reschedule(id, iso))}>
            <div className="week-col-head">
              <span className="week-dow">{Utils.DAYS_SHORT[date.getDay()]}</span>
              <span className="week-date">{date.getDate()}</span>
            </div>
            <div className="week-col-body">
              {list.length ? list.map(t => {
                const cat = Categories.get(t.categoryId);
                const p = Tasks.progress(t);
                return (
                  <button type="button" key={t.id} draggable {...drag.source(t.id)} onClick={() => actions.openTask(t.id)}
                    className={cx('week-task', `prio-${t.priority}`, Tasks.isClosed(t) && 'is-done', Tasks.isOverdue(t) && 'is-overdue')}
                    style={{ '--chip-color': chipColor(t) }}>
                    <span className="week-task-time">{t.dueTime ? Utils.formatTime(t.dueTime) : 'All day'}</span>
                    <span className="week-task-title">{t.title}</span>
                    <span className="week-task-meta">
                      {cat && <span><i className={`fa-solid ${cat.icon}`} /> {cat.name}</span>}
                      {p.total > 0 && <span><i className="fa-solid fa-list-check" /> {p.done}/{p.total}</span>}
                    </span>
                  </button>
                );
              }) : <p className="week-empty">No tasks</p>}
            </div>
            <button type="button" className="week-add" onClick={() => onAdd(iso)}><i className="fa-solid fa-plus" /> Add task</button>
          </div>
        );
      })}
    </div>
  );
}

export default function CalendarView({ tasks, onAdd }) {
  const { calMode: mode, setCalMode, calCursor: cursor, setCalCursor } = useAppState();
  const byDate = groupByDate(tasks);
  const undated = tasks.filter(t => !t.dueDate && !Tasks.isClosed(t)).length;

  const navigate = direction => setCalCursor(mode === 'month'
    ? Utils.addMonths(Utils.startOfMonth(cursor), direction)
    : Utils.addDays(cursor, 7 * direction));

  const modeBtn = (value, label) => (
    <button type="button" className={cx('seg-btn', mode === value && 'active')} aria-pressed={mode === value} onClick={() => setCalMode(value)}>{label}</button>
  );

  return (
    <div className="calendar card">
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button type="button" className="icon-btn" aria-label="Previous" data-tip="Previous" onClick={() => navigate(-1)}><i className="fa-solid fa-chevron-left" /></button>
          <button type="button" className="icon-btn" aria-label="Next" data-tip="Next" onClick={() => navigate(1)}><i className="fa-solid fa-chevron-right" /></button>
          <h2 className="cal-title">{title(mode, cursor)}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCalCursor(new Date())}>Today</button>
        </div>
        <div className="segmented">{modeBtn('month', 'Month')}{modeBtn('week', 'Week')}</div>
      </div>
      {mode === 'month'
        ? <MonthGrid byDate={byDate} cursor={cursor} onAdd={onAdd} />
        : <WeekGrid byDate={byDate} cursor={cursor} onAdd={onAdd} />}
      {undated > 0 && (
        <p className="cal-footnote"><i className="fa-regular fa-calendar-xmark" /> {Utils.plural(undated, 'open task')} without a due date {undated === 1 ? 'is' : 'are'} not shown.</p>
      )}
    </div>
  );
}
