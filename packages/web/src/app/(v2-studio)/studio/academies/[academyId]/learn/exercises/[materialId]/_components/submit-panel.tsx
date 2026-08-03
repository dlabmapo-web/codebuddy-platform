'use client';

import { summarizeOutcomes, type CaseOutcome } from '@cove/shared';
import {
  AlertTriangle,
  Check,
  CircleDashed,
  LoaderCircle,
  X,
} from 'lucide-react';
import * as React from 'react';

import { useErrorText } from '@/i18n/client/use-error-text';
import { useLayoutTranslation } from '@/i18n';

import type { SubmissionState } from '../_hooks/use-submission';

const outcomeIcon: Record<CaseOutcome, React.ElementType> = {
  PASSED: Check,
  WRONG_OUTPUT: X,
  RUNTIME_ERROR: AlertTriangle,
  TIME_LIMIT: AlertTriangle,
  MEMORY_LIMIT: AlertTriangle,
  SKIPPED: CircleDashed,
};

const outcomeClass: Record<CaseOutcome, string> = {
  PASSED: 'bg-success/15 text-success',
  WRONG_OUTPUT: 'bg-danger/15 text-danger',
  RUNTIME_ERROR: 'bg-danger/15 text-danger',
  TIME_LIMIT: 'bg-warning/20 text-warning',
  MEMORY_LIMIT: 'bg-warning/20 text-warning',
  SKIPPED: 'bg-white/5 text-[#6b7280]',
};

export function SubmitPanel({ submission }: { submission: SubmissionState }) {
  const { t } = useLayoutTranslation('learn');
  const errorText = useErrorText();
  const { result, cells, submitting, error } = submission;

  if (!submitting && !result && !error) return null;

  const summary = result ? summarizeOutcomes(result.cases) : null;
  const judgeFault = result?.status === 'ERRORED';

  return (
    <section className="shrink-0 border-t border-white/10 bg-[#252526] px-3 py-2.5">
      <header className="mb-2 flex items-center gap-2">
        {submitting ? (
          <LoaderCircle className="size-3.5 animate-spin text-brand" />
        ) : null}
        <span className="text-[12.5px] font-bold text-[#d4d4d4]">
          {submitting
            ? t('submit.running')
            : judgeFault
              ? t('submit.judge_error')
              : result?.status === 'PASSED'
                ? t('submit.passed')
                : t('submit.failed')}
        </span>
        {result && !judgeFault ? (
          <span className="text-[12px] text-[#8c8c8c]">
            {t('submit.case_summary', {
              passed: result.passedCount,
              total: result.totalCount,
            })}
            {result.runtimeMs === null
              ? null
              : ` · ${t('submit.runtime', { ms: result.runtimeMs })}`}
          </span>
        ) : null}
      </header>

      {error ? (
        <p className="rounded-md bg-danger/10 px-2.5 py-2 text-[12.5px] text-danger">
          {errorText(error)}
        </p>
      ) : null}

      {/* Fills in as cases report, so the student watches progress rather than
          an opaque spinner. Positions stay fixed so it never reflows. */}
      <ol className="flex flex-wrap gap-1.5">
        {cells.map((cell) => {
          const Icon =
            cell.state === 'done' ? outcomeIcon[cell.outcome] : CircleDashed;
          return (
            <li
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11.5px] font-bold ${
                cell.state === 'done'
                  ? outcomeClass[cell.outcome]
                  : 'bg-white/5 text-[#6b7280]'
              }`}
              key={cell.position}
              title={
                cell.state === 'done'
                  ? t(`submit.outcome.${cell.outcome}`)
                  : t('submit.outcome_pending')
              }
            >
              <Icon className={cell.state === 'done' ? 'size-3' : 'size-3 animate-pulse'} />
              {cell.position}
            </li>
          );
        })}
      </ol>

      {summary && summary.skipped > 0 ? (
        // Early exit stops at the first failure; without saying so, the
        // remaining greyed cases read as unexplained.
        <p className="mt-2 text-[11.5px] text-[#8c8c8c]">
          {t('submit.stopped_early', { count: summary.skipped })}
        </p>
      ) : null}

      {result?.cases
        .filter((item) => item.isSample && item.outcome === 'WRONG_OUTPUT')
        .slice(0, 1)
        .map((item) => (
          <div className="mt-2 grid gap-2 sm:grid-cols-2" key={item.position}>
            <Diff label={t('submit.expected')} value={item.expectedOutput ?? ''} />
            <Diff label={t('submit.actual')} value={item.actualOutput ?? ''} />
          </div>
        ))}

      {result && !judgeFault && result.status !== 'PASSED' ? (
        <p className="mt-2 text-[11.5px] text-[#8c8c8c]">
          {t('submit.hidden_note')}
        </p>
      ) : null}
    </section>
  );
}

function Diff({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 font-mono text-[10.5px] font-bold uppercase tracking-wider text-[#8c8c8c]">
        {label}
      </div>
      <pre className="max-h-24 overflow-auto rounded-md bg-[#1e1e1e] px-2 py-1.5 font-mono text-[11.5px] leading-[1.5] text-[#d4d4d4]">
        {value || ' '}
      </pre>
    </div>
  );
}
