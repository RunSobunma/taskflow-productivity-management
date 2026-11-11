/* =========================================================================
   useActions — every user-facing action in one place (task lifecycle,
   modals, collections, data management, notifications) with consistent
   toasts, undo and confirmation dialogs.
   ========================================================================= */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '../context/AppContext.jsx';
import { DB } from '../lib/storage.js';
import { Tasks } from '../lib/tasks.js';
import { Categories } from '../lib/categories.js';
import { Projects } from '../lib/projects.js';
import { Bus, Utils, ValidationError } from '../lib/utils.js';

export function useActions() {
  const ui = useUI();
  const navigate = useNavigate();

  return useMemo(() => {
    const { toast, openModal, closeModal, findModal, confirm } = ui;

    const safely = fn => {
      try { return fn(); } catch (err) {
        if (!(err instanceof ValidationError)) console.error(err);
        toast(err.message || 'Something went wrong', { type: 'error' });
        return null;
      }
    };
    const undoable = (message, undo, title = '') => toast(message, { title, action: { label: 'Undo', onClick: undo } });
    const detailsOf = id => findModal(m => m.type === 'taskDetails' && m.props.taskId === id);
    const closeDetailsFor = id => { const m = detailsOf(id); if (m) closeModal(m.id); };

    const a = {
      safely,
      go: path => navigate(`/${path}`),

      /* ---------------- Modals ---------------- */
      openTask(id) {
        if (!Tasks.get(id)) { toast('That task no longer exists.', { type: 'error' }); return; }
        if (!detailsOf(id)) openModal('taskDetails', { taskId: id });
      },
      editTask: id => { if (Tasks.get(id)) openModal('taskForm', { taskId: id }); },
      newTask: (defaults = {}) => openModal('taskForm', { defaults }),
      quickAdd: (defaults = {}) => openModal('quickAdd', { defaults }),
      openDay: iso => openModal('day', { iso }),
      openShortcuts: () => { if (!findModal(m => m.type === 'shortcuts')) openModal('shortcuts'); },
      openPalette: () => { if (!findModal(m => m.type === 'palette')) openModal('palette'); },
      newCollection: kind => openModal('collection', { kind }),
      editCollection: (kind, id) => openModal('collection', { kind, id }),

      /** Create from quick-add values. Throws ValidationError for the form to display. */
      createQuick(values) {
        const task = Tasks.create(values);
        toast(`“${task.title}” added`, { title: 'Task created', action: { label: 'Open', onClick: () => a.openTask(task.id) } });
        return task;
      },

      /* ---------------- Task lifecycle ---------------- */
      toggleComplete: id => safely(() => {
        const before = Tasks.get(id);
        if (!before) return;
        const prevStatus = before.status;
        const t = Tasks.toggleComplete(id);
        if (Tasks.isDone(t)) {
          const recurring = t.recurring !== 'none' && t.spawnedNext;
          undoable(recurring ? 'Next occurrence has been scheduled.' : `“${t.title}”`, () => safely(() => Tasks.setStatus(t.id, prevStatus)), 'Task completed 🎉');
        } else {
          toast(`“${t.title}” marked as not completed.`, { type: 'info' });
        }
      }),
      setStatus: (id, status) => safely(() => {
        const t = Tasks.setStatus(id, status);
        if (t) toast(`Status changed to ${Tasks.STATUS[t.status].label}.`, { type: 'info' });
      }),
      toggleImportant: id => {
        const t = Tasks.toggleImportant(id);
        if (t) toast(t.important ? 'Marked as important.' : 'Removed from important.', { type: 'info' });
      },
      togglePin: id => {
        const t = Tasks.togglePin(id);
        if (t) toast(t.pinned ? 'Pinned to the top of your lists.' : 'Task unpinned.', { type: 'info' });
      },
      duplicate: id => {
        const copy = Tasks.duplicate(id);
        if (copy) toast(`“${copy.title}” created.`, { title: 'Task duplicated', action: { label: 'Open', onClick: () => a.openTask(copy.id) } });
      },
      archive: id => {
        const t = Tasks.archive(id);
        if (t) { closeDetailsFor(id); undoable(`“${t.title}” archived.`, () => Tasks.unarchive(id)); }
      },
      unarchive: id => { const t = Tasks.unarchive(id); if (t) toast(`“${t.title}” restored from archive.`); },
      trash: id => {
        const t = Tasks.trash(id);
        if (t) { closeDetailsFor(id); undoable(`“${t.title}” moved to Trash.`, () => Tasks.restore(id), 'Task deleted'); }
      },
      restore: id => { const t = Tasks.restore(id); if (t) toast(`“${t.title}” restored.`); },
      async destroy(id) {
        const t = Tasks.get(id);
        if (!t) return;
        const ok = await confirm({ title: 'Delete permanently?', message: `“${t.title}” will be deleted forever. This cannot be undone.`, confirmLabel: 'Delete forever', danger: true });
        if (ok) { closeDetailsFor(id); Tasks.destroy(id); toast('Task permanently deleted.', { type: 'info' }); }
      },
      async emptyTrash() {
        const n = Tasks.counts().trash;
        if (!n) return;
        const ok = await confirm({ title: 'Empty Trash?', message: `${Utils.plural(n, 'task')} will be permanently deleted. This cannot be undone.`, confirmLabel: 'Empty Trash', danger: true });
        if (ok) { Tasks.emptyTrash(); toast(`${Utils.plural(n, 'task')} permanently deleted.`, { type: 'info' }); }
      },
      startTimer: id => { const t = Tasks.startTimer(id); if (t) toast(`Tracking time on “${t.title}”.`, { type: 'info' }); },
      stopTimer: id => { const t = Tasks.stopTimer(id); if (t) toast(`Time logged. Total: ${Utils.formatMinutes(t.timeSpent)}.`); },
      moveToStatus: (id, status) => safely(() => {
        const t = Tasks.get(id);
        if (!t || t.status === status) return;
        Tasks.setStatus(id, status);
        toast(`Moved to ${Tasks.STATUS[status].label}.`, { type: 'info' });
      }),
      reschedule: (id, date) => safely(() => {
        const t = Tasks.get(id);
        if (!t || t.dueDate === date) return;
        const prev = t.dueDate;
        Tasks.update(id, { dueDate: date }, { activity: { type: 'updated', message: `Rescheduled “${t.title}” to ${Utils.formatDate(date)}` } });
        undoable(`Rescheduled to ${Utils.formatDate(date)}.`, () => safely(() => Tasks.update(id, { dueDate: prev })));
      }),

      /* ---------------- Categories & projects ---------------- */
      async deleteCollection(kind, id) {
        const Store = kind === 'project' ? Projects : Categories;
        const item = Store.get(id);
        if (!item) return false;
        const linked = Store.taskCount(id, { openOnly: false });
        const ok = await confirm({
          title: `Delete ${kind} “${item.name}”?`,
          message: linked ? `${Utils.plural(linked, 'task')} will be kept but no longer belong to this ${kind}.` : `This ${kind} has no tasks.`,
          confirmLabel: `Delete ${kind}`, danger: true,
        });
        if (!ok) return false;
        ui.closeAllModals();
        Store.remove(id);
        if (window.location.hash.includes(`/${kind}/${id}`)) navigate('/organize');
        toast(`${kind[0].toUpperCase() + kind.slice(1)} deleted.`, { type: 'info' });
        return true;
      },

      /* ---------------- Data ---------------- */
      exportJSON() {
        Utils.download(`taskflow-backup-${Utils.todayISO()}.json`, DB.exportData());
        toast('Backup downloaded.', { title: 'Export complete' });
      },
      exportCSV() {
        const list = DB.state.tasks.filter(t => !t.deleted);
        if (!list.length) { toast('There are no tasks to export yet.', { type: 'warning' }); return; }
        Utils.download(`taskflow-tasks-${Utils.todayISO()}.csv`, Tasks.toCSV(list), 'text/csv');
        toast(`${Utils.plural(list.length, 'task')} exported to CSV.`, { title: 'Export complete' });
      },
      async importJSON(file) {
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) { toast('That file is too large to import.', { type: 'error' }); return; }
        const ok = await confirm({ title: 'Import backup?', message: `Importing “${file.name}” will replace all current data. Export a backup first if you want to keep it.`, confirmLabel: 'Replace & import', icon: 'fa-file-import' });
        if (!ok) return;
        const dismiss = toast('Importing data…', { type: 'info', duration: 10000 });
        try {
          const result = DB.importData(await Utils.readFile(file));
          dismiss();
          Bus.emit('settings:changed', {});
          Bus.emit('data:changed');
          toast(`${Utils.plural(result.tasks, 'task')}, ${Utils.plural(result.projects, 'project')} imported${result.skipped ? ` (${result.skipped} invalid skipped)` : ''}.`, { title: 'Import complete' });
        } catch (err) {
          dismiss();
          toast(err.message, { type: 'error', title: 'Import failed' });
        }
      },
      async clearData() {
        const ok = await confirm({ title: 'Clear all data?', message: 'All tasks, categories, projects and activity will be permanently deleted. Consider exporting a backup first.', confirmLabel: 'Delete everything', danger: true });
        if (!ok) return;
        ui.closeAllModals();
        DB.clearAll();
        Bus.emit('settings:changed', {});
        Bus.emit('data:changed');
        toast('All data has been cleared.', { type: 'info' });
      },
      loadStarter() {
        const n = safely(() => Tasks.createStarterTasks());
        if (n) toast(`${n} starter tasks added. Edit or delete them any time.`, { title: 'Workspace ready' });
      },
      async clearActivity() {
        const ok = await confirm({ title: 'Clear activity history?', message: 'Your tasks are not affected.', confirmLabel: 'Clear history', danger: true });
        if (ok) { DB.state.activity.length = 0; DB.save('activity'); Bus.emit('activity:changed'); toast('Activity history cleared.', { type: 'info' }); }
      },

      /* ---------------- Notifications ---------------- */
      requestNotificationPermission() {
        if (!('Notification' in window)) { toast('This browser does not support notifications. In-app alerts will be used.', { type: 'warning' }); return; }
        Notification.requestPermission().then(result => {
          if (result === 'granted') { DB.updateSettings({ notifications: true }); toast('Browser notifications enabled.'); }
          else { toast('Permission not granted — TaskFlow will use in-app notifications.', { type: 'warning' }); Bus.emit('settings:changed', {}); }
        });
      },
      /** Browser notification when allowed; in-app toast as fallback (and whenever the page is visible). */
      notify(title, body, taskId = null, type = 'warning') {
        let shown = false;
        if (DB.state.settings.notifications && 'Notification' in window && Notification.permission === 'granted') {
          try {
            const n = new Notification(title, { body, tag: taskId || undefined, icon: './logo.svg' });
            n.onclick = () => { window.focus(); if (taskId) a.openTask(taskId); n.close(); };
            shown = true;
          } catch (e) { shown = false; }
        }
        if (!shown || !document.hidden) {
          toast(body, { title, type, duration: 7000, action: taskId ? { label: 'View', onClick: () => a.openTask(taskId) } : null });
        }
      },
    };
    return a;
  }, [ui, navigate]);
}
