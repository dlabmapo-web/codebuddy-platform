import { themeCookieMaxAge, themeCookieName, type Theme } from './settings';

/**
 * Switching writes the cookie and mutates `<html>` in place. No reload.
 *
 * The language switcher reloads because the server tree, the i18next
 * instance, and every cached React Query entry have to agree on the language.
 * Nothing server-rendered depends on the theme — it is entirely a CSS concern —
 * so setting the two attributes is enough, and it is instant. The cookie only
 * has to keep the *next* server render in agreement.
 */
export function setBrowserTheme(theme: Theme): void {
  try {
    document.cookie = `${themeCookieName}=${theme}; path=/; max-age=${themeCookieMaxAge}; SameSite=Lax`;
  } catch {
    // Cookies disabled. The theme still applies for this session; it just
    // will not survive the next request. Not worth an error state.
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
}
