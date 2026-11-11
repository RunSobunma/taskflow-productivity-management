/* =========================================================================
   Portal-style hosts rendered once at the root: modal stack, toasts, menu.
   ========================================================================= */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useUI } from '../context/AppContext.jsx';
import TaskFormModal from './modals/TaskFormModal.jsx';
import TaskDetailsModal from './modals/TaskDetailsModal.jsx';
import CollectionModal from './modals/CollectionModal.jsx';
import CommandPalette from './modals/CommandPalette.jsx';
import { ConfirmModal, DayTasksModal, QuickAddModal, ShortcutsModal } from './modals/Dialogs.jsx';
import { cx } from './common.jsx';

const REGISTRY = {
  taskForm: TaskFormModal,
  taskDetails: TaskDetailsModal,
  quickAdd: QuickAddModal,
  collection: CollectionModal,
  confirm: ConfirmModal,
  shortcuts: ShortcutsModal,
  palette: CommandPalette,
  day: DayTasksModal,
};

export function ModalHost() {
  const { modals, closeModal } = useUI();
  return (
    <div id="modal-root">
      {modals.map(m => {
        const Component = REGISTRY[m.type];
        return Component ? <Component key={m.id} {...m.props} onClose={() => closeModal(m.id)} /> : null;
      })}
    </div>
  );
}

/* ---------------- Toasts ---------------- */
const TOAST_ICONS = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info', warning: 'fa-triangle-exclamation' };

function Toast({ toast, onDismiss }) {
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const timer = useRef(null);

  const dismiss = () => {
    clearTimeout(timer.current);
    setLeaving(true);
    setTimeout(onDismiss, 250);
  };
  const schedule = ms => { clearTimeout(timer.current); timer.current = setTimeout(dismiss, ms); };

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    schedule(toast.duration);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cx('toast', `toast-${toast.type}`, shown && !leaving && 'show', leaving && 'hide', paused && 'paused')}
      role={toast.type === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => { clearTimeout(timer.current); setPaused(true); }}
      onMouseLeave={() => { setPaused(false); schedule(1500); }}>
      <i className={`fa-solid ${TOAST_ICONS[toast.type] || TOAST_ICONS.info} toast-icon`} />
      <div className="toast-body">{toast.title && <strong>{toast.title}</strong>}<span>{toast.message}</span></div>
      {toast.action && <button type="button" className="toast-action" onClick={() => { toast.action.onClick(); dismiss(); }}>{toast.action.label}</button>}
      <button type="button" className="toast-close" aria-label="Dismiss" onClick={dismiss}><i className="fa-solid fa-xmark" /></button>
      <span className="toast-timer" style={{ animationDuration: `${toast.duration}ms` }} />
    </div>
  );
}

export function ToastHost() {
  const { toasts, dismissToast } = useUI();
  return (
    <div className="toast-root" aria-live="polite">
      {toasts.map(t => <Toast key={t.id} toast={t} onDismiss={() => dismissToast(t.id)} />)}
    </div>
  );
}

/* ---------------- Context menu ---------------- */
export function MenuHost() {
  const { menu, closeMenu } = useUI();
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!menu || !ref.current) { setPos(null); return; }
    const r = menu.rect;
    const m = ref.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - m.width - 8, r.right - m.width));
    const top = r.bottom + m.height + 8 > window.innerHeight ? Math.max(8, r.top - m.height - 6) : r.bottom + 6;
    setPos({ left, top });
    const first = ref.current.querySelector('.menu-item');
    if (first) first.focus({ preventScroll: true });
  }, [menu]);

  useEffect(() => {
    if (!menu) return undefined;
    const onDown = e => {
      if (ref.current && ref.current.contains(e.target)) return;
      if (menu.anchor.contains(e.target)) return;   // the anchor's own click toggles the menu
      closeMenu();
    };
    const onKey = e => { if (e.key === 'Escape') { e.stopImmediatePropagation(); closeMenu(); } };
    const onScroll = () => closeMenu();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onScroll);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [menu, closeMenu]);

  if (!menu) return null;

  const onKeyDown = e => {
    const list = Array.from(ref.current.querySelectorAll('.menu-item'));
    const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
  };

  return (
    <div ref={ref} className={cx('menu', pos && 'open')} role="menu" onKeyDown={onKeyDown}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}>
      {menu.items.map((item, i) => (item === '-'
        ? <div key={`sep-${i}`} className="menu-sep" role="separator" />
        : (
          <button key={item.label} type="button" role="menuitem" className={cx('menu-item', item.danger && 'danger')}
            onClick={() => { closeMenu(); item.onSelect(); }}>
            <i className={item.icon} /><span>{item.label}</span>
          </button>
        )))}
    </div>
  );
}
