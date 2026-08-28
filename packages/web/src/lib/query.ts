'use client';

import {
  MutationCache,
  QueryCache,
  QueryClient,
  isServer,
} from '@tanstack/react-query';

import { endSession } from '@/lib/session/end-session';
import { isSessionEnded } from '@/lib/session/expired-session';

/**
 * One place that notices a session has ended.
 *
 * Every read and every write on every page passes through these caches, so a
 * lapsed session is caught wherever it happens rather than by each page that
 * remembers to look. What used to happen instead is worth stating: a page
 * rendered its own "sign in again" panel, whose button went to `/login`, which
 * saw a perfectly valid auth session and bounced the reader to the overview —
 * a dead end that looked like a way out.
 *
 * Signing out is the honest answer. If the server will not accept this session
 * any more, holding onto it in the browser only produces the same refusal on
 * the next page.
 */
function makeQueryClient() {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isSessionEnded(error)) void endSession();
      },
    }),
    queryCache: new QueryCache({
      onError: (error) => {
        if (isSessionEnded(error)) void endSession();
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (count, error) => {
          const status = (error as { status?: number }).status;
          return !(status && status >= 400 && status < 500) && count < 2;
        },
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (isServer) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
