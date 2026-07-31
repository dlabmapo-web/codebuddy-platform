'use client';

import type { LearnCourseSummary } from '@cove/shared';
import { BookOpen, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { useLayoutTranslation } from '@/i18n';

export function CourseCard({
  academyId,
  course,
}: {
  academyId: string;
  course: LearnCourseSummary;
}) {
  const { t } = useLayoutTranslation('learn');
  const { progress } = course;
  const completion =
    progress.total > 0
      ? Math.round((progress.solved / progress.total) * 100)
      : 0;

  return (
    <Link
      className="group flex flex-col rounded-card border border-border bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      href={`/studio/academies/${academyId}/learn/courses/${course.courseId}`}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
          <BookOpen className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15.5px] font-bold tracking-[-0.01em]">
            {course.title}
          </h3>
          <p className="mt-1 line-clamp-2 min-h-[2.6em] text-[13px] leading-[1.6] text-sub">
            {course.description}
          </p>
        </div>
        <ChevronRight className="mt-1 size-4 shrink-0 text-sub transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
      </div>

      <p className="mt-4 text-[12px] text-sub">
        {t('catalog.counts', {
          modules: course.counts.modules,
          lectures: course.counts.lectures,
          exercises: course.counts.exercises,
        })}
      </p>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-[12px]">
          <span className="text-sub">
            {progress.started > 0
              ? t('catalog.progress_started', { count: progress.started })
              : t('catalog.progress_none')}
          </span>
          <span className="font-bold text-brand">
            {progress.solved}/{progress.total}
          </span>
        </div>
        <div
          aria-hidden
          className="h-1.5 overflow-hidden rounded-full bg-canvas"
        >
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${completion}%` }}
          />
        </div>
      </div>
    </Link>
  );
}
