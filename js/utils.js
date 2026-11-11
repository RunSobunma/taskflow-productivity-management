/* =========================================================================
   TaskFlow — utils.js
   Shared, dependency-free helpers: ids, escaping, dates, formatting, events.
   ========================================================================= */
'use strict';

/** Error carrying per-field validation messages: { field: message } */
class ValidationError extends Error {
  constructor(errors) {
    super(Object.values(errors)[0] || 'Invalid input');
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

/** Tiny publish/subscribe event bus used to keep every view in sync. */
const Bus = (() => {
  const listeners = {};
  return {
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    emit(event, payload) { (listeners[event] || []).forEach(fn => { try { fn(payload); } catch (e) { console.error(e); } }); },
  };
})();

const Utils = (() => {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MONTHS_SHORT = MONTHS.map(m => m.slice(0, 3));
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DAYS_SHORT = DAYS.map(d => d.slice(0, 3));
  const pad = n => String(n).padStart(2, '0');

  /** Settings are read lazily so formatting always reflects the latest preferences. */
  // `DB` is a top-level const (not a window property), so check it via typeof.
  const settings = () => (typeof DB !== 'undefined' && DB.state && DB.state.settings) || {};

  function uid(prefix = 'id') {
    const rand = window.crypto && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
    return `${prefix}_${Date.now().toString(36)}${rand}`;
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  /* ---------- Dates (all ISO dates are local "YYYY-MM-DD") ---------- */
  const toISODate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => toISODate(new Date());

  function parseDate(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.getMonth() === m - 1 ? date : null;
  }

  function addDays(date, n) { const r = new Date(date); r.setDate(r.getDate() + n); return r; }

  function addMonths(date, n) {
    const r = new Date(date);
    const day = r.getDate();
    r.setDate(1);
    r.setMonth(r.getMonth() + n);
    const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
    r.setDate(Math.min(day, last));
    return r;
  }

  function startOfDay(date) { const r = new Date(date); r.setHours(0, 0, 0, 0); return r; }
  function startOfWeek(date, weekStart = Number(settings().weekStart) || 0) {
    const r = startOfDay(date);
    return addDays(r, -((r.getDay() - weekStart + 7) % 7));
  }
  const startOfMonth = date => new Date(date.getFullYear(), date.getMonth(), 1);
  const diffDays = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / 86400000);
  const isValidTime = t => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

  /** Weekday names ordered according to the "week starts on" setting. */
  function weekdayOrder(short = true) {
    const start = Number(settings().weekStart) || 0;
    const names = short ? DAYS_SHORT : DAYS;
    return Array.from({ length: 7 }, (_, i) => names[(start + i) % 7]);
  }

  function formatDate(iso, format = settings().dateFormat || 'MMM D, YYYY') {
    const d = typeof iso === 'string' ? parseDate(iso) : iso;
    if (!d) return '';
    const map = {
      YYYY: d.getFullYear(), MMM: MONTHS_SHORT[d.getMonth()], MM: pad(d.getMonth() + 1),
      DD: pad(d.getDate()), D: d.getDate(),
    };
    return format.replace(/YYYY|MMM|MM|DD|D/g, token => map[token]);
  }

  /** "Today", "Tomorrow", "Friday" or a formatted date. */
  function friendlyDate(iso) {
    const d = parseDate(iso);
    if (!d) return '';
    const diff = diffDays(d, new Date());
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff > 1 && diff < 7) return DAYS[d.getDay()];
    return formatDate(iso);
  }

  function formatTime(hhmm) {
    if (!isValidTime(hhmm)) return '';
    if (String(settings().timeFormat) === '24') return hhmm;
    let [h, m] = hhmm.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${pad(m)} ${suffix}`;
  }

  function formatDateTime(timestamp) {
    if (!timestamp) return '—';
    const d = new Date(timestamp);
    return `${formatDate(toISODate(d))}, ${formatTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`)}`;
  }

  function relativeTime(timestamp) {
    const sec = Math.round((Date.now() - timestamp) / 1000);
    if (sec < 45) return 'just now';
    const min = Math.round(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hrs = Math.round(min / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days}d ago`;
    return formatDate(toISODate(new Date(timestamp)));
  }

  function formatMinutes(minutes) {
    const m = Math.max(0, Math.round(Number(minutes) || 0));
    if (!m) return '0m';
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return h ? `${h}h${rest ? ` ${rest}m` : ''}` : `${rest}m`;
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
  }

  function debounce(fn, wait = 200) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
  }

  function download(filename, content, mime = 'application/json') {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function readFile(file, as = 'text') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Could not read file'));
      as === 'dataURL' ? reader.readAsDataURL(file) : reader.readAsText(file);
    });
  }

  const initials = name => (name || 'You').trim().split(/\s+/).slice(0, 2).map(p => p[0].toUpperCase()).join('');
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  return {
    MONTHS, MONTHS_SHORT, DAYS, DAYS_SHORT, uid, escapeHTML, toISODate, todayISO, parseDate,
    addDays, addMonths, startOfDay, startOfWeek, startOfMonth, diffDays, isValidTime, weekdayOrder,
    formatDate, friendlyDate, formatTime, formatDateTime, relativeTime, formatMinutes, formatBytes,
    debounce, download, readFile, initials, plural,
  };
})();

/** Short alias used in templates. */
const esc = Utils.escapeHTML;
