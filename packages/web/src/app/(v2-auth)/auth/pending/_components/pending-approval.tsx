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
} from '@/lib/academy-access-state';
import { orpc } from '@/lib/orpc';

export function PendingApproval({
  initialAccount,
}: {
  initialAccount: AuthMeResponse;
}) {
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
    return <p className="text-sm text-sub">Checking your application…</p>;
  }
  if (account.isError) {
    return (
      <div className="space-y-5">
        <p className="text-sm text-danger">We could not load your academy access.</p>
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
        <h2 className="text-xl font-bold text-ink">{view.heading}</h2>
        <p className="mt-2 text-sm leading-6 text-sub">
          {view.description}
        </p>
        {application?.status === 'REJECTED' && application.reviewReason ? (
          <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{application.reviewReason}</p>
        ) : null}
      </div>
      {academy && view.statusLabel ? (
        <div className="rounded-xl border border-border bg-canvas p-4 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-sub">Academy</span>
            <strong className="text-right text-ink">{academy.name}</strong>
          </div>
          <div className="mt-2 flex justify-between gap-4">
            <span className="text-sub">Status</span>
            <strong className={statusToneClass(view.statusTone)}>
              {view.statusLabel}
            </strong>
          </div>
        </div>
      ) : null}
      {state.kind === 'active' ? (
        <Link
          className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-brand px-5 font-bold text-white hover:bg-brand-deep"
          href={`/studio/academies/${state.membership.academy.id}`}
        >
          Enter academy
        </Link>
      ) : null}
      <button
        className="h-12 w-full rounded-xl bg-brand font-bold text-white hover:bg-brand-deep disabled:opacity-60"
        disabled={account.isFetching}
        onClick={() => void checkStatus()}
        type="button"
      >
        {account.isFetching ? 'Checking…' : 'Check approval status'}
      </button>
      {view.canCancel ? (
        <button
          className="h-11 w-full rounded-xl border border-border font-semibold text-sub hover:text-ink disabled:opacity-60"
          disabled={requestAction.isPending}
          onClick={() => requestAction.mutate('cancel')}
          type="button"
        >
          Cancel application
        </button>
      ) : view.canReapply ? (
        <button
          className="h-11 w-full rounded-xl border border-brand font-semibold text-brand disabled:opacity-60"
          disabled={requestAction.isPending}
          onClick={() => requestAction.mutate('reapply')}
          type="button"
        >
          Apply again
        </button>
      ) : null}
      {requestAction.isError ? (
        <p className="text-sm text-danger">The application could not be updated.</p>
      ) : null}
      {lastCheckedAt ? (
        <p className="text-center text-xs text-sub">Checked at {lastCheckedAt.toLocaleTimeString()}</p>
      ) : (
        <p className="text-center text-xs text-sub">This page does not refresh automatically.</p>
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
