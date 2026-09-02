'use client';

import type {
  AcademyRole,
  ListPlatformInvitationsResult,
} from '@cove/shared';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';

import { orpc } from '@/lib/orpc';

import {
  invitationsPath,
  parseInvitationsQuery,
  serializeInvitationsQuery,
  type InvitationsQuery,
} from '../_lib/invitations-query';

/** The queue's own react-query prefix, so one write clears every reader. */
export const invitationsKey = ['platform-invitations'] as const;

/** The address owns the filter, as it does on every other console list. */
export function useInvitationsState() {
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const urlQuery = React.useMemo(
    () => parseInvitationsQuery(searchKey),
    [searchKey],
  );
  const [query, setQuery] = React.useState<InvitationsQuery>(urlQuery);
  const [urlKey, setUrlKey] = React.useState(searchKey);
  if (urlKey !== searchKey) {
    setUrlKey(searchKey);
    setQuery(urlQuery);
  }

  const path = invitationsPath(query);
  React.useEffect(() => {
    if (path !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', path);
    }
  }, [path]);

  const change = React.useCallback((partial: Partial<InvitationsQuery>) => {
    setQuery((current) => {
      const next = { ...current, ...partial };
      // Narrowing while on page 4 shows an empty table and reads as "there are
      // none" — the fastest way to make a working filter look broken.
      const narrowed =
        serializeInvitationsQuery({ ...current, page: 1 }) !==
        serializeInvitationsQuery({ ...next, page: 1 });
      return narrowed ? { ...next, page: 1 } : next;
    });
  }, []);

  return { query, path, change };
}

export function useInvitationsQuery(
  query: InvitationsQuery,
  initialData: ListPlatformInvitationsResult | null | undefined,
  initialKey: string,
) {
  const key = serializeInvitationsQuery(query);
  return useQuery<ListPlatformInvitationsResult>({
    queryKey: [...invitationsKey, key],
    queryFn: () => orpc.platformInvitations.list(query),
    initialData: key === initialKey ? (initialData ?? undefined) : undefined,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    retry: false,
  });
}

/**
 * Sending, through the academy's own procedure.
 *
 * `academyInvitations.create` and not a platform twin: an operator already
 * passes `academy.members.manage` through the platform branch of
 * `AcademyAccessService`, so this is the same call a manager's own page makes,
 * with the same role ceiling, the same audit record, and — because the router
 * queues the email after the invitation commits — the same delivery ladder.
 *
 * The token comes back once. Only its hash is stored, so this response is the
 * only moment it can be shown, which is what the composer does with it.
 */
export function useSendInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      academyId: string;
      email: string;
      role: AcademyRole;
    }) => orpc.academyInvitations.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invitationsKey }),
  });
}

/**
 * Resending, which rotates the token and starts a new attempt.
 *
 * Guarded by `ManagerScopeService.requireManager`, which demands
 * `role === 'MANAGER'` — and the platform branch reports exactly that, because
 * the console's client deliberately does not forward the view-role cookie
 * (`shouldForwardViewRole` in `lib/orpc.ts`). That is load-bearing: an operator
 * who had switched to a Teacher view on some earlier diagnostic would otherwise
 * be refused here for a reason nothing on this page could explain.
 */
export function useResendInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { academyId: string; invitationId: string }) =>
      orpc.academyInvitationDelivery.resend(input),
    // Re-read rather than patched. A resend rotates the token, moves the
    // expiry, and starts a new attempt, and reconstructing all three in the
    // cache is a second implementation of what the server just decided.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invitationsKey }),
  });
}

export function useRevokeInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { academyId: string; invitationId: string }) =>
      orpc.academyInvitations.revoke(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invitationsKey }),
  });
}

export type { InvitationsQuery };
