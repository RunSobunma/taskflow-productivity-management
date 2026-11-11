/* =========================================================================
   TaskFlow — analytics.js
   Productivity metrics computed from real task data + Chart.js charts.
   ========================================================================= */
'use strict';

const Analytics = (() => {
  const charts = {};
  const DAY = 86400000;

  const active = () => DB.state.tasks.filter(t => !t.deleted);
  const completedBetween = (from, to) => active().filter(t => t.completedAt && t.completedAt >= from && t.completedAt < to).length;
  const createdBetween = (from, to) => active().filter(t => t.createdAt >= from && t.createdAt < to).length;

  function summary() {
    const now = new Date();
    const dayStart = Utils.startOfDay(now).getTime();
    const weekStart = Utils.startOfWeek(now).getTime();
    const monthStart = Utils.startOfMonth(now).getTime();
    const end = dayStart + DAY;
    const tasks = DB.state.tasks.filter(Tasks.isActive);
    const relevant = tasks.filter(t => t.status !== 'cancelled');
    const completed = relevant.filter(Tasks.isDone).length;
    const thisWeek = completedBetween(weekStart, end);
    const lastWeek = completedBetween(weekStart - 7 * DAY, weekStart);
    const todayIso = Utils.todayISO();
    return {
      total: tasks.length,
      completed,
      pending: tasks.filter(t => !Tasks.isClosed(t)).length,
      inProgress: tasks.filter(t => t.status === 'in-progress').length,
      overdue: tasks.filter(Tasks.isOverdue).length,
      dueToday: tasks.filter(t => t.dueDate === todayIso && !Tasks.isClosed(t)).length,
      dueTodayTotal: tasks.filter(t => t.dueDate === todayIso).length,
      dueTodayDone: tasks.filter(t => t.dueDate === todayIso && Tasks.isDone(t)).length,
      completionRate: relevant.length ? Math.round((completed / relevant.length) * 100) : 0,
      completedToday: completedBetween(dayStart, end),
      completedWeek: thisWeek,
      completedLastWeek: lastWeek,
      completedMonth: completedBetween(monthStart, end),
      weekChange: lastWeek ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : (thisWeek ? 100 : 0),
      timeSpent: tasks.reduce((sum, t) => sum + Tasks.elapsed(t), 0),
      avgPerDay: Math.round((completedBetween(dayStart - 29 * DAY, end) / 30) * 10) / 10,
    };
  }

  /** Completed count per day for the last `days` days. */
  function dailyCompletions(days = 14) {
    const start = Utils.startOfDay(Utils.addDays(new Date(), -(days - 1)));
    return Array.from({ length: days }, (_, i) => {
      const d = Utils.addDays(start, i);
      const from = d.getTime();
      return { label: `${Utils.MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`, short: Utils.DAYS_SHORT[d.getDay()], value: completedBetween(from, from + DAY) };
    });
  }

  /** Created vs completed per week for the last `weeks` weeks. */
  function weeklyActivity(weeks = 8) {
    const current = Utils.startOfWeek(new Date());
    return Array.from({ length: weeks }, (_, i) => {
      const start = Utils.addDays(current, -7 * (weeks - 1 - i));
      const from = start.getTime();
      const to = Utils.addDays(start, 7).getTime();
      return { label: `${Utils.MONTHS_SHORT[start.getMonth()]} ${start.getDate()}`, created: createdBetween(from, to), completed: completedBetween(from, to) };
    });
  }

  /** Current week Mon..Sun (per setting): completed vs due, for the dashboard bars. */
  function weekOverview() {
    const start = Utils.startOfWeek(new Date());
    const todayIso = Utils.todayISO();
    return Array.from({ length: 7 }, (_, i) => {
      const d = Utils.addDays(start, i);
      const iso = Utils.toISODate(d);
      const from = d.getTime();
      return {
        label: Utils.DAYS_SHORT[d.getDay()], iso, isToday: iso === todayIso,
        completed: completedBetween(from, from + DAY),
        due: DB.state.tasks.filter(t => Tasks.isActive(t) && t.dueDate === iso).length,
      };
    });
  }

  function priorityDistribution() {
    const open = DB.state.tasks.filter(t => Tasks.isActive(t) && !Tasks.isClosed(t));
    return Object.keys(Tasks.PRIORITY).map(p => ({ key: p, label: Tasks.PRIORITY[p].label, count: open.filter(t => t.priority === p).length }));
  }

  function statusDistribution() {
    const tasks = DB.state.tasks.filter(Tasks.isActive);
    return Object.keys(Tasks.STATUS).map(s => ({ key: s, label: Tasks.STATUS[s].label, count: tasks.filter(t => t.status === s).length }));
  }

  /* ------------------------------ Charts ------------------------------ */
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function destroyCharts() { Object.keys(charts).forEach(k => { charts[k].destroy(); delete charts[k]; }); }

  function baseOptions() {
    const grid = cssVar('--border');
    const text = cssVar('--text-3');
    return {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 500 },
      plugins: {
        legend: { labels: { color: cssVar('--text-2'), usePointStyle: true, boxWidth: 8, font: { family: 'Inter', size: 12 } } },
        tooltip: { backgroundColor: cssVar('--tooltip-bg'), titleFont: { family: 'Inter' }, bodyFont: { family: 'Inter' }, padding: 10, cornerRadius: 8 },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: text, font: { family: 'Inter', size: 11 } }, border: { color: grid } },
        y: { beginAtZero: true, grid: { color: grid }, ticks: { color: text, precision: 0, font: { family: 'Inter', size: 11 } }, border: { display: false } },
      },
    };
  }

  function make(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(canvas, config);
  }

  function renderCharts() {
    destroyCharts();
    if (typeof Chart === 'undefined') return false;
    const accent = cssVar('--accent');
    const success = cssVar('--success');
    const prio = ['--p-low', '--p-medium', '--p-high', '--p-urgent'].map(cssVar);

    const daily = dailyCompletions(14);
    make('chart-daily', {
      type: 'bar',
      data: { labels: daily.map(d => d.label), datasets: [{ label: 'Completed', data: daily.map(d => d.value), backgroundColor: accent, borderRadius: 6, maxBarThickness: 28 }] },
      options: { ...baseOptions(), plugins: { ...baseOptions().plugins, legend: { display: false } } },
    });

    const weekly = weeklyActivity(8);
    make('chart-weekly', {
      type: 'line',
      data: {
        labels: weekly.map(w => w.label),
        datasets: [
          { label: 'Created', data: weekly.map(w => w.created), borderColor: accent, backgroundColor: 'transparent', tension: 0.35, pointRadius: 3, borderWidth: 2 },
          { label: 'Completed', data: weekly.map(w => w.completed), borderColor: success, backgroundColor: 'transparent', tension: 0.35, pointRadius: 3, borderWidth: 2 },
        ],
      },
      options: baseOptions(),
    });

    const cats = Categories.distribution();
    make('chart-categories', {
      type: 'doughnut',
      data: { labels: cats.map(c => c.name), datasets: [{ data: cats.map(c => c.count), backgroundColor: cats.map(c => c.color), borderColor: cssVar('--surface'), borderWidth: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { ...baseOptions().plugins, legend: { ...baseOptions().plugins.legend, position: 'bottom' } } },
    });

    const pr = priorityDistribution();
    make('chart-priority', {
      type: 'bar',
      data: { labels: pr.map(p => p.label), datasets: [{ label: 'Open tasks', data: pr.map(p => p.count), backgroundColor: prio, borderRadius: 6, maxBarThickness: 22 }] },
      options: { ...baseOptions(), indexAxis: 'y', plugins: { ...baseOptions().plugins, legend: { display: false } },
        scales: { x: { ...baseOptions().scales.y }, y: { ...baseOptions().scales.x } } },
    });
    return true;
  }

  /* ------------------------------ Page ------------------------------ */
  function kpi(icon, tone, label, value, sub) {
    return `
      <div class="stat-card">
        <div class="stat-icon tone-${tone}"><i class="fa-solid ${icon}"></i></div>
        <div class="stat-body"><span class="stat-label">${label}</span><strong class="stat-value">${value}</strong>${sub ? `<span class="stat-sub">${sub}</span>` : ''}</div>
      </div>`;
  }

  function trendText(s) {
    if (!s.completedLastWeek && !s.completedWeek) return 'No completions yet this week or last';
    const up = s.weekChange >= 0;
    return `<span class="trend ${up ? 'up' : 'down'}"><i class="fa-solid fa-arrow-${up ? 'up' : 'down'}"></i> ${Math.abs(s.weekChange)}%</span> vs last week`;
  }

  function chartCard(id, title, subtitle, empty) {
    return `
      <section class="card chart-card">
        <header class="card-head"><div><h3>${title}</h3><p>${subtitle}</p></div></header>
        <div class="chart-wrap">${empty ? UI.emptyState({ icon: 'fa-chart-simple', title: 'Not enough data yet', text: empty, compact: true }) : `<canvas id="${id}"></canvas>`}</div>
      </section>`;
  }

  function renderPage() {
    const s = summary();
    const hasTasks = DB.state.tasks.some(t => !t.deleted);
    const hasCompleted = DB.state.tasks.some(t => t.completedAt && !t.deleted);
    const chartJsMissing = typeof Chart === 'undefined';
    return `
      <div class="page-stack">
        <div class="stat-grid">
          ${kpi('fa-sun', 'amber', 'Completed today', s.completedToday, `${s.dueToday} still due today`)}
          ${kpi('fa-calendar-week', 'indigo', 'Completed this week', s.completedWeek, trendText(s))}
          ${kpi('fa-calendar', 'violet', 'Completed this month', s.completedMonth, `${s.avgPerDay} per day (30-day avg)`)}
          ${kpi('fa-bullseye', 'green', 'Completion rate', `${s.completionRate}%`, `${s.completed} of ${s.total - DB.state.tasks.filter(t => Tasks.isActive(t) && t.status === 'cancelled').length} tasks`)}
          ${kpi('fa-hourglass-half', 'blue', 'Pending', s.pending, `${s.inProgress} in progress`)}
          ${kpi('fa-triangle-exclamation', 'red', 'Overdue', s.overdue, s.overdue ? 'Needs attention' : 'All on track')}
          ${kpi('fa-stopwatch', 'slate', 'Time tracked', Utils.formatMinutes(s.timeSpent), 'Across active tasks')}
        </div>
        ${chartJsMissing ? `<div class="notice"><i class="fa-solid fa-plug-circle-xmark"></i> Charts need an internet connection to load Chart.js. Your metrics above are still calculated live.</div>` : ''}
        <div class="chart-grid">
          ${chartCard('chart-daily', 'Daily completions', 'Tasks completed per day, last 14 days', hasCompleted ? '' : 'Complete a few tasks to see your daily trend.')}
          ${chartCard('chart-weekly', 'Weekly activity', 'Tasks created vs completed, last 8 weeks', hasTasks ? '' : 'Create tasks to see weekly activity.')}
          ${chartCard('chart-categories', 'Category distribution', 'Active tasks by category', hasTasks ? '' : 'Tasks will appear here by category.')}
          ${chartCard('chart-priority', 'Open tasks by priority', 'Where your remaining effort sits', DB.state.tasks.some(t => Tasks.isActive(t) && !Tasks.isClosed(t)) ? '' : 'No open tasks — nice work!')}
        </div>
      </div>`;
  }

  return { summary, dailyCompletions, weeklyActivity, weekOverview, priorityDistribution, statusDistribution, renderCharts, destroyCharts, renderPage };
})();
