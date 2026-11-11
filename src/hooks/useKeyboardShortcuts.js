/* Global keyboard shortcuts (N, /, Ctrl+K, Ctrl+/, Ctrl+Enter, Esc, G-sequences). */
import { useEffect, useRef } from 'react';

const isTyping = el => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
const submitForm = form => (form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })));

/**
 * handlers: { hasModal, closeTopModal, closePanels, quickAdd, focusSearch, openPalette, openShortcuts, go }
 * closePanels() returns true when it closed something (activity panel, mobile sidebar).
 */
export function useKeyboardShortcuts(handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    let gPending = false;
    let gTimer = null;

    const onKeyDown = e => {
      const h = ref.current;
      const typing = isTyping(e.target);
      const mod = e.ctrlKey || e.metaKey;

      if (e.key === 'Escape') {
        // Modals handle Escape themselves when focus is inside them.
        if (h.closePanels()) { e.preventDefault(); return; }
        if (h.hasModal()) { e.preventDefault(); h.closeTopModal(); return; }
        if (typing) e.target.blur();
        return;
      }
      if (mod && e.key === 'Enter') {
        const layers = document.querySelectorAll('.modal-layer');
        const top = layers[layers.length - 1];
        const form = (top && top.querySelector('form#task-form, form#quick-add-form, form#collection-form'))
          || (typing && e.target.closest('form[data-quick-add]'));
        if (form) { e.preventDefault(); submitForm(form); }
        return;
      }
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); h.openPalette(); return; }
      if (mod && e.key === '/') { e.preventDefault(); h.openShortcuts(); return; }
      if (typing || mod || e.altKey || h.hasModal()) return;

      const key = e.key.toLowerCase();
      if (gPending) {
        gPending = false;
        clearTimeout(gTimer);
        const routes = { d: 'dashboard', t: 'tasks', i: 'inbox', c: 'calendar', a: 'analytics', s: 'settings', u: 'upcoming' };
        if (routes[key]) { e.preventDefault(); h.go(routes[key]); }
        return;
      }
      if (key === 'n') { e.preventDefault(); h.quickAdd(); }
      else if (e.key === '/') { e.preventDefault(); h.focusSearch(); }
      else if (e.key === '?') { e.preventDefault(); h.openShortcuts(); }
      else if (key === 'g') { gPending = true; gTimer = setTimeout(() => { gPending = false; }, 1200); }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); clearTimeout(gTimer); };
  }, []);
}
