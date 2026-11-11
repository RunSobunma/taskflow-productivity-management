/* Dashboard: greeting, live clock, stats, today, upcoming, weekly bars, projects, activity. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DB } from '../lib/storage.js';
import { Tasks } from '../lib/tasks.js';
import { Projects } from '../lib/projects.js';
import { Analytics } from '../lib/analytics.js';
import { Utils } from '../lib/utils.js';
import { useActions } from '../hooks/useActions.js';
import { MiniRow } from '../components/TaskViews.jsx';
import ActivityList from '../components/ActivityList.jsx';
import { CollectionIcon, EmptyState, ProgressBar, cx } from '../components/common.jsx';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function greeting(h) {
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function Ring({ pct, size = 92 }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${pct}% complete`}>
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" />
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle">{pct}%</text>
    </svg>
  );
}

function StatCard({ icon, tone, label, value, sub, route, pct = null }) {
  const actions = useActions();
  return (
    <button type="button" className="stat-card is-link" onClick={() => actions.go(route)}>
      <div className={`stat-icon tone-${tone}`}><i className={`fa-solid ${icon}`} /></div>
      <div className="stat-body">
        <span className="stat-label">{label}</span>
        <strong className="stat-value">{value}</strong>
        {pct !== null && <ProgressBar pct={pct} size="sm" />}
        <span className="stat-sub">{sub}</span>
      </div>
    </button>
  );
}

export default function DashboardPage() {
  const actions = useActions();
  const now = useClock();
  const s = Analytics.summary();
  const name = DB.state.settings.userName;
  const hasTasks = DB.state.tasks.some(t => !t.deleted);
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const [time, suffix = ''] = Utils.formatTime(hhmm).split(' ');
  const todayList = Tasks.query('today', {}, 'due').sort((a, b) => Number(Tasks.isClosed(a)) - Number(Tasks.isClosed(b))).slice(0, 7);
  const upcoming = Tasks.query('upcoming', {}, 'due').slice(0, 6);
  const week = Analytics.weekOverview();
  const weekMax = Math.max(1, ...week.map(d => Math.max(d.completed, d.due)));
  const projects = Projects.list().map(p => ({ p, prog: Projects.progress(p.id) })).filter(x => x.prog.total).slice(0, 4);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  const summaryText = !hasTasks ? 'Let’s set up your workspace — add your first task to get started.'
    : s.dueToday || s.overdue
      ? `You have ${Utils.plural(s.dueToday, 'task')} due today${s.overdue ? ` and ${s.overdue} overdue` : ''}.`
      : 'You’re all caught up for today. 🎉';

  return (
    <div className="page-stack">
      <section className="hero">
        <div className="hero-text">
          <p className="hero-date">{Utils.DAYS[now.getDay()]}, {Utils.formatDate(Utils.toISODate(now))}</p>
          <h2>{greeting(now.getHours())}{name ? `, ${name}` : ''} <span className="wave" aria-hidden="true">👋</span></h2>
          <p className="hero-sub">{summaryText}</p>
          <div className="hero-actions">
            <button type="button" className="btn btn-light" onClick={() => actions.newTask()}><i className="fa-solid fa-plus" /> New task</button>
            <button type="button" className="btn btn-glass" onClick={() => actions.go('today')}><i className="fa-solid fa-calendar-day" /> Today’s plan</button>
          </div>
        </div>
        <div className="hero-side">
          <div className="hero-clock"><span>{time}</span><small>{suffix}</small></div>
          <div className="hero-ring"><Ring pct={s.completionRate} /><span>Completion</span></div>
        </div>
      </section>

      {!hasTasks && (
        <section className="card onboarding">
          <div className="onboarding-art"><i className="fa-solid fa-wand-magic-sparkles" /></div>
          <div>
            <h3>Welcome to TaskFlow</h3>
            <p>Create your first task, or add a small set of starter tasks you can edit or delete — a quick way to explore views, calendar and analytics.</p>
          </div>
          <div className="onboarding-actions">
            <button type="button" className="btn btn-primary" onClick={() => actions.newTask()}><i className="fa-solid fa-plus" /> Create a task</button>
            <button type="button" className="btn btn-ghost" onClick={actions.loadStarter}><i className="fa-solid fa-seedling" /> Add starter tasks</button>
          </div>
        </section>
      )}

      <div className="stat-grid stat-grid-6">
        <StatCard icon="fa-layer-group" tone="indigo" label="Total tasks" value={s.total} sub={`${s.inProgress} in progress`} route="tasks" />
        <StatCard icon="fa-circle-check" tone="green" label="Completed" value={s.completed} sub={`${s.completedToday} today`} route="completed" pct={pct(s.completed, s.total)} />
        <StatCard icon="fa-hourglass-half" tone="blue" label="Pending" value={s.pending} sub="Open tasks" route="tasks" pct={pct(s.pending, s.total)} />
        <StatCard icon="fa-triangle-exclamation" tone="red" label="Overdue" value={s.overdue} sub={s.overdue ? 'Needs attention' : 'All on track'} route="today" />
        <StatCard icon="fa-calendar-day" tone="amber" label="Due today" value={s.dueToday} sub={`${s.dueTodayDone}/${s.dueTodayTotal} done`} route="today" pct={pct(s.dueTodayDone, s.dueTodayTotal)} />
        <StatCard icon="fa-bullseye" tone="violet" label="Productivity" value={`${s.completionRate}%`} sub="Completion rate" route="analytics" pct={s.completionRate} />
      </div>

      <div className="dash-grid">
        <div className="dash-col">
          <section className="card">
            <header className="card-head">
              <div><h3><i className="fa-solid fa-calendar-day" /> Today’s tasks</h3><p>{s.dueTodayDone} of {s.dueTodayTotal} completed{s.overdue ? ` · ${s.overdue} overdue included` : ''}</p></div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => actions.go('today')}>View all</button>
            </header>
            {todayList.length
              ? <div className="mini-list">{todayList.map(t => <MiniRow key={t.id} task={t} />)}</div>
              : <EmptyState icon="fa-mug-hot" title="Nothing due today" text="Add a task for today to start planning." compact
                  action={{ label: 'Add task for today', icon: 'fa-plus', onClick: () => actions.quickAdd({ dueDate: Utils.todayISO() }) }} />}
          </section>
          <section className="card">
            <header className="card-head">
              <div><h3><i className="fa-solid fa-hourglass-start" /> Upcoming deadlines</h3><p>Next tasks by due date</p></div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => actions.go('upcoming')}>View all</button>
            </header>
            {upcoming.length
              ? <div className="mini-list">{upcoming.map(t => <MiniRow key={t.id} task={t} />)}</div>
              : <EmptyState icon="fa-calendar-week" title="No upcoming deadlines" text="Tasks with future due dates will show here." compact />}
          </section>
        </div>

        <div className="dash-col">
          <section className="card">
            <header className="card-head">
              <div><h3><i className="fa-solid fa-chart-column" /> This week</h3><p>{Utils.plural(s.completedWeek, 'task')} completed · {s.weekChange >= 0 ? '+' : ''}{s.weekChange}% vs last week</p></div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => actions.go('analytics')}>Analytics</button>
            </header>
            <div className="week-bars">
              {week.map(d => (
                <div key={d.iso} className={cx('week-bar-col', d.isToday && 'is-today')} title={`${d.label}: ${d.completed} completed, ${d.due} due`}>
                  <span className="week-bar-value">{d.completed}</span>
                  <div className="week-bar">
                    <span className="week-bar-due" style={{ height: `${(d.due / weekMax) * 100}%` }} />
                    <span className="week-bar-done" style={{ height: `${(d.completed / weekMax) * 100}%` }} />
                  </div>
                  <span className="week-bar-label">{d.label}</span>
                </div>
              ))}
            </div>
            <div className="legend"><span><i className="legend-dot done" />Completed</span><span><i className="legend-dot due" />Due</span></div>
          </section>

          {projects.length > 0 && (
            <section className="card">
              <header className="card-head">
                <div><h3><i className="fa-solid fa-folder-open" /> Projects</h3><p>Progress across active projects</p></div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => actions.go('organize')}>Manage</button>
              </header>
              <div className="project-mini-list">
                {projects.map(({ p, prog }) => (
                  <Link key={p.id} className="project-mini" to={`/project/${p.id}`}>
                    <CollectionIcon item={p} size="sm" />
                    <div><div className="project-mini-top"><strong>{p.name}</strong><span>{prog.pct}%</span></div><ProgressBar pct={prog.pct} size="sm" /></div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="card">
            <header className="card-head"><div><h3><i className="fa-solid fa-clock-rotate-left" /> Recent activity</h3><p>Latest changes in your workspace</p></div></header>
            <ActivityList items={DB.state.activity} limit={6} />
          </section>
        </div>
      </div>
    </div>
  );
}
