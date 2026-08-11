import { describe, expect, it } from 'vitest';

import {
  defaultTheme,
  isTheme,
  oppositeTheme,
  themeClassName,
  themes,
} from './settings';

describe('isTheme', () => {
  it.each(themes)('accepts %s', (theme) => {
    expect(isTheme(theme)).toBe(true);
  });

  it.each([undefined, null, '', 'DARK', 'system', 'auto', 'light; drop', '<script>'])(
    'rejects %j',
    (value) => {
      expect(isTheme(value as string | undefined)).toBe(false);
    },
  );
});

describe('themeClassName', () => {
  it('names the class for dark', () => {
    expect(themeClassName('dark')).toBe('dark');
  });

  it('leaves light unclassed', () => {
    expect(themeClassName('light')).toBeUndefined();
  });
});

describe('oppositeTheme', () => {
  it('round-trips', () => {
    expect(oppositeTheme('light')).toBe('dark');
    expect(oppositeTheme('dark')).toBe('light');
    expect(oppositeTheme(oppositeTheme('light'))).toBe('light');
  });

  it('always names a real theme, so the toggle cannot point nowhere', () => {
    for (const theme of themes) {
      expect(themes).toContain(oppositeTheme(theme));
      expect(oppositeTheme(theme)).not.toBe(theme);
    }
  });
});

describe('defaults', () => {
  it('offers exactly two themes', () => {
    expect(themes).toEqual(['light', 'dark']);
  });

  it('starts a new reader in light', () => {
    expect(defaultTheme).toBe('light');
    expect(isTheme(defaultTheme)).toBe(true);
  });
});
