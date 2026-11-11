/* =========================================================================
   Minimal HTML5 drag & drop helpers for tasks (board columns, calendar days).
   Usage: <el {...drag.source(id)} />  and  <el {...drag.target(onDrop)} />
   ========================================================================= */
let draggingId = null;

export const drag = {
  source(id) {
    return {
      onDragStart(e) {
        draggingId = id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
        const el = e.currentTarget;
        requestAnimationFrame(() => el.classList.add('is-dragging'));
      },
      onDragEnd(e) {
        draggingId = null;
        e.currentTarget.classList.remove('is-dragging');
        document.querySelectorAll('.is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
      },
    };
  },
  target(onDrop) {
    return {
      onDragOver(e) {
        if (!draggingId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        document.querySelectorAll('.is-drop-target').forEach(el => el !== e.currentTarget && el.classList.remove('is-drop-target'));
        e.currentTarget.classList.add('is-drop-target');
      },
      onDragLeave(e) {
        if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('is-drop-target');
      },
      onDrop(e) {
        if (!draggingId) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.classList.remove('is-drop-target');
        const id = draggingId;
        draggingId = null;
        onDrop(id);
      },
    };
  },
};
