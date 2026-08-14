'use client';

import {
  type OverviewFilters as Filters,
  type OverviewRange,
  type OverviewScope,
} from '@cove/shared';
import {
  GraduationCap,
  History,
  Layers,
  Loader2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { coursesForClass } from '../../_lib/overview-url';
import { formatLocalDate } from '../../_lib/overview-view';
import { FilterSelector } from './filter-selector';
import { RangePicker } from './range-picker';

/**
 * What the page is currently describing, and how to change it.
 *
 * The scope line under the controls is not decoration. "7 days" means different
 * days depending on when it is read, so the effective dates and the timezone
 * are printed — a screenshot of this page should still be readable next month,
 * and a teacher in a staff meeting should not have to work out which week the
 * numbers are about.
 *
 * The course picker offers only what the selected class is taught, because the
 * server would refuse anything else and a control that offers a refused option
 * is a control that lies.
 */
export function OverviewFilters({
  filters,
  isFetching,
  onChange,
  query,
  scope,
}: {
  filters: Filters;
  isFetching: boolean;
  onChange: (change: {
    classId?: string | null;
    courseId?: string | null;
    range?: OverviewRange;
  }) => void;
  query: { classId: string | null; courseId: string | null; range: OverviewRange };
  scope: OverviewScope;
}) {
  const { t, i18n } = useTranslation('teaching');
  const courses = coursesForClass(filters.courses, query.classId);

  return (
    // Sticky on desktop only. §6.2 — on a phone the bar is a third of the
    // viewport, and a control that covers the content it filters is worse than
    // one a teacher has to scroll back to.
    <div className="flex flex-col gap-2.5 border-b border-border bg-canvas pb-3 lg:sticky lg:top-0 lg:z-20 lg:pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelector
          allLabel={t('filters.all_classes')}
          icon={Users}
          label={t('filters.class')}
          onChange={(classId) => onChange({ classId })}
          options={filters.classes}
          value={query.classId}
        />
        <FilterSelector
          allLabel={t('filters.all_courses')}
          disabled={courses.length === 0}
          icon={Layers}
          label={t('filters.course')}
          onChange={(courseId) => onChange({ courseId })}
          options={courses}
          value={query.courseId}
        />

        <RangePicker
          onChange={(range) => onChange({ range })}
          period={scope.period}
          value={query.range}
        />

        {/*
         * A labelled refresh marker rather than a spinner over the page. The
         * previous numbers stay readable while the next scope arrives; what
         * changes is that they are announced as no longer current.
         */}
        {isFetching ? (
          <span
            aria-live="polite"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-[12px] font-bold text-brand"
          >
            <Loader2
              aria-hidden
              className="size-3.5 animate-spin motion-reduce:animate-none"
            />
            {t('updating')}
          </span>
        ) : null}
      </div>

      {/*
       * What the page is currently describing, as three separate facts rather
       * than one grey sentence. "7 days" means different days depending on when
       * it is read, so the effective dates and the timezone are always printed —
       * a screenshot of this page should still be readable next month, and a
       * teacher in a staff meeting should not have to work out which week the
       * numbers are about.
       */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] leading-[1.5]">
        <ScopeFact icon={GraduationCap} tone="peer">
          {t('scope.counts', {
            count: scope.classCount,
            students: scope.enrolledStudents,
          })}
        </ScopeFact>
        {scope.activityTrackedSince ? (
          <ScopeFact icon={History} tone="teal">
            {t('scope.tracked_since', {
              date: formatLocalDate(scope.activityTrackedSince, i18n.language),
            })}
          </ScopeFact>
        ) : null}
      </div>
    </div>
  );
}

/** One statement about the current scope, with a mark that names its kind. */
function ScopeFact({
  children,
  icon: Icon,
  tone,
}: {
  children: React.ReactNode;
  icon: LucideIcon;
  tone: 'brand' | 'peer' | 'teal';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 font-semibold text-sub',
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          'size-3.5 shrink-0',
          tone === 'brand' && 'text-brand',
          tone === 'peer' && 'text-peer',
          tone === 'teal' && 'text-teal',
        )}
      />
      {children}
    </span>
  );
}
