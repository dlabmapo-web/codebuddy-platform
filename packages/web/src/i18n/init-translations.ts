import { createInstance, type i18n, type Resource } from 'i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import { initReactI18next } from 'react-i18next/initReactI18next';
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatShortDate,
  formatShortDateTime,
  formatTime,
} from '@cove/i18n/format';
import {
  defaultLocale,
  fallbackLocale,
  isLocale,
  locales,
} from '@cove/i18n/settings';

/** The one configuration both entry points below build from. */
function initOptions(
  locale: string,
  namespaces: readonly string[],
  resources?: Resource,
) {
  return {
    lng: locale,
    resources,
    fallbackLng: fallbackLocale,
    supportedLngs: [...locales],
    defaultNS: namespaces[0],
    fallbackNS: namespaces[0],
    ns: [...namespaces],
    preload: resources ? [] : [locale],
    // React already escapes interpolated values; i18next must not escape them
    // again, or an apostrophe in "You're all set" renders as "You&#39;re".
    interpolation: { escapeValue: false },
  };
}

/**
 * Builds an instance from resources already in hand, without a microtask.
 *
 * i18next's `init` populates the resource store synchronously when every
 * resource is passed inline and no backend has to fetch anything — the promise
 * it returns is a wrapper, not a wait. So a caller that cannot await, like the
 * client-side `PageTranslationsProvider`, loses nothing by not doing so, and
 * gains the formatters in the same pass rather than a microtask later.
 */
export function initTranslationsSync(
  locale: string,
  namespaces: readonly string[],
  resources: Resource,
): i18n {
  const instance = createInstance();
  instance.use(initReactI18next);
  void instance.init(initOptions(locale, namespaces, resources));
  attachFormatters(instance);
  return instance;
}

/**
 * Builds an isolated i18next instance. Never the global singleton: the server
 * renders many requests concurrently, and a shared instance would leak one
 * reader's locale into another's response.
 *
 * Pass `resources` on the client to reuse the bundle the server already
 * serialized; omit it on the server so the backend loads the JSON. When the
 * resources are already in hand and the caller cannot await, use
 * `initTranslationsSync`.
 */
export async function initTranslations(
  locale: string,
  namespaces: readonly string[],
  i18nInstance?: i18n,
  resources?: Resource,
) {
  const instance = i18nInstance ?? createInstance();

  instance.use(initReactI18next);

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

  await instance.init(initOptions(locale, namespaces, resources));
  attachFormatters(instance);

  return {
    i18n: instance,
    resources: instance.services.resourceStore.data as Resource,
    t: instance.t,
  };
}

function attachFormatters(instance: i18n): void {
  const formatter = instance.services.formatter;
  if (formatter) {
    const localeFor = (language?: string) =>
      isLocale(language) ? language : defaultLocale;
    formatter.add('date', (value, language) =>
      formatDate(value as Date | string, localeFor(language)));
    formatter.add('shortDate', (value, language) =>
      formatShortDate(value as Date | string, localeFor(language)));
    formatter.add('dateTime', (value, language) =>
      formatDateTime(value as Date | string, localeFor(language)));
    formatter.add('shortDateTime', (value, language) =>
      formatShortDateTime(value as Date | string, localeFor(language)));
    formatter.add('time', (value, language) =>
      formatTime(value as Date | string, localeFor(language)));
    formatter.add('number', (value, language) =>
      formatNumber(Number(value), localeFor(language)));
    formatter.add('percent', (value, language) =>
      formatPercent(Number(value), localeFor(language)));
  }
}
