'use client';

import { useContext } from 'react';
import {
  Trans,
  useTranslation,
} from 'react-i18next';
import type { Namespace, ParseKeys } from 'i18next';
import { defaultLocale, isLocale, type Locale } from '@cove/i18n/settings';

import { I18nLayoutContext } from './layout-translations-provider';

export { LayoutTranslationsProvider } from './layout-translations-provider';
export { PageTranslationsProvider } from './page-translations-provider';

/**
 * A checked key for a namespace — for the places that carry a key as data
 * (nav items, state-to-copy maps) instead of calling `t` inline. Without it
 * those keys would be plain `string` and typos would survive to runtime.
 */
export type TranslationKey<Ns extends Namespace> = ParseKeys<Ns>;

/**
 * The hook every v2 client component uses. Bound to the layout instance, so it
 * keeps working inside a route that mounts its own `PageTranslationsProvider`.
 */
function useLayoutTranslationImpl(
  ns?: Parameters<typeof useTranslation>[0],
  options?: Parameters<typeof useTranslation>[1],
) {
  const i18n = useContext(I18nLayoutContext);
  return useTranslation(ns, { i18n, ...options });
}

// Keep react-i18next's overloads intact at the public boundary. Rebuilding the
// generic signature here loses its FallbackNs behavior and makes otherwise
// valid typed namespace tuples fail to compile.
export const useLayoutTranslation =
  useLayoutTranslationImpl as typeof useTranslation;

/** `<Trans>` bound to the same instance, for copy with inline markup. */
export function LayoutTrans(props: React.ComponentProps<typeof Trans>) {
  const i18n = useContext(I18nLayoutContext);
  return <Trans i18n={i18n} {...props} />;
}

/** The active locale, for `Intl` formatting inside client components. */
export function useLocale(): Locale {
  const { i18n } = useLayoutTranslation();
  return isLocale(i18n.language) ? i18n.language : defaultLocale;
}
