'use client';

import type { LearnClassSummary } from '@cove/shared';
import { ArrowRight, Users } from 'lucide-react';
import Link from 'next/link';

import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { useLayoutTranslation } from '@/i18n';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { splitSchedule } from '../_lib/class-schedule';
import { ClassScheduleChip } from './class-schedule-chip';
import { ClassTeacher } from './class-teacher';

/** Student-facing class facts: schedule, assigned teacher, courses and headcount. */
export function ClassCard({ summary }: { summary: LearnClassSummary }) {
  const academySlug = useAcademySlug();
  const { t } = useLayoutTranslation('learn');
  const count = summary.availableCourseCount;
  const { schedule } = splitSchedule(summary.description);

  return (
    <Link
      className="group flex h-full flex-col rounded-card border border-border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      href={`${routes.academy(academySlug)}/learn/classes/${summary.classId}`}
    >
      <div className="flex items-center justify-between gap-2">
        {schedule ? (
          <ClassScheduleChip schedule={schedule} />
        ) : (
          // Keeps the name on the same line it sits on in every other card,
          // so a class written without a schedule does not ride higher than
          // its neighbours.
          <span aria-hidden className="h-[1.75rem]" />
        )}
        {/* Beside the schedule because it qualifies the class the same way:
            this is what it opens up right now, not a total it once had. */}
        <span
          className={cn(
            'tabular shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold',
            count > 0 ? 'bg-brand-soft text-brand' : 'bg-muted text-sub',
          )}
        >
          {t('classes.course_count', { count })}
        </span>
      </div>

      <h2 className="mt-3 truncate text-[16px] font-extrabold tracking-[-0.015em]">
        {summary.name}
      </h2>

      {summary.studentCount !== undefined ? <p className="mt-3 mb-4 flex items-center gap-2 text-[13px] font-medium text-sub"><Users aria-hidden className="size-4" />{t('classes.student_count', { count: summary.studentCount })}</p> : null}

      {/* Keep teacher and action aligned across cards with different schedules. */}
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
        <ClassTeacher teacher={summary.teacher} />
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-bold text-brand">
          {t('classes.open')}
          <ArrowRight
            aria-hidden
            className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        </span>
      </div>
    </Link>
  );
}
