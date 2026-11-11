/* Analytics: KPIs + Chart.js charts (react-chartjs-2), all from real task data. */
import {
  ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, LineElement, PointElement, Tooltip,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { DB } from '../lib/storage.js';
import { Tasks } from '../lib/tasks.js';
import { Categories } from '../lib/categories.js';
import { Analytics } from '../lib/analytics.js';
import { Utils } from '../lib/utils.js';
import { resolvedTheme } from '../hooks/useTheme.js';
import { EmptyState } from '../components/common.jsx';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend);

const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function theme() {
  const grid = cssVar('--border');
  const text = cssVar('--text-3');
  const font = { family: 'Inter', size: 11 };
  const plugins = {
    legend: { labels: { color: cssVar('--text-2'), usePointStyle: true, boxWidth: 8, font: { family: 'Inter', size: 12 } } },
    tooltip: { backgroundColor: cssVar('--tooltip-bg'), titleColor: cssVar('--tooltip-text'), bodyColor: cssVar('--tooltip-text'), padding: 10, cornerRadius: 8 },
  };
  const scales = {
    x: { grid: { display: false }, ticks: { color: text, font }, border: { color: grid } },
    y: { beginAtZero: true, grid: { color: grid }, ticks: { color: text, precision: 0, font }, border: { display: false } },
  };
  return { plugins, scales, base: { responsive: true, maintainAspectRatio: false, animation: { duration: 500 } } };
}

function Kpi({ icon, tone, label, value, sub }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon tone-${tone}`}><i className={`fa-solid ${icon}`} /></div>
      <div className="stat-body"><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong>{sub && <span className="stat-sub">{sub}</span>}</div>
    </div>
  );
}

function ChartCard({ title, subtitle, empty, children }) {
  return (
    <section className="card chart-card">
      <header className="card-head"><div><h3>{title}</h3><p>{subtitle}</p></div></header>
      <div className="chart-wrap">{empty ? <EmptyState icon="fa-chart-simple" title="Not enough data yet" text={empty} compact /> : children}</div>
    </section>
  );
}

export default function AnalyticsPage() {
  const themeKey = resolvedTheme() + DB.state.settings.accent;   // remount charts when colours change
  const s = Analytics.summary();
  const t = theme();
  const accent = cssVar('--accent');
  const success = cssVar('--success');
  const hasTasks = DB.state.tasks.some(x => !x.deleted);
  const hasCompleted = DB.state.tasks.some(x => x.completedAt && !x.deleted);
  const hasOpen = DB.state.tasks.some(x => Tasks.isActive(x) && !Tasks.isClosed(x));

  const daily = Analytics.dailyCompletions(14);
  const weekly = Analytics.weeklyActivity(8);
  const cats = Categories.distribution();
  const prio = Analytics.priorityDistribution();

  const trend = !s.completedLastWeek && !s.completedWeek
    ? 'No completions yet this week or last'
    : <><span className={`trend ${s.weekChange >= 0 ? 'up' : 'down'}`}><i className={`fa-solid fa-arrow-${s.weekChange >= 0 ? 'up' : 'down'}`} /> {Math.abs(s.weekChange)}%</span> vs last week</>;

  return (
    <div className="page-stack">
      <div className="stat-grid">
        <Kpi icon="fa-sun" tone="amber" label="Completed today" value={s.completedToday} sub={`${s.dueToday} still due today`} />
        <Kpi icon="fa-calendar-week" tone="indigo" label="Completed this week" value={s.completedWeek} sub={trend} />
        <Kpi icon="fa-calendar" tone="violet" label="Completed this month" value={s.completedMonth} sub={`${s.avgPerDay} per day (30-day avg)`} />
        <Kpi icon="fa-bullseye" tone="green" label="Completion rate" value={`${s.completionRate}%`} sub={`${s.completed} of ${s.relevant} tasks`} />
        <Kpi icon="fa-hourglass-half" tone="blue" label="Pending" value={s.pending} sub={`${s.inProgress} in progress`} />
        <Kpi icon="fa-triangle-exclamation" tone="red" label="Overdue" value={s.overdue} sub={s.overdue ? 'Needs attention' : 'All on track'} />
        <Kpi icon="fa-stopwatch" tone="slate" label="Time tracked" value={Utils.formatMinutes(s.timeSpent)} sub="Across active tasks" />
      </div>

      <div className="chart-grid" key={themeKey}>
        <ChartCard title="Daily completions" subtitle="Tasks completed per day, last 14 days" empty={hasCompleted ? '' : 'Complete a few tasks to see your daily trend.'}>
          <Bar data={{ labels: daily.map(d => d.label), datasets: [{ label: 'Completed', data: daily.map(d => d.value), backgroundColor: accent, borderRadius: 6, maxBarThickness: 28 }] }}
            options={{ ...t.base, scales: t.scales, plugins: { ...t.plugins, legend: { display: false } } }} />
        </ChartCard>
        <ChartCard title="Weekly activity" subtitle="Tasks created vs completed, last 8 weeks" empty={hasTasks ? '' : 'Create tasks to see weekly activity.'}>
          <Line data={{
            labels: weekly.map(w => w.label),
            datasets: [
              { label: 'Created', data: weekly.map(w => w.created), borderColor: accent, backgroundColor: accent, tension: 0.35, pointRadius: 3, borderWidth: 2 },
              { label: 'Completed', data: weekly.map(w => w.completed), borderColor: success, backgroundColor: success, tension: 0.35, pointRadius: 3, borderWidth: 2 },
            ],
          }} options={{ ...t.base, scales: t.scales, plugins: t.plugins }} />
        </ChartCard>
        <ChartCard title="Category distribution" subtitle="Active tasks by category" empty={hasTasks ? '' : 'Tasks will appear here by category.'}>
          <Doughnut data={{ labels: cats.map(c => c.name), datasets: [{ data: cats.map(c => c.count), backgroundColor: cats.map(c => c.color), borderColor: cssVar('--surface'), borderWidth: 3 }] }}
            options={{ ...t.base, cutout: '68%', plugins: { ...t.plugins, legend: { ...t.plugins.legend, position: 'bottom' } } }} />
        </ChartCard>
        <ChartCard title="Open tasks by priority" subtitle="Where your remaining effort sits" empty={hasOpen ? '' : 'No open tasks — nice work!'}>
          <Bar data={{ labels: prio.map(p => p.label), datasets: [{ label: 'Open tasks', data: prio.map(p => p.count),
            backgroundColor: ['--p-low', '--p-medium', '--p-high', '--p-urgent'].map(cssVar), borderRadius: 6, maxBarThickness: 22 }] }}
            options={{ ...t.base, indexAxis: 'y', plugins: { ...t.plugins, legend: { display: false } }, scales: { x: t.scales.y, y: t.scales.x } }} />
        </ChartCard>
      </div>
    </div>
  );
}
