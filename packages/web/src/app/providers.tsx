'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

import { getQueryClient } from '@/lib/query';
import { ThemeProvider } from '@/lib/theme/theme-provider';
import type { Theme } from '@/lib/theme/settings';

export function Providers({
  children,
  theme,
}: {
  children: React.ReactNode;
  theme: Theme;
}) {
  const [queryClient] = useState(() => getQueryClient());

  return (
    <ThemeProvider initialTheme={theme}>
      <QueryClientProvider client={queryClient}>
        {children}
        {process.env.NODE_ENV === 'development' ? (
          <ReactQueryDevtools initialIsOpen={false} />
        ) : null}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
