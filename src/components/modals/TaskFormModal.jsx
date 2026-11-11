/* =========================================================================
   Full task form (create / edit): details, schedule, reminder, recurrence,
   time tracking, tags, checklist and attachments.
   ========================================================================= */
import { useRef, useState } from 'react';
import Modal from '../Modal.jsx';
import { DB } from '../../lib/storage.js';
import { Tasks } from '../../lib/tasks.js';
import { Utils } from '../../lib/utils.js';
import { useUI } from '../../context/AppContext.jsx';
import { useActions } from '../../hooks/useActions.js';
import { FieldError, useFormErrors } from '../../hooks/useFormErrors.jsx';
import { CategoryOptions, PriorityOptions, ProjectOptions, StatusOptions } from '../forms.jsx';
import { cx } from '../common.jsx';

const MAX_INLINE_ATTACHMENT = 1.5 * 1024 * 1024;

export function fileIcon(a) {
  const t = a.type || '';
  if (t.startsWith('image/')) return 'fa-file-image';
  if (t === 'application/pdf') return 'fa-file-pdf';
  if (t.startsWith('video/')) return 'fa-file-video';
  if (t.startsWith('audio/')) return 'fa-file-audio';
  if (/zip|compressed|tar/.test(t)) return 'fa-file-zipper';
  if (/sheet|excel|csv/.test(t)) return 'fa-file-excel';
  if (/word|document/.test(t)) return 'fa-file-word';
  if (t.startsWith('text/')) return 'fa-file-lines';
  return 'fa-file';
}

const normalizeTag = raw => raw.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-');

