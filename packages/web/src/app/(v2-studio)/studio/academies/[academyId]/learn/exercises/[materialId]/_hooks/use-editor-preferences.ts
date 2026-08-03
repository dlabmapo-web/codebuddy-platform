'use client';

import * as React from 'react';

/**
 * Editor preferences that belong to the person, not the problem.
 *
 * Persisted locally rather than on the server: it is a display preference, and
 * making it a round trip would mean a student's font size flickers on every
 * problem they open.
 */
const STORAGE_KEY = 'cove-editor-font-size';
const DEFAULT_FONT_SIZE = 13;
export const MIN_FONT_SIZE = 11;
export const MAX_FONT_SIZE = 20;
const CHANGE_EVENT = 'cove-editor-preferences-change';

export function clampFontSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_FONT_SIZE;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));
}

function subscribe(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onStoreChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
  };
}

function getSnapshot() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? DEFAULT_FONT_SIZE : clampFontSize(Number(stored));
  } catch {
    return DEFAULT_FONT_SIZE;
  }
}

export function useEditorPreferences() {
  // The server snapshot keeps prerendered markup deterministic. React reads
  // the browser snapshot after hydration, so localStorage never runs on the
  // server and no effect is needed to mirror one source of truth into another.
  const fontSize = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => DEFAULT_FONT_SIZE,
  );

  const change = React.useCallback((next: number) => {
    const clamped = clampFontSize(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(clamped));
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      // Private browsing and full storage both land here. The editor remains
      // at its last successfully stored size.
    }
  }, []);

  return {
    fontSize,
    increase: () => change(fontSize + 1),
    decrease: () => change(fontSize - 1),
    canIncrease: fontSize < MAX_FONT_SIZE,
    canDecrease: fontSize > MIN_FONT_SIZE,
  };
}
