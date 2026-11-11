/* =========================================================================
   TaskFlow — categories.js
   Categories: CRUD (via the shared collection factory), palette & icon set.
   ========================================================================= */
'use strict';

const Categories = (() => {
  const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#64748b'];
  const ICONS = [
    'fa-briefcase', 'fa-user', 'fa-graduation-cap', 'fa-cart-shopping', 'fa-heart-pulse', 'fa-wallet',
    'fa-house', 'fa-plane', 'fa-code', 'fa-dumbbell', 'fa-book', 'fa-music', 'fa-palette', 'fa-gamepad',
    'fa-leaf', 'fa-car', 'fa-utensils', 'fa-camera', 'fa-lightbulb', 'fa-star', 'fa-folder', 'fa-rocket',
    'fa-bullhorn', 'fa-users', 'fa-tag', 'fa-gift', 'fa-paw', 'fa-baby', 'fa-chart-pie', 'fa-flask',
  ];

  const collection = DB.createCollection({
    key: 'categories', label: 'Category', taskField: 'categoryId', normalize: DB.normalizeCategory,
  });

  /** Category usage for charts: [{ category, count }] of active tasks, incl. "Uncategorised". */
  function distribution() {
    const active = DB.state.tasks.filter(t => !t.deleted && !t.archived);
    const rows = collection.list().map(c => ({ name: c.name, color: c.color, count: active.filter(t => t.categoryId === c.id).length }));
    const none = active.filter(t => !t.categoryId).length;
    if (none) rows.push({ name: 'Uncategorised', color: '#94a3b8', count: none });
    return rows.filter(r => r.count > 0);
  }

  return { ...collection, COLORS, ICONS, distribution };
})();
