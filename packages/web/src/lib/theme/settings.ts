export const themes = ['light', 'dark'] as const;

export type Theme = (typeof themes)[number];

/**
 * What a reader with no saved choice gets.
 *
 * There is no `system` option: the product offers two themes and the toggle
 * shows which one is on. Following the OS instead would mean the button could
 * not name its own state on the server, which is the whole reason this renders
 * without a flash.
 */
export const defaultTheme: Theme = 'light';

export const themeCookieName = 'cove-theme';
export const themeCookieMaxAge = 60 * 60 * 24 * 365;

export function isTheme(value: string | undefined | null): value is Theme {
  return typeof value === 'string' && (themes as readonly string[]).includes(value);
}

/** The `.dark` class the server puts on `<html>`. */
export function themeClassName(theme: Theme): string | undefined {
  return theme === 'dark' ? 'dark' : undefined;
}

/** The other theme — what the toggle switches to. */
export function oppositeTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}
