'use client';

import {
  isSolutionCheckPending,
  spreadsheetCellLimits,
  type SolutionCheck,
  type SolutionCheckCase,
} from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { orpc } from '@/lib/orpc';
import { SectionCard } from './authoring-fields';

const passing = new Set(['PASSED', 'PASSED_WITH_WARNING', 'SKIPPED']);

/**
 * The saved problem's official solutions, run against its own test cases.
 *
 * Read with the page and refreshed every 5 s only while a check is running,
 * which a staff member is usually watching for a few seconds after a save.
 */
export function SolutionCheckCard({
  academyId,
  courseId,
  materialId,
  initialCheck,
  testCases,
}: {
  academyId: string;
  courseId: string;
  materialId: string;
  /** `undefined` when the server read failed, so the card reads it itself. */
  initialCheck: SolutionCheck | null | undefined;
  /** The saved cases, to name the length of data a spreadsheet cut. */
  testCases: ReadonlyArray<{ input: string; expectedOutput: string }>;
}) {
  const { t } = useTranslation('solution-check');
  const queryClient = useQueryClient();
  const target = { academyId, courseId, materialId };
  const queryKey = ['solution-check', academyId, courseId, materialId];
  const query = useQuery({
    queryKey,
    queryFn: () => orpc.academyCourses.getSolutionCheck(target),
    initialData: initialCheck,
    staleTime: 30_000,
    retry: false,
    refetchInterval: (current) => current.state.data && isSolutionCheckPending(current.state.data.status) ? 5_000 : false,
  });
  const run = useMutation({
    mutationFn: () => orpc.academyCourses.runSolutionCheck(target),
    onSuccess: (check) => {
      queryClient.setQueryData(queryKey, check);
      void queryClient.invalidateQueries({ queryKey: ['solution-checks', academyId, courseId] });
    },
  });
  const check = query.data ?? null;
  const pending = check ? isSolutionCheckPending(check.status) : false;

  return (
    <SectionCard
      title={t('title')}
      description={t('help')}
      icon={ShieldCheck}
      action={
        <button
          type="button"
          onClick={() => run.mutate()}
          disabled={pending || run.isPending}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-ink transition-colors hover:bg-canvas disabled:opacity-50"
        >
          <RefreshCw aria-hidden className={`size-4 ${run.isPending ? 'animate-spin' : ''}`} />
          {run.isPending ? t('running') : t('run_again')}
        </button>
      }
    >
      <div className="mt-4 space-y-3" aria-live="polite">
        <StatusLine check={check} />
        {check && !check.current && !pending ? (
          <p className="text-sm text-sub">{t('stale')}</p>
        ) : null}
        {run.isError ? <p role="alert" className="text-sm text-danger">{t('run_failed')}</p> : null}
        {check?.status === 'FAILED' || check?.status === 'ERRORED' ? <Failures check={check} testCases={testCases} /> : null}
      </div>
    </SectionCard>
  );
}

function StatusLine({ check }: { check: SolutionCheck | null }) {
  const { t } = useTranslation('solution-check');
  if (!check) return <p className="text-sm text-sub">{t('status.NONE')}</p>;
  if (isSolutionCheckPending(check.status)) {
    return (
      <p className="flex items-center gap-2 text-sm font-semibold text-sub">
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
        {t(`status.${check.status}`)}
      </p>
    );
  }
  if (check.status === 'PASSED' && check.result) {
    const solutions = check.result.solutions;
    const cases = solutions[0]?.cases ?? [];
    const slowest = solutions.flatMap((solution) => solution.cases)
      .filter((item) => item.runtimeMs !== null)
      .sort((left, right) => (right.runtimeMs! / right.limitMs) - (left.runtimeMs! / left.limitMs))[0];
    return (
      <div className="space-y-1">
        <p className="flex items-center gap-2 text-sm font-semibold text-success">
          <CheckCircle2 aria-hidden className="size-4" />
          {t('status.PASSED', { count: solutions.length, cases: cases.length })}
        </p>
        {slowest ? (
          <p className="text-xs text-sub">
            {t('slowest', { runtime: slowest.runtimeMs, limit: slowest.limitMs })}
          </p>
        ) : null}
      </div>
    );
  }
  const failed = check.status === 'FAILED';
  return (
    <p className={`flex items-center gap-2 text-sm font-semibold ${failed ? 'text-danger' : 'text-sub'}`}>
      {failed || check.status === 'ERRORED' ? <AlertTriangle aria-hidden className="size-4" /> : null}
      {t(`status.${check.status}`)}
    </p>
  );
}

function Failures({
  check,
  testCases,
}: {
  check: SolutionCheck;
  testCases: ReadonlyArray<{ input: string; expectedOutput: string }>;
}) {
  const { t } = useTranslation('solution-check');
  const solutions = check.result?.solutions ?? [];
  const several = solutions.length > 1;
  return (
    <div className="space-y-3">
      {solutions.filter((solution) => !solution.passed).map((solution) => (
        <div key={solution.index} className="space-y-2">
          {several ? (
            <p className="text-xs font-bold uppercase tracking-wide text-sub">
              {solution.title ?? t('solution_label', { number: solution.index + 1 })}
            </p>
          ) : null}
          <ul className="space-y-2">
            {solution.cases.filter((item) => !passing.has(item.outcome)).map((item) => (
              <FailedCase key={item.position} item={item} saved={testCases[item.position - 1]} />
            ))}
          </ul>
          {solution.stoppedBy ? (
            <p className="text-xs text-sub">{t('stopped', { reason: solution.stoppedBy })}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function FailedCase({ item, saved }: { item: SolutionCheckCase; saved?: { input: string; expectedOutput: string } }) {
  const { t } = useTranslation('solution-check');
  const cutLength = item.cutSuspected
    ? [saved?.input.length, saved?.expectedOutput.length].find((length): length is number =>
      length !== undefined && (spreadsheetCellLimits as readonly number[]).includes(length)) ?? 50_000
    : null;
  const hint = cutLength !== null
    ? t('hint.cut', { length: cutLength.toLocaleString() })
    : item.outcome in hintKeys ? t(`hint.${hintKeys[item.outcome as keyof typeof hintKeys]}`) : null;
  return (
    <li className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2.5 text-sm">
      <p className="font-semibold text-ink">
        {t('case_label', { position: item.position })}
        <span className="font-normal text-sub"> · {item.isSample ? t('sample') : t('hidden')} · </span>
        <span className="text-danger">{t(`outcome.${item.outcome}`)}</span>
      </p>
      {item.error ? (
        <p className="mt-1 break-words font-mono text-[13px] text-ink">
          {item.error.type}{item.error.message ? `: ${item.error.message}` : ''}
          {item.error.line ? <span className="text-sub"> ({t('line', { line: item.error.line })})</span> : null}
        </p>
      ) : null}
      {hint ? <p className="mt-1 text-[13px] text-sub">{hint}</p> : null}
    </li>
  );
}

const hintKeys = {
  WRONG_OUTPUT: 'WRONG_OUTPUT',
  RUNTIME_ERROR: 'RUNTIME_ERROR',
  TIME_LIMIT: 'TIME_LIMIT',
  MEMORY_LIMIT: 'MEMORY_LIMIT',
} as const;
