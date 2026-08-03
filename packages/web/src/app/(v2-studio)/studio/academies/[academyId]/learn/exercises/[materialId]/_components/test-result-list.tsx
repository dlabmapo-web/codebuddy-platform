'use client';

import type {
  CaseCell,
  CaseOutcome,
  SubmissionCaseResult,
  SubmissionResult,
} from '@cove/shared';
import {
  Check,
  Clock3,
  LoaderCircle,
  MemoryStick,
  Minus,
  X,
} from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';

import { firstFailedSample, outcomeTone } from '../_lib/scoring';

const rowTone = {
  pass: {
    row: 'border-success/20 bg-success/[0.045]',
    icon: 'bg-success/15 text-success',
    outcome: 'text-success',
  },
  fail: {
    row: 'border-danger/25 bg-danger/[0.055]',
    icon: 'bg-danger/15 text-[#fb7185]',
    outcome: 'text-[#fb7185]',
  },
  limit: {
    row: 'border-warning/25 bg-warning/[0.055]',
    icon: 'bg-warning/15 text-warning',
    outcome: 'text-warning',
  },
  idle: {
    row: 'border-white/10 bg-white/[0.025]',
    icon: 'bg-white/[0.06] text-[#7b8394]',
    outcome: 'text-[#7b8394]',
  },
} as const;

export function TestResultList({
  cells,
  result,
}: {
  cells: CaseCell[];
  result: SubmissionResult | null;
}) {
  const { t } = useLayoutTranslation('learn');
  const resultByPosition = new Map(
    result?.cases.map((item) => [item.position, item]) ?? [],
  );
  const expandedPosition = firstFailedSample(result)?.position ?? null;

  if (cells.length === 0) return null;

  return (
    <section>
      <h4 className="mb-2 text-[12px] font-bold text-[#dbe2ee]">
        {t('submit.test_results')}
      </h4>
      <ol className="space-y-2">
        {cells.map((cell) => {
          const caseResult = resultByPosition.get(cell.position);
          const outcome = cell.state === 'done' ? cell.outcome : null;
          const tone = outcome ? outcomeTone[outcome] : 'idle';
          const visual = rowTone[tone];
          const Icon = outcomeIcon(outcome);
          const isSample =
            cell.state === 'done' ? cell.isSample : caseResult?.isSample;
          const expanded =
            caseResult !== undefined && cell.position === expandedPosition;
          const outcomeLabel = outcome
            ? t(`submit.outcome.${outcome}`)
            : t('submit.outcome_pending');

          return (
            <li
              aria-label={`${t('submit.case_n', { number: cell.position })}: ${outcomeLabel}`}
              className={`overflow-hidden rounded-xl border ${visual.row}`}
              key={cell.position}
            >
              <div className="flex min-w-0 items-center gap-3 px-3 py-2.5">
                <div
                  className={`grid size-8 shrink-0 place-items-center rounded-lg ${visual.icon}`}
                >
                  <Icon
                    aria-hidden
                    className={`size-4 ${outcome === null ? 'animate-spin motion-reduce:animate-none' : ''}`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12px] font-bold text-[#f1f5f9]">
                      {t('submit.case_n', { number: cell.position })}
                    </span>
                    {isSample ? (
                      <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-[#94a3b8]">
                        {t('submit.sample_case')}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-[10.5px] text-[#94a3b8]">
                    {outcome
                      ? t(`submit.outcome_detail.${outcome}`)
                      : t('submit.outcome_detail.PENDING')}
                    {caseResult?.runtimeMs === null || !caseResult
                      ? null
                      : ` · ${t('submit.runtime', { ms: caseResult.runtimeMs })}`}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-right text-[10.5px] font-bold ${visual.outcome}`}
                >
                  {outcomeLabel}
                </span>
              </div>

              {expanded ? <CaseDiff caseResult={caseResult} /> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function outcomeIcon(outcome: CaseOutcome | null) {
  switch (outcome) {
    case 'PASSED':
      return Check;
    case 'WRONG_OUTPUT':
    case 'RUNTIME_ERROR':
      return X;
    case 'TIME_LIMIT':
      return Clock3;
    case 'MEMORY_LIMIT':
      return MemoryStick;
    case 'SKIPPED':
      return Minus;
    default:
      return LoaderCircle;
  }
}

function CaseDiff({ caseResult }: { caseResult: SubmissionCaseResult }) {
  const { t } = useLayoutTranslation('learn');

  return (
    <div className="border-t border-danger/15 px-3 pb-3 pt-2.5">
      <p className="mb-2 text-[10.5px] leading-relaxed text-[#aab3c2]">
        {t('submit.compare_output')}
      </p>
      <div className="grid gap-2 min-[480px]:grid-cols-2">
        <Diff
          label={t('submit.expected')}
          value={caseResult.expectedOutput ?? ''}
        />
        <Diff
          label={t('submit.actual')}
          value={caseResult.actualOutput ?? ''}
        />
      </div>
    </div>
  );
}

function Diff({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 font-mono text-[9.5px] font-bold uppercase tracking-wider text-[#7f8998]">
        {label}
      </div>
      <pre className="max-h-28 overflow-auto rounded-lg bg-[#171717] px-2.5 py-2 font-mono text-[11.5px] leading-[1.5] text-[#d8dee9] ring-1 ring-inset ring-white/[0.06]">
        {value || ' '}
      </pre>
    </div>
  );
}
