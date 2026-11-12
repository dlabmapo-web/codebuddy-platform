'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { assessmentCacheMatches } from '@/lib/assessment-cache';
import { getQueryClient } from '@/lib/query';
import { ThemeProvider } from '@/lib/theme/theme-provider';
import { routes } from '@/lib/routes';
import type { Theme } from '@/lib/theme/settings';

export function Providers({
  children,
  theme,
}: {
  children: React.ReactNode;
  theme: Theme;
}) {
  const pathname = usePathname();
  // Floating debug controls otherwise cover actions in fullscreen workspaces.
  const fullscreenWorkspace =
    pathname === routes.turtle || /\/learn\/(?:exercises|documents|turtle|quizzes|videos)\//.test(pathname) ||
    /\/teach\/classes\/[^/]+\/students\/[^/]+\/(?:work|submissions|live)(?:\/|$)/.test(pathname);
  const [queryClient] = useState(() => getQueryClient());
  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{academyId?: unknown}>).detail;
      if (typeof detail?.academyId !== 'string') return;
      const academyId = detail.academyId;
      void queryClient.invalidateQueries({predicate: query => assessmentCacheMatches(query.queryKey, academyId)});
    };
    window.addEventListener('cove:assessment-changed', refresh);
    return () => window.removeEventListener('cove:assessment-changed', refresh);
  }, [queryClient]);

  return (
    <ThemeProvider initialTheme={theme}>
      <QueryClientProvider client={queryClient}>
        {children}
        {process.env.NODE_ENV === 'development' && !fullscreenWorkspace ? (
          <ReactQueryDevtools initialIsOpen={false} />
        ) : null}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
