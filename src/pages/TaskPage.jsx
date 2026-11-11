/* Task pages (My Tasks, Inbox, Today, …, category, project, calendar):
   quick add, view switcher, filters, sorting and the selected view. */
import { useState } from 'react';
import { Tasks } from '../lib/tasks.js';
import { Categories } from '../lib/categories.js';
import { Projects } from '../lib/projects.js';
import { Utils } from '../lib/utils.js';
import { useAppState } from '../context/AppContext.jsx';
import { useActions } from '../hooks/useActions.js';
import { CategoryOptions, PriorityOptions, ProjectOptions, QuickAddForm, StatusOptions } from '../components/forms.jsx';
import { TaskBoard, TaskGrid, TaskList } from '../components/TaskViews.jsx';
import CalendarView from '../components/CalendarView.jsx';
import { CollectionIcon, EmptyState, ProgressBar, cx } from '../components/common.jsx';

const emptyFilters = () => ({ priority: '', status: '', category: '', project: '', due: '', completion: '', important: false, overdue: false });
const VIEWS = [['list', 'fa-list', 'List'], ['board', 'fa-table-columns', 'Board'], ['grid', 'fa-grip', 'Grid'], ['calendar', 'fa-calendar', 'Calendar']];
const DUE_OPTIONS = [['', 'Any date'], ['today', 'Due today'], ['tomorrow', 'Due tomorrow'], ['week', 'This week'], ['next7', 'Next 7 days'], ['month', 'This month'], ['overdue', 'Overdue'], ['nodate', 'No due date']];

function ScopeHeader({ page }) {
  if (page.itemKind === 'project') {
    const p = page.item;
    const prog = Projects.progress(p.id);
    return (
      <section className="card scope-card">
        <CollectionIcon item={p} size="lg" />
        <div className="scope-info"><h2>{p.name}</h2><p>{p.description || 'No description'}</p></div>
        <div className="scope-progress">
          <div className="progress-label">
            <span>{prog.done}/{prog.total} tasks done{prog.overdue > 0 && <> · <span className="text-danger">{prog.overdue} overdue</span></>}</span>
            <strong>{prog.pct}%</strong>
          </div>
          <ProgressBar pct={prog.pct} />
        </div>
      </section>
    );
  }
  if (page.itemKind === 'category') {
    const c = page.item;
    return (
      <section className="card scope-card scope-card-sm">
        <CollectionIcon item={c} />
        <div className="scope-info"><h2>{c.name}</h2><p>{Utils.plural(Categories.taskCount(c.id), 'open task')}</p></div>
      </section>
    );
  }
  return null;
}

