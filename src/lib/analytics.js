/* =========================================================================
   TaskFlow — analytics.js
   Productivity metrics computed from real task data (rendering lives in
   src/pages/AnalyticsPage.jsx).
   ========================================================================= */
import { DB } from './storage.js';
import { Utils } from './utils.js';
import { Tasks } from './tasks.js';

export const Analytics = (() => {
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
      relevant: relevant.length,
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
      return { label: `${Utils.MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`, value: completedBetween(from, from + DAY) };
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

  /** Current week (per week-start setting): completed vs due, for the dashboard bars. */
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

  return { summary, dailyCompletions, weeklyActivity, weekOverview, priorityDistribution };
})();
