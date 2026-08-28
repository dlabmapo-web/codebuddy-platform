'use client';

import type { LearnClassDetail } from '@cove/shared';
import { BookOpen } from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';

import { CourseCard } from '../../../_components/course-card';
import { splitSchedule } from '../../_lib/class-schedule';
import { ClassScheduleChip } from '../../_components/class-schedule-chip';
import { ClassTeacher } from '../../_components/class-teacher';

/**
 * One class: when it meets, who runs it, and what it currently opens up.
 *
 * Those three facts sit together in one strip under the heading. They used to
 * be scattered — the way back on the left of a row, the teacher pushed to the
 * far right of it, the course count floating above the grid — which read as
 * three unrelated fragments rather than as the identity of the class the
 * heading had just named. The way back left the row entirely: it belongs above
 * the title, and `StudioPage` renders it there.
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
  const { schedule } = splitSchedule(detail.description);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-card border border-border bg-card px-5 py-4">
        {schedule ? <ClassScheduleChip schedule={schedule} /> : null}
        <ClassTeacher size="md" teacher={detail.teacher} />
        <span className="tabular ml-auto shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-[12px] font-bold text-brand">
          {t('classes.course_count', { count: detail.courses.length })}
        </span>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-[16px] font-bold tracking-[-0.01em]">
          {t('classes.courses_title')}
        </h2>

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
