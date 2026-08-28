'use client';

import type {
  TeacherAttentionKind,
  TeacherAttentionReason,
} from '@cove/shared';
import type { TFunction } from 'i18next';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { attentionTone, durationDisplay } from '../_lib/progress-view';

/**
 * Why a student is on the list, in the words a teacher would use to a student.
 *
 * This is the one place the page raises its voice, and it spends that on a
 * sentence rather than on a colour: "Failed 4 times in a row" is something a
 * teacher can act on, and a severity dot is not. The icon and the warm tone are
 * reinforcement — remove both and every reason is still fully readable, which
 * is what §18 requires of a state that must not depend on colour.
 *
 * Nothing here ranks anybody. There is no score, no comparison, and no
 * ordering between the three reasons beyond the fixed one they print in.
 */

export function AttentionChip({
  className,
  reason,
}: {
  className?: string;
  reason: TeacherAttentionReason;
}) {
  const { t } = useTranslation('teach');

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold',
        attentionTone,
        className,
      )}
    >
      <AlertTriangle aria-hidden className="size-3.5 shrink-0" />
      {reasonText(reason, t)}
    </span>
  );
}

/**
 * Every current reason for one exercise, or nothing at all.
 *
 * Coexisting reasons are all shown: a student can be failing repeatedly *and*
 * have spent an hour on the last attempt, and collapsing that into the
 * "worst" one would hide the half a teacher needs.
 */
export function AttentionReasons({
  reasons,
  compact = false,
}: {
  reasons: TeacherAttentionReason[];
  compact?: boolean;
}) {
  const { t } = useTranslation('teach');

  if (reasons.length === 0) {
    return (
      <span className="text-[12.5px] text-sub">
        <span aria-hidden>—</span>
        <span className="sr-only">{t('progress.roster.no_attention')}</span>
      </span>
    );
  }

  return (
    <ul className={cn('flex flex-wrap gap-1.5', compact && 'gap-1')}>
      {reasons.map((reason) => (
        <li key={reason.kind}>
          <AttentionChip reason={reason} />
        </li>
      ))}
    </ul>
  );
}

/**
 * A roster row's summary: which kinds, and how many problems.
 *
 * The row shows kinds rather than full sentences because the numbers differ
 * per problem, and a row that said "failed 4 times in a row" across three
 * problems would be stating something untrue. The sentences appear in the
 * student's own detail, beside the problem each belongs to.
 */
export function AttentionSummary({
  count,
  kinds,
}: {
  count: number;
  kinds: TeacherAttentionKind[];
}) {
  const { t } = useTranslation('teach');

  if (count === 0 || kinds.length === 0) {
    return (
      <span className="text-[12.5px] text-sub">
        <span aria-hidden>—</span>
        <span className="sr-only">{t('progress.roster.no_attention')}</span>
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {kinds.map((kind) => (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold',
            attentionTone,
          )}
          key={kind}
        >
          <AlertTriangle aria-hidden className="size-3.5 shrink-0" />
          {t(`progress.attention.short_${kind}`)}
        </span>
      ))}
      <span className="text-[12px] text-sub">
        {t('progress.roster.attention_problems', { count })}
      </span>
    </div>
  );
}

function reasonText(
  reason: TeacherAttentionReason,
  t: TFunction<'teach'>,
): string {
  if (reason.kind !== 'long_solve') {
    return t(`progress.attention.${reason.kind}`, { count: reason.value });
  }
  // The threshold is measured in seconds and read in minutes: "1,800" is not
  // something anybody acts on.
  const display = durationDisplay(reason.value);
  const duration =
    display.kind === 'hours'
      ? t('progress.duration.hours', {
          hours: display.hours,
          minutes: display.minutes,
        })
      : display.kind === 'minutes'
        ? t('progress.duration.minutes', {
            minutes: display.minutes,
            seconds: display.seconds,
          })
        : display.kind === 'seconds'
          ? t('progress.duration.seconds', { seconds: display.seconds })
          : t('progress.duration.missing');
  return t('progress.attention.long_solve', { duration });
}
