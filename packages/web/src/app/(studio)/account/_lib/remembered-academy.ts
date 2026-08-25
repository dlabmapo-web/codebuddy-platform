'use client';

import { useSyncExternalStore } from 'react';

import { lastAcademyStorageKey } from './academy-selection';

/**
 * The academy this browser looked at last.
 *
 * `useSyncExternalStore` rather than an effect that calls `setState`: local
 * storage is an external system, it does not exist during the server render,
 * and the server snapshot is honestly `null`. Reading it this way means the
 * first client render already has the answer instead of arriving one render
 * later and re-deciding which academy to show.
 *
 * Nothing subscribes: the value only changes because this tab changed it, and
 * this tab already re-renders when it does.
 */
export function useRememberedAcademy(): string | null {
  return useSyncExternalStore(subscribe, readClient, readServer);
}

export function rememberAcademy(academyId: string): void {
  try {
    window.localStorage.setItem(lastAcademyStorageKey, academyId);
  } catch {
    // Private browsing and storage quotas both throw here. Forgetting which
    // academy someone looked at is not worth failing a page load over.
  }
}

function subscribe(): () => void {
  return () => undefined;
}

function readClient(): string | null {
  try {
    return window.localStorage.getItem(lastAcademyStorageKey);
  } catch {
    return null;
  }
}

function readServer(): string | null {
  return null;
}
