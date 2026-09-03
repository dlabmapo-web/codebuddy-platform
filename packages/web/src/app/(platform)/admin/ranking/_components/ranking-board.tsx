'use client';

import type { ClassPointsState, PointsPeriodKind } from '@cove/shared';
import { ArrowRight, Building2, Users, X } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { ClassLeaderboard } from '@/app/(studio)/academy/[academySlug]/(framed)/points/_components/class-leaderboard';
import {
  EmptyState,
  Panel,
} from '@/app/(studio)/academy/[academySlug]/(framed)/_components/overview-ui/panel';
import { cn } from '@/lib/utils';

import { useClassBoardQuery } from '../../_hooks/use-platform-ranking';

/**
 * One class's ranking, the same board the class's own manager reads.
 *
 * `ClassLeaderboard` off `points.getClassBoard` — the component and the
 * procedure the manager's page uses, not a console copy. §5.1 of the student
 * points design is the requirement: staff and students see the identical board
 * from the identical query, so nobody comparing screens sees two different
 * third places. An operator is one more reader of that same board.
 *
 * ## It is not wrapped in a panel
 *
 * `ClassLeaderboard` *is* a panel — it renders its own header, its own trophy,
 * its own participant count and period. Wrapping it in a second one produced
 * two nested cards with the same title on both, which is what the manager's own
 * page avoids by rendering it bare. The only chrome added here is the line
 * above it naming which class is open, because that question is answered by a
 * picker on the manager's page and by a table row on this one.
 *
 * The class picker inside the board's toolbar is hidden for the same reason:
 * the table above has already chosen, and the same control twice on one screen
 * is how two controls end up disagreeing.
 *
 * ## What it adds, and it is one thing
 *
 * A link per row into that student's ledger — the manager's own row action,
 * pointed at the console's mount of the same page. It is what makes "why does
 * 지호 have forty points" answerable from here rather than being the start of a
 * second support call.
 */
export function RankingBoard({
  academyId,
  academyName,
  academySlug,
  classId,
  className,
  from,
  onClose,
  onSelectPeriod,
  period,
  state,
}: {
  academyId: string;
  academyName: string | null;
  /** Null until the row is on the page the table is showing. */
  academySlug: string | null;
  classId: string;
  className: string | null;
  /** This page's address, so the ledger's Back returns to it with its filters. */
  from: string;
  onClose: () => void;
  onSelectPeriod: (period: PointsPeriodKind) => void;
  period: PointsPeriodKind;
  state: ClassPointsState | null;
}) {
  const { t } = useTranslation('platform-ranking');
  const { t: points } = useTranslation('points');

  // Points switched off is a fact the table already holds, so the board says so
  // rather than firing a request the API would refuse with `POINTS_UNAVAILABLE`
  // and rendering that refusal as an error.
  const off = state === 'points_off';
  const result = useClassBoardQuery(off ? null : academyId, classId, period);

  return (
    <section aria-label={t('board.title')} className="grid gap-2.5">
      {/* Which class is open, and the way out of it. The manager's page needs
          neither: their class comes from a picker that stays on screen. */}
      <div className="flex flex-wrap items-center gap-2.5 px-1">
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="grid size-6 shrink-0 place-items-center rounded-lg bg-muted text-sub"
          >
            <Building2 className="size-3.5" strokeWidth={2.5} />
          </span>
          <span className="truncate text-[14px] font-bold text-ink">
            {className ?? t('board.title')}
          </span>
          {academyName ? (
            <span className="truncate text-[13px] text-sub">
              {academyName}
            </span>
          ) : null}
          {academySlug ? (
            <span className="truncate font-mono text-[12px] text-sub">
              /{academySlug}
            </span>
          ) : null}
        </span>

        <button
          className={cn(
            'ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5',
            'text-[13px] font-bold text-sub transition-colors hover:border-brand hover:text-brand',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
          )}
          onClick={onClose}
          type="button"
        >
          <X aria-hidden className="size-3.5" />
          {t('board.close')}
        </button>
      </div>

      {off ? (
        <Panel icon={Users} title={t('board.title')} tone="warning">
          <EmptyState
            body={t('state.points_off_body')}
            icon={Users}
            title={t('state.points_off')}
            tone="warning"
          />
        </Panel>
      ) : result.isError ? (
        <Panel icon={Users} title={t('board.title')} tone="danger">
          <EmptyState
            body={t('board.unavailable_body')}
            icon={Users}
            title={t('board.unavailable')}
            tone="danger"
          />
        </Panel>
      ) : (
        <div
          className={cn(
            result.isPlaceholderData && 'opacity-60 transition-opacity',
          )}
        >
          <ClassLeaderboard
            board={result.data?.leaderboard ?? null}
            hideClassFilter
            // Both are owned by the page: the class by the table's selection,
            // the period by the toggle in the table's header. The board reads
            // that state here, and never owns it.
            onSelectClass={() => {}}
            onSelectPeriod={onSelectPeriod}
            periodKind={period}
            periodLabel={points(`period.${period}`)}
            rowAction={(row) =>
              academySlug ? (
                <Link
                  aria-label={points('staff.open_points_aria', {
                    name: row.displayName,
                  })}
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2.5 py-1.5 text-[13px] font-bold text-sub transition-colors hover:border-brand hover:text-brand"
                  href={`/admin/academies/${academySlug}/points/students/${row.membershipId}?from=${encodeURIComponent(from)}`}
                >
                  {points('staff.open_points')}
                  <ArrowRight aria-hidden className="size-3.5" />
                </Link>
              ) : null
            }
          />
        </div>
      )}
    </section>
  );
}
