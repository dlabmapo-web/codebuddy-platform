'use client';

import { type Resource } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { useState, type ReactNode } from 'react';

import { initTranslationsSync } from './init-translations';

/**
 * For a namespace too large to ride in every page's payload (see the budget in
 * `namespaces.ts`). Components under it use `useTranslation` from
 * react-i18next; shell components keep using `useLayoutTranslation` and are
 * unaffected.
 *
 * The instance is rebuilt when the locale or the namespace set changes, and
 * that is load-bearing rather than tidiness.
 *
 * All four academy overviews mount this provider, each with its own
 * namespaces. Server components are flattened in the RSC payload, so after a
 * soft refresh — which is what switching academy role does — React sees the
 * same *client* component at the same position and preserves its state. The
 * `useState` initializer does not run again, the previous role's instance is
 * kept, and the new role's copy renders as raw keys: `catalog.title`,
 * `CATALOG.SPINE_TITLE`. Only a full reload rebuilt it, which is exactly the
 * shape the bug had.
 *
 * Built synchronously for a smaller, separate reason: i18next populates its
 * store during `init` when the resources are inline, so there is nothing to
 * await, and `initTranslationsSync` attaches the formatters in the same pass
 * instead of a microtask later.
 */
export function PageTranslationsProvider({
  children,
  locale,
  namespaces,
  resources,
}: {
  children: ReactNode;
  locale: string;
  namespaces: readonly string[];
  resources: Resource;
}) {
  const signature = `${locale}|${[...namespaces].join(',')}`;
  const [current, setCurrent] = useState(() => ({
    signature,
    i18n: initTranslationsSync(locale, namespaces, resources),
  }));

  // Adjusting state during render, which React documents for exactly this: the
  // alternative is an effect, and an effect would let one frame paint through
  // the previous role's instance before correcting itself.
  if (current.signature !== signature) {
    setCurrent({
      signature,
      i18n: initTranslationsSync(locale, namespaces, resources),
    });
  }

  return <I18nextProvider i18n={current.i18n}>{children}</I18nextProvider>;
}
