/* =========================================================================
   Bridges the framework-agnostic DB (mutable state + event bus) to React.
   Every data / settings / activity change bumps a version number; the root
   component subscribes with useSyncExternalStore and the tree re-renders.
   ========================================================================= */
import { useSyncExternalStore } from 'react';
import { Bus } from '../lib/utils.js';

let version = 0;
const listeners = new Set();

function bump() {
  version += 1;
  listeners.forEach(listener => listener());
}

['data:changed', 'activity:changed', 'settings:changed', 'theme:changed'].forEach(event => Bus.on(event, bump));

/** Force a re-render (e.g. day rollover, running timers). */
export const refreshStore = bump;

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Subscribe the calling component to every store change; returns the version. */
export function useStoreVersion() {
  return useSyncExternalStore(subscribe, () => version);
}
