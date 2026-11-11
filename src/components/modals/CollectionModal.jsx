/* Category / project create & edit form with colour and icon pickers. */
import { useRef, useState } from 'react';
import Modal from '../Modal.jsx';
import { Categories } from '../../lib/categories.js';
import { Projects } from '../../lib/projects.js';
import { useUI } from '../../context/AppContext.jsx';
import { useActions } from '../../hooks/useActions.js';
import { FieldError, useFormErrors } from '../../hooks/useFormErrors.jsx';
import { CollectionIcon, cx } from '../common.jsx';

export default function CollectionModal({ kind, id, onClose }) {
  const isProject = kind === 'project';
  const Store = isProject ? Projects : Categories;
  const item = id ? Store.get(id) : null;
  const { toast } = useUI();
  const actions = useActions();
  const formRef = useRef(null);
  const closeRef = useRef(null);
  const [errors, run] = useFormErrors(formRef);
  const [values, setValues] = useState(() => ({
    name: item ? item.name : '',
    description: item ? item.description || '' : '',
    color: item ? item.color : Categories.COLORS[Store.list().length % Categories.COLORS.length],
    icon: item ? item.icon : (isProject ? 'fa-folder' : 'fa-tag'),
  }));
  const set = key => e => setValues(v => ({ ...v, [key]: e.target.value }));

  const submit = e => {
    e.preventDefault();
    const data = isProject ? values : { name: values.name, color: values.color, icon: values.icon };
    const saved = run(() => (item ? Store.update(item.id, data) : Store.create(data)));
    if (saved) {
      closeRef.current();
      toast(`${isProject ? 'Project' : 'Category'} “${saved.name}” ${item ? 'updated' : 'created'}.`);
    }
  };

  return (
    <Modal title={`${item ? 'Edit' : 'New'} ${kind}`} size="sm" onClose={onClose} closeRef={closeRef}
      footer={close => (
        <>
          {item && <button type="button" className="btn btn-danger-soft" onClick={() => actions.deleteCollection(kind, item.id)}><i className="fa-regular fa-trash-can" /> Delete</button>}
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
          <button type="submit" className="btn btn-primary" form="collection-form">{item ? 'Save' : `Create ${kind}`}</button>
        </>
      )}>
      <form id="collection-form" className="collection-form" ref={formRef} onSubmit={submit} noValidate>
        <div className="collection-preview"><CollectionIcon item={values} /><strong>{values.name || `New ${kind}`}</strong></div>
        <div className={cx('field', errors.name && 'has-error')}>
          <label htmlFor="cf-name">Name <span className="req">*</span></label>
          <input id="cf-name" name="name" className="input" maxLength={40} required autoComplete="off" autoFocus
            placeholder={isProject ? 'e.g. Website redesign' : 'e.g. Errands'} value={values.name} onChange={set('name')} />
          <FieldError errors={errors} name="name" />
        </div>
        {isProject && (
          <div className="field">
            <label htmlFor="cf-desc">Description</label>
            <textarea id="cf-desc" name="description" className="input" rows={2} maxLength={300} placeholder="What is this project about?"
              value={values.description} onChange={set('description')} />
          </div>
        )}
        <fieldset className="field"><legend>Color</legend>
          <div className="swatches">
            {Categories.COLORS.map(c => (
              <label className="swatch" style={{ '--swatch': c }} key={c}>
                <input type="radio" name="color" value={c} checked={values.color === c} onChange={set('color')} aria-label={`Color ${c}`} /><span />
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="field"><legend>Icon</legend>
          <div className="icon-picker">
            {Categories.ICONS.map(ic => (
              <label className="icon-choice" key={ic}>
                <input type="radio" name="icon" value={ic} checked={values.icon === ic} onChange={set('icon')} aria-label={ic.replace('fa-', '')} />
                <span><i className={`fa-solid ${ic}`} /></span>
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
