'use client';

import type { PointsPage, PointsPeriodKind } from '@cove/shared';
import { formatDate } from '@cove/i18n/format';
import { pointsPeriodKinds } from '@cove/shared';
import { TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useLocale } from '@/i18n';
import { cn } from '@/lib/utils';

import { EmptyState } from '../../_components/overview-ui/panel';
import { usePointsPage } from '../_hooks/use-points-page';
import { ClassLeaderboard } from './class-leaderboard';
import { PointLedger } from './point-ledger';
import { PointRulesPanel } from './point-rules';
import { SeasonPlate } from './season-plate';

/**
 * The page, top to bottom, in one column.
 *
 * One column at every width, the same rule the teacher's and the manager's
 * overviews follow — and here it matters more than there, because horizontal
 * scroll on a leaderboard is how a child fails to find their own row.
 *
 * The order is deliberate: what you earned, where that puts you, how to earn
 * more, and then the receipts. A student who only reads the first screen has
 * still been told the two things the page exists to say.
 *
 * ## The hue sequence
 *
 * Four sections, four questions, and — following `overview-ui/panel.tsx` — one
 * hue each: brand blue asks *what did I earn*, action orange asks *where does
 * that put me*, violet asks *how do I earn more*, green asks *where did this
 * come from*. Violet on the rules panel rather than teal is the one deliberate
 * reassignment: teal already means measured time *inside* that panel, and a
 * section wearing the same hue as one of the chips it contains makes the chip
 * stop meaning anything.
 *
 * The one rule that does not bend, from `panel.tsx`: colour identifies a
 * section or a measurement, never a child.
 *
 * The page owns its own heading rather than taking the shell's, because the
 * period control belongs beside the title it governs. Floating alone above the
 * first card, it read as a control with nothing to control.
 */
export function PointsWorkspace({
  academyId,
  initialData,
}: {
  academyId: string;
  initialData: PointsPage | null;
}) {
  const { t } = useTranslation('points');
  const locale = useLocale();
  const { data, query, result, update } = usePointsPage({
    academyId,
    initialData,
  });

  const header = (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <h1 className="text-[1.7rem] font-extrabold leading-tight">
          {t('title')}
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-[1.65] text-sub">
          {t('description')}
        </p>
      </div>
      <PeriodToggle onSelect={(period) => update({ period })} value={query.period} />
    </div>
  );

  if (!data) {
    return (
      <>
        {header}
        <EmptyState
          body={t('board.unavailable')}
          icon={TriangleAlert}
          title={t('title')}
          tone="danger"
        />
      </>
    );
  }

  const periodLabel = t(`period.${data.period.kind}`);
  const rangeLabel =
    data.period.startDate === data.period.endDate
      ? formatDate(data.period.startDate, locale)
      : `${formatDate(data.period.startDate, locale)} – ${formatDate(
          data.period.endDate,
          locale,
        )}`;

  return (
    <>
      {header}

      <div
        className={cn(
          'flex flex-col gap-5',
          // The rows in hand stay on screen while the next period loads. On a
          // page whose point is a number moving, a flash of empty reads as a loss.
          result.isPlaceholderData && 'opacity-60 transition-opacity',
        )}
      >
        <SeasonPlate
          periodKind={data.period.kind}
          periodLabel={periodLabel}
          rangeLabel={rangeLabel}
          standing={data.standing}
        />

        {data.leaderboard !== null ? (
          <ClassLeaderboard
            board={data.leaderboard}
            onSelectClass={(classId) => update({ classId })}
            onSelectPeriod={(period) => update({ period })}
            periodKind={data.period.kind}
            periodLabel={periodLabel}
          />
        ) : null}

        <PointRulesPanel rules={data.rules} />

        {/* The period's last academy-local day is today whenever the reader is
            looking at the daily board, which is the only case where a day
            header can honestly say so. */}
        <PointLedger
          academyId={academyId}
          classId={data.leaderboard?.classId ?? null}
          initialPage={data.ledger}
          {...(data.period.kind === 'day' ? { today: data.period.endDate } : {})}
        />
      </div>
    </>
  );
}

/**
 * 오늘 / 이번 주 / 이번 달.
 *
 * A segmented control rather than a dropdown: three options a student switches
 * between constantly should cost one tap, and the one they are on should be
 * visible without opening anything.
 */
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
      className="inline-flex shrink-0 self-start rounded-xl border border-border bg-card p-1 shadow-[var(--shadow-card)]"
      role="tablist"
    >
      {pointsPeriodKinds.map((kind) => (
        <button
          aria-selected={kind === value}
          className={cn(
            'rounded-lg px-4 py-2 text-[13.5px] font-bold transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
            kind === value
              ? 'bg-brand text-on-brand shadow-[var(--shadow-card)]'
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
