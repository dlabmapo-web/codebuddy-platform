'use client';

import type { AcademyRole } from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { orpc } from '@/lib/orpc';

export type AcademyInvitation = Awaited<
  ReturnType<typeof orpc.academyInvitations.list>
>['invitations'][number];

export function useInvitationsManager(academyId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['academy', academyId, 'invitations'];
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AcademyRole>('STUDENT');
  const [formOpen, setFormOpen] = useState(false);
  const [invitationLink, setInvitationLink] = useState<string>();
  const invitationsQuery = useQuery({
    queryKey,
    queryFn: () => orpc.academyInvitations.list({ academyId }),
    retry: false,
  });
  const createMutation = useMutation({
    mutationFn: () =>
      orpc.academyInvitations.create({ academyId, email, role }),
    onSuccess: async (result) => {
      setInvitationLink(
        `${window.location.origin}/auth/invitations/${result.token}?academy=${academyId}`,
      );
      setEmail('');
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  const revokeMutation = useMutation({
    mutationFn: (invitationId: string) =>
      orpc.academyInvitations.revoke({ academyId, invitationId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    email,
    setEmail,
    role,
    formOpen,
    openForm: () => setFormOpen(true),
    closeForm: () => setFormOpen(false),
    setRole,
    invitationLink,
    copyInvitationLink: () =>
      invitationLink
        ? navigator.clipboard.writeText(invitationLink)
        : Promise.resolve(),
    invitations: invitationsQuery.data?.invitations ?? [],
    loading: invitationsQuery.isPending,
    loadError: invitationsQuery.error,
    create: () => createMutation.mutate(),
    createPending: createMutation.isPending,
    createError: createMutation.error,
    revoke: (invitationId: string) => revokeMutation.mutate(invitationId),
    revokePending: revokeMutation.isPending,
    revokeError: revokeMutation.error,
  };
}

export type InvitationsManagerState = ReturnType<
  typeof useInvitationsManager
>;
