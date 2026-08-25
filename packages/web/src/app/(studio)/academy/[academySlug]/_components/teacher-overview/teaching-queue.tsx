'use client';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import {
  overviewAttentionKinds,
  type OverviewAttentionReason,
  type TeachingQueueStudent,
} from '@cove/shared';
import { ArrowRight, CircleCheck, Clock3, Flag, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import {
  attentionIcons,
  attentionReasonDisplayValue,
  attentionTones,
} from '../../_lib/overview-view';
import {
  solutionStatusPath,
  studentAnalyticsPath,
  type OverviewQuery,
} from '../../_lib/overview-url';
import { Avatar, Duration, EmptyState, Panel } from './overview-primitives';

/**
 * The overview's signature surface: who to check first, and what says so.
 *
 * It is the first content on the page because it is the answer to the first
 * question a teacher opens the page with. Everything below it is the evidence
 * underneath, which is why this is the only section on the page that carries
 * the action colour on its *rows* rather than only in its header — a page where
 * five things are urgent has nothing urgent on it.
 *
 * The orange rail is the whole visual argument. It runs the full height of a
 * row rather than sitting inside it, so five rows read as one prioritized
 * column from across a staffroom, and the rest of the page can stay a quiet
 * reading surface without losing its hierarchy.
 *
 * No row is numbered and no row is scored. §6.3 forbids calling a child weak,
 * lazy, or at risk, and a rank printed beside a name is that sentence written
 * in digits. The avatar disc is identity and nothing else — its hue comes from
 * the membership id, so it says "this is Ada" and never "Ada is behind". What
 * each row states instead is a measurement and where it came from, so a teacher
 * can disagree with the order and still use the row.
 *
 * See §6.3 of the teacher overview and student analytics redesign.
 */
export function TeachingQueue({
  academyId,
  isStale,
  query,
  rows,
  total,
}: {
  academyId: string;
  isStale: boolean;
  query: OverviewQuery;
  rows: TeachingQueueStudent[];
  total: number;
}) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('teaching');

  return (
    <Panel
      actions={
        total > 0 ? (
          <Link
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12.5px] font-bold text-on-primary',
              'transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              isStale && 'pointer-events-none opacity-50',
            )}
            // Every reason, which is exactly "students with at least one" —
            // the reasons are exhaustive, so this needs no separate concept.
            href={studentAnalyticsPath({
              academySlug,
              query,
              attention: [...overviewAttentionKinds],
            })}
          >
            {t('queue.view_all')}
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        ) : null
      }
      description={t('queue.description')}
      icon={Flag}
      id="teaching-queue"
      meta={
        total > 0
          ? total > rows.length
            ? t('queue.meta', { shown: rows.length, total })
            : t('queue.meta_all', { count: total })
          : undefined
      }
      testId="teaching-queue"
      title={t('queue.title')}
      tone="primary"
    >
      {rows.length === 0 ? (
        <EmptyState
          body={t('queue.empty_body')}
          icon={CircleCheck}
          title={t('queue.empty_title')}
          tone="success"
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((row) => (
            <QueueRow
              academyId={academyId}
              isStale={isStale}
              key={row.membershipId}
              row={row}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function QueueRow({
  academyId,
  isStale,
  row,
}: {
  academyId: string;
  isStale: boolean;
  row: TeachingQueueStudent;
}) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('teaching');
  const href = solutionStatusPath({
    academySlug,
    classId: row.classId,
    membershipId: row.membershipId,
  });
  const [primary, ...rest] = row.reasons;

  return (
    <li
      className={cn(
        'relative flex flex-wrap items-center gap-x-4 gap-y-2.5 py-3.5 pl-5 pr-4',
        'transition-colors hover:bg-primary/[0.03]',
      )}
    >
      {/*
       * The rail. Absolute and full-height so it reads as one continuous
       * priority column down the section rather than as five separate badges,
       * and `aria-hidden` because the reason chip beside it already says in
       * words what the colour is doing.
       */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] bg-primary"
      />

      <Avatar id={row.membershipId} name={row.displayName} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-[14px] font-bold text-ink">
            {row.displayName}
          </span>
          <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-sub">
            {row.className}
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <ReasonChip reason={primary} />
          {rest.map((reason) => (
            <ReasonChip key={reason.kind} muted reason={reason} />
          ))}
        </div>

        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-sub">
          {row.curriculumLabel ? (
            <span className="flex min-w-0 items-center gap-1">
              <MapPin aria-hidden className="size-3.5 shrink-0 opacity-70" />
              <span className="truncate">{row.curriculumLabel}</span>
            </span>
          ) : null}
          <span className="flex items-center gap-1 whitespace-nowrap">
            <Clock3 aria-hidden className="size-3.5 shrink-0 text-teal" />
            {t('queue.active')}{' '}
            <Duration className="font-semibold text-ink" seconds={row.activeSeconds} />
          </span>
          <span className="whitespace-nowrap">
            {t('queue.last_seen')} <LastSeen at={row.lastActivityAt} />
          </span>
        </p>
      </div>

      {href ? (
        <Link
          className={cn(
            'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[12.5px] font-bold text-ink',
            'transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            isStale && 'pointer-events-none opacity-50',
          )}
          href={href}
        >
          {t('queue.open')}
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      ) : null}
    </li>
  );
}

/**
 * One reason, with the measurement that produced it.
 *
 * The number is never optional. "Stalled" is an opinion; "stalled 9 days" is
 * something a teacher can check against what they remember of the week, and
 * being checkable is what keeps this list from becoming a label on a child.
 */
function ReasonChip({
  muted = false,
  reason,
}: {
  muted?: boolean;
  reason: OverviewAttentionReason;
}) {
  const { t } = useTranslation('teaching');
  const Icon = attentionIcons[reason.kind];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full py-1 pl-2 pr-2.5 text-[11.5px] font-bold tabular-nums',
        muted ? 'bg-accent text-sub' : attentionTones[reason.kind],
      )}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
      {t(`queue.reason.${reason.kind}`, {
        count: attentionReasonDisplayValue(reason),
      })}
    </span>
  );
}

/** When the student was last seen, or that they never were. */
function LastSeen({ at }: { at: string | null }) {
  const { t, i18n } = useTranslation('teaching');
  if (!at) {
    return <span className="font-semibold text-ink">{t('never')}</span>;
  }
  return (
    <time className="font-mono font-semibold tabular-nums text-ink" dateTime={at}>
      {new Intl.DateTimeFormat(i18n.language, {
        month: 'short',
        day: 'numeric',
      }).format(new Date(at))}
    </time>
  );
}
