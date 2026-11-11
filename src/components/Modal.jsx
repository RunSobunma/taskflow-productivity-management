/* =========================================================================
   Accessible modal: enter/exit animation, focus trap, Escape to close,
   backdrop click, focus restoration.
   ========================================================================= */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { cx } from './common.jsx';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])';

export default function Modal({ title, size = 'md', className = '', footer, children, onClose, closeRef }) {
  const [open, setOpen] = useState(false);
  const layerRef = useRef(null);
  const titleId = useId();
  const closingRef = useRef(false);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setOpen(false);
    setTimeout(onClose, 180);
  }, [onClose]);

  // Let parents trigger the animated close.
  if (closeRef) closeRef.current = close;

  useEffect(() => {
    const returnFocus = document.activeElement;
    const frame = requestAnimationFrame(() => {
      setOpen(true);
      const layer = layerRef.current;
      if (!layer) return;
      const target = layer.querySelector('[autofocus], [data-autofocus]')
        || layer.querySelector('.modal-body input:not([type=hidden]), .modal-body textarea, .modal-body select, .modal-body button')
        || layer.querySelector('.modal');
      if (target) target.focus({ preventScroll: true });
    });
    document.body.classList.add('modal-open');
    return () => {
      cancelAnimationFrame(frame);
      if (!document.querySelector('.modal-layer')) document.body.classList.remove('modal-open');
      if (returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => () => {
    // Runs after this layer is removed from the DOM.
    if (!document.querySelector('.modal-layer')) document.body.classList.remove('modal-open');
  }, []);

  const onKeyDown = e => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusables = Array.from(layerRef.current.querySelectorAll(FOCUSABLE)).filter(el => el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <div ref={layerRef} className={cx('modal-layer', className, open && 'open')} onKeyDown={onKeyDown}
      onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close dialog" onClick={close}><i className="fa-solid fa-xmark" /></button>
        </header>
        <div className="modal-body">{typeof children === 'function' ? children(close) : children}</div>
        {footer && <footer className="modal-foot">{typeof footer === 'function' ? footer(close) : footer}</footer>}
      </div>
    </div>
  );
}
