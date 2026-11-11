/* Applies theme / accent / density settings to <html> and follows the OS theme. */
import { useEffect } from 'react';
import { DB } from '../lib/storage.js';
import { Bus } from '../lib/utils.js';

const media = window.matchMedia('(prefers-color-scheme: dark)');

export function resolvedTheme() {
  const theme = DB.state.settings.theme;
  return theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
}

export function useThemeSync() {
  const { theme, accent, density } = DB.state.settings;
  const resolved = resolvedTheme();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.accent = accent;
    root.dataset.density = density;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = resolved === 'dark' ? '#0b0d12' : '#f7f8fa';
  }, [resolved, accent, density]);

  useEffect(() => {
    if (theme !== 'system') return undefined;
    const onChange = () => Bus.emit('theme:changed');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  return resolved;
}
