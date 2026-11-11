/* =========================================================================
   Route / page configuration shared by the router, top bar and pages.
   ========================================================================= */
import { Categories } from './lib/categories.js';
import { Projects } from './lib/projects.js';
import { Tasks } from './lib/tasks.js';
import { Utils } from './lib/utils.js';

export const TASK_PAGES = {
  tasks: { title: 'My Tasks', icon: 'fa-list-check', empty: { icon: 'fa-list-check', title: 'No tasks yet', text: 'Create your first task to get organised.' } },
  inbox: { title: 'Inbox', icon: 'fa-inbox', empty: { icon: 'fa-inbox', title: 'Inbox zero', text: 'Open tasks without a category or project land here.' } },
  today: { title: 'Today', icon: 'fa-calendar-day', empty: { icon: 'fa-mug-hot', title: 'Nothing due today', text: 'Enjoy your day — or plan something new.' } },
  upcoming: { title: 'Upcoming', icon: 'fa-calendar-week', sort: 'due', empty: { icon: 'fa-calendar-week', title: 'No upcoming tasks', text: 'Tasks with future due dates appear here.' } },
  important: { title: 'Important', icon: 'fa-star', empty: { icon: 'fa-star', title: 'No starred tasks', text: 'Star a task to keep it front and centre.' } },
  completed: { title: 'Completed', icon: 'fa-circle-check', noQuickAdd: true, sort: 'updated', empty: { icon: 'fa-circle-check', title: 'Nothing completed yet', text: 'Completed tasks are collected here.' } },
  archived: { title: 'Archived', icon: 'fa-box-archive', noQuickAdd: true, empty: { icon: 'fa-box-archive', title: 'Archive is empty', text: 'Archive tasks you want to keep but hide from your lists.' } },
  trash: { title: 'Trash', icon: 'fa-trash-can', noQuickAdd: true, empty: { icon: 'fa-trash-can', title: 'Trash is empty', text: 'Deleted tasks stay here until you remove them permanently.' } },
  calendar: { title: 'Calendar', icon: 'fa-calendar', noQuickAdd: true, forceView: 'calendar', sort: 'due' },
};

const OTHER_PAGES = {
  dashboard: { title: 'Dashboard', kind: 'dashboard' },
  analytics: { title: 'Analytics', kind: 'analytics' },
  organize: { title: 'Categories & Projects', kind: 'organize' },
  settings: { title: 'Settings', kind: 'settings' },
};

export function parsePath(pathname) {
  const [, name = '', id = ''] = pathname.split('/');
  return { name: name || 'dashboard', id: decodeURIComponent(id) };
}

export const routeKey = ({ name, id }) => (id ? `${name}/${id}` : name);

/** Page configuration for a route, or null when it does not exist. */
export function pageConfig({ name, id }) {
  if (TASK_PAGES[name]) return { ...TASK_PAGES[name], kind: 'tasks', scope: name };
  if (name === 'category') {
    const c = Categories.get(id);
    return c && {
      title: c.name, icon: c.icon, color: c.color, kind: 'tasks', scope: `category:${id}`, item: c, itemKind: 'category',
      empty: { icon: c.icon, title: `No tasks in ${c.name}`, text: 'Add a task to this category to see it here.' },
    };
  }
  if (name === 'project') {
    const p = Projects.get(id);
    return p && {
      title: p.name, icon: p.icon, color: p.color, kind: 'tasks', scope: `project:${id}`, item: p, itemKind: 'project',
      empty: { icon: p.icon, title: 'This project has no tasks', text: 'Break the project down into tasks to track progress.' },
    };
  }
  return OTHER_PAGES[name] || null;
}

export function subtitle(page) {
  const now = new Date();
  const todayLabel = `${Utils.DAYS[now.getDay()]}, ${Utils.formatDate(Utils.todayISO())}`;
  switch (page.kind) {
    case 'dashboard': return todayLabel;
    case 'analytics': return 'Your productivity at a glance';
    case 'organize': {
      const n = Categories.list().length;
      return `${n} ${n === 1 ? 'category' : 'categories'} · ${Utils.plural(Projects.list().length, 'project')}`;
    }
    case 'settings': return 'Personalise TaskFlow';
    default: break;
  }
  const { scope } = page;
  if (scope === 'today') {
    const overdue = Tasks.counts().overdue;
    return `${todayLabel}${overdue ? ` · ${overdue} overdue` : ''}`;
  }
  if (scope === 'trash') return 'Items in Trash can be restored or deleted forever';
  if (scope === 'archived') return 'Hidden from your lists, kept for reference';
  if (scope === 'calendar') return 'Plan your tasks by due date';
  const list = Tasks.query(scope);
  const open = list.filter(t => !Tasks.isClosed(t)).length;
  return `${open} open · ${list.length - open} closed`;
}

/** Defaults for new tasks created while viewing a route. */
export function contextDefaults({ name, id }) {
  if (name === 'category') return { categoryId: id };
  if (name === 'project') return { projectId: id };
  if (name === 'today') return { dueDate: Utils.todayISO() };
  if (name === 'upcoming') return { dueDate: Utils.toISODate(Utils.addDays(new Date(), 1)) };
  if (name === 'important') return { important: true };
  return {};
}
