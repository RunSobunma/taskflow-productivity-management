/* =========================================================================
   UI context: toasts, modal stack, context menu.
   App-state context: global search, task view mode, calendar position.
   ========================================================================= */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { DB } from '../lib/storage.js';

const UIContext = createContext(null);
const AppStateContext = createContext(null);
let seq = 0;

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [modals, setModals] = useState([]);
  const [menu, setMenu] = useState(null);
  const modalsRef = useRef(modals);
  modalsRef.current = modals;

  const dismissToast = useCallback(id => setToasts(list => list.filter(t => t.id !== id)), []);

  const toast = useCallback((message, options = {}) => {
    const id = ++seq;
    setToasts(list => [...list, { id, message, type: 'success', duration: 4000, ...options }].slice(-4));
    return () => dismissToast(id);
  }, [dismissToast]);

  const openModal = useCallback((type, props = {}) => {
    const id = ++seq;
    setModals(list => [...list, { id, type, props }]);
    return id;
  }, []);

  /** Close a modal by id, or the top-most one when no id is given. */
  const closeModal = useCallback(id => {
    setModals(list => (id === undefined ? list.slice(0, -1) : list.filter(m => m.id !== id)));
  }, []);

  const closeAllModals = useCallback(() => setModals([]), []);
  const findModal = useCallback(predicate => modalsRef.current.find(predicate), []);
  const hasModal = useCallback(() => modalsRef.current.length > 0, []);

  const confirm = useCallback(options => new Promise(resolve => openModal('confirm', { ...options, resolve })), [openModal]);

  /** Clicking the same anchor again toggles the menu closed. */
  const openMenu = useCallback((anchor, items) => {
    setMenu(current => (current && current.anchor === anchor ? null : { anchor, rect: anchor.getBoundingClientRect(), items }));
  }, []);
  const closeMenu = useCallback(() => setMenu(null), []);

  const value = useMemo(() => ({
    toasts, toast, dismissToast, modals, openModal, closeModal, closeAllModals, findModal, hasModal, confirm, menu, openMenu, closeMenu,
  }), [toasts, toast, dismissToast, modals, openModal, closeModal, closeAllModals, findModal, hasModal, confirm, menu, openMenu, closeMenu]);

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function AppStateProvider({ children }) {
  const [search, setSearch] = useState('');
  const [view, setView] = useState(() => DB.state.settings.defaultView);
  const [calMode, setCalMode] = useState('month');
  const [calCursor, setCalCursor] = useState(() => new Date());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const keepSearchRef = useRef(false);

  const value = useMemo(() => ({
    search, setSearch, view, setView, calMode, setCalMode, calCursor, setCalCursor, filtersOpen, setFiltersOpen, keepSearchRef,
  }), [search, view, calMode, calCursor, filtersOpen]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export const useUI = () => useContext(UIContext);
export const useAppState = () => useContext(AppStateContext);
