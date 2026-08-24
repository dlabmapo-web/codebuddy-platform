'use client';

import { formatNumber } from '@cove/i18n/format';
import type { LeaderboardRow } from '@cove/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowRight, RotateCcw, School, Trophy } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { ProfileAvatar } from '@/components/studio/profile-avatar';
import { useLocale } from '@/i18n';
import { orpc } from '@/lib/orpc';
import { cn } from '@/lib/utils';

import { rankMarker } from '../../points/_lib/points-view';
import { Panel } from '../overview-ui/panel';
import { FilterSelector } from '../teacher-overview/filter-selector';

/**
 * Today's first five places, shared by all four academy overviews.
 *
 * This is deliberately a list rather than a compressed copy of the complete
 * data table. Position, identity, and points are the only questions an
 * overview answers; composition, sorting, rules, and history remain on the
 * complete board. Metal is confined to the position marker, exactly as it is
 * there, so color describes a rank that resets tomorrow rather than a child.
 */
export function OverviewRankingCard({
  academyId,
  audience,
  preferredClassId,
}: {
  academyId: string;
  audience: 'student' | 'staff';
  /** The teacher overview's explicit class filter; absent means first allowed. */
  preferredClassId?: string | null;
}) {
  const { t } = useTranslation('points');
  const locale = useLocale();
  const preferred = preferredClassId ?? null;
  const [selection, setSelection] = React.useState({
    classId: preferred,
    preferred,
  });
  // A teacher changing the overview's class starts this card at that class.
  // A choice made inside the card remains local until the parent preference
  // itself changes; no effect is needed to mirror one piece of state into
  // another.
  const classId = selection.preferred === preferred ? selection.classId : preferred;

  const result = useQuery({
    queryKey: ['overview-points-board', academyId, classId ?? 'first'],
    queryFn: () =>
      orpc.points.getOverviewBoard({
        academyId,
        ...(classId ? { classId } : {}),
      }),
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 30_000,
  });

  if (!result.data) {
    return result.isError ? (
      <Panel icon={Trophy} title={t('preview.title')} tone="primary">
        <div className="p-4" role="alert">
          <p className="text-[13px] font-semibold text-sub">
            {t('preview.unavailable')}
          </p>
          <button
            className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12.5px] font-bold text-ink transition-colors hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onClick={() => void result.refetch()}
            type="button"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            {t('preview.retry')}
          </button>
        </div>
      </Panel>
    ) : (
      <RankingSkeleton />
    );
  }

  const { leaderboard, period } = result.data;
  const selectedClassId = leaderboard.classId;
  const selectedClass = leaderboard.classes.find(
    (entry) => entry.classId === selectedClassId,
  );
  const isStale = result.isFetching || result.isPlaceholderData;
  const date = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: period.timeZone,
  }).format(new Date(period.startsAt));
  const fullHref = selectedClassId
    ? `/studio/academies/${academyId}/points${
        audience === 'staff' ? '/classes' : ''
      }?period=day&classId=${selectedClassId}`
    : null;

  return (
    <Panel
      actions={
        fullHref && !isStale ? (
          <Link
            className="inline-flex items-center gap-1 text-[12.5px] font-bold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            href={fullHref}
          >
            {t('preview.open')}
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        ) : fullHref ? (
          <span className="inline-flex items-center gap-1 text-[12.5px] font-bold text-sub opacity-60">
            {t('preview.open')}
            <ArrowRight aria-hidden className="size-3.5" />
          </span>
        ) : null
      }
      description={t('preview.description')}
      icon={Trophy}
      meta={
        leaderboard.eligible
          ? t('preview.participants', { count: leaderboard.participants })
          : undefined
      }
      scope={t('preview.scope', { date })}
      title={t('preview.title')}
      tone="primary"
    >
      <div
        className={cn(
          'transition-opacity motion-reduce:transition-none',
          isStale && 'opacity-60',
        )}
      >
        {leaderboard.classes.length > 1 ? (
          <div className="border-b border-border px-4 py-3">
            <FilterSelector
              disabled={isStale}
              icon={School}
              label={t('preview.class_label')}
              onChange={(value) => {
                if (value) setSelection({ classId: value, preferred });
              }}
              options={leaderboard.classes.map((entry) => ({
                label: entry.name,
                value: entry.classId,
              }))}
              value={selectedClassId}
            />
          </div>
        ) : selectedClass ? (
          <p className="border-b border-border px-4 py-2.5 text-[12.5px] font-semibold text-sub">
            {selectedClass.name}
          </p>
        ) : null}

        {leaderboard.eligible ? (
          <>
            <ol aria-label={t('preview.list_label')}>
              {leaderboard.rows.map((row, index) => (
                <RankingRow
                  key={`${index}:${row.position}:${row.displayName}`}
                  row={row}
                />
              ))}
            </ol>
            {leaderboard.viewer ? <ViewerFooter row={leaderboard.viewer} /> : null}
          </>
        ) : (
          <RankingEmpty
            onRetry={() => void result.refetch()}
            reason={leaderboard.reason}
          />
        )}
      </div>
    </Panel>
  );
}

