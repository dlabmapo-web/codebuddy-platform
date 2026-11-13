'use client';

import type { MonitoringClassRoster } from '@cove/shared';
import { ArrowRight, BookOpen } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { routes } from '@/lib/routes';

/** Assigned courses from the already authorized roster, with no additional read. */
export function ClassCourses({ courses }: { courses: MonitoringClassRoster['courses'] }) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('monitoring');
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-card border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold text-ink" id={headingId}>
          {t('roster.courses_label')}
        </h2>
        <span className="text-[13px] font-semibold text-sub">
          {t('classes.course_count', { count: courses.length })}
        </span>
      </div>
      {courses.length === 0 ? (
        <p className="py-2 text-[14px] text-sub">{t('roster.no_courses')}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <li className="min-w-0" key={course.id}>
              <Link
                className="group flex h-full items-start gap-3 rounded-lg border border-border bg-canvas p-4 transition-colors hover:border-brand/40 hover:bg-brand-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                href={routes.academyLearnCourse(academySlug, course.id)}
                prefetch={false}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                  <BookOpen aria-hidden className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-[15px] font-bold leading-6 text-ink">
                    {course.title}
                  </span>
                  {!course.isVisible ? (
                    <span className="mt-1 block text-[12px] font-semibold text-sub">
                      {t('roster.course_hidden')}
                    </span>
                  ) : null}
                  <span className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand group-hover:underline">
                    {t('roster.view_course')}
                    <ArrowRight aria-hidden className="size-3.5" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
