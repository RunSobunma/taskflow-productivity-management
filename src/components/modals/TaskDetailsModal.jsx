/* =========================================================================
   Task details drawer — live-updating view with status switcher, timer,
   checklist editing and lifecycle actions.
   ========================================================================= */
import { useEffect, useRef, useState } from 'react';
import Modal from '../Modal.jsx';
import { Tasks } from '../../lib/tasks.js';
import { Utils } from '../../lib/utils.js';
import { useUI } from '../../context/AppContext.jsx';
import { useActions } from '../../hooks/useActions.js';
import {
  CategoryChip, CheckButton, DueChip, IconBtn, PriorityBadge, ProgressBar, ProjectChip, StatusBadge, TagList, cx,
} from '../common.jsx';
import { fileIcon } from './TaskFormModal.jsx';

function DetailItem({ icon, label, children }) {
  return (
    <div className="detail-item">
      <span className="detail-label"><i className={icon} />{label}</span>
      <span className="detail-value">{children || <span className="muted">—</span>}</span>
    </div>
  );
}

function SubtaskItem({ task, sub }) {
  const { toast } = useUI();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(sub.title);
  const doneRef = useRef(false);

  const finish = save => {
    if (doneRef.current) return;
    doneRef.current = true;
    setEditing(false);
    if (save && value.trim() && value.trim() !== sub.title) {
      try { Tasks.updateSubtask(task.id, sub.id, value); } catch (err) { toast(err.message, { type: 'error' }); }
    } else {
      setValue(sub.title);
    }
  };

  return (
    <li className={cx('subtask', sub.done && 'is-done')}>
      <button type="button" className={cx('check check-sm', sub.done && 'checked')} role="checkbox" aria-checked={sub.done} aria-label="Toggle subtask"
        disabled={task.deleted} onClick={() => Tasks.toggleSubtask(task.id, sub.id)}><i className="fa-solid fa-check" /></button>
      {editing ? (
        <input className="input input-sm" value={value} maxLength={200} aria-label="Edit subtask" autoFocus
          onChange={e => setValue(e.target.value)} onBlur={() => finish(true)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); finish(true); }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
          }} />
      ) : <span className="subtask-title">{sub.title}</span>}
      {!task.deleted && !editing && (
        <span className="subtask-actions">
          <IconBtn className="icon-btn-sm" icon="fa-regular fa-pen-to-square" label="Edit subtask" onClick={() => { doneRef.current = false; setValue(sub.title); setEditing(true); }} />
          <IconBtn className="icon-btn-sm danger" icon="fa-regular fa-trash-can" label="Delete subtask"
            onClick={() => { Tasks.deleteSubtask(task.id, sub.id); toast('Subtask removed.', { type: 'info' }); }} />
        </span>
      )}
    </li>
  );
}