export default function TaskFormModal({ taskId, defaults = {}, onClose }) {
  const task = taskId ? Tasks.get(taskId) : null;
  const isEdit = !!task;
  const settings = DB.state.settings;
  const { toast } = useUI();
  const actions = useActions();
  const formRef = useRef(null);
  const closeRef = useRef(null);
  const [errors, run] = useFormErrors(formRef);

  const [form, setForm] = useState(() => {
    const src = task || {
      title: '', description: '', status: 'todo', priority: settings.defaultPriority, categoryId: '', projectId: '',
      startDate: '', dueDate: '', dueTime: '', reminder: defaults.dueDate ? settings.defaultReminder : '', reminderAt: '',
      recurring: 'none', estimate: 0, timeSpent: 0, important: false, pinned: false, ...defaults,
    };
    return {
      title: src.title || '', description: src.description || '', status: src.status || 'todo', priority: src.priority || settings.defaultPriority,
      categoryId: src.categoryId || '', projectId: src.projectId || '', startDate: src.startDate || '', dueDate: src.dueDate || '',
      dueTime: src.dueTime || '', reminder: src.reminder || '', reminderAt: src.reminderAt || '', recurring: src.recurring || 'none',
      estimate: src.estimate || '', timeSpent: src.timeSpent || '', important: !!src.important, pinned: !!src.pinned,
    };
  });
  const [tags, setTags] = useState(() => [...((task || defaults).tags || [])]);
  const [subtasks, setSubtasks] = useState(() => ((task || defaults).subtasks || []).map(s => ({ ...s })));
  const [attachments, setAttachments] = useState(() => ((task || defaults).attachments || []).map(a => ({ ...a })));
  const [tagEntry, setTagEntry] = useState('');
  const [subEntry, setSubEntry] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const subEntryRef = useRef(null);

  const set = key => e => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [key]: value }));
  };

  /* ---- Tags ---- */
  const addTags = raw => {
    const next = [...tags];
    raw.split(',').map(normalizeTag).filter(Boolean).forEach(tag => {
      if (tag.length > 30) { toast('Tags must be 30 characters or fewer', { type: 'warning' }); return; }
      if (next.includes(tag)) return;
      if (next.length >= 20) { toast('A task can have up to 20 tags', { type: 'warning' }); return; }
      next.push(tag);
    });
    setTags(next);
    return next;
  };
  const onTagKey = e => {
    if ((e.key === 'Enter' || e.key === ',') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); addTags(tagEntry); setTagEntry(''); }
    if (e.key === 'Backspace' && !tagEntry && tags.length) setTags(tags.slice(0, -1));
  };

  /* ---- Subtasks ---- */
  const addSub = () => {
    const title = subEntry.trim();
    if (title) { setSubtasks(list => [...list, { id: null, title, done: false }]); setSubEntry(''); }
    if (subEntryRef.current) subEntryRef.current.focus();
  };
  const updateSub = (i, patch) => setSubtasks(list => list.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const doneCount = subtasks.filter(s => s.done).length;

  /* ---- Attachments ---- */
  const addFiles = async files => {
    const next = [...attachments];
    for (const file of files) {
      if (next.length >= 10) { toast('Up to 10 attachments per task', { type: 'warning' }); break; }
      let dataUrl = '';
      if (file.size <= MAX_INLINE_ATTACHMENT) {
        try { dataUrl = await Utils.readFile(file, 'dataURL'); } catch (err) { toast(`Could not read ${file.name}`, { type: 'error' }); continue; }
      } else {
        toast(`${file.name} is larger than 1.5 MB — only its name and size are saved.`, { type: 'warning' });
      }
      next.push({ id: null, name: file.name, size: file.size, type: file.type, dataUrl, addedAt: Date.now() });
    }
    setAttachments(next);
  };

  /* ---- Submit ---- */
  const submit = e => {
    e.preventDefault();
    const finalTags = tagEntry.trim() ? addTags(tagEntry) : tags;
    setTagEntry('');
    const finalSubs = subEntry.trim() ? [...subtasks, { id: null, title: subEntry.trim(), done: false }] : subtasks;
    setSubtasks(finalSubs);
    setSubEntry('');
    const data = {
      ...form,
      title: form.title.trim(), description: form.description.trim(),
      estimate: Number(form.estimate || 0), timeSpent: Number(form.timeSpent || 0),
      reminderAt: form.reminder === 'custom' ? form.reminderAt : '',
      tags: finalTags, subtasks: finalSubs.filter(s => s.title.trim()), attachments,
    };
    const saved = run(() => (isEdit ? Tasks.update(task.id, data) : Tasks.create(data)));
    if (saved) {
      closeRef.current();
      toast(isEdit ? 'Your changes have been saved.' : `“${saved.title}” was added.`, {
        title: isEdit ? 'Task updated' : 'Task created',
        action: isEdit ? null : { label: 'Open', onClick: () => actions.openTask(saved.id) },
      });
    }
  };

  const field = (label, name, control, extra = '') => (
    <div className={cx('field', extra, errors[name] && 'has-error')}>
      <label htmlFor={`tf-${name}`}>{label}</label>{control}<FieldError errors={errors} name={name} />
    </div>
  );
  const select = (name, options) => <select id={`tf-${name}`} name={name} className="input" value={form[name]} onChange={set(name)}>{options}</select>;
  const input = (name, type, attrs = {}) => <input id={`tf-${name}`} name={name} type={type} className="input" value={form[name]} onChange={set(name)} {...attrs} />;
  const optionsOf = map => Object.keys(map).map(k => <option key={k} value={k}>{map[k]}</option>);

  return (
    <Modal title={isEdit ? 'Edit task' : 'New task'} size="lg" onClose={onClose} closeRef={closeRef}
      footer={close => (
        <>
          <span className="foot-note">{isEdit ? `Last updated ${Utils.relativeTime(task.updatedAt)}` : <><kbd>Ctrl</kbd> + <kbd>Enter</kbd> to save</>}</span>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
          <button type="submit" className="btn btn-primary" form="task-form"><i className="fa-solid fa-check" /> {isEdit ? 'Save changes' : 'Create task'}</button>
        </>
      )}>
      <form id="task-form" className="task-form" ref={formRef} onSubmit={submit} noValidate>
        <div className={cx('field', errors.title && 'has-error')}>
          <label htmlFor="tf-title">Title <span className="req" aria-hidden="true">*</span></label>
          <input id="tf-title" name="title" className="input input-lg" maxLength={200} required autoComplete="off" autoFocus
            placeholder="What needs to be done?" value={form.title} onChange={set('title')} />
          <FieldError errors={errors} name="title" />
        </div>
        {field('Description', 'description', <textarea id="tf-description" name="description" className="input" rows={3} maxLength={5000}
          placeholder="Add details, links or notes…" value={form.description} onChange={set('description')} />)}

        <div className="form-section-title">Details</div>
        <div className="form-grid">
          {field('Status', 'status', select('status', <StatusOptions />))}
          {field('Priority', 'priority', select('priority', <PriorityOptions />))}
          {field('Category', 'categoryId', select('categoryId', <CategoryOptions />))}
          {field('Project', 'projectId', select('projectId', <ProjectOptions />))}
        </div>

        <div className="form-section-title">Schedule</div>
        <div className="form-grid">
          {field('Start date', 'startDate', input('startDate', 'date'))}
          {field('Due date', 'dueDate', input('dueDate', 'date'))}
          {field('Due time', 'dueTime', input('dueTime', 'time'))}
          {field('Repeat', 'recurring', select('recurring', optionsOf(Tasks.RECURRENCE)))}
          {field('Reminder', 'reminder', select('reminder', optionsOf(Tasks.REMINDER)))}
          {form.reminder === 'custom' && field('Remind me at', 'reminderAt', input('reminderAt', 'datetime-local'))}
        </div>

        <div className="form-section-title">Time</div>
        <div className="form-grid">
          {field('Estimated time (minutes)', 'estimate', input('estimate', 'number', { min: 0, step: 5, placeholder: 'e.g. 45' }))}
          {field('Actual time spent (minutes)', 'timeSpent', input('timeSpent', 'number', { min: 0, step: 5, placeholder: '0' }))}
        </div>

        <div className="form-section-title">Tags</div>
        <div className="tag-input" onClick={e => { if (e.target === e.currentTarget) e.currentTarget.querySelector('.tag-entry').focus(); }}>
          {tags.map((tag, i) => (
            <span className="tag tag-removable" key={tag}>#{tag}
              <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => setTags(tags.filter((_, idx) => idx !== i))}><i className="fa-solid fa-xmark" /></button>
            </span>
          ))}
          <input type="text" className="tag-entry" placeholder="Type a tag and press Enter" maxLength={30} aria-label="Add tag"
            value={tagEntry} onChange={e => setTagEntry(e.target.value)} onKeyDown={onTagKey} />
        </div>

        <div className="form-section-title">Checklist <span className="muted">{subtasks.length ? `${doneCount}/${subtasks.length}` : ''}</span></div>
        {subtasks.length > 0 && (
          <ul className="subtask-editor">
            {subtasks.map((s, i) => (
              <li className="subtask-edit-row" key={s.id || `new-${i}`}>
                <label className="mini-check"><input type="checkbox" checked={s.done} aria-label="Done" onChange={e => updateSub(i, { done: e.target.checked })} /><span /></label>
                <input type="text" className="input input-sm" value={s.title} maxLength={200} aria-label={`Subtask ${i + 1}`} onChange={e => updateSub(i, { title: e.target.value })} />
                <button type="button" className="icon-btn icon-btn-sm danger" aria-label="Remove subtask" onClick={() => setSubtasks(subtasks.filter((_, idx) => idx !== i))}><i className="fa-solid fa-xmark" /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="inline-add">
          <input ref={subEntryRef} type="text" className="input" placeholder="Add a subtask and press Enter" maxLength={200} aria-label="New subtask"
            value={subEntry} onChange={e => setSubEntry(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); addSub(); } }} />
          <button type="button" className="btn btn-ghost" onClick={addSub}><i className="fa-solid fa-plus" /> Add</button>
        </div>

        <div className="form-section-title">Attachments</div>
        <label className={cx('dropzone', dragOver && 'is-over')}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(Array.from(e.dataTransfer.files)); }}>
          <input type="file" multiple onChange={e => { addFiles(Array.from(e.target.files)); e.target.value = ''; }} />
          <i className="fa-solid fa-cloud-arrow-up" />
          <span><strong>Choose files</strong> or drop them here</span>
          <small>Files up to 1.5 MB are stored in your browser; larger files keep their name and size only.</small>
        </label>
        {attachments.length > 0 && (
          <ul className="attachment-list">
            {attachments.map((a, i) => (
              <li className="attachment" key={a.id || `new-${i}`}>
                <i className={`fa-regular ${fileIcon(a)}`} /><span className="attachment-name">{a.name}</span>
                <span className="muted">{Utils.formatBytes(a.size)}{a.dataUrl ? '' : ' · name only'}</span>
                <button type="button" className="icon-btn icon-btn-sm danger" aria-label="Remove attachment" onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))}><i className="fa-solid fa-xmark" /></button>
              </li>
            ))}
          </ul>
        )}

        <div className="toggle-row">
          <label className="switch"><input type="checkbox" checked={form.important} onChange={set('important')} /><span className="switch-ui" /><span>Mark as important</span></label>
          <label className="switch"><input type="checkbox" checked={form.pinned} onChange={set('pinned')} /><span className="switch-ui" /><span>Pin to top</span></label>
        </div>
      </form>
    </Modal>
  );
}
