'use client';

import type { CurriculumReadinessRow, DifficultProblem } from '@cove/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, BookOpenCheck, Layers, Puzzle, SearchX } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/studio/data-table';
import { cn } from '@/lib/utils';

import { solutionStatusPath } from '../../_lib/overview-url';
import {
  CurriculumPath,
  EmptyState,
  Meter,
  Panel,
} from './overview-primitives';

/**
 * Curriculum readiness — the three lectures the class is least ready to leave.
 *
 * The title says *current* readiness because it is the one section on the page
 * the date filter deliberately does not rewrite. Readiness is cumulative: a
 * lecture the class finished in March is still a lecture they are ready for,
 * and recomputing it over seven days would report a class as unready for
 * everything they did not happen to revisit this week. The exception is stated
 * beside the title rather than in a footnote, because a teacher reading "12%
 * ready" under a "7 days" filter would otherwise reasonably read it as this
 * week's figure.
 *
 * Ready means one student solved 80% of the lecture, counted per student and
 * then shared over the roster — not the roster's average completion. A lecture
 * where half the class finished and half never started is 50% ready, which is
 * the number that decides whether to move on; the average would call the same
 * lecture and a class where everyone is exactly halfway both "50%", and those
 * are two completely different lessons to teach tomorrow.
 *
 * See §6.8 of the teacher overview and student analytics redesign.
 */
export function CurriculumReadiness({
  academyId,
  isStale,
  rows,
}: {
  academyId: string;
  isStale: boolean;
  rows: CurriculumReadinessRow[];
}) {
  const { t } = useTranslation('teaching');

  return (
    <Panel
      description={t('curriculum.description')}
      icon={BookOpenCheck}
      id="curriculum-readiness"
      meta={t('curriculum.meta')}
      testId="curriculum-readiness"
      title={t('curriculum.title')}
      tone="warning"
    >
      {rows.length === 0 ? (
        <EmptyState
          body={t('curriculum.empty_body')}
          icon={Layers}
          title={t('curriculum.empty_title')}
          tone="warning"
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((row) => {
            const href = solutionStatusPath({
              academyId,
              classId: row.classId,
              courseId: row.courseId,
            });
            return (
              <li className="px-4 py-3.5" key={row.lectureId}>
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold text-ink">
                      {row.lectureTitle}
                    </p>
                    <CurriculumPath
                      course={row.courseTitle}
                      module={row.moduleTitle}
                      outlineNumber={row.outlineNumber}
                      tone="warning"
                    />
                  </div>
                  <div className="flex shrink-0 items-baseline gap-2">
                    <span className="font-mono text-[20px] font-extrabold tabular-nums text-ink">
                      {t('percent', { value: row.readiness ?? 0 })}
                    </span>
                    <span className="text-[11.5px] font-bold uppercase tracking-[0.05em] text-sub">
                      {t('curriculum.ready')}
                    </span>
                  </div>
                </div>

                <div className="mt-2.5">
                  <Meter
                    label={t('curriculum.readiness_label', {
                      lecture: row.lectureTitle,
                      percent: row.readiness ?? 0,
                    })}
                    percent={row.readiness}
                    // Amber rather than blue: this section only ever shows the
                    // lectures at the bottom, and a blue bar filling from the
                    // left reads as progress being made.
                    tone="warning"
                  />
                </div>

                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11.5px] tabular-nums text-sub">
                  <span>
                    {t('curriculum.ready_of', {
                      ready: row.readyStudents,
                      eligible: row.eligibleStudents,
                    })}
                  </span>
                  <span aria-hidden>·</span>
                  <span>
                    {t('curriculum.attempted', {
                      count: row.attemptingStudents,
                    })}
                  </span>
                  {href ? (
                    <>
                      <span aria-hidden>·</span>
                      <Link
                        className={cn(
                          'font-sans font-bold text-brand transition-colors hover:underline',
                          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                          isStale && 'pointer-events-none opacity-50',
                        )}
                        href={href}
                      >
                        {t('curriculum.open')}
                      </Link>
                    </>
                  ) : null}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/**
 * Difficult problems — the five with the lowest distinct-student solve rate.
 *
 * The solve rate is over students, never over attempts, and the submission
 * count sits beside it rather than inside it. One child retrying a problem
 * twenty times says something about that child; twenty children each failing it
 * once says something about the problem, and only the second is what this
 * section is for. Showing both columns is what lets a teacher tell them apart
 * at a glance.
 *
 * See §6.9 of the teacher overview and student analytics redesign.
 */
export function DifficultProblems({
  academyId,
  isStale,
  rows,
}: {
  academyId: string;
  isStale: boolean;
  rows: DifficultProblem[];
}) {
  const { t } = useTranslation('teaching');
  const columns: ColumnDef<DifficultProblem, unknown>[] = [
    {
      accessorKey: 'title',
      header: t('problems.column_problem'),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <>
          <span className="block max-w-xs truncate text-[13px] font-semibold">
            {row.original.title}
          </span>
          <CurriculumPath
            course={row.original.courseTitle}
            lecture={row.original.lectureTitle}
            module={row.original.moduleTitle}
            outlineNumber={row.original.outlineNumber}
          />
        </>
      ),
    },
    {
      accessorKey: 'attemptingStudents',
      header: () => (
        <span className="block text-right">
          {t('problems.column_attempted')}
        </span>
      ),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <span className="block text-right font-mono tabular-nums text-sub">
          {row.original.attemptingStudents}
        </span>
      ),
    },
    {
      accessorKey: 'solvedStudents',
      header: () => (
        <span className="block text-right">{t('problems.column_solved')}</span>
      ),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <span className="block text-right font-mono tabular-nums text-sub">
          {row.original.solvedStudents}
        </span>
      ),
    },
    {
      accessorKey: 'solveRate',
      header: () => (
        <span className="block text-right">{t('problems.column_rate')}</span>
      ),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <span className="block text-right font-mono font-bold tabular-nums">
          {t('percent', { value: row.original.solveRate })}
        </span>
      ),
    },
    {
      accessorKey: 'submissions',
      header: () => (
        <span className="block text-right">
          {t('problems.column_submissions')}
        </span>
      ),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <span className="block text-right font-mono tabular-nums text-sub">
          {row.original.submissions}
        </span>
      ),
    },
    {
      id: 'action',
      header: '',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const href = solutionStatusPath({
          academyId,
          classId: row.original.classId,
          materialId: row.original.materialId,
          view: 'problems',
        });
        return href ? (
          <Link
            className={cn(
              'inline-flex items-center gap-1 whitespace-nowrap text-[12.5px] font-bold text-brand',
              'transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              isStale && 'pointer-events-none opacity-50',
            )}
            href={href}
          >
            {t('problems.open')}
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        ) : null;
      },
    },
  ];

  return (
    <Panel
      description={t('problems.description')}
      icon={Puzzle}
      id="difficult-problems"
      meta={t('problems.meta')}
      testId="difficult-problems"
      title={t('problems.title')}
      tone="danger"
    >
      {rows.length === 0 ? (
        <EmptyState
          body={t('problems.empty_body')}
          icon={SearchX}
          title={t('problems.empty_title')}
          tone="danger"
        />
      ) : (
        <DataTable
          className="[&_table]:min-w-[760px] [&_tbody_tr]:h-14"
          columns={columns}
          data={rows}
          frameless
          showColumnVisibility={false}
        />
      )}
    </Panel>
  );
}
