'use client';

import { useSyncExternalStore } from 'react';

/**
 * The current time, for UI that ages — "3 minutes ago" and its relatives.
 *
 * An external store rather than `Date.now()` in the render body or a clock
 * held in state. Reading the clock during render is impure and the compiler
 * refuses it; holding it in state and setting it from an effect renders every
 * consumer twice on mount to avoid a discrepancy of milliseconds. This is the
 * shape React provides for exactly this: a value that lives outside the tree
 * and changes on its own.
 *
 * Returns `null` on the server, so nothing that depends on the clock reaches
 * the HTML and there is no hydration mismatch to suppress. Callers render the
 * ageing part only once they have a number, which arrives on the first client
 * render.
 *
 * One timer for every consumer, started with the first subscriber and stopped
 * with the last. It ticks once a minute because that is the finest unit
 * anything here displays — a second-by-second timer would repaint a list for a
 * label that cannot change.
 */
const listeners = new Set<() => void>();
let snapshot: number | null = null;
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  timer ??= setInterval(() => {
    snapshot = Date.now();
    for (const notify of listeners) notify();
  }, 60_000);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** Cached, so React sees a stable value between ticks rather than a new one per read. */
function getSnapshot(): number {
  snapshot ??= Date.now();
  return snapshot;
}

function getServerSnapshot(): null {
  return null;
}

export function useMinuteClock(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
