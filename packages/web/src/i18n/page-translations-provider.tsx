'use client';

import { createInstance, type Resource } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { useState, type ReactNode } from 'react';

import { initTranslations } from './init-translations';

/**
 * For a namespace too large to ride in every page's payload (see the budget in
 * `namespaces.ts`). Components under it use `useTranslation` from
 * react-i18next; shell components keep using `useLayoutTranslation` and are
 * unaffected.
 *
 * Nothing needs this yet. It exists so that outgrowing the budget is a local
 * change to one route rather than a restructuring.
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
  const [i18n] = useState(() => {
    const instance = createInstance();
    void initTranslations(locale, namespaces, instance, resources);
    return instance;
  });

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
