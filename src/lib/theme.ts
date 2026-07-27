export const THEME_KEY = 'cove-theme';

export type Theme = 'light' | 'dark';

/**
 * Inline script injected into <head> and run before first paint to prevent the
 * flash of the wrong theme (FOUC). Reads the saved choice from localStorage and
 * falls back to the OS preference on first visit, then sets the `dark` class on
 * <html> so CSS variables resolve correctly before React hydrates.
 */
export const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('${THEME_KEY}');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (theme === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;