function RankingRow({ row }: { row: LeaderboardRow }) {
  const { t } = useTranslation('points');
  const locale = useLocale();

  return (
    <li
      aria-label={t('preview.row_label', {
        name: row.displayName,
        points: formatNumber(row.points, locale),
        position: formatNumber(row.position, locale),
      })}
      className={cn(
        'flex min-h-14 items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0',
        row.isYou && 'bg-brand-soft shadow-[inset_3px_0_0_var(--brand)]',
      )}
    >
      <span className="flex w-10 shrink-0 justify-center">
        <PositionMarker position={row.position} />
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2.5">
        <ProfileAvatar
          {...row.avatar}
          className="hidden sm:inline-flex"
          name={row.displayName}
          size="sm"
        />
        <span className="truncate text-[13.5px] font-semibold text-ink">
          {row.displayName}
        </span>
        {row.isYou ? (
          <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[10.5px] font-bold text-on-brand">
            {t('preview.you')}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 font-mono text-[15px] font-bold tabular-nums text-ink">
        {formatNumber(row.points, locale)}
        <span className="ml-0.5 text-[12px] font-semibold text-sub">P</span>
      </span>
    </li>
  );
}

function ViewerFooter({ row }: { row: LeaderboardRow }) {
  const { t } = useTranslation('points');
  const locale = useLocale();
  return (
    <div className="flex items-center gap-3 border-t border-brand/20 bg-brand-soft px-4 py-3 shadow-[inset_3px_0_0_var(--brand)]">
      <span className="flex w-10 shrink-0 justify-center">
        <PositionMarker position={row.position} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10.5px] font-bold uppercase tracking-[0.08em] text-brand">
          {t('preview.your_place')}
        </span>
        <span className="block truncate text-[13px] font-semibold text-ink">
          {row.displayName}
        </span>
      </span>
      <span className="shrink-0 font-mono text-[15px] font-bold tabular-nums text-ink">
        {formatNumber(row.points, locale)}
        <span className="ml-0.5 text-[12px] font-semibold text-sub">P</span>
      </span>
    </div>
  );
}

function PositionMarker({ position }: { position: number }) {
  const { t } = useTranslation('points');
  const locale = useLocale();
  const marker = rankMarker(position);
  if (marker.kind === 'plain') {
    return (
      <span className="font-mono text-center text-[13px] font-bold tabular-nums text-sub">
        {t('plate.rank_short', { position: formatNumber(position, locale) })}
      </span>
    );
  }

  const Icon = marker.icon;
  return (
    <span
      aria-hidden
      className={cn('grid size-8 place-items-center rounded-lg', marker.chip)}
    >
      <Icon className="size-4" strokeWidth={2.25} />
    </span>
  );
}

function RankingEmpty({
  onRetry,
  reason,
}: {
  onRetry: () => void;
  reason: 'TOO_FEW_STUDENTS' | 'NO_ACTIVITY_YET' | 'NOT_ENROLLED' | 'UNAVAILABLE';
}) {
  const { t } = useTranslation('points');
  const copy = {
    TOO_FEW_STUDENTS: ['board.too_few', 'board.too_few_hint'],
    NO_ACTIVITY_YET: ['board.quiet', 'preview.quiet_hint'],
    NOT_ENROLLED: ['board.not_enrolled', 'board.not_enrolled_hint'],
    UNAVAILABLE: ['board.unavailable', 'preview.unavailable'],
  } as const;
  const [title, body] = copy[reason];

  return (
    <div className="p-5 text-center" role={reason === 'UNAVAILABLE' ? 'alert' : undefined}>
      <p className="text-[13.5px] font-bold text-ink">{t(title)}</p>
      <p className="mx-auto mt-1 max-w-xl text-[12.5px] leading-[1.6] text-sub">
        {t(body)}
      </p>
      {reason === 'UNAVAILABLE' ? (
        <button
          className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12.5px] font-bold text-ink transition-colors hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={onRetry}
          type="button"
        >
          <RotateCcw aria-hidden className="size-3.5" />
          {t('preview.retry')}
        </button>
      ) : null}
    </div>
  );
}

function RankingSkeleton() {
  const { t } = useTranslation('points');
  return (
    <Panel icon={Trophy} title={t('preview.title')} tone="primary">
      <div aria-hidden className="animate-pulse motion-reduce:animate-none">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            className="flex h-14 items-center gap-3 border-b border-border px-4 last:border-b-0"
            key={index}
          >
            <span className="size-8 rounded-lg bg-muted" />
            <span className="h-3.5 w-36 rounded bg-muted" />
            <span className="ml-auto h-4 w-12 rounded bg-muted" />
          </div>
        ))}
      </div>
    </Panel>
  );
}
