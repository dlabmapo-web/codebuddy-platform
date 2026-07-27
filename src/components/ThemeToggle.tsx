'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { THEME_KEY, type Theme } from '@/lib/theme';

/**
 * Sun/moon theme switcher. Two variants:
 *  - default (inline): a compact icon button for embedding in a header's
 *    top-right cluster (student/teacher/admin GNB, fullscreen toolbars).
 *  - floating: a fixed top-right pill for pages with no header (auth).
 * Persists to localStorage; the anti-FOUC script in <head> applies it on load.
 */
export default function ThemeToggle({ floating = false }: { floating?: boolean }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
    setTheme(next);
  }

  // Avoid rendering the wrong icon before we've read the applied theme.
  if (!mounted) return null;

  const isDark = theme === 'dark';
  const base =
    'flex items-center justify-center text-sub transition-colors hover:text-primary hover:bg-surface';
  const shape = floating
    ? 'fixed bottom-5 right-5 z-50 h-11 w-11 rounded-full border border-border bg-card shadow-md'
    : 'h-9 w-9 rounded-lg';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      title={isDark ? '라이트 모드' : '다크 모드'}
      className={`${base} ${shape}`}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
