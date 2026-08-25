'use client';

import type { CaseCell, SubmissionResult } from '@cove/shared';

import { useLayoutTranslation } from '@/i18n';

import type { ResultPresentation } from '../_lib/scoring';

const scoreTone = {
  grading: 'border-brand/35 bg-brand/10 text-[#60a5fa]',
  accepted: 'border-success/35 bg-success/10 text-success',
  wrong_output: 'border-danger/35 bg-danger/10 text-[#fb7185]',
  runtime_error: 'border-danger/35 bg-danger/10 text-[#fb7185]',
  time_limit: 'border-warning/40 bg-warning/10 text-warning',
  memory_limit: 'border-warning/40 bg-warning/10 text-warning',
  not_accepted: 'border-danger/35 bg-danger/10 text-[#fb7185]',
  judge_error: 'border-warning/40 bg-warning/10 text-warning',
  transport_error: 'border-danger/35 bg-danger/10 text-[#fb7185]',
} as const;

export function ResultMetrics({
  cells,
  presentation,
  result,
}: {
  cells: CaseCell[];
  presentation: ResultPresentation;
  result: SubmissionResult | null;
}) {
  const { t } = useLayoutTranslation('learn');
  const passedWhileGrading = cells.filter(
    (cell) => cell.state === 'done' && cell.outcome === 'PASSED',
  ).length;
  const total = result?.totalCount ?? cells.length;
  const passed = result?.passedCount ?? passedWhileGrading;

  return (
    <dl className="grid grid-cols-[1.35fr_1fr_1fr] gap-2">
      <Metric
        accent
        accentClass={scoreTone[presentation]}
        label={t('submit.metric_score')}
        testId="result-score"
        value={
          result ? t('submit.score', { score: result.score }) : '— / 100'
        }
      />
      <Metric
        label={t('submit.metric_passed')}
        testId="result-passed"
        value={total > 0 ? `${passed} / ${total}` : '— / —'}
      />
      <Metric
        label={t('submit.metric_runtime')}
        testId="result-runtime"
        value={
          result?.runtimeMs === null || !result
            ? '—'
            : t('submit.runtime', { ms: result.runtimeMs })
        }
      />
    </dl>
  );
}

function Metric({
  accent = false,
  accentClass = '',
  label,
  testId,
  value,
}: {
  accent?: boolean;
  accentClass?: string;
  label: string;
  testId: string;
  value: string;
}) {
  return (
    <div
      className={`min-w-0 rounded-xl border px-3 py-2.5 ${
        accent
          ? accentClass
          : 'border-white/10 bg-white/[0.035]'
      }`}
      data-testid={testId}
    >
      <dt className="truncate text-[10.5px] font-semibold text-[#94a3b8]">
        {label}
      </dt>
      <dd
        className={`mt-1 truncate font-mono font-extrabold leading-none ${
          accent ? 'text-[22px]' : 'text-[16px] text-[#f8fafc]'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
