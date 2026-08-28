'use client';

import type { TeacherCurriculumResult } from '@cove/shared';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import type { ProgressState } from '../_hooks/use-teacher-progress';
import { useCourseOutlineQuery } from '../_hooks/use-teacher-progress';
import { LectureProblems } from './lecture-problems';
import {
  EmptyState,
  Meter,
  Panel,
  RegionError,
  RegionLoading,
  StaleBanner,
} from './progress-primitives';

/**
 * The class's curriculum, read as a structure rather than as a list.
 *
 * This is the page's one structural signature. Courses stay closed until one
 * is chosen; a chosen course shows its modules as a spine, and each lecture is
 * a single scannable line: a coordinate on the left, the title and its own
 * description in the middle, and the same meter in the same column on every
 * row, so a teacher reads a course vertically like a ledger and can see where
 * a class stalled without opening anything.
 *
 * Nothing below a lecture is fetched until the lecture is opened. A course
 * with four hundred problems costs exactly one outline.
 */
export function CurriculumOverview({
  academyId,
  classId,
  data,
  failed,
  onRetry,
  state,
}: {
  academyId: string;
  classId: string;
  data: TeacherCurriculumResult;
  failed: boolean;
  onRetry: () => void;
  state: ProgressState;
}) {
  const { t } = useTranslation('teach');
  const { settled } = state;
  const openCourseId = settled.courseIds.length === 1 ? settled.courseIds[0]! : null;

  if (data.courses.length === 0) {
    return (
      <EmptyState
        body={
          settled.q
            ? t('progress.empty.no_results_body')
            : t('progress.empty.no_courses_body')
        }
        title={
          settled.q
            ? t('progress.empty.no_results_title')
            : t('progress.empty.no_courses_title')
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {failed ? <StaleBanner onRetry={onRetry} /> : null}

      {openCourseId ? (
        <CourseOutline
          academyId={academyId}
          classId={classId}
          courseId={openCourseId}
          state={state}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {data.courses.map((course) => (
            <li key={course.courseId}>
              <button
                className="flex h-full w-full flex-col rounded-card border border-border bg-card p-4 text-left outline-none transition-colors hover:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
                onClick={() => state.change({ courseIds: [course.courseId] })}
                type="button"
              >
                <span className="text-[14.5px] font-bold">{course.title}</span>
                {course.description ? (
                  <span className="mt-1 line-clamp-2 text-[13px] leading-[1.5] text-sub">
                    {course.description}
                  </span>
                ) : null}
                <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-sub">
                  <span>
                    {t('progress.curriculum.modules', {
                      count: course.moduleCount,
                    })}
                  </span>
                  <span aria-hidden>·</span>
                  <span>
                    {t('progress.curriculum.problems', {
                      count: course.exerciseCount,
                    })}
                  </span>
                  {course.attentionCount > 0 ? (
                    <span className="rounded-full bg-warning/10 px-2 py-0.5 font-semibold text-warning">
                      {t('progress.attention.heading')} {course.attentionCount}
                    </span>
                  ) : null}
                </span>
                <span className="mt-3 flex items-center gap-2.5">
                  <Meter
                    label={t('progress.curriculum.completion_label', {
                      title: course.title,
                      percent: `${course.completionPercent}%`,
                    })}
                    percent={course.completionPercent}
                  />
                  <span className="shrink-0 font-mono text-[12.5px] font-bold tabular-nums">
                    {course.completionPercent}%
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CourseOutline({
  academyId,
  classId,
  courseId,
  state,
}: {
  academyId: string;
  classId: string;
  courseId: string;
  state: ProgressState;
}) {
  const { t } = useTranslation('teach');
  const outline = useCourseOutlineQuery(
    { academyId, classId },
    state.settled,
    courseId,
  );

  if (outline.isError && !outline.data) {
    return (
      <RegionError
        body={t('progress.error.not_found_body')}
        onRetry={() => void outline.refetch()}
        title={t('progress.error.not_found_title')}
      />
    );
  }

  const data = outline.data;
  const openLectureId = state.settled.lectureId;

  return (
    <Panel
      actions={
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12.5px] font-semibold text-sub transition-colors hover:border-brand hover:text-brand"
          onClick={() =>
            state.change({ courseIds: [], moduleId: null, lectureId: null })
          }
          type="button"
        >
          <ChevronLeft aria-hidden className="size-3.5" />
          {t('progress.curriculum.close_course')}
        </button>
      }
      description={data?.course.description || undefined}
      title={data ? data.course.title : t('progress.loading')}
      titleId="course-outline-heading"
    >
      {!data ? (
        <RegionLoading rows={4} />
      ) : data.modules.length === 0 ? (
        <EmptyState
          body={t('progress.empty.no_results_body')}
          title={t('progress.empty.no_results_title')}
        />
      ) : (
        <ol className="flex flex-col">
          {data.modules.map((module) => (
            <li className="border-b border-border last:border-0" key={module.moduleId}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 bg-accent/40 px-4 py-2">
                <h3 className="text-[12.5px] font-bold uppercase tracking-[0.05em] text-sub">
                  <span className="mr-1.5 font-mono">{module.position}</span>
                  {module.title}
                </h3>
                <span className="font-mono text-[12px] tabular-nums text-sub">
                  {t('progress.curriculum.pairs_value', {
                    solved: module.solvedPairs,
                    total: module.eligiblePairs,
                  })}
                </span>
              </div>

              <ol className="flex flex-col">
                {module.lectures.map((lecture) => {
                  const open = openLectureId === lecture.lectureId;
                  return (
                    <li
                      className="border-t border-border/60 first:border-0"
                      key={lecture.lectureId}
                    >
                      <button
                        aria-expanded={open}
                        className={cn(
                          'flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40',
                          open && 'bg-brand-soft/40',
                        )}
                        onClick={() =>
                          state.change({
                            moduleId: open ? null : module.moduleId,
                            lectureId: open ? null : lecture.lectureId,
                            materialId: null,
                          })
                        }
                        type="button"
                      >
                        {/* The coordinate is the rail: it lines up down the
                            whole course, so scanning does not depend on how
                            long a lecture is called. */}
                        <span className="w-10 shrink-0 font-mono text-[12.5px] tabular-nums text-sub">
                          {lecture.outlineNumber}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-semibold">
                            {lecture.title}
                          </span>
                          {lecture.description ? (
                            <span className="block truncate text-[12.5px] text-sub">
                              {lecture.description}
                            </span>
                          ) : null}
                        </span>

                        {lecture.attentionCount > 0 ? (
                          <span className="shrink-0 rounded-full bg-warning/10 px-2 py-0.5 text-[12px] font-semibold text-warning">
                            {lecture.attentionCount}
                          </span>
                        ) : null}

                        {/* Fixed column, so every lecture's meter starts at
                            the same x. That alignment is the scan. */}
                        <span className="hidden w-40 shrink-0 items-center gap-2 sm:flex">
                          <Meter
                            label={t('progress.curriculum.completion_label', {
                              title: lecture.title,
                              percent: `${lecture.completionPercent}%`,
                            })}
                            percent={lecture.completionPercent}
                          />
                          <span className="w-14 shrink-0 text-right font-mono text-[12px] tabular-nums text-sub">
                            {t('progress.curriculum.pairs_value', {
                              solved: lecture.solvedPairs,
                              total: lecture.eligiblePairs,
                            })}
                          </span>
                        </span>

                        <ChevronDown
                          aria-hidden
                          className={cn(
                            'size-4 shrink-0 text-sub transition-transform motion-reduce:transition-none',
                            open && 'rotate-180',
                          )}
                        />
                      </button>

                      {open ? (
                        <div className="border-t border-border bg-card">
                          <LectureProblems
                            academyId={academyId}
                            classId={classId}
                            enabled
                            lectureId={lecture.lectureId}
                            onSelectProblem={(materialId) =>
                              state.change({ materialId })
                            }
                            selectedMaterialId={state.settled.materialId}
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
