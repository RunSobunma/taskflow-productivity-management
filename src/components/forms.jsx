/* =========================================================================
   Shared form pieces: select option lists and the quick-add form used by
   both the inline bar on task pages and the quick-add dialog.
   ========================================================================= */
import { useRef, useState } from 'react';
import { DB } from '../lib/storage.js';
import { Tasks } from '../lib/tasks.js';
import { Categories } from '../lib/categories.js';
import { Projects } from '../lib/projects.js';
import { useActions } from '../hooks/useActions.js';
import { FieldError, useFormErrors } from '../hooks/useFormErrors.jsx';
import { cx } from './common.jsx';

export const PriorityOptions = () => Object.keys(Tasks.PRIORITY).map(p => <option key={p} value={p}>{Tasks.PRIORITY[p].label}</option>);
export const StatusOptions = () => Object.keys(Tasks.STATUS).map(s => <option key={s} value={s}>{Tasks.STATUS[s].label}</option>);
export const CategoryOptions = ({ empty = 'No category' }) => [
  <option key="" value="">{empty}</option>,
  ...Categories.list().map(c => <option key={c.id} value={c.id}>{c.name}</option>),
];
export const ProjectOptions = ({ empty = 'No project' }) => [
  <option key="" value="">{empty}</option>,
  ...Projects.list().map(p => <option key={p.id} value={p.id}>{p.name}</option>),
];

/**
 * Quick add form. `valuesRef` (optional) exposes the current values to the parent
 * (used by "More options"). `onCreated(task)` runs after a successful save.
 */
export function QuickAddForm({ defaults = {}, id, className, autoFocus = false, onCreated, valuesRef, children }) {
  const actions = useActions();
  const formRef = useRef(null);
  const titleRef = useRef(null);
  const [errors, run] = useFormErrors(formRef);
  const [values, setValues] = useState(() => ({
    title: defaults.title || '',
    priority: defaults.priority || DB.state.settings.defaultPriority,
    dueDate: defaults.dueDate || '',
    categoryId: defaults.categoryId || '',
  }));
  if (valuesRef) valuesRef.current = values;
  const set = key => e => setValues(v => ({ ...v, [key]: e.target.value }));

  const submit = e => {
    e.preventDefault();
    const task = run(() => actions.createQuick({
      projectId: defaults.projectId || '', status: defaults.status || 'todo', important: !!defaults.important, ...values,
    }));
    if (task) {
      setValues(v => ({ ...v, title: '' }));
      if (titleRef.current) titleRef.current.focus();
      if (onCreated) onCreated(task);
    }
  };

  return (
    <form id={id} className={className} ref={formRef} onSubmit={submit} noValidate data-quick-add>
      <div className={cx('qa-title field', errors.title && 'has-error')}>
        <i className="fa-solid fa-plus qa-icon" aria-hidden="true" />
        <input ref={titleRef} name="title" className="input" placeholder="Add a task… press Enter to save" maxLength={200}
          autoComplete="off" aria-label="Task title" autoFocus={autoFocus} value={values.title} onChange={set('title')} />
      </div>
      <div className="qa-options">
        <label className="qa-opt" data-tip="Priority"><i className="fa-solid fa-flag" />
          <select name="priority" aria-label="Priority" value={values.priority} onChange={set('priority')}><PriorityOptions /></select></label>
        <label className="qa-opt" data-tip="Due date"><i className="fa-regular fa-calendar" />
          <input type="date" name="dueDate" aria-label="Due date" value={values.dueDate} onChange={set('dueDate')} /></label>
        <label className="qa-opt" data-tip="Category"><i className="fa-solid fa-tag" />
          <select name="categoryId" aria-label="Category" value={values.categoryId} onChange={set('categoryId')}><CategoryOptions /></select></label>
      </div>
      {children}
      <FieldError errors={errors} name="title" />
    </form>
  );
}
