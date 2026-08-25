'use client';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import type {
  CalibrationRow,
  CurriculumEffectiveness,
  DifficultProblem,
  GrindRow,
  NeverAttemptedRow,
} from '@cove/shared';
import { CircleSlash, Compass, Repeat, Scale } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import {
  calibrationTones,
  difficultyTones,
  exerciseHref,
} from '../../_lib/lead-view';
import { EmptyState, Meter, toneStyles } from '../overview-ui/panel';

/**
 * The four things a measurement can say about a problem somebody wrote.
 *
 * Four bodies rather than one table, because they ask for four different acts.
 * The hardest problems are for teaching attention; a mislabelled difficulty is
 * a metadata edit; a grind is a rewrite of a description or a test case; an
 * untouched exercise is a pacing question. One combined table would need a
 * column saying which of the four a row was, which is a heading pretending to
 * be data.
 *
 * `effectiveness-tabs.tsx` puts them behind one tab strip and only ever mounts
 * one, which is what lets each of them state emptiness at full size. As four
 * stacked cards they could not: four full-height "nothing found" panels in a
 * row turned a page about a curriculum into a page about the absence of
 * findings, and they had to be compressed to one line each. One at a time,
 * a check that came back clean has the room to say so properly.
 *
 * Every row carries the measurement that put it there. A page that asks
 * somebody to change authored work has to show its evidence, because the author
 * is the only person who can tell whether the label is wrong or the problem is.
 */

/* ------------------------------------------------- shared row furniture */

/**
 * The curriculum position, in tabular figures.
 *
 * The one structural device this page repeats, and it is information rather
 * than decoration: `2.4.1` is where the exercise actually sits in the course a
 * student walks through, so two rows from the same lecture sort together and a
 * Team Lead can find the thing in the tree without opening it.
 */
function Outline({ value }: { value: string | null }) {
  if (!value) return null;
  return (
    <span className="shrink-0 rounded-md bg-accent px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums text-sub">
      {value}
    </span>
  );
}

function RowShell({
  children,
  href,
}: {
  children: React.ReactNode;
  href: string;
}) {
  return (
    <li>
      <Link
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 transition-colors',
          'hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
        )}
        href={href}
      >
        {children}
      </Link>
    </li>
  );
}

function Path({ course, lecture }: { course: string; lecture: string }) {
  return (
    <span className="block truncate text-[11.5px] text-sub">
      {course} › {lecture}
    </span>
  );
}

/* ------------------------------------------------------ hardest problems */

