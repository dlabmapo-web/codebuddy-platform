'use client';

import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';
import { currentBrowserMeetsBaseline } from '@/lib/workspace/browser-baseline';

const DISMISSED_KEY = 'cove.browser-baseline-notice.dismissed';
const CHANGE_EVENT = 'cove:browser-baseline-notice';
/** Dismissal for this page view, for when storage refuses to remember it. */
let dismissedInMemory = false;

function subscribe(onStoreChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(CHANGE_EVENT, onStoreChange);
}

function shouldShow(): boolean {
  if (dismissedInMemory || currentBrowserMeetsBaseline()) return false;
  try {
    return window.localStorage.getItem(DISMISSED_KEY) !== '1';
  } catch {
    // Storage can be unavailable; the notice is still worth showing.
    return true;
  }
}

/**
 * Tells a student on an outdated browser why the page looks broken.
 *
 * Styled inline on purpose: the browsers it exists for are exactly the ones
 * that cannot apply the stylesheet, so utility classes would leave the notice
 * as broken as the page it explains. Nothing is gated on it.
 */
export function BrowserBaselineNotice() {
  const { t } = useLayoutTranslation('learn');
  // Hidden in the server snapshot: the server cannot know the browser, and
  // rendering the notice there would flash it for everyone.
  const visible = React.useSyncExternalStore(subscribe, shouldShow, () => false);

  if (!visible) return null;

  const dismiss = () => {
    dismissedInMemory = true;
    try {
      window.localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Nowhere to remember it beyond this page view.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return (
    <div
      role="alert"
      style={{
        alignItems: 'center',
        background: '#FEF3C7',
        borderBottom: '1px solid #F59E0B',
        color: '#78350F',
        display: 'flex',
        flexWrap: 'wrap',
        fontSize: 13,
        gap: 12,
        lineHeight: 1.5,
        padding: '8px 16px',
      }}
    >
      <span style={{ flex: '1 1 240px' }}>{t('workspace.browser_outdated')}</span>
      <button
        onClick={dismiss}
        style={{
          background: 'transparent',
          border: '1px solid #B45309',
          borderRadius: 6,
          color: '#78350F',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
          padding: '2px 10px',
        }}
        type="button"
      >
        {t('workspace.browser_outdated_dismiss')}
      </button>
    </div>
  );
}