export default function TaskPage({ page, defaults }) {
  const actions = useActions();
  const { search, setSearch, view: globalView, setView, filtersOpen, setFiltersOpen } = useAppState();
  const [filters, setFilters] = useState(emptyFilters);
  const [sort, setSort] = useState(page.sort || 'newest');

  const view = page.forceView || globalView;
  const tasks = Tasks.query(page.scope, { ...filters, search }, sort);
  const activeCount = Object.values(filters).filter(Boolean).length;
  const filtered = activeCount > 0 || !!search;
  const setFilter = key => e => setFilters(f => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const clearFilters = () => { setFilters(emptyFilters()); setSearch(''); };
  const addWith = extra => actions.quickAdd({ ...defaults, ...extra });

  const filterSelect = (key, label, options) => (
    <label className="filter-field"><span>{label}</span>
      <select className="input input-sm" value={filters[key]} onChange={setFilter(key)} data-filter={key}>{options}</select>
    </label>
  );

  let results;
  if (view === 'calendar') {
    results = <CalendarView tasks={tasks} onAdd={date => addWith({ dueDate: date })} />;
  } else if (!tasks.length && (view !== 'board' || filtered || page.noQuickAdd)) {
    results = filtered
      ? <EmptyState icon="fa-magnifying-glass" title="No matching tasks" text="Try a different search or clear your filters."
          action={{ label: 'Clear filters', icon: 'fa-filter-circle-xmark', onClick: clearFilters }} />
      : <EmptyState {...page.empty} action={page.noQuickAdd ? null : { label: 'New task', icon: 'fa-plus', onClick: () => actions.newTask(defaults) }} />;
  } else if (view === 'board') {
    results = <TaskBoard tasks={tasks} onAdd={status => addWith({ status })} />;
  } else if (view === 'grid') {
    results = <TaskGrid tasks={tasks} />;
  } else {
    results = <TaskList tasks={tasks} />;
  }

  return (
    <div className="page-stack">
      <ScopeHeader page={page} />

      {!page.noQuickAdd && (
        <QuickAddForm className="quick-add-bar card" defaults={defaults}>
          <button type="submit" className="btn btn-primary btn-sm"><i className="fa-solid fa-plus" /> Add</button>
        </QuickAddForm>
      )}

      <div className="toolbar">
        <div className="toolbar-left">
          {!page.forceView && (
            <div className="segmented" role="group" aria-label="View">
              {VIEWS.map(([v, icon, label]) => (
                <button key={v} type="button" className={cx('seg-btn', view === v && 'active')} aria-pressed={view === v} data-tip={`${label} view`}
                  data-view={v} onClick={() => setView(v)}>
                  <i className={`fa-solid ${icon}`} /><span className="seg-label">{label}</span>
                </button>
              ))}
            </div>
          )}
          <button type="button" className={cx('btn btn-ghost btn-sm', filtersOpen && 'is-active')} aria-expanded={filtersOpen} aria-controls="filter-panel"
            onClick={() => setFiltersOpen(!filtersOpen)}>
            <i className="fa-solid fa-sliders" /> Filters {activeCount > 0 && <span className="pill">{activeCount}</span>}
          </button>
          <span className="result-count">{Utils.plural(tasks.length, 'task')}</span>
        </div>
        <div className="toolbar-right">
          {view !== 'calendar' && (
            <label className="sort-select" data-tip="Sort tasks"><i className="fa-solid fa-arrow-down-wide-short" />
              <select aria-label="Sort by" value={sort} onChange={e => setSort(e.target.value)} data-sort>
                {Object.entries(Tasks.SORT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
          )}
          {page.scope === 'trash' && (
            <button type="button" className="btn btn-danger-soft btn-sm" disabled={!Tasks.counts().trash} onClick={actions.emptyTrash}>
              <i className="fa-solid fa-trash" /> Empty Trash
            </button>
          )}
          {page.item && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => actions.editCollection(page.itemKind, page.item.id)}>
              <i className="fa-regular fa-pen-to-square" /> Edit
            </button>
          )}
        </div>
      </div>

      <div className={cx('filter-panel', filtersOpen && 'open')} id="filter-panel">
        {filterSelect('priority', 'Priority', [<option key="" value="">Any priority</option>, <PriorityOptions key="p" />])}
        {filterSelect('status', 'Status', [<option key="" value="">Any status</option>, <StatusOptions key="s" />])}
        {page.itemKind !== 'category' && filterSelect('category', 'Category', [<CategoryOptions key="c" empty="Any category" />, <option key="none" value="__none">Uncategorised</option>])}
        {page.itemKind !== 'project' && filterSelect('project', 'Project', [<ProjectOptions key="p" empty="Any project" />, <option key="none" value="__none">No project</option>])}
        {filterSelect('due', 'Due date', DUE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>))}
        {filterSelect('completion', 'Completion', [['', 'All'], ['pending', 'Pending'], ['completed', 'Completed']].map(([v, l]) => <option key={v} value={v}>{l}</option>))}
        <div className="filter-toggles">
          <label className="chip-toggle"><input type="checkbox" checked={filters.important} onChange={setFilter('important')} /><span><i className="fa-solid fa-star" /> Important</span></label>
          <label className="chip-toggle"><input type="checkbox" checked={filters.overdue} onChange={setFilter('overdue')} /><span><i className="fa-solid fa-triangle-exclamation" /> Overdue</span></label>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" disabled={!filtered} onClick={clearFilters}><i className="fa-solid fa-filter-circle-xmark" /> Clear filters</button>
      </div>

      <div className="task-results">{results}</div>
    </div>
  );
}
