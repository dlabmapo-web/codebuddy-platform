'use client';

import type { LearnClassDetail } from '@cove/shared';
import { ArrowLeft, BookOpen } from 'lucide-react';
import Link from 'next/link';

import { useLayoutTranslation } from '@/i18n';

import { CourseCard } from '../../../_components/course-card';
import { ClassTeacher } from '../../_components/class-teacher';

/**
 * One class: what it is, who runs it, and what it currently opens up.
 *
 * The header row is the course outline's, mirrored — the way back on the left,
 * the one fact that qualifies the page on the right — so a student moving
 * between a class and a course finds the same furniture in the same place.
 *
 * Course rendering is delegated whole to the shared card. A class is an access
 * path, not a second curriculum, so a course reached through one must look and
 * link exactly as it does in **My Courses**.
 */
export function ClassDetail({
  academyId,
  detail,
}: {
  academyId: string;
  detail: LearnClassDetail;
}) {
  const { t } = useLayoutTranslation('learn');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <Link
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-semibold text-sub transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          href={`/studio/academies/${academyId}/learn/classes`}
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          {t('classes.back')}
        </Link>
        <ClassTeacher teacher={detail.teacher} />
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-[16px] font-bold tracking-[-0.01em]">
            {t('classes.courses_title')}
          </h2>
          <span className="tabular text-[12.5px] text-sub">
            {t('classes.course_count', { count: detail.courses.length })}
          </span>
        </div>

        {detail.courses.length === 0 ? (
          // Deliberately says nothing about *what* is missing: an unassigned
          // course, a hidden one, and one with no visible problems are the same
          // absence here, and naming any of them would leak a title.
          <div className="flex flex-col items-center rounded-card border border-dashed border-border bg-card px-6 py-16 text-center">
            <BookOpen className="size-8 text-sub/40" />
            <h3 className="mt-3 text-[15px] font-bold">
              {t('classes.courses_empty_title')}
            </h3>
            <p className="mt-1.5 max-w-md text-[13.5px] leading-6 text-sub">
              {t('classes.courses_empty_body')}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {detail.courses.map((course) => (
              <CourseCard
                academyId={academyId}
                classId={detail.classId}
                course={course}
                key={course.courseId}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
