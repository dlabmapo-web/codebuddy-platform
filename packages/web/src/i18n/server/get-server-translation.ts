import type { TFunction } from 'i18next';
import type { Locale } from '@cove/i18n/settings';

import { initTranslations } from '../init-translations';
import type { LayoutNamespace } from '../namespaces';
import { getLocale } from './get-locale';

/**
 * Translations for server components, `generateMetadata`, and server actions —
 * anywhere there is no React context to read from.
 *
 * The returned `t` is scoped to the namespaces passed, exactly as
 * `useLayoutTranslation` is on the client: the first is the default, and the
 * rest are reachable with a `namespace:` prefix.
 *
 * Client components must use `useLayoutTranslation` instead; this builds a
 * fresh instance per call and would be wasteful in a render loop.
 */
export async function getServerTranslation<
  const Ns extends readonly [LayoutNamespace, ...LayoutNamespace[]],
>(namespaces: Ns): Promise<{ locale: Locale; t: TFunction<Ns> }> {
  const locale = await getLocale();
  const { i18n } = await initTranslations(locale, namespaces);
  return { locale, t: i18n.t as unknown as TFunction<Ns> };
}
