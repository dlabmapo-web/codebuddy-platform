'use client';

import { routes } from '@/lib/routes';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import type { ClassPointsBoard, PointsPeriodKind } from '@cove/shared';
import { pointsPeriodKinds } from '@cove/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowRight, School, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { orpc } from '@/lib/orpc';

import { EmptyState } from '../../../_components/overview-ui/panel';
import { FilterSelector } from '../../../_components/teacher-overview/filter-selector';
import { ClassLeaderboard } from '../../_components/class-leaderboard';

/**
 * Every class's ranking, in one place, for the people who run the academy.
 *
 * A manager and a team lead hold every class, and reaching a ranking through
 * one class's detail page meant navigating to a class to ask a question that
 * is not about that class — "who is doing the work this week" is an academy
 * question, and answering it for twelve classes cost twelve navigations. A
 * teacher keeps the in-class board instead, and that is the right shape for
 * them: they hold two or three classes, they arrive at one to teach it, and
 * the ranking is context on a page they were already on.
 *
 * ## What it does not become
 *
 * There is no academy-wide ranking here and there is no field in the contract
 * for one. §10.2 — a student can move a position in a room of eighteen and
 * cannot move one in an academy of four hundred, and a list of every child in
 * the academy would mostly rank enrolment date. This page ranks *within* a
 * class; the class is chosen, never merged.
 *
 * The board is the same component a student sees, off the same query, so a
 * manager and a child comparing screens never see two different third places.
 * The one addition is a link per row into that student's own ledger, which is
 * what makes "why does 지호 have forty points" answerable from here — §5.1.
 */
export function ClassRankingWorkspace({ academyId }: { academyId: string }) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('points');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  // The address holds both, so a manager can send "3반, this month" to a
  // colleague and have them open the same screen.
  const parsed = React.useMemo(() => {
    const params = new URLSearchParams(searchKey);
    const period = params.get('period');
    return {
      classId: params.get('classId'),
      period: (pointsPeriodKinds as readonly string[]).includes(period ?? '')
        ? (period as PointsPeriodKind)
        : ('day' as PointsPeriodKind),
    };
  }, [searchKey]);

  const [query, setQuery] = React.useState(parsed);
  const [urlKey, setUrlKey] = React.useState(searchKey);
  if (urlKey !== searchKey) {
    // A real navigation — Back, or a shared link. Adopt it.
    setUrlKey(searchKey);
    setQuery(parsed);
  }

  const update = React.useCallback(
    (next: Partial<typeof query>) => {
      const merged = { ...query, ...next };
      setQuery(merged);
      const params = new URLSearchParams();
      if (merged.classId) params.set('classId', merged.classId);
      if (merged.period !== 'day') params.set('period', merged.period);
      const search = params.toString();
      setUrlKey(search);
      // `replaceState`, so switching period four times does not leave Back
      // walking through four of them.
      window.history.replaceState(null, '', `${pathname}${search ? `?${search}` : ''}`);
    },
    [pathname, query],
  );

  const result = useQuery({
    queryKey: ['staff-class-board', academyId, query.classId, query.period],
    queryFn: () =>
      orpc.points.getClassBoard({
        academyId,
        period: query.period,
        ...(query.classId ? { classId: query.classId } : {}),
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const board: ClassPointsBoard | undefined = result.data;
  const classes = board?.leaderboard.classes ?? [];
  // The server picked the first class when the address named none. Reading it
  // back means the picker shows what the table is actually showing rather than
  // an empty trigger over a full board.
  const selectedClassId = query.classId ?? board?.leaderboard.classId ?? null;

  if (board && classes.length === 0) {
    return (
      <EmptyState
        body={t('staff.no_classes_hint')}
        icon={Users}
        title={t('staff.no_classes')}
        tone="primary"
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelector
          disabled={classes.length === 0}
          icon={School}
          label={t('staff.class_label')}
          onChange={(classId) => {
            if (classId) update({ classId });
          }}
          options={classes.map((entry) => ({
            label: entry.name,
            value: entry.classId,
          }))}
          triggerClassName="h-10"
          value={selectedClassId}
        />
        <PeriodToggle
          onSelect={(period) => update({ period })}
          value={query.period}
        />
      </div>

      <div
        className={cn(
          result.isPlaceholderData && 'opacity-60 transition-opacity',
        )}
      >
        <ClassLeaderboard
          board={board?.leaderboard ?? null}
          // The picker above already chose the class; a second one inside the
          // table's toolbar would be the same control twice on one screen.
          hideClassFilter
          onSelectClass={(classId) => update({ classId })}
          onSelectPeriod={(period) => update({ period })}
          periodKind={query.period}
          periodLabel={t(`period.${query.period}`)}
          rowAction={(row) => (
            <Link
              aria-label={t('staff.open_points_aria', { name: row.displayName })}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2.5 py-1.5 text-[13px] font-bold text-sub transition-colors hover:border-brand hover:text-brand"
              href={`${routes.academy(academySlug)}/points/students/${row.membershipId}`}
            >
              {t('staff.open_points')}
              <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          )}
        />
      </div>
    </div>
  );
}

/** 오늘 / 이번 주 / 이번 달, the same control the student's page carries. */
function PeriodToggle({
  onSelect,
  value,
}: {
  onSelect: (period: PointsPeriodKind) => void;
  value: PointsPeriodKind;
}) {
  const { t } = useTranslation('points');
  return (
    <div
      aria-label={t('period.label')}
      className="inline-flex rounded-xl border border-border bg-card p-1 shadow-[var(--shadow-card)]"
      role="tablist"
    >
      {pointsPeriodKinds.map((kind) => (
        <button
          aria-selected={kind === value}
          className={cn(
            'rounded-lg px-3.5 py-1.5 text-[13px] font-bold transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
            kind === value
              ? 'bg-brand text-on-brand'
              : 'text-sub hover:bg-brand-soft hover:text-brand',
          )}
          key={kind}
          onClick={() => onSelect(kind)}
          role="tab"
          type="button"
        >
          {t(`period.${kind}`)}
        </button>
      ))}
    </div>
  );
}
