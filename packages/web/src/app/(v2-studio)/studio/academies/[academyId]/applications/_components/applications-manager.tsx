'use client';

import type { AcademyRole } from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { formatDate } from '@cove/i18n/format';

import { useLayoutTranslation, useLocale } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { RoleSelector } from '../../_components/role-selector';

export function ApplicationsManager({ academyId }: { academyId: string }) {
  const { t } = useLayoutTranslation('applications');
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const requests = useQuery({
    queryKey: ['academy', academyId, 'applications'],
    queryFn: () => orpc.academyJoinRequests.list({ academyId }),
    retry: false,
  });
  const review = useMutation({
    mutationFn: (input:
      | { requestId: string; decision: 'APPROVE'; role: AcademyRole; reason?: string }
      | { requestId: string; decision: 'REJECT'; reason: string }) =>
      orpc.academyJoinRequests.review({ academyId, ...input }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['academy', academyId, 'applications'] }),
        queryClient.invalidateQueries({ queryKey: ['academy', academyId, 'members'] }),
      ]);
    },
  });

  if (requests.isPending) {
    return <p className="text-sm text-sub">{t('loading')}</p>;
  }
  if (requests.isError) {
    return (
      <p className="text-sm text-danger">
        {errorText(requests.error, t('forbidden'))}
      </p>
    );
  }
  if (requests.data.requests.length === 0) {
    return <p className="text-sm text-sub">{t('empty')}</p>;
  }

  return (
    <div className="space-y-4">
      {requests.data.requests.map((request) => (
        <ApplicationCard
          disabled={review.isPending}
          key={request.id}
          onApprove={(role, reason) => review.mutate({ requestId: request.id, decision: 'APPROVE', role, reason })}
          onReject={(reason) => review.mutate({ requestId: request.id, decision: 'REJECT', reason })}
          request={request}
        />
      ))}
      {review.isError ? (
        <p className="text-sm text-danger">
          {errorText(review.error, t('review_failed'))}
        </p>
      ) : null}
    </div>
  );
}

function ApplicationCard({
  request,
  disabled,
  onApprove,
  onReject,
}: {
  request: Awaited<ReturnType<typeof orpc.academyJoinRequests.list>>['requests'][number];
  disabled: boolean;
  onApprove: (role: AcademyRole, reason?: string) => void;
  onReject: (reason: string) => void;
}) {
  const { t } = useLayoutTranslation(['applications', 'common']);
  const locale = useLocale();
  const [role, setRole] = useState<AcademyRole>('STUDENT');
  const [reason, setReason] = useState('');
  return (
    <article className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="font-bold">{request.user.displayName ??
              request.user.email ??
              t('common:fallback.user')}</h2>
          <p className="text-sm text-sub">{request.user.email}</p>
          {request.message ? <p className="mt-2 text-sm">{request.message}</p> : null}
        </div>
        <span className="text-xs text-sub">
          {formatDate(request.createdAt, locale)}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[180px_1fr_auto_auto]">
        <RoleSelector onChange={setRole} value={role} />
        <input
          className="h-11 rounded-lg border border-border px-3 text-sm"
          onChange={(event) => setReason(event.target.value)}
          placeholder={t('reason_placeholder')}
          value={reason}
        />
        <button
          className="rounded-lg bg-brand px-4 text-sm font-bold text-white disabled:opacity-50"
          disabled={disabled}
          onClick={() => onApprove(role, reason || undefined)}
          type="button"
        >
          {t('approve')}
        </button>
        <button
          className="rounded-lg border border-red-200 px-4 text-sm font-bold text-red-700 disabled:opacity-50"
          disabled={disabled || !reason.trim()}
          onClick={() => onReject(reason)}
          type="button"
        >
          {t('reject')}
        </button>
      </div>
    </article>
  );
}
