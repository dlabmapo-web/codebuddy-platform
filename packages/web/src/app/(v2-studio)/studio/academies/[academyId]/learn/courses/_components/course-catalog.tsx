'use client';

import type { LearnCourseSummary, LearnDraftSummary } from '@cove/shared';
import { BookOpen } from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';

import { useCourseCatalog } from '../_hooks/use-course-catalog';
import { ContinuePanel } from './continue-panel';
import { CourseCard } from './course-card';

export function CourseCatalog({
  academyId,
  initialCourses,
  initialDrafts,
}: {
  academyId: string;
  initialCourses: LearnCourseSummary[];
  initialDrafts: LearnDraftSummary[];
}) {
  const { t } = useLayoutTranslation('learn');
  const catalog = useCourseCatalog({
    academyId,
    initialCourses,
    initialDrafts,
  });

  return (
    <div className="flex flex-col gap-6">
      <ContinuePanel
        academyId={academyId}
        discard={catalog.discard}
        discardingId={catalog.discardingId}
        drafts={catalog.drafts}
      />

      {catalog.courses.length === 0 ? (
        <div className="flex flex-col items-center rounded-card border border-dashed border-border bg-white px-6 py-16 text-center">
          <BookOpen className="size-8 text-sub/40" />
          <h2 className="mt-3 text-[15px] font-bold">
            {t('catalog.empty_title')}
          </h2>
          <p className="mt-1.5 max-w-md text-[13.5px] leading-6 text-sub">
            {t('catalog.empty_body')}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {catalog.courses.map((course) => (
            <CourseCard
              academyId={academyId}
              course={course}
              key={course.courseId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
