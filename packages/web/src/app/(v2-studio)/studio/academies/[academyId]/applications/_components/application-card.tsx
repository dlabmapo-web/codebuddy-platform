import type { AcademyRole } from '@cove/shared';
import { formatDate } from '@cove/i18n/format';
import { useState } from 'react';

import { useLayoutTranslation, useLocale } from '@/i18n';
import { RoleSelector } from '../../_components/role-selector';

import type { ApplicationRequest } from '../_hooks/use-applications-manager';

export function ApplicationCard({
  request,
  disabled,
  onApprove,
  onReject,
}: {
  request: ApplicationRequest;
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
          <h2 className="font-bold">
            {request.user.displayName ??
              request.user.email ??
              t('common:fallback.user')}
          </h2>
          <p className="text-sm text-sub">{request.user.email}</p>
          {request.message ? (
            <p className="mt-2 text-sm">{request.message}</p>
          ) : null}
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
