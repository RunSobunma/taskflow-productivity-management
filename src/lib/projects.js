/* =========================================================================
   TaskFlow — projects.js
   Projects: CRUD (via the shared collection factory) and progress tracking.
   ========================================================================= */
import { DB } from './storage.js';
import { Tasks } from './tasks.js';

export const Projects = (() => {
  const collection = DB.createCollection({
    key: 'projects', label: 'Project', taskField: 'projectId', normalize: DB.normalizeProject,
  });

  /** Progress across active tasks of a project (cancelled tasks are excluded). */
  function progress(id) {
    const tasks = DB.state.tasks.filter(t => t.projectId === id && !t.deleted && !t.archived && t.status !== 'cancelled');
    const done = tasks.filter(t => t.status === 'completed').length;
    const overdue = tasks.filter(Tasks.isOverdue).length;
    return { total: tasks.length, done, open: tasks.length - done, overdue, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
  }

  return { ...collection, progress };
})();
