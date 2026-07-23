'use client';

import type { AcademyRole } from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { orpc } from '@/lib/orpc';

const roles: AcademyRole[] = ['STUDENT', 'TEACHER', 'TEAM_LEAD', 'MANAGER'];

export function InvitationsManager({ academyId }: { academyId: string }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AcademyRole>('STUDENT');
  const [invitationLink, setInvitationLink] = useState<string>();
  const invitations = useQuery({
    queryKey: ['academy', academyId, 'invitations'],
    queryFn: () => orpc.academyInvitations.list({ academyId }),
    retry: false,
  });
  const createInvitation = useMutation({
    mutationFn: () => orpc.academyInvitations.create({ academyId, email, role }),
    onSuccess: async (result) => {
      setInvitationLink(
        `${window.location.origin}/auth/invitations/${result.token}?academy=${academyId}`,
      );
      setEmail('');
      await queryClient.invalidateQueries({ queryKey: ['academy', academyId, 'invitations'] });
    },
  });
  const revoke = useMutation({
    mutationFn: (invitationId: string) =>
      orpc.academyInvitations.revoke({ academyId, invitationId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['academy', academyId, 'invitations'] });
    },
  });

  return (
    <div className="space-y-7">
      <form
        className="grid gap-3 sm:grid-cols-[1fr_180px_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          createInvitation.mutate();
        }}
      >
        <input
          className="h-11 rounded-lg border border-border px-3 text-sm"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="member@example.com"
          required
          type="email"
          value={email}
        />
        <select
          className="h-11 rounded-lg border border-border bg-white px-3 text-sm"
          onChange={(event) => setRole(event.target.value as AcademyRole)}
          value={role}
        >
          {roles.map((item) => <option key={item} value={item}>{item.replace('_', ' ')}</option>)}
        </select>
        <button
          className="h-11 rounded-lg bg-brand px-4 text-sm font-bold text-white disabled:opacity-50"
          disabled={createInvitation.isPending}
          type="submit"
        >
          Create invitation
        </button>
      </form>
      {invitationLink ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-bold text-blue-900">Copy this link now—it is shown only once.</p>
          <div className="mt-2 flex gap-2">
            <input className="min-w-0 flex-1 rounded-lg border border-blue-200 bg-white px-3 text-xs" readOnly value={invitationLink} />
            <button
              className="rounded-lg bg-blue-700 px-4 text-sm font-bold text-white"
              onClick={() => void navigator.clipboard.writeText(invitationLink)}
              type="button"
            >
              Copy
            </button>
          </div>
        </div>
      ) : null}
      {createInvitation.isError ? <p className="text-sm text-danger">The invitation could not be created.</p> : null}
      <div className="space-y-3">
        {invitations.isPending ? <p className="text-sm text-sub">Loading invitations…</p> : null}
        {invitations.data?.invitations.map((invitation) => (
          <article className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4" key={invitation.id}>
            <div>
              <h2 className="font-bold">{invitation.email}</h2>
              <p className="text-sm text-sub">
                {invitation.role.replace('_', ' ')} · {invitation.status} · expires {new Date(invitation.expiresAt).toLocaleDateString()}
              </p>
            </div>
            {invitation.status === 'PENDING' ? (
              <button
                className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(invitation.id)}
                type="button"
              >
                Revoke
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
