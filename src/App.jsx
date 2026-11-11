/* =========================================================================
   App shell: providers, router, layout, global behaviours.
   ========================================================================= */
import { useCallback, useEffect, useRef, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AppStateProvider, UIProvider, useAppState, useUI } from './context/AppContext.jsx';
import { useStoreVersion } from './store/store.js';
import { DB } from './lib/storage.js';
import { Bus } from './lib/utils.js';
import { contextDefaults, pageConfig, parsePath, subtitle } from './routes.js';
import { useActions } from './hooks/useActions.js';
import { useThemeSync } from './hooks/useTheme.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useReminders } from './hooks/useReminders.js';
import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';
import { MenuHost, ModalHost, ToastHost } from './components/Hosts.jsx';
import { cx } from './components/common.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import TaskPage from './pages/TaskPage.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import OrganizePage from './pages/OrganizePage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

/** Resolves the current route to a page and renders it (unknown → dashboard). */
function PageRoute({ name }) {
  const { id = '' } = useParams();
  const route = { name, id };
  const page = pageConfig(route);
  if (!page) return <Navigate to="/dashboard" replace />;
  switch (page.kind) {
    case 'dashboard': return <DashboardPage />;
    case 'analytics': return <AnalyticsPage />;
    case 'organize': return <OrganizePage />;
    case 'settings': return <SettingsPage />;
    default: return <TaskPage page={page} defaults={contextDefaults(route)} />;
  }
}

const TASK_ROUTES = ['tasks', 'inbox', 'today', 'upcoming', 'important', 'completed', 'archived', 'trash', 'calendar'];

function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const ui = useUI();
  const actions = useActions();
  const { search, setSearch, keepSearchRef } = useAppState();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const searchRef = useRef(null);

  const route = parsePath(location.pathname);
  const page = pageConfig(route) || pageConfig({ name: 'dashboard' });
  const { sidebarCollapsed } = DB.state.settings;

  useThemeSync();

  // Route change: reset search (unless a search triggered the navigation), close panels.
  useEffect(() => {
    if (!keepSearchRef.current) setSearch('');
    keepSearchRef.current = false;
    setSidebarOpen(false);
    setActivityOpen(false);
    ui.closeMenu();
    window.scrollTo(0, 0);
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { document.title = `${page.title} · TaskFlow`; }, [page.title]);

  // Startup notices (once) + storage errors.
  useEffect(() => {
    DB.issues.splice(0).forEach(msg => ui.toast(msg, { type: 'warning', title: 'Data notice', duration: 8000 }));
    let last = 0;
    return Bus.on('storage:error', () => {
      if (Date.now() - last < 5000) return;
      last = Date.now();
      ui.toast('Browser storage is full — your latest change may not be saved. Remove large attachments or export and clear old data.', { type: 'error', title: 'Storage full', duration: 9000 });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useReminders(actions.notify);

  const onSearch = value => {
    setSearch(value);
    if (page.kind !== 'tasks' && value.trim()) {
      keepSearchRef.current = true;
      navigate('/tasks');
    }
  };

  const defaults = contextDefaults(route);
  const closePanels = useCallback(() => {
    if (activityOpen) { setActivityOpen(false); return true; }
    if (sidebarOpen) { setSidebarOpen(false); return true; }
    return false;
  }, [activityOpen, sidebarOpen]);

  useKeyboardShortcuts({
    hasModal: ui.hasModal,
    closeTopModal: () => ui.closeModal(),
    closePanels,
    quickAdd: () => actions.quickAdd(defaults),
    focusSearch: () => { searchRef.current.focus(); searchRef.current.select(); },
    openPalette: actions.openPalette,
    openShortcuts: actions.openShortcuts,
    go: actions.go,
  });

  return (
    <>
      <a className="skip-link" href="#view" onClick={e => { e.preventDefault(); document.getElementById('view').focus(); }}>Skip to content</a>
      <div className={cx('app', sidebarCollapsed && 'sidebar-collapsed', sidebarOpen && 'sidebar-open')} id="app">
        <Sidebar onClose={() => setSidebarOpen(false)} />
        <div className="sidebar-backdrop" aria-hidden="true" onClick={() => setSidebarOpen(false)} />
        <div className="main">
          <Topbar title={page.title} subtitle={subtitle(page)} search={search} onSearch={onSearch} searchRef={searchRef}
            onOpenSidebar={() => setSidebarOpen(true)} activityOpen={activityOpen} setActivityOpen={setActivityOpen}
            onNewTask={() => actions.newTask(defaults)} />
          {/* key → remount (fresh filters + enter animation) on every route change */}
          <main className="view view-enter" id="view" tabIndex={-1} key={location.pathname}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<PageRoute name="dashboard" />} />
              {TASK_ROUTES.map(name => <Route key={name} path={`/${name}`} element={<PageRoute name={name} />} />)}
              <Route path="/category/:id" element={<PageRoute name="category" />} />
              <Route path="/project/:id" element={<PageRoute name="project" />} />
              <Route path="/analytics" element={<PageRoute name="analytics" />} />
              <Route path="/organize" element={<PageRoute name="organize" />} />
              <Route path="/settings" element={<PageRoute name="settings" />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </div>
      </div>
      <button type="button" className="fab" aria-label="Quick add task" onClick={() => actions.quickAdd(defaults)}><i className="fa-solid fa-plus" /></button>
      <ModalHost />
      <ToastHost />
      <MenuHost />
    </>
  );
}

export default function App() {
  useStoreVersion();   // re-render the tree on every data / settings change
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <UIProvider>
        <AppStateProvider>
          <Shell />
        </AppStateProvider>
      </UIProvider>
    </HashRouter>
  );
}
