/* Reminder & overdue engine: checks every 30s, on tab focus and shortly after load. */
import { useEffect, useRef } from 'react';
import { DB } from '../lib/storage.js';
import { Tasks } from '../lib/tasks.js';
import { Utils } from '../lib/utils.js';
import { refreshStore } from '../store/store.js';

export function checkReminders(notify) {
  const now = Date.now();
  let changed = false;
  const reminders = [];
  const overdue = [];
  DB.state.tasks.forEach(t => {
    if (!Tasks.isActive(t) || Tasks.isClosed(t)) return;
    const at = Tasks.reminderTime(t);
    if (at && !t.reminded && at.getTime() <= now) {
      t.reminded = true;
      changed = true;
      if (now - at.getTime() < 12 * 3600000) reminders.push(t);   // skip very stale reminders
    }
    if (DB.state.settings.overdueAlerts && !t.overdueNotified && Tasks.isOverdue(t)) {
      t.overdueNotified = true;
      changed = true;
      overdue.push(t);
    }
  });
  if (!changed) return;
  DB.save('tasks');
  reminders.forEach(t => {
    const when = t.dueDate ? `Due ${Utils.friendlyDate(t.dueDate).toLowerCase()}${t.dueTime ? ` at ${Utils.formatTime(t.dueTime)}` : ''}` : 'Reminder';
    DB.logActivity('reminder', `Reminder: “${t.title}”`, t.id);
    notify(`Reminder: ${t.title}`, when, t.id, 'info');
  });
  if (overdue.length === 1) {
    DB.logActivity('overdue', `“${overdue[0].title}” is overdue`, overdue[0].id);
    notify('Task overdue', `“${overdue[0].title}” is past its due date.`, overdue[0].id, 'warning');
  } else if (overdue.length > 1) {
    DB.logActivity('overdue', `${overdue.length} tasks are overdue`);
    notify(`${overdue.length} tasks are overdue`, 'Open Today to review them.', null, 'warning');
  }
}

export function useReminders(notify) {
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  useEffect(() => {
    const check = () => checkReminders((...args) => notifyRef.current(...args));
    let day = Utils.todayISO();
    const initial = setTimeout(check, 1200);
    const interval = setInterval(() => {
      check();
      // Refresh relative dates at midnight and live timers every tick.
      const today = Utils.todayISO();
      const typingInView = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)
        && document.activeElement.closest('#view');
      if ((today !== day || DB.state.tasks.some(t => t.timerStartedAt && !t.deleted)) && !typingInView) {
        day = today;
        refreshStore();
      }
    }, 30000);
    const onVisible = () => { if (!document.hidden) check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(initial); clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
}
