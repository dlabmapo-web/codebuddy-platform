import { cookies } from 'next/headers';

import { defaultTheme, isTheme, themeCookieName, type Theme } from './settings';

/**
 * Resolved on the server so the correct theme is in the first byte of HTML.
 *
 * Deliberately simpler than `getLocale()`: there is no header to negotiate,
 * because `system` is resolved by `prefers-color-scheme` in the browser rather
 * than guessed here. Next's own guidance says to resolve on the server when
 * the tree is already dynamic — see
 * `node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`.
 * The root layout already awaits `cookies()` for the locale, so this second
 * read costs nothing.
 */
export async function getTheme(): Promise<Theme> {
  const saved = (await cookies()).get(themeCookieName)?.value;
  return isTheme(saved) ? saved : defaultTheme;
}
