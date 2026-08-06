'use client';

import type { ResultChangedEvent, RunActivityPayload } from '@cove/shared';
import { CircleCheck, CircleX, LoaderCircle, MinusCircle } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useLocale } from '@/i18n';

const lifecycleStyles = {
  STARTED: { icon: LoaderCircle, tone: 'text-[#9CDCFE]', spin: true },
  COMPLETED: { icon: CircleCheck, tone: 'text-[#4ADE80]', spin: false },
  FAILED: { icon: CircleX, tone: 'text-[#F87171]', spin: false },
  CANCELLED: { icon: MinusCircle, tone: 'text-[#a5a5a5]', spin: false },
} as const;

/**
 * How the student's latest run went, above the terminal that shows it.
 *
 * Metadata only: when it ran, how it ended, and the latest graded verdict. The
 * output itself belongs to the mirrored terminal below, and restating it here
 * is how a teacher ends up comparing two copies of the same text and wondering
 * which of them is current.
 */
export function StudentRunPanel({
  result,
  run,
}: {
  result: ResultChangedEvent | null;
  run: RunActivityPayload | null;
}) {
  const { t } = useTranslation('monitoring');
  const locale = useLocale();
  const time = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { timeStyle: 'medium' }),
    [locale],
  );

  // The terminal underneath says what an absent run looks like; two
  // placeholders for one absence would be one too many.
  if (!run && !result) return null;

  const lifecycle = run ? lifecycleStyles[run.lifecycle] : null;
  const Icon = lifecycle?.icon;

  return (
    <div className="border-b border-white/10 px-3 py-2">
      {run && lifecycle && Icon ? (
        <>
          <p
            className={`flex items-center gap-1.5 font-mono text-[12px] font-semibold ${lifecycle.tone}`}
          >
            <Icon
              aria-hidden
              className={`size-3.5 shrink-0 ${
                lifecycle.spin ? 'motion-safe:animate-spin' : ''
              }`}
            />
            {/* A run of one test reports how it went; a plain run of the whole
                file has no score to report, only that it happened. */}
            {run.sampleCount > 0
              ? t(`run.${run.lifecycle}`, {
                  passed: run.passedCount,
                  total: run.sampleCount,
                })
              : t(`run_plain.${run.lifecycle}`)}
            <span className="font-normal text-[#8C8C8C]">
              {time.format(new Date(run.at))}
            </span>
          </p>
        </>
      ) : null}

      {result ? (
        <p className="mt-1 font-mono text-[12px] text-[#8C8C8C]">
          <span className="font-bold uppercase tracking-wider">
            {t('workspace.result_title')}
          </span>{' '}
          {t('workspace.result_score', { score: result.score })} ·{' '}
          {t('workspace.result_cases', {
            passed: result.passedCount,
            total: result.totalCount,
          })}
        </p>
      ) : null}
    </div>
  );
}
