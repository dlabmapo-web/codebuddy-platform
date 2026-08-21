export const locales = ["ko", "en"] as const;

export type Locale = (typeof locales)[number];

/** What a brand-new visitor gets when Accept-Language matches nothing. */
export const defaultLocale: Locale = "ko";

/**
 * What i18next falls back to for a key missing in the active locale.
 * Deliberately different from `defaultLocale`: English is the authoring
 * language, so it is complete by construction. A Korean reader seeing one
 * English label beats any reader seeing a raw dotted key.
 */
export const fallbackLocale: Locale = "en";

export const defaultNS = "common";

export const localeCookieName = "i18next";
export const localeCookieMaxAge = 60 * 60 * 24 * 365;

/** Academy schedules are Korean regardless of the reader's language. */
export const displayTimeZone = "Asia/Seoul";

/** What each locale calls itself, for the language switcher. */
export const localeNames: Record<Locale, string> = {
  ko: "한국어",
  en: "English",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/**
 * The namespaces the root layout ships in every page's RSC payload.
 *
 * The budget in `locales.spec.ts` is measured against exactly this list. A
 * namespace that belongs to one route — the monitoring copy, for instance —
 * stays out of it and is loaded by that route through
 * `PageTranslationsProvider`, so a feature used by one role does not cost
 * every page its payload.
 *
 * `auth` left this list when password recovery landed: it is read on six
 * signed-out screens and by nobody afterwards, so a student in the middle of
 * an exercise was carrying the copy for a password they were not resetting.
 * The `(v2-auth)` layout mounts it instead.
 */
export const layoutNamespaces = [
  "common",
  "nav",
  "academy",
  "members",
  "applications",
  "invitations",
  "courses",
  "classes",
  "content",
  "learn",
  "errors",
  "validation",
] as const;

export type LayoutNamespace = (typeof layoutNamespaces)[number];
