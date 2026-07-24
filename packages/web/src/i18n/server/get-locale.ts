import { match } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';
import { cookies, headers } from 'next/headers';
import {
  defaultLocale,
  isLocale,
  localeCookieName,
  locales,
  type Locale,
} from '@cove/i18n/settings';

/**
 * Resolution order: the reader's saved choice, then what their browser asks
 * for, then the product's default. Resolved on the server only — detecting on
 * the client would flash the wrong language through hydration.
 *
 * There is no locale in the URL and no proxy: Next 16 renamed `middleware` to
 * `proxy`, and reading the cookie here does the same job with one fewer moving
 * part. See docs/design/2026-07-24-cove-v2-internationalization-design.md §4.2.
 */
export async function getLocale(): Promise<Locale> {
  const saved = (await cookies()).get(localeCookieName)?.value;
  if (isLocale(saved)) return saved;

  const negotiatorHeaders: Record<string, string> = {};
  (await headers()).forEach((value, key) => {
    negotiatorHeaders[key] = value;
  });

  try {
    const requested = new Negotiator({ headers: negotiatorHeaders }).languages();
    const matched = match(requested, [...locales], defaultLocale);
    return isLocale(matched) ? matched : defaultLocale;
  } catch {
    // A malformed Accept-Language header throws rather than returning nothing.
    return defaultLocale;
  }
}
