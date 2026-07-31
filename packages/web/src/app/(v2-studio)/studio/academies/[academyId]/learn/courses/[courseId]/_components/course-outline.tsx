'use client';

import type { LearnCourseOutline } from '@cove/shared';
import { ArrowLeft, BookOpen, Search, X } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';
import { Input } from '@/components/studio/primitives';

import { useCourseOutline } from '../_hooks/use-course-outline';
import { ModuleSection } from './module-section';

export function CourseOutline({
  academyId,
  courseId,
  initialOutline,
  versionLabel,
}: {
  academyId: string;
  courseId: string;
  initialOutline: LearnCourseOutline;
  versionLabel: string;
}) {
  const { t } = useLayoutTranslation('learn');
  const outline = useCourseOutline({ academyId, courseId, initialOutline });

  // A deep-linked lecture is only in the DOM once its module is expanded, which
  // the hook arranges on first render — so the scroll waits for paint.
  React.useEffect(() => {
    if (!outline.requestedLectureId) return;
    const target = document.getElementById(
      `lecture-${outline.requestedLectureId}`,
    );
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [outline.requestedLectureId]);

  const empty = initialOutline.modules.every((module) =>
    module.lectures.every((lecture) => lecture.exercises.length === 0),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-semibold text-sub transition-colors hover:bg-canvas hover:text-ink"
            href={`/studio/academies/${academyId}/learn/courses`}
          >
            <ArrowLeft className="size-3.5" />
            {t('outline.back')}
          </Link>
          <span className="rounded-full bg-canvas px-2 py-0.5 text-[11.5px] font-bold text-sub">
            {versionLabel}
          </span>
          <span className="text-[12.5px] text-sub">
            {t('outline.progress', {
              solved: outline.progress.solved,
              total: outline.progress.total,
            })}
          </span>
        </div>

        <label className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-sub/60" />
          <Input
            className="pl-9 pr-9"
            onChange={(event) => outline.setQuery(event.target.value)}
            placeholder={t('outline.search_placeholder')}
            type="search"
            value={outline.query}
          />
          {outline.query ? (
            <button
              aria-label={t('outline.search_clear')}
              className="absolute right-2.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-sub hover:text-ink"
              onClick={() => outline.setQuery('')}
              type="button"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </label>
      </div>

      {empty ? (
        <div className="flex flex-col items-center rounded-card border border-dashed border-border bg-white px-6 py-16 text-center">
          <BookOpen className="size-8 text-sub/40" />
          <h2 className="mt-3 text-[15px] font-bold">
            {t('outline.empty_title')}
          </h2>
          <p className="mt-1.5 max-w-md text-[13.5px] leading-6 text-sub">
            {t('outline.empty_body')}
          </p>
        </div>
      ) : outline.modules.length === 0 ? (
        <div className="flex flex-col items-center rounded-card border border-border bg-white px-6 py-14 text-center">
          <Search className="size-7 text-sub/40" />
          <p className="mt-3 text-[13.5px] text-sub">
            {t('outline.no_results')}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {outline.modules.map((module) => (
            <ModuleSection
              academyId={academyId}
              expanded={outline.isExpanded(module.id)}
              key={module.id}
              module={module}
              onToggle={() => outline.toggleModule(module.id)}
              requestedLectureId={outline.requestedLectureId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