/** §10.1 — ordered by the same comparator the other two overviews use. */
export function ProblemsPanel({
  academyId,
  rows,
}: {
  academyId: string;
  rows: DifficultProblem[];
}) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('lead');

  if (rows.length === 0) {
    return (
      <EmptyState
        body={t('problems.empty_body')}
        icon={Compass}
        title={t('problems.empty_title')}
        tone="warning"
      />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <RowShell
          href={exerciseHref(academySlug, row.classId, row.materialId)}
          key={row.materialId}
        >
          <Outline value={row.outlineNumber} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">
              {row.title}
            </span>
            <Path course={row.courseTitle} lecture={row.lectureTitle} />
          </span>
          <span className="flex w-32 shrink-0 flex-col gap-1">
            <Meter
              label={t('problems.solve_rate_label', {
                solved: row.solvedStudents,
                attempting: row.attemptingStudents,
              })}
              percent={row.solveRate}
              tone="warning"
            />
            <span className="font-mono text-[11px] font-bold tabular-nums text-sub">
              {t('problems.solve_rate', {
                percent: row.solveRate,
                solved: row.solvedStudents,
                attempting: row.attemptingStudents,
              })}
            </span>
          </span>
        </RowShell>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------- calibration */

/**
 * §10.2 — where an authored label and the measurement disagree.
 *
 * The row shows both numbers and links to the editor. There is deliberately no
 * one-click correction: a period-scoped measurement is not entitled to rewrite
 * an authored judgement, and only the person who wrote the problem knows
 * whether the label is wrong or the problem is.
 */
export function CalibrationPanel({
  academyId,
  rows,
}: {
  academyId: string;
  rows: CalibrationRow[];
}) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('lead');

  if (rows.length === 0) {
    return (
      <EmptyState
        body={t('calibration.empty_body')}
        icon={Scale}
        title={t('calibration.empty_title')}
        tone="primary"
      />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => {
        const tone = toneStyles[calibrationTones[row.verdict]];
        return (
          <RowShell
            href={exerciseHref(academySlug, row.courseId, row.materialId)}
            key={row.materialId}
          >
            <Outline value={row.outlineNumber} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">
                {row.title}
              </span>
              <Path course={row.courseTitle} lecture={row.lectureTitle} />
            </span>

            {/* The claim, then the evidence, in that order. */}
            <span className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  'rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide',
                  difficultyTones[row.difficulty],
                )}
              >
                {t(`difficulty.${row.difficulty}`)}
              </span>
              <span className="font-mono text-[12px] font-bold tabular-nums text-ink">
                {t('calibration.measured', {
                  percent: row.solveRate,
                  attempting: row.attemptingStudents,
                })}
              </span>
            </span>

            <span
              className={cn(
                'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold',
                tone.pill,
              )}
            >
              {t(`calibration.verdict.${row.verdict}`)}
            </span>
          </RowShell>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------------- grind */

/** §10.3 — students get there, but only by brute force. */
export function GrindPanel({
  academyId,
  rows,
}: {
  academyId: string;
  rows: GrindRow[];
}) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('lead');

  if (rows.length === 0) {
    return (
      <EmptyState
        body={t('grind.empty_body')}
        icon={Repeat}
        title={t('grind.empty_title')}
        tone="teal"
      />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <RowShell
          href={exerciseHref(academySlug, row.courseId, row.materialId)}
          key={row.materialId}
        >
          <Outline value={row.outlineNumber} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">
              {row.title}
            </span>
            <Path course={row.courseTitle} lecture={row.lectureTitle} />
          </span>
          <span className="flex shrink-0 items-baseline gap-1.5">
            <span className="font-mono text-[19px] font-extrabold leading-none tabular-nums text-teal">
              {row.ratio.toFixed(1)}
            </span>
            <span className="text-[11px] font-semibold text-sub">
              {t('grind.per_solver')}
            </span>
          </span>
          <span className="w-full shrink-0 font-mono text-[11px] font-bold tabular-nums text-sub sm:w-auto">
            {t('grind.evidence', {
              submissions: row.submissions,
              solved: row.solvedStudents,
              percent: row.solveRate,
            })}
          </span>
        </RowShell>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------- never attempted */

/** §10.5 — live, in front of active students, and still untouched. */
export function NeverAttemptedPanel({
  academyId,
  effectiveness,
}: {
  academyId: string;
  effectiveness: CurriculumEffectiveness;
}) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('lead');
  const rows: NeverAttemptedRow[] = effectiveness.neverAttempted;

  if (rows.length === 0) {
    return (
      <EmptyState
        body={t('never_attempted.empty_body')}
        icon={CircleSlash}
        title={t('never_attempted.empty_title')}
        tone="brand"
      />
    );
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <RowShell
            href={exerciseHref(academySlug, row.courseId, row.materialId)}
            key={row.materialId}
          >
            <Outline value={row.outlineNumber} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">
                {row.title}
              </span>
              <Path course={row.courseTitle} lecture={row.lectureTitle} />
            </span>
            <span className="shrink-0 font-mono text-[11.5px] font-bold tabular-nums text-sub">
              {t('never_attempted.reachable', { count: row.reachableStudents })}
            </span>
          </RowShell>
        ))}
      </ul>
      {effectiveness.neverAttemptedTotal > rows.length ? (
        <p className="px-4 pb-3.5 pt-2 text-[11.5px] font-semibold text-sub">
          {t('never_attempted.more', {
            count: effectiveness.neverAttemptedTotal - rows.length,
          })}
        </p>
      ) : null}
    </>
  );
}
