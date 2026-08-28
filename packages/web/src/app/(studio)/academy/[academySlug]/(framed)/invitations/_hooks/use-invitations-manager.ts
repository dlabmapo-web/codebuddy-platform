'use client';

import type { AcademyRole, InvitationDelivery } from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { orpc } from '@/lib/orpc';

/**
 * One invitation, with what happened to its email.
 *
 * Flattened from the delivery endpoint's `{ invitation, delivery }` pair so the
 * table's existing columns keep working and delivery is one more field rather
 * than a reshaping of every accessor.
 *
 * §13 — the delivery state is a separate field from the invitation status, and
 * stays that way all the way to the screen. An invitation can be PENDING while
 * its email bounced, and one column could not say both.
 */
export type AcademyInvitation = Awaited<
  ReturnType<typeof orpc.academyInvitationDelivery.list>
>['invitations'][number]['invitation'] & {
  delivery: InvitationDelivery | null;
};

export function useInvitationsManager(academyId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['academy', academyId, 'invitations'];
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AcademyRole>('STUDENT');
  const [formOpen, setFormOpen] = useState(false);
  const [invitationLink, setInvitationLink] = useState<string>();
  const invitationsQuery = useQuery({
    queryKey,
    // The delivery-aware read rather than the plain list: this is the one
    // surface that should be told an address bounced, and §7.6 keeps that
    // evidence on an endpoint a caller has to ask for.
    queryFn: () => orpc.academyInvitationDelivery.list({ academyId }),
    retry: false,
  });
  const createMutation = useMutation({
    mutationFn: () =>
      orpc.academyInvitations.create({ academyId, email, role }),
    onSuccess: async (result) => {
      setInvitationLink(
        `${window.location.origin}/invite/${result.token}?academy=${academyId}`,
      );
      setEmail('');
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  const resendMutation = useMutation({
    mutationFn: (invitationId: string) =>
      orpc.academyInvitationDelivery.resend({ academyId, invitationId }),
    onSuccess: async () => {
      // Re-read rather than patched. A resend rotates the token, moves the
      // expiry, and starts a new attempt, and reconstructing all three in the
      // cache is a second implementation of what the server just decided.
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
    invitations: (invitationsQuery.data?.invitations ?? []).map(
      (row): AcademyInvitation => ({ ...row.invitation, delivery: row.delivery }),
    ),
    loading: invitationsQuery.isPending,
    loadError: invitationsQuery.error,
    create: () => createMutation.mutate(),
    createPending: createMutation.isPending,
    createError: createMutation.error,
    resend: (invitationId: string) => resendMutation.mutate(invitationId),
    resendPending: resendMutation.isPending,
    resendingId: resendMutation.variables ?? null,
    resendError: resendMutation.error,
    revoke: (invitationId: string) => revokeMutation.mutate(invitationId),
    revokePending: revokeMutation.isPending,
    revokeError: revokeMutation.error,
  };
}

export type InvitationsManagerState = ReturnType<
  typeof useInvitationsManager
>;
