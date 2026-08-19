'use client';

import type { PracticeExercise } from '@cove/shared';
import { ArrowRight, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import {
  CurriculumPath,
  OutlineChip,
  Panel,
  Percent,
  useRelativeDay,
} from './student-primitives';

/**
 * Unfinished work worth returning to.
 *
 * The same exercises the teacher's Teaching queue would name, chosen by the
 * same rule — so a child and the adult helping them are looking at one list.
 * What is different is everything the row says.
 *
 * The teacher's version prints the reason and its measurement: five
 * consecutive failures, stalled eleven days, thirty-one minutes on the last
 * failed attempt. That is the evidence an adult needs to decide where to spend
 * a lesson. None of it appears here. A child needs the door, not a tally of
 * how many times they have already walked into it, and the schema behind this
 * row has no field that could carry one.
 *
 * The best score does appear, because it is the one number that helps rather
 * than judges: 60% says the approach is close, and 0% says start again.
 *
 * See §7.8 of the student academy overview design.
 */
export function PracticeList({
  academyId,
  isStale,
  rows,
}: {
  academyId: string;
  isStale: boolean;
  rows: PracticeExercise[];
}) {
  const { t } = useTranslation('learning');
  const relativeDay = useRelativeDay();

  if (rows.length === 0) return null;

  return (
    <Panel
      description={t('practice.description')}
      icon={RotateCcw}
      id="practice"
      meta={t('practice.meta', { count: rows.length })}
      testId="practice-list"
      title={t('practice.title')}
      tone="warning"
    >
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.materialId}>
            <Link
              className={cn(
                'flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-accent',
                'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                isStale && 'pointer-events-none opacity-50',
              )}
              href={`/studio/academies/${academyId}/learn/exercises/${row.materialId}`}
            >
              <OutlineChip tone="warning" value={row.outlineNumber} />

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-bold">
                  {row.title}
                </span>
                <CurriculumPath
                  course={row.courseTitle}
                  lecture={row.lectureTitle}
                  module={row.moduleTitle}
                />
              </span>

              <span className="hidden shrink-0 flex-col items-end sm:flex">
                <span className="text-[13px] font-bold">
                  <Percent value={row.bestScore} />
                </span>
                <span className="text-[11px] text-sub">
                  {t('practice.best_so_far')}
                </span>
              </span>

              <span className="hidden shrink-0 text-[11.5px] text-sub md:block">
                {relativeDay(row.lastAttemptAt)}
              </span>

              <span
                aria-hidden
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-warning/10 px-2.5 text-[12.5px] font-bold text-warning"
              >
                {t('practice.action')}
                <ArrowRight className="size-3.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
