'use client';

import type { StudentCourseProgress } from '@cove/shared';
import { ArrowRight, BookOpen, GraduationCap, PartyPopper } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { EmptyState, Meter, Panel } from './student-primitives';

/**
 * How far through each course the student is, and the next thing in it.
 *
 * The numbers are the catalog's numbers. §7.5 — they come from the projection
 * **My Courses** already prints rather than being recomputed here, because a
 * dashboard that derived its own copy would eventually disagree with the page
 * a student can reach in one click, and there is no version of that a child
 * could diagnose.
 *
 * A finished course keeps its row and loses its link. Nothing about it is
 * hidden — a student who completed a course should see that they did — but the
 * row stops being a door, because there is nothing behind it.
 */
export function CourseProgress({
  academyId,
  courses,
  isStale,
}: {
  academyId: string;
  courses: StudentCourseProgress[];
  isStale: boolean;
}) {
  const { t } = useTranslation('learning');

  return (
    <Panel
      actions={
        <Link
          className={cn(
            'inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] font-bold text-success',
            'transition-colors hover:bg-success/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            isStale && 'pointer-events-none opacity-50',
          )}
          href={`/studio/academies/${academyId}/learn/courses`}
        >
          {t('courses.view_all')}
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      }
      description={t('courses.description')}
      icon={GraduationCap}
      id="course-progress"
      meta={t('courses.meta', { count: courses.length })}
      testId="course-progress"
      title={t('courses.title')}
      tone="success"
    >
      {courses.length === 0 ? (
        <EmptyState
          body={t('courses.empty_body')}
          icon={BookOpen}
          title={t('courses.empty_title')}
          tone="success"
        />
      ) : (
        <ul className="divide-y divide-border">
          {courses.map((course) => {
            const done = course.total > 0 && course.solved >= course.total;
            return (
              <li className="p-4" key={course.courseId}>
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
                  <div className="min-w-0 flex-1">
                    <Link
                      className={cn(
                        'block truncate text-[14.5px] font-bold tracking-[-0.01em] transition-colors hover:text-success',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                        isStale && 'pointer-events-none opacity-50',
                      )}
                      href={`/studio/academies/${academyId}/learn/courses/${course.courseId}`}
                    >
                      {course.title}
                    </Link>
                    {course.lastLectureLabel ? (
                      <p className="mt-0.5 truncate text-[11.5px] text-sub">
                        {t('courses.last_lecture', {
                          lecture: course.lastLectureLabel,
                        })}
                      </p>
                    ) : null}
                  </div>
                  <p className="flex shrink-0 items-baseline gap-1 font-mono text-[13px] font-bold tabular-nums">
                    {course.solved}
                    <span className="text-[11.5px] font-semibold text-sub">
                      {t('courses.of_total', { total: course.total })}
                    </span>
                  </p>
                </div>

                <div className="mt-2.5">
                  <Meter
                    label={t('courses.meter', {
                      solved: course.solved,
                      total: course.total,
                    })}
                    percent={course.percent}
                    tone="success"
                  />
                </div>

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11.5px] font-semibold text-sub">
                    {course.started > 0
                      ? t('courses.started', { count: course.started })
                      : t('courses.percent_done', { value: course.percent })}
                  </span>
                  {done ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[11.5px] font-bold text-success">
                      <PartyPopper aria-hidden className="size-3.5" />
                      {t('courses.complete')}
                    </span>
                  ) : course.nextMaterialId ? (
                    <Link
                      className={cn(
                        'inline-flex h-8 items-center gap-1.5 rounded-lg bg-success/10 px-3 text-[12.5px] font-bold text-success',
                        'transition-colors hover:bg-success/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                        isStale && 'pointer-events-none opacity-50',
                      )}
                      href={`/studio/academies/${academyId}/learn/exercises/${course.nextMaterialId}`}
                    >
                      {t('courses.next')}
                      <span className="max-w-[10rem] truncate font-normal">
                        {course.nextTitle}
                      </span>
                      <ArrowRight aria-hidden className="size-3.5" />
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
