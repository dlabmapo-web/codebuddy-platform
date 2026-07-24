'use client';

import type { AcademyRole } from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { formatDate } from '@cove/i18n/format';

import { useLayoutTranslation, useLocale } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { RoleSelector } from '../../_components/role-selector';

export function InvitationsManager({ academyId }: { academyId: string }) {
  const { t } = useLayoutTranslation(['invitations', 'common']);
  const errorText = useErrorText();
  const locale = useLocale();
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
          placeholder={t('email_placeholder')}
          required
          type="email"
          value={email}
        />
        <RoleSelector onChange={setRole} value={role} />
        <button
          className="h-11 rounded-lg bg-brand px-4 text-sm font-bold text-white disabled:opacity-50"
          disabled={createInvitation.isPending}
          type="submit"
        >
          {t('create')}
        </button>
      </form>
      {invitationLink ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-bold text-blue-900">{t('link_notice')}</p>
          <div className="mt-2 flex gap-2">
            <input className="min-w-0 flex-1 rounded-lg border border-blue-200 bg-white px-3 text-xs" readOnly value={invitationLink} />
            <button
              className="rounded-lg bg-blue-700 px-4 text-sm font-bold text-white"
              onClick={() => void navigator.clipboard.writeText(invitationLink)}
              type="button"
            >
              {t('common:action.copy')}
            </button>
          </div>
        </div>
      ) : null}
      {createInvitation.isError ? (
        <p className="text-sm text-danger">
          {errorText(createInvitation.error, t('create_failed'))}
        </p>
      ) : null}
      <div className="space-y-3">
        {invitations.isPending ? (
          <p className="text-sm text-sub">{t('loading')}</p>
        ) : null}
        {invitations.isError ? (
          <p className="text-sm text-danger">
            {errorText(invitations.error, t('load_failed'))}
          </p>
        ) : null}
        {invitations.data?.invitations.map((invitation) => (
          <article className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4" key={invitation.id}>
            <div>
              <h2 className="font-bold">{invitation.email}</h2>
              <p className="text-sm text-sub">
                {t('meta', {
                  role: t(`common:role.${invitation.role}`),
                  status: t(`common:invitation_status.${invitation.status}`),
                  date: formatDate(invitation.expiresAt, locale),
                })}
              </p>
            </div>
            {invitation.status === 'PENDING' ? (
              <button
                className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(invitation.id)}
                type="button"
              >
                {t('revoke')}
              </button>
            ) : null}
          </article>
        ))}
      </div>
      {revoke.isError ? (
        <p className="text-sm text-danger">
          {errorText(revoke.error, t('revoke_failed'))}
        </p>
      ) : null}
    </div>
  );
}
