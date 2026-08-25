'use client';

import type { AuthMeResponse } from '@cove/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  pendingStateView,
  resolveAcademyAccessState,
} from '@/lib/academy-access-state';
import { orpc } from '@/lib/orpc';

export function usePendingApproval(initialAccount: AuthMeResponse) {
  const [lastCheckedAt, setLastCheckedAt] = useState<Date>();
  const accountQuery = useQuery({
    queryKey: ['auth', 'me', initialAccount.user.authUserId],
    queryFn: () => orpc.auth.me({}),
    initialData: initialAccount,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const state = resolveAcademyAccessState(accountQuery.data);
  const view = pendingStateView(state);
  const application =
    state.kind === 'application' ? state.application : undefined;
  const academy =
    state.kind === 'active' || state.kind === 'suspended'
      ? state.membership.academy
      : state.kind === 'application'
        ? state.application.academy
        : undefined;
  const requestMutation = useMutation({
    mutationFn: async (kind: 'cancel' | 'reapply') => {
      if (!application) throw new Error('No academy application');
      return kind === 'cancel'
        ? orpc.joinRequests.cancel({ requestId: application.id })
        : orpc.joinRequests.create({ academyId: application.academy.id });
    },
    onSuccess: async () => {
      await accountQuery.refetch();
    },
  });

  async function checkStatus() {
    await accountQuery.refetch();
    setLastCheckedAt(new Date());
  }

  return {
    state,
    view,
    application,
    academy,
    loading: accountQuery.isPending,
    loadError: accountQuery.error,
    checking: accountQuery.isFetching,
    checkStatus,
    lastCheckedAt,
    requestPending: requestMutation.isPending,
    requestError: requestMutation.error,
    cancel: () => requestMutation.mutate('cancel'),
    reapply: () => requestMutation.mutate('reapply'),
  };
}

export type PendingApprovalState = ReturnType<typeof usePendingApproval>;
