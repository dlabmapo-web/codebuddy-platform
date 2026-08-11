'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

import { setBrowserTheme } from './set-theme';
import { defaultTheme, type Theme } from './settings';

type ThemeContextValue = {
  /** The reader's choice, not the resolved appearance. `system` stays `system`. */
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * Seeded from the server-resolved cookie value, so a switcher renders its
 * correct label during SSR.
 *
 * It holds no effect and reads no `matchMedia`: `system` is resolved by CSS,
 * and the initial value already arrived with the HTML. That is what lets the
 * switcher render on the server instead of waiting for hydration.
 */
export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: ReactNode;
  initialTheme: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    setBrowserTheme(next);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider.');
  }
  return context;
}

export { defaultTheme };
