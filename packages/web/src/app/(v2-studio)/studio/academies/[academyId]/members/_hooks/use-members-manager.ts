'use client';

import type { AcademyRole } from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { orpc } from '@/lib/orpc';

export type AcademyMember = Awaited<
  ReturnType<typeof orpc.academyMembers.list>
>['members'][number];

type MemberOperation =
  | { kind: 'role'; membershipId: string; role: AcademyRole }
  | { kind: 'suspend' | 'restore'; membershipId: string };

export function useMembersManager(academyId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['academy', academyId, 'members'];
  const membersQuery = useQuery({
    queryKey,
    queryFn: () => orpc.academyMembers.list({ academyId }),
    retry: false,
  });
  const updateMutation = useMutation({
    mutationFn: (operation: MemberOperation) => {
      if (operation.kind === 'role') {
        return orpc.academyMembers.changeRole({
          academyId,
          membershipId: operation.membershipId,
          role: operation.role,
        });
      }
      return operation.kind === 'suspend'
        ? orpc.academyMembers.suspend({
            academyId,
            membershipId: operation.membershipId,
          })
        : orpc.academyMembers.restore({
            academyId,
            membershipId: operation.membershipId,
          });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    members: membersQuery.data?.members ?? [],
    loading: membersQuery.isPending,
    loadError: membersQuery.error,
    updatePending: updateMutation.isPending,
    updateError: updateMutation.error,
    changeRole: (membershipId: string, role: AcademyRole) =>
      updateMutation.mutate({ kind: 'role', membershipId, role }),
    suspend: (membershipId: string) =>
      updateMutation.mutate({ kind: 'suspend', membershipId }),
    restore: (membershipId: string) =>
      updateMutation.mutate({ kind: 'restore', membershipId }),
  };
}

export type MembersManagerState = ReturnType<typeof useMembersManager>;
