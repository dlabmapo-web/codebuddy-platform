'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { AuthMeResponse } from '@cove/shared';
import {
  Ban,
  CheckCircle2,
  CircleOff,
  Clock3,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { SignOutControl } from '../../_components/sign-out-control';
import {
  pendingStateView,
  resolveAcademyAccessState,
  type PendingStateKind,
} from '@/lib/academy-access-state';
import { formatTime } from '@cove/i18n/format';

import {
  useLayoutTranslation,
  useLocale,
  type TranslationKey,
} from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';

/**
 * State-to-copy map. Written out rather than built from a template string so
 * i18next's typed keys can check every one of them.
 */
const stateCopy: Record<
  PendingStateKind,
  {
    heading: TranslationKey<'auth'>;
    description: TranslationKey<'auth'>;
    status: `common:${TranslationKey<'common'>}` | null;
  }
> = {
  approved: {
    heading: 'pending.state.approved_heading',
    description: 'pending.state.approved_description',
    status: 'common:membership_status.ACTIVE',
  },
  suspended: {
    heading: 'pending.state.suspended_heading',
    description: 'pending.state.suspended_description',
    status: 'common:membership_status.SUSPENDED',
  },
  none: {
    heading: 'pending.state.none_heading',
    description: 'pending.state.none_description',
    status: null,
  },
  pending: {
    heading: 'pending.state.pending_heading',
    description: 'pending.state.pending_description',
    status: 'common:join_request_status.PENDING',
  },
  application_approved: {
    heading: 'pending.state.application_approved_heading',
    description: 'pending.state.application_approved_description',
    status: 'common:join_request_status.APPROVED',
  },
  rejected: {
    heading: 'pending.state.rejected_heading',
    description: 'pending.state.rejected_description',
    status: 'common:join_request_status.REJECTED',
  },
  cancelled: {
    heading: 'pending.state.cancelled_heading',
    description: 'pending.state.cancelled_description',
    status: 'common:join_request_status.CANCELLED',
  },
};

export function PendingApproval({
  initialAccount,
}: {
  initialAccount: AuthMeResponse;
}) {
  const { t } = useLayoutTranslation(['auth', 'common']);
  const errorText = useErrorText();
  const locale = useLocale();
  const [lastCheckedAt, setLastCheckedAt] = useState<Date>();
  const account = useQuery({
    queryKey: ['auth', 'me', initialAccount.user.authUserId],
    queryFn: () => orpc.auth.me({}),
    initialData: initialAccount,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const state = resolveAcademyAccessState(account.data);
  const view = pendingStateView(state);
  const copy = stateCopy[view.state];
  const application = state.kind === 'application'
    ? state.application
    : undefined;
  const requestAction = useMutation({
    mutationFn: async (kind: 'cancel' | 'reapply') => {
      if (!application) throw new Error('No academy application');
      return kind === 'cancel'
        ? orpc.joinRequests.cancel({ requestId: application.id })
        : orpc.joinRequests.create({ academyId: application.academy.id });
    },
    onSuccess: async () => {
      await account.refetch();
    },
  });

  async function checkStatus() {
    await account.refetch();
    setLastCheckedAt(new Date());
  }

  if (account.isPending) {
    return <p className="text-sm text-sub">{t('pending.checking')}</p>;
  }
  if (account.isError) {
    return (
      <div className="space-y-5">
        <p className="text-sm text-danger">
          {errorText(account.error, t('pending.load_failed'))}
        </p>
        <SignOutControl />
      </div>
    );
  }

  const academy = state.kind === 'active' || state.kind === 'suspended'
    ? state.membership.academy
    : state.kind === 'application'
      ? state.application.academy
      : undefined;
  return (
    <div className="space-y-5">
      <StateIcon kind={state.kind} status={application?.status} />
      <div>
        <h2 className="text-xl font-bold text-ink">{t(copy.heading)}</h2>
        <p className="mt-2 text-sm leading-6 text-sub">
          {t(copy.description, {
            academy: view.academyName ?? '',
          })}
        </p>
        {application?.status === 'REJECTED' && application.reviewReason ? (
          <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{application.reviewReason}</p>
        ) : null}
      </div>
      {academy && copy.status ? (
        <div className="rounded-xl border border-border bg-canvas p-4 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-sub">{t('pending.academy')}</span>
            <strong className="text-right text-ink">{academy.name}</strong>
          </div>
          <div className="mt-2 flex justify-between gap-4">
            <span className="text-sub">{t('pending.status')}</span>
            <strong className={statusToneClass(view.statusTone)}>
              {t(copy.status)}
            </strong>
          </div>
          {view.role ? (
            <div className="mt-2 flex justify-between gap-4">
              <span className="text-sub">{t('pending.role')}</span>
              <strong className="text-right text-ink">
                {t(`common:role.${view.role}`)}
              </strong>
            </div>
          ) : null}
        </div>
      ) : null}
      {state.kind === 'active' ? (
        <Link
          className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-brand px-5 font-bold text-white hover:bg-brand-deep"
          href={`/studio/academies/${state.membership.academy.id}`}
        >
          {t('pending.enter_academy')}
        </Link>
      ) : null}
      <button
        className="h-12 w-full rounded-xl bg-brand font-bold text-white hover:bg-brand-deep disabled:opacity-60"
        disabled={account.isFetching}
        onClick={() => void checkStatus()}
        type="button"
      >
        {account.isFetching
          ? t('pending.checking_status')
          : t('pending.check_status')}
      </button>
      {view.canCancel ? (
        <button
          className="h-11 w-full rounded-xl border border-border font-semibold text-sub hover:text-ink disabled:opacity-60"
          disabled={requestAction.isPending}
          onClick={() => requestAction.mutate('cancel')}
          type="button"
        >
          {t('pending.cancel_application')}
        </button>
      ) : view.canReapply ? (
        <button
          className="h-11 w-full rounded-xl border border-brand font-semibold text-brand disabled:opacity-60"
          disabled={requestAction.isPending}
          onClick={() => requestAction.mutate('reapply')}
          type="button"
        >
          {t('pending.apply_again')}
        </button>
      ) : null}
      {requestAction.isError ? (
        <p className="text-sm text-danger">
          {errorText(requestAction.error, t('pending.update_failed'))}
        </p>
      ) : null}
      {lastCheckedAt ? (
        <p className="text-center text-xs text-sub">
          {t('pending.checked_at', {
            time: formatTime(lastCheckedAt, locale),
          })}
        </p>
      ) : (
        <p className="text-center text-xs text-sub">
          {t('pending.no_auto_refresh')}
        </p>
      )}
      <SignOutControl className="w-full text-sm font-semibold text-sub hover:text-ink" />
    </div>
  );
}

function StateIcon({
  kind,
  status,
}: {
  kind: ReturnType<typeof resolveAcademyAccessState>['kind'];
  status?: AuthMeResponse['user']['applications'][number]['status'];
}) {
  if (kind === 'active' || status === 'APPROVED') {
    return <CheckCircle2 className="text-success" size={42} />;
  }
  if (kind === 'suspended') {
    return <Ban className="text-slate-600" size={42} />;
  }
  if (kind === 'welcome') {
    return <CircleOff className="text-slate-500" size={42} />;
  }
  if (status === 'REJECTED') {
    return <XCircle className="text-danger" size={42} />;
  }
  return <Clock3 className="text-amber-600" size={42} />;
}

function statusToneClass(tone: ReturnType<typeof pendingStateView>['statusTone']) {
  switch (tone) {
    case 'green':
      return 'text-success';
    case 'red':
      return 'text-danger';
    case 'slate':
      return 'text-slate-600';
    case 'amber':
      return 'text-amber-700';
  }
}
