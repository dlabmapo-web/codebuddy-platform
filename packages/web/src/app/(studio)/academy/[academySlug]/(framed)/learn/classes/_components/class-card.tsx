'use client';

import type { LearnClassSummary } from '@cove/shared';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { useLayoutTranslation } from '@/i18n';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { splitSchedule } from '../_lib/class-schedule';
import { ClassScheduleChip } from './class-schedule-chip';
import { ClassTeacher } from './class-teacher';

/**
 * One class, as the record it is: when it meets, what it is called, what it is
 * for, who runs it, and how much it currently opens up.
 *
 * The schedule leads. It used to be the first few words of the grey paragraph
 * — `토 10:00 — 기초 과정을...` — which buried the single fact a student
 * recognises a class by. Lifted into its own chip, three classes stop being
 * three paragraphs to read and become Saturday, Monday-Wednesday-Friday, and
 * Tuesday-Thursday.
 *
 * It still carries no class glyph of its own: on a page of classes a class
 * icon repeats what the reader already knows. The two marks here both identify
 * something — a time, and a person.
 *
 * Nothing on the card comes from the management surface: it receives a
 * `LearnClassSummary` and builds one URL, so there is no roster, status, or
 * edit action it could render even by mistake.
 */
export function ClassCard({ summary }: { summary: LearnClassSummary }) {
  const academySlug = useAcademySlug();
  const { t } = useLayoutTranslation('learn');
  const count = summary.availableCourseCount;
  const { schedule, description } = splitSchedule(summary.description);

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

      {description ? (
        <p className="mt-1 line-clamp-2 text-[13px] leading-[1.6] text-sub">
          {description}
        </p>
      ) : null}

      {/* `mt-auto` rather than a reserved description height: cards in a row
          stretch to the tallest, and pinning the footer keeps them level
          without padding short copy out with a blank line. */}
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
