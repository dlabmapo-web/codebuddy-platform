'use client';

import type { AcademyRole } from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { orpc } from '@/lib/orpc';

export type ApplicationRequest = Awaited<
  ReturnType<typeof orpc.academyJoinRequests.list>
>['requests'][number];

export function useApplicationsManager(academyId: string) {
  const queryClient = useQueryClient();
  const applicationsKey = ['academy', academyId, 'applications'];
  const requestsQuery = useQuery({
    queryKey: applicationsKey,
    queryFn: () => orpc.academyJoinRequests.list({ academyId }),
    retry: false,
  });
  const reviewMutation = useMutation({
    mutationFn: (
      input:
        | {
            requestId: string;
            decision: 'APPROVE';
            role: AcademyRole;
            reason?: string;
          }
        | { requestId: string; decision: 'REJECT'; reason: string },
    ) => orpc.academyJoinRequests.review({ academyId, ...input }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: applicationsKey }),
        queryClient.invalidateQueries({
          queryKey: ['academy', academyId, 'members'],
        }),
      ]);
    },
  });

  return {
    requests: requestsQuery.data?.requests ?? [],
    loading: requestsQuery.isPending,
    loadError: requestsQuery.error,
    reviewPending: reviewMutation.isPending,
    reviewError: reviewMutation.error,
    approve: (requestId: string, role: AcademyRole, reason?: string) =>
      reviewMutation.mutate({
        requestId,
        decision: 'APPROVE',
        role,
        reason,
      }),
    reject: (requestId: string, reason: string) =>
      reviewMutation.mutate({ requestId, decision: 'REJECT', reason }),
  };
}

export type ApplicationsManagerState = ReturnType<
  typeof useApplicationsManager
>;
