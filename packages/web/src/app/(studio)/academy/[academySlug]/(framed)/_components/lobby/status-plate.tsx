'use client';

import type { JoinRequestKind } from '@cove/shared';
import { Clock3, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@cove/i18n/format';

import { useLocale } from '@/i18n';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';

import { ApplicationTracker } from './application-tracker';

/**
 * The lobby's one loud element, and everything else on the page is quiet so
 * that it can be.
 *
 * It wears `draft` amber, which is not a decorative choice: it is the colour
 * the PENDING chip wears in the manager's applications table and the colour of
 * the count on their nav. The person waiting and the person deciding read the
 * same state in the same colour, on opposite sides of the same review.
 *
 * The two actions under it are deliberately plain text rather than buttons.
 * Withdrawing is reachable — it has to be, or the only way out of a lobby is
 * to sign out and never come back — but it is not what this page is for, and a
 * second solid button beside "Open My Page" would offer a person deciding
 * whether to leave the same weight as the thing they should actually do.
 */
export function StatusPlate({
  academyName,
  appliedAt,
  requestId,
  requestedKind,
}: {
  academyName: string;
  appliedAt: string;
  requestId: string;
  requestedKind: JoinRequestKind;
}) {
  const { t } = useTranslation('lobby');
  const locale = useLocale();
  const router = useRouter();

  const withdraw = useMutation({
    mutationFn: () => orpc.joinRequests.cancel({ requestId }),
    onSuccess: () => {
      // Cancelled is a terminal state, and `/pending` is where terminal states
      // are read — it already offers reapplying. `refresh` first so the route
      // guard re-resolves and cannot serve the lobby of an academy this person
      // has just left.
      router.refresh();
      router.push(routes.pending);
    },
  });

  return (
    <div className="grid gap-5 rounded-card border border-draft/25 bg-draft/[0.06] p-5 sm:p-6">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-2xl bg-draft text-on-draft"
        >
          <Clock3 className="size-[1.35rem]" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="text-[1.15rem] font-extrabold tracking-[-0.01em]">
              {t('status.heading')}
            </h2>
            <span className="rounded-full bg-draft/15 px-2 py-0.5 text-[11px] font-bold text-draft">
              {t(
                requestedKind === 'STAFF'
                  ? 'status.kind_staff'
                  : 'status.kind_student',
              )}
            </span>
          </div>
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-[1.65] text-sub">
            {t('status.body', { academy: academyName })}
          </p>
          <p className="mt-2 text-[12px] font-semibold tabular-nums text-sub">
            {t('status.applied', { when: formatDate(appliedAt, locale) })}
          </p>
        </div>
      </div>

      <ApplicationTracker />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-draft/20 pt-4">
        <Link
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-3.5 text-[13.5px] font-bold text-on-brand outline-none transition-colors hover:bg-brand-deep focus-visible:ring-2 focus-visible:ring-brand/40"
          href={routes.account}
        >
          <UserRound aria-hidden className="size-4" strokeWidth={2.25} />
          {t('profile.action')}
        </Link>
        <button
          className="text-[13px] font-semibold text-sub underline-offset-4 outline-none transition-colors hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-60"
          disabled={withdraw.isPending}
          onClick={() => withdraw.mutate()}
          type="button"
        >
          {withdraw.isPending ? t('actions.working') : t('actions.withdraw')}
        </button>
        {/*
         * "Wrong academy" is not a hypothetical here: `dlab-mapo` and
         * `mapo-dlab` differ only in word order and both appear in the signup
         * selector. Somebody sitting in the wrong lobby is invisible to the
         * manager who should have received them, and both sides read it as
         * Cove being broken — so the recovery is one link rather than
         * withdraw, sign out, start again.
         */}
        <Link
          className="text-[13px] font-semibold text-sub underline-offset-4 outline-none transition-colors hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-brand/40"
          href={routes.pending}
        >
          {t('actions.elsewhere')}
        </Link>
      </div>

      {withdraw.isError ? (
        <p className="text-[13px] font-semibold text-danger" role="alert">
          {t('actions.failed')}
        </p>
      ) : null}
    </div>
  );
}
