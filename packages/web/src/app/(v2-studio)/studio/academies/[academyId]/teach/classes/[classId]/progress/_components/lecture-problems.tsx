'use client';

import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { useLectureProblemsQuery } from '../_hooks/use-teacher-progress';
import {
  DataGrid,
  Duration,
  Meter,
  RegionError,
  RegionLoading,
  Td,
  Th,
} from './progress-primitives';

/**
 * One lecture's problems, requested only when that lecture is open.
 *
 * A large course is never rendered problem by problem up front: expanding is
 * what asks for analytics, and the outline above stays visible while this
 * loads so the teacher never loses their place in the curriculum.
 *
 * The attention column counts affected students rather than flagging the
 * problem. A hard problem is not a defect, and labelling it as one would push
 * teachers to teach the metric.
 */
export function LectureProblems({
  academyId,
  classId,
  enabled,
  lectureId,
  onSelectProblem,
  selectedMaterialId,
}: {
  academyId: string;
  classId: string;
  enabled: boolean;
  lectureId: string;
  onSelectProblem: (materialId: string | null) => void;
  selectedMaterialId: string | null;
}) {
  const { t } = useTranslation('teach');
  const problems = useLectureProblemsQuery(
    { academyId, classId },
    enabled,
    lectureId,
  );

  if (problems.isError && !problems.data) {
    return (
      <div className="p-4">
        <RegionError
          body={t('progress.error.body')}
          onRetry={() => void problems.refetch()}
          title={t('progress.error.title')}
        />
      </div>
    );
  }
  if (!problems.data) return <RegionLoading rows={2} />;

  if (problems.data.rows.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-[13px] text-sub">
        {t('progress.empty.no_exercises_body')}
      </p>
    );
  }

  return (
    <DataGrid
      head={
        <>
          <Th>{t('progress.problem.column_problem')}</Th>
          <Th>{t('progress.problem.column_difficulty')}</Th>
          <Th numeric>{t('progress.problem.column_attempted')}</Th>
          <Th numeric>{t('progress.problem.column_solved')}</Th>
          <Th numeric>{t('progress.problem.column_attempts')}</Th>
          <Th>{t('progress.problem.column_solved_rate')}</Th>
          <Th numeric>{t('progress.problem.column_median')}</Th>
          <Th numeric>{t('progress.problem.column_attention')}</Th>
          <Th className="text-right">
            <span className="sr-only">{t('progress.problem.open')}</span>
          </Th>
        </>
      }
    >
      {problems.data.rows.map((row) => {
        const open = selectedMaterialId === row.materialId;
        return (
          <tr
            className={cn(
              'border-b border-border/60 last:border-0',
              open && 'bg-brand-soft/40',
            )}
            key={row.materialId}
          >
            <Td>
              <span className="font-semibold">
                <span className="mr-1.5 font-mono text-[12.5px] text-sub">
                  {row.outlineNumber}
                </span>
                {row.title}
              </span>
            </Td>
            <Td>
              <span className="whitespace-nowrap rounded-md bg-accent px-2 py-0.5 text-[12px] font-semibold text-sub">
                {t(`progress.difficulty.${row.difficulty}`)}
              </span>
            </Td>
            <Td numeric>{row.studentsAttempted}</Td>
            <Td numeric>{row.studentsSolved}</Td>
            <Td numeric>{row.attempts}</Td>
            <Td>
              <div className="flex min-w-[7rem] flex-col gap-1.5">
                <span className="font-mono text-[12.5px] tabular-nums text-sub">
                  {row.solvedPercent}%
                </span>
                <Meter
                  label={t('progress.curriculum.completion_label', {
                    title: row.title,
                    percent: `${row.solvedPercent}%`,
                  })}
                  percent={row.solvedPercent}
                />
              </div>
            </Td>
            <Td numeric>
              <Duration seconds={row.medianSolveSec} />
            </Td>
            <Td numeric>
              {row.attentionCount > 0 ? (
                <span className="font-mono font-bold text-warning">
                  {row.attentionCount}
                </span>
              ) : (
                <span className="text-sub">
                  <span aria-hidden>—</span>
                  <span className="sr-only">
                    {t('progress.roster.no_attention')}
                  </span>
                </span>
              )}
            </Td>
            <Td className="text-right">
              <button
                aria-expanded={open}
                className="whitespace-nowrap rounded-md px-1 text-[13px] font-bold text-brand outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand/40"
                onClick={() => onSelectProblem(open ? null : row.materialId)}
                type="button"
              >
                {open
                  ? t('progress.problem.close')
                  : t('progress.problem.open')}
              </button>
            </Td>
          </tr>
        );
      })}
    </DataGrid>
  );
}
