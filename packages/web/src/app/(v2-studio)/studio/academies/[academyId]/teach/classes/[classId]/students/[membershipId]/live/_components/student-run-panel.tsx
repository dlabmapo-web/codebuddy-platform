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
 * What the student's own terminal is showing.
 *
 * The output arrives as the summary the student's client publishes — the same
 * text on their screen, and nothing else. Hidden cases have no field here and
 * never will, so a teacher reading this pane learns exactly what the student
 * can already see.
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

  if (!run && !result) {
    return (
      <p className="px-3 py-2 font-mono text-[12.5px] text-[#8C8C8C]">
        {t('workspace.no_run')}
      </p>
    );
  }

  const lifecycle = run ? lifecycleStyles[run.lifecycle] : null;
  const Icon = lifecycle?.icon;

  return (
    <div className="px-3 py-2">
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

          {run.output ? (
            <pre className="mt-2 whitespace-pre-wrap font-mono text-[12.5px] leading-[1.65] text-[#D4D4D4]">
              {run.output}
            </pre>
          ) : (
            <p className="mt-2 font-mono text-[12.5px] text-[#8C8C8C]">
              {t('workspace.run_empty')}
            </p>
          )}
        </>
      ) : null}

      {result ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
          <p className="font-mono text-[11.5px] font-bold uppercase tracking-wider text-[#8C8C8C]">
            {t('workspace.result_title')}
          </p>
          <p className="mt-1 font-mono text-[12.5px] text-[#D4D4D4]">
            {t('workspace.result_score', { score: result.score })} ·{' '}
            {t('workspace.result_cases', {
              passed: result.passedCount,
              total: result.totalCount,
            })}
          </p>
        </div>
      ) : null}
    </div>
  );
}
