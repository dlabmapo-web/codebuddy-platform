import {
  localeCookieMaxAge,
  localeCookieName,
  type Locale,
} from '@cove/i18n/settings';

/** Synchronize the server cookie and document language before a full reload. */
export function setBrowserLocale(locale: Locale): void {
  document.cookie = `${localeCookieName}=${locale}; path=/; max-age=${localeCookieMaxAge}; SameSite=Lax`;
  document.documentElement.lang = locale;
  window.location.reload();
}
