import {
  localeCookieMaxAge,
  localeCookieName,
  type Locale,
} from "@cove/i18n/settings";

/**
 * Synchronize the server cookie and document language before a full reload.
 *
 * Same cookie as `@cove/web` writes, so the choice carries across to the
 * product. A reload rather than a router refresh: every string on this site is
 * server-rendered, and reloading is both simpler and indistinguishable to the
 * reader at this page weight.
 */
export function setBrowserLocale(locale: Locale): void {
  document.cookie = `${localeCookieName}=${locale}; path=/; max-age=${localeCookieMaxAge}; SameSite=Lax`;
  document.documentElement.lang = locale;
  window.location.reload();
}
