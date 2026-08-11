import { match } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";
import { cookies, headers } from "next/headers";
import {
  defaultLocale,
  isLocale,
  localeCookieName,
  locales,
  type Locale,
} from "@cove/i18n/settings";

/**
 * Resolution order: the reader's saved choice, then what their browser asks
 * for, then the product's default.
 *
 * Reads the same cookie name as `@cove/web`, so a visitor who set English in
 * the product and then clicks through to the marketing site keeps it — as long
 * as the two are served from the same registrable domain.
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