export default function TaskDetailsModal({ taskId, onClose }) {
  const t = Tasks.get(taskId);
  const actions = useActions();
  const { toast } = useUI();
  const [newSub, setNewSub] = useState('');
  const subInputRef = useRef(null);

  useEffect(() => { if (!t) onClose(); }, [t, onClose]);
  if (!t) return null;

  const p = Tasks.progress(t);
  const reminder = Tasks.reminderTime(t);
  const spent = Tasks.elapsed(t);

  const addSubtask = e => {
    e.preventDefault();
    try {
      Tasks.addSubtask(t.id, newSub);
      setNewSub('');
    } catch (err) { toast(err.message, { type: 'error' }); }
    if (subInputRef.current) subInputRef.current.focus();
  };

  const footer = close => (t.deleted ? (
    <>
      <button type="button" className="btn btn-danger-soft" onClick={() => actions.destroy(t.id)}><i className="fa-solid fa-trash" /> Delete forever</button>
      <span className="spacer" />
      <button type="button" className="btn btn-primary" onClick={() => actions.restore(t.id)}><i className="fa-solid fa-rotate-left" /> Restore</button>
    </>
  ) : (
    <>
      <IconBtn icon="fa-regular fa-trash-can" tip="Move to Trash" onClick={() => actions.trash(t.id)} />
      <IconBtn icon={`fa-solid ${t.archived ? 'fa-box-open' : 'fa-box-archive'}`} tip={t.archived ? 'Unarchive' : 'Archive'}
        onClick={() => (t.archived ? actions.unarchive(t.id) : actions.archive(t.id))} />
      <IconBtn icon="fa-regular fa-copy" tip="Duplicate" onClick={() => actions.duplicate(t.id)} />
      <IconBtn className={cx(t.pinned && 'is-active')} icon="fa-solid fa-thumbtack" tip={t.pinned ? 'Unpin' : 'Pin to top'} onClick={() => actions.togglePin(t.id)} />
      <IconBtn className={cx(t.important && 'is-starred')} icon={`${t.important ? 'fa-solid' : 'fa-regular'} fa-star`} tip={t.important ? 'Unstar' : 'Mark important'}
        label="Toggle important" onClick={() => actions.toggleImportant(t.id)} />
      <span className="spacer" />
      <button type="button" className="btn btn-ghost" onClick={close}>Close</button>
      <button type="button" className="btn btn-primary" onClick={() => actions.editTask(t.id)}><i className="fa-regular fa-pen-to-square" /> Edit</button>
    </>
  ));

  return (
    <Modal title={<><i className="fa-regular fa-file-lines title-icon" /> Task details</>} size="drawer" className="modal-drawer" onClose={onClose} footer={footer}>
      <div className="details">
        {t.deleted && <div className="notice notice-danger"><i className="fa-regular fa-trash-can" /> This task is in the Trash.</div>}
        {t.archived && !t.deleted && <div className="notice"><i className="fa-solid fa-box-archive" /> This task is archived.</div>}
        <div className="details-title">
          <CheckButton task={t} />
          <h3 className={cx(Tasks.isDone(t) && 'is-done')}>{t.title}</h3>
        </div>
        <div className="details-badges">
          <StatusBadge status={t.status} /><PriorityBadge priority={t.priority} /><CategoryChip id={t.categoryId} /><ProjectChip id={t.projectId} />
          {Tasks.isOverdue(t) && <span className="badge badge-danger"><i className="fa-solid fa-triangle-exclamation" />Overdue</span>}
          {t.important && <span className="badge badge-amber"><i className="fa-solid fa-star" />Important</span>}
          {t.pinned && <span className="badge"><i className="fa-solid fa-thumbtack" />Pinned</span>}
        </div>

        {!t.deleted && (
          <div className="details-status">
            <label>Status</label>
            <div className="segmented segmented-sm" role="group" aria-label="Status">
              {Object.keys(Tasks.STATUS).map(s => (
                <button type="button" key={s} className={cx('seg-btn', t.status === s && 'active')} aria-pressed={t.status === s}
                  onClick={() => actions.setStatus(t.id, s)}>{Tasks.STATUS[s].label}</button>
              ))}
            </div>
          </div>
        )}

        <div className="detail-grid">
          <DetailItem icon="fa-regular fa-calendar-plus" label="Start date">{t.startDate && Utils.formatDate(t.startDate)}</DetailItem>
          <DetailItem icon="fa-regular fa-calendar" label="Due date">{t.dueDate && <DueChip task={t} />}</DetailItem>
          <DetailItem icon="fa-regular fa-bell" label="Reminder">
            {reminder && <>{Utils.formatDateTime(reminder.getTime())}{t.reminded && <span className="muted"> (sent)</span>}</>}
          </DetailItem>
          <DetailItem icon="fa-solid fa-repeat" label="Repeats">{t.recurring !== 'none' && Tasks.RECURRENCE[t.recurring]}</DetailItem>
          <DetailItem icon="fa-regular fa-clock" label="Estimate">{t.estimate > 0 && Utils.formatMinutes(t.estimate)}</DetailItem>
          <DetailItem icon="fa-solid fa-stopwatch" label="Time spent">
            <span className="time-spent">{Utils.formatMinutes(spent)}{t.timerStartedAt && <span className="live-dot" />}</span>
            {t.timerStartedAt
              ? <button type="button" className="btn btn-sm btn-danger-soft" onClick={() => actions.stopTimer(t.id)}><i className="fa-solid fa-stop" /> Stop timer</button>
              : <button type="button" className="btn btn-sm btn-ghost" disabled={t.deleted || Tasks.isClosed(t)} onClick={() => actions.startTimer(t.id)}><i className="fa-solid fa-play" /> Start timer</button>}
          </DetailItem>
          <DetailItem icon="fa-regular fa-square-plus" label="Created">{Utils.formatDateTime(t.createdAt)}</DetailItem>
          <DetailItem icon="fa-regular fa-pen-to-square" label="Updated">{Utils.formatDateTime(t.updatedAt)}</DetailItem>
          {t.completedAt && <DetailItem icon="fa-regular fa-circle-check" label="Completed">{Utils.formatDateTime(t.completedAt)}</DetailItem>}
        </div>
        {t.estimate > 0 && (
          <div className="estimate-bar"><span className="muted">Time used vs estimate</span>
            <ProgressBar pct={Math.min(100, Math.round((spent / t.estimate) * 100))} size="sm" label="Time used vs estimate" /></div>
        )}

        <section className="detail-section">
          <h4>Description</h4>
          {t.description ? <p className="details-desc">{t.description}</p> : <p className="muted">No description.</p>}
        </section>

        {t.tags.length > 0 && <section className="detail-section"><h4>Tags</h4><div className="tag-row"><TagList tags={t.tags} /></div></section>}

        <section className="detail-section">
          <div className="detail-section-head"><h4>Checklist</h4>{p.total > 0 && <span className="muted">{p.done}/{p.total} completed · {p.pct}%</span>}</div>
          {p.total > 0 && <ProgressBar pct={p.pct} label="Checklist progress" />}
          <ul className="subtasks">{t.subtasks.map(s => <SubtaskItem key={s.id} task={t} sub={s} />)}</ul>
          {!t.deleted && (
            <form className="inline-add" onSubmit={addSubtask} noValidate data-subtask-form>
              <input ref={subInputRef} type="text" className="input" placeholder="Add a subtask…" maxLength={200} aria-label="New subtask"
                value={newSub} onChange={e => setNewSub(e.target.value)} />
              <button type="submit" className="btn btn-ghost"><i className="fa-solid fa-plus" /> Add</button>
            </form>
          )}
        </section>

        <section className="detail-section">
          <h4>Attachments</h4>
          {t.attachments.length ? (
            <ul className="attachment-list">
              {t.attachments.map(a => (
                <li className="attachment" key={a.id}>
                  <i className={`fa-regular ${fileIcon(a)}`} /><span className="attachment-name">{a.name}</span>
                  <span className="muted">{Utils.formatBytes(a.size)}</span>
                  {a.dataUrl
                    ? <a className="icon-btn icon-btn-sm" href={a.dataUrl} download={a.name} aria-label={`Download ${a.name}`} data-tip="Download"><i className="fa-solid fa-download" /></a>
                    : <span className="muted small">name only</span>}
                </li>
              ))}
            </ul>
          ) : <p className="muted">No attachments. Add files by editing the task.</p>}
        </section>
      </div>
    </Modal>
  );
}
