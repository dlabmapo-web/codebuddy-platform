'use client';

import type { PointsPeriodKind } from '@cove/shared';
import { pointsPeriodKinds } from '@cove/shared';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { orpc } from '@/lib/orpc';
import { cn } from '@/lib/utils';

import { ClassLeaderboard } from '../../points/_components/class-leaderboard';

/**
 * The class board, as staff see it.
 *
 * §5.1 — the identical board their students see: same component, same query,
 * same ordering, same numbers. A teacher and a student comparing their screens
 * must never see two different third places, and one implementation is the
 * only way to guarantee that. The one difference is that no row is marked
 * `isYou`, because the reader is not in the class.
 *
 * It renders nothing at all when the academy does not run a points economy.
 * A staff page must not explain a feature this academy chose not to use, and
 * a `NOT_FOUND` from the flag check is that answer rather than an error worth
 * showing.
 */
export function ClassPointsBoard({
  academyId,
  classId,
}: {
  academyId: string;
  classId: string;
}) {
  const { t } = useTranslation('points');
  const [period, setPeriod] = React.useState<PointsPeriodKind>('day');

  const board = useQuery({
    queryKey: ['class-points-board', academyId, classId, period],
    queryFn: () => orpc.points.getClassBoard({ academyId, classId, period }),
    placeholderData: keepPreviousData,
    // The flag is off, or this reader may not open this class. Neither is
    // worth a retry storm behind a panel that is about to render nothing.
    retry: false,
    staleTime: 30_000,
  });

  if (board.isError || (!board.data && !board.isPending)) return null;
  if (!board.data) return null;

  return (
    <div
      className={cn(
        'flex flex-col gap-3',
        board.isPlaceholderData && 'opacity-60 transition-opacity',
      )}
    >
      <StaffPeriodToggle onSelect={setPeriod} value={period} />
      <ClassLeaderboard
        board={board.data.leaderboard}
        // Staff arrive here from one class's own page. The board now carries
        // every class they may read, for the academy-wide ranking page — but
        // offering that list here would be a second, worse class switcher
        // beside the one they navigated through.
        hideClassFilter
        onSelectClass={() => undefined}
        onSelectPeriod={setPeriod}
        periodKind={period}
        periodLabel={t(`period.${period}`)}
      />
    </div>
  );
}

/**
 * Today / this week / this month.
 *
 * Local state rather than the URL, unlike the student's page. A teacher's
 * class page already owns its address, and a shared link to it should open on
 * the roster the sender meant rather than on a period they happened to leave
 * selected.
 */
function StaffPeriodToggle({
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
      className="inline-flex self-start rounded-lg border border-border bg-card p-0.5"
      role="tablist"
    >
      {pointsPeriodKinds.map((kind) => (
        <button
          aria-selected={kind === value}
          className={cn(
            'rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors',
            kind === value ? 'bg-brand text-on-brand' : 'text-sub hover:text-ink',
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
