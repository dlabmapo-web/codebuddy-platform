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
