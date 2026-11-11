import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles/style.css';
import { DB } from './lib/storage.js';
import App from './App.jsx';

// Load and validate persisted data before the first render.
DB.init();

// Dev-only handle for debugging in the browser console (removed from production builds).
if (import.meta.env.DEV) {
  Promise.all([import('./lib/tasks.js'), import('./lib/categories.js'), import('./lib/projects.js'), import('./lib/analytics.js'), import('./lib/utils.js')])
    .then(([t, c, p, a, u]) => {
      window.__taskflow = { DB, Tasks: t.Tasks, Categories: c.Categories, Projects: p.Projects, Analytics: a.Analytics, Utils: u.Utils, ValidationError: u.ValidationError };
    });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
