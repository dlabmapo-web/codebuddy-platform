'use client';

import { formatDate, formatNumber } from '@cove/i18n/format';
import type { PointsPage } from '@cove/shared';
import { CalendarDays } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useLocale } from '@/i18n';

import { PointLedger } from './point-ledger';
import { PointRulesPanel } from './point-rules';

/**
 * One student's points, for a member of staff.
 *
 * The plate is deliberately not reused. §11.2's signature element is a gap to
 * chase, written in the second person to the child it is about — a teacher
 * reading it about somebody else's nine-year-old is the wrong voice, and "you
 * are 6 points behind" is nonsense on this page. What a teacher needs is the
 * total, the period it covers, and every line that produced it.
 *
 * The rules panel stays, because the question this page answers is usually
 * "where did that number come from" and the answer is half in the ledger and
 * half in what each action pays.
 *
 * Nothing here can write. There is no award control, no adjustment, and no
 * void — the API has no method for the first two, and the correction path in
 * §7.6 is deliberately not exposed yet.
 */
export function StudentPointsLedger({
  academyId,
  membershipId,
  page,
}: {
  academyId: string;
  membershipId: string;
  page: PointsPage;
}) {
  const { t } = useTranslation('points');
  const locale = useLocale();

  const rangeLabel =
    page.period.startDate === page.period.endDate
      ? formatDate(page.period.startDate, locale)
      : `${formatDate(page.period.startDate, locale)} – ${formatDate(
          page.period.endDate,
          locale,
        )}`;

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-card border border-border bg-card px-5 py-5">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-brand">
            {t(`period.${page.period.kind}`)}
          </p>
          <p className="flex items-center gap-1.5 text-sm text-sub">
            <CalendarDays aria-hidden className="size-4" />
            {rangeLabel}
          </p>
        </header>

        <p className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2">
          <span className="font-mono text-4xl font-semibold leading-none tabular-nums text-brand">
            {t('plate.total', {
              points: formatNumber(page.standing.points, locale),
            })}
          </span>
          <span className="text-sm text-sub">
            {t('student.solved', {
              count: page.standing.solvedProblems,
            })}
          </span>
        </p>
      </section>

      <PointLedger
        academyId={academyId}
        classId={page.leaderboard?.classId ?? null}
        initialPage={page.ledger}
        membershipId={membershipId}
      />

      <PointRulesPanel rules={page.rules} />
    </div>
  );
}
