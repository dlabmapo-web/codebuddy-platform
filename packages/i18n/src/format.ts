import { displayTimeZone, type Locale } from "./settings.js";

/**
 * Dates and numbers are formatted with `Intl`, never with translated format
 * strings — a translator should not be able to break date rendering, and
 * `Intl` already knows that Korean writes 2026년 7월 24일.
 *
 * Formatters are cached because constructing one is the expensive part.
 */
const dateCache = new Map<string, Intl.DateTimeFormat>();
const numberCache = new Map<string, Intl.NumberFormat>();

function intlLocale(locale: Locale): string {
  return locale === "ko" ? "ko-KR" : "en-US";
}

function dateFormatter(
  locale: Locale,
  options: Intl.DateTimeFormatOptions,
  cacheKey: string,
): Intl.DateTimeFormat {
  const key = `${locale}:${cacheKey}`;
  let formatter = dateCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(intlLocale(locale), {
      timeZone: displayTimeZone,
      ...options,
    });
    dateCache.set(key, formatter);
  }
  return formatter;
}

/** Jul 24, 2026 · 2026년 7월 24일 */
export function formatDate(value: Date | string, locale: Locale): string {
  return dateFormatter(
    locale,
    { year: "numeric", month: "short", day: "numeric" },
    "date",
  ).format(new Date(value));
}

/** Jul 24 · 7월 24일 — for dense table cells where the year is noise. */
export function formatShortDate(value: Date | string, locale: Locale): string {
  return dateFormatter(locale, { month: "short", day: "numeric" }, "shortDate").format(
    new Date(value),
  );
}

/**
 * Jul 24, 2026 · 3:40 PM · 2026년 7월 24일 · 오후 3:40
 *
 * Date and time are formatted separately and joined with our own separator.
 * Node and browsers can choose different locale punctuation (`,` versus
 * `at`) for one combined Intl formatter, which breaks React hydration.
 */
export function formatDateTime(value: Date | string, locale: Locale): string {
  return `${formatDate(value, locale)} · ${formatTime(value, locale)}`;
}

/** Aug 25 · 2:54 PM · 8월 25일 · 오후 2:54 */
export function formatShortDateTime(
  value: Date | string,
  locale: Locale,
): string {
  return `${formatShortDate(value, locale)} · ${formatTime(value, locale)}`;
}

/** 3:40 PM · 오후 3:40 */
export function formatTime(value: Date | string, locale: Locale): string {
  // ICU 78 changed ko-KR's day-period text from 오전/오후 to AM/PM. Node and
  // browsers do not necessarily ship the same ICU release, so relying on that
  // localized token can also create a React hydration mismatch. Read only the
  // academy-local clock fields from Intl and render our two supported locale
  // conventions explicitly.
  const parts = dateFormatter(
    "en",
    { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
    "clockParts",
  ).formatToParts(new Date(value));
  const hour24 = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = parts.find((part) => part.type === "minute")?.value;

  if (!Number.isInteger(hour24) || minute === undefined) {
    throw new RangeError("Unable to format time");
  }

  const hour12 = hour24 % 12 || 12;
  const isAfternoon = hour24 >= 12;
  return locale === "ko"
    ? `${isAfternoon ? "오후" : "오전"} ${hour12}:${minute}`
    : `${hour12}:${minute} ${isAfternoon ? "PM" : "AM"}`;
}

/** 1,204 in both locales, but via Intl so a third language stays correct. */
export function formatNumber(value: number, locale: Locale): string {
  let formatter = numberCache.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(intlLocale(locale));
    numberCache.set(locale, formatter);
  }
  return formatter.format(value);
}

/** 24% in both launch locales, with correct rules for future locales. */
export function formatPercent(value: number, locale: Locale): string {
  const key = `${locale}:percent`;
  let formatter = numberCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(intlLocale(locale), {
      style: "percent",
      maximumFractionDigits: 1,
    });
    numberCache.set(key, formatter);
  }
  return formatter.format(value);
}
