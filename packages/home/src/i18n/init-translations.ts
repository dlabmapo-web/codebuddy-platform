import { createInstance, type i18n, type Resource } from "i18next";
import resourcesToBackend from "i18next-resources-to-backend";
import { defaultLocale, fallbackLocale, locales } from "@cove/i18n/settings";

/**
 * Builds an isolated i18next instance — never the global singleton, since the
 * server renders many requests concurrently and a shared instance would leak
 * one reader's locale into another's response.
 *
 * Two deliberate omissions against `@cove/web`'s version:
 *
 * - No `Intl` formatters. Marketing copy has no dates, counts, or percentages.
 * - No `initReactI18next`. react-i18next calls `createContext` at module
 *   scope, which is not a function under React's server condition, so merely
 *   importing it from a server component fails the build. Every string on this
 *   site is server-rendered and reaches its client components as plain props,
 *   so there is no React context to install in the first place. If a client
 *   component ever needs `t` directly, the plugin belongs in a separate
 *   `'use client'` module — not back in here.
 */
export async function initTranslations(
  locale: string,
  namespaces: readonly string[],
  i18nInstance?: i18n,
  resources?: Resource,
) {
  const instance = i18nInstance ?? createInstance();

  if (!resources) {
    instance.use(
      resourcesToBackend(
        // A relative path, not the `@cove/i18n/locales/*` export: the bundler
        // has to statically glob this directory to know what it may import,
        // and it cannot do that through a package export map.
        (language: string, namespace: string) =>
          import(`../../../i18n/src/locales/${language}/${namespace}.json`),
      ),
    );
  }

  await instance.init({
    lng: locale,
    resources,
    fallbackLng: fallbackLocale,
    supportedLngs: [...locales],
    defaultNS: namespaces[0] ?? defaultLocale,
    fallbackNS: namespaces[0],
    ns: [...namespaces],
    preload: resources ? [] : [locale],
    // React already escapes interpolated values; i18next must not escape them
    // again, or an apostrophe in "You're all set" renders as "You&#39;re".
    interpolation: { escapeValue: false },
  });

  return {
    i18n: instance,
    resources: instance.services.resourceStore.data as Resource,
    t: instance.t,
  };
}
