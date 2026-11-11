/* Categories & projects management with progress. */
import { Link } from 'react-router-dom';
import { Categories } from '../lib/categories.js';
import { Projects } from '../lib/projects.js';
import { Utils } from '../lib/utils.js';
import { useActions } from '../hooks/useActions.js';
import { CollectionIcon, EmptyState, IconBtn, ProgressBar } from '../components/common.jsx';

function CardActions({ kind, item }) {
  const actions = useActions();
  return (
    <div className="collection-actions">
      <IconBtn className="icon-btn-sm" icon="fa-regular fa-pen-to-square" tip="Edit" label={`Edit ${item.name}`} onClick={() => actions.editCollection(kind, item.id)} />
      <IconBtn className="icon-btn-sm danger" icon="fa-regular fa-trash-can" tip="Delete" label={`Delete ${item.name}`} onClick={() => actions.deleteCollection(kind, item.id)} />
    </div>
  );
}

export default function OrganizePage() {
  const actions = useActions();
  const projects = Projects.list();
  const categories = Categories.list();

  return (
    <div className="page-stack">
      <section>
        <div className="section-head">
          <div><h2>Projects</h2><p>Group related tasks and track progress toward a goal.</p></div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => actions.newCollection('project')}><i className="fa-solid fa-plus" /> New project</button>
        </div>
        {projects.length ? (
          <div className="collection-grid">
            {projects.map(p => {
              const prog = Projects.progress(p.id);
              return (
                <article className="collection-card project-card" key={p.id}>
                  <Link className="collection-main" to={`/project/${p.id}`}>
                    <CollectionIcon item={p} />
                    <div><h4>{p.name}</h4><p>{p.description || 'No description'}</p></div>
                  </Link>
                  <div className="progress-label">
                    <span>{prog.done}/{prog.total} done{prog.overdue > 0 && <> · <span className="text-danger">{prog.overdue} overdue</span></>}</span>
                    <strong>{prog.pct}%</strong>
                  </div>
                  <ProgressBar pct={prog.pct} label={`${p.name} progress`} />
                  <CardActions kind="project" item={p} />
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState icon="fa-folder-open" title="No projects yet" text="Create a project to group tasks and see progress." compact
            action={{ label: 'New project', icon: 'fa-plus', onClick: () => actions.newCollection('project') }} />
        )}
      </section>

      <section>
        <div className="section-head">
          <div><h2>Categories</h2><p>Colour-coded areas of your life and work.</p></div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => actions.newCollection('category')}><i className="fa-solid fa-plus" /> New category</button>
        </div>
        {categories.length ? (
          <div className="collection-grid">
            {categories.map(c => {
              const open = Categories.taskCount(c.id);
              const total = Categories.taskCount(c.id, { openOnly: false });
              const pct = total ? Math.round(((total - open) / total) * 100) : 0;
              return (
                <article className="collection-card" key={c.id}>
                  <Link className="collection-main" to={`/category/${c.id}`}>
                    <CollectionIcon item={c} />
                    <div><h4>{c.name}</h4><p>{Utils.plural(open, 'open task')} · {total - open} done</p></div>
                  </Link>
                  <ProgressBar pct={pct} size="sm" label={`${c.name} completion`} />
                  <CardActions kind="category" item={c} />
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState icon="fa-tags" title="No categories" text="Categories help you organise tasks by area." compact
            action={{ label: 'New category', icon: 'fa-plus', onClick: () => actions.newCollection('category') }} />
        )}
      </section>
    </div>
  );
}
