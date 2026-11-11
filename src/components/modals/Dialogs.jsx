/* =========================================================================
   Smaller dialogs: quick add, confirmation, keyboard shortcuts, day list.
   ========================================================================= */
import { useRef } from 'react';
import Modal from '../Modal.jsx';
import { Tasks } from '../../lib/tasks.js';
import { Utils } from '../../lib/utils.js';
import { useAppState } from '../../context/AppContext.jsx';
import { useActions } from '../../hooks/useActions.js';
import { QuickAddForm } from '../forms.jsx';
import { MiniRow } from '../TaskViews.jsx';
import { EmptyState } from '../common.jsx';

export function QuickAddModal({ defaults = {}, onClose }) {
  const actions = useActions();
  const closeRef = useRef(null);
  const valuesRef = useRef({});
  return (
    <Modal title={<><i className="fa-solid fa-bolt title-icon" /> Quick add task</>} size="sm" className="modal-quick" onClose={onClose} closeRef={closeRef}
      footer={close => (
        <>
          <button type="button" className="btn btn-link" onClick={() => {
            const values = valuesRef.current;
            close();
            actions.newTask({ ...defaults, ...values });
          }}><i className="fa-solid fa-sliders" /> More options</button>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
          <button type="submit" className="btn btn-primary" form="quick-add-form">Save <kbd>↵</kbd></button>
        </>
      )}>
      <QuickAddForm id="quick-add-form" className="quick-add-modal" defaults={defaults} autoFocus valuesRef={valuesRef}
        onCreated={() => closeRef.current()} />
    </Modal>
  );
}

export function ConfirmModal({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', danger = false, icon, resolve, onClose }) {
  const answered = useRef(false);
  const closeRef = useRef(null);
  const finish = () => { if (!answered.current) resolve(false); onClose(); };
  return (
    <Modal title="" size="sm" className="modal-confirm" onClose={finish} closeRef={closeRef}
      footer={close => (
        <>
          <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} data-confirm autoFocus
            onClick={() => { answered.current = true; resolve(true); close(); }}>{confirmLabel}</button>
        </>
      )}>
      <div className="confirm">
        <div className={`confirm-icon ${danger ? 'tone-red' : 'tone-indigo'}`}>
          <i className={`fa-solid ${icon || (danger ? 'fa-triangle-exclamation' : 'fa-circle-question')}`} />
        </div>
        <h3>{title}</h3><p>{message}</p>
      </div>
    </Modal>
  );
}

const SHORTCUTS = [
  [['N'], 'New task (quick add)'], [['/'], 'Focus search'], [['Ctrl', 'K'], 'Quick actions'], [['Ctrl', '/'], 'Show keyboard shortcuts'],
  [['Ctrl', 'Enter'], 'Save the open task form'], [['Esc'], 'Close dialog, menu or panel'], [['G', 'D'], 'Go to Dashboard'],
  [['G', 'T'], 'Go to My Tasks'], [['G', 'C'], 'Go to Calendar'], [['G', 'A'], 'Go to Analytics'],
];

export function ShortcutsModal({ onClose }) {
  return (
    <Modal title={<><i className="fa-regular fa-keyboard title-icon" /> Keyboard shortcuts</>} size="sm" onClose={onClose}
      footer={close => <button type="button" className="btn btn-primary" onClick={close}>Got it</button>}>
      <ul className="shortcut-list">
        {SHORTCUTS.map(([keys, label]) => (
          <li key={label}>
            <span>{label}</span>
            <span className="keys">
              {keys.map((k, i) => (
                <span key={k}>{i > 0 && (keys[0] === 'G' ? <span className="muted"> then </span> : ' + ')}<kbd>{k}</kbd></span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function DayTasksModal({ iso, onClose }) {
  const actions = useActions();
  const { search } = useAppState();
  const list = Tasks.query('calendar', { search }, 'due').filter(t => t.dueDate === iso);
  const date = Utils.parseDate(iso);
  return (
    <Modal title={`${Utils.DAYS[date.getDay()]}, ${Utils.formatDate(iso)}`} size="sm" onClose={onClose}
      footer={close => (
        <>
          <button type="button" className="btn btn-ghost" onClick={close}>Close</button>
          <button type="button" className="btn btn-primary" onClick={() => actions.quickAdd({ dueDate: iso })}><i className="fa-solid fa-plus" /> Add task</button>
        </>
      )}>
      {list.length
        ? <div className="mini-list">{list.map(t => <MiniRow key={t.id} task={t} showDate={false} />)}</div>
        : <EmptyState icon="fa-calendar-check" title="Nothing scheduled" text="No tasks are due on this day." compact />}
    </Modal>
  );
}
