'use client';

import type { LearnCourseOutline } from '@cove/shared';
import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown } from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';

import { formatProblemOutlineNumber, lectureProgress } from '../_lib/course-outline';
import { ExerciseRow } from './exercise-row';

type Module = LearnCourseOutline['modules'][number];

export function ModuleSection({
  academyId,
  classId,
  expanded,
  isLectureExpanded,
  module,
  onToggle,
  onToggleLecture,
  requestedLectureId,
}: {
  academyId: string;
  classId: string;
  expanded: boolean;
  isLectureExpanded: (lectureId: string) => boolean;
  module: Module;
  onToggle: () => void;
  onToggleLecture: (lectureId: string) => void;
  requestedLectureId: string | null;
}) {
  const { t } = useLayoutTranslation('learn');
  const exerciseCount = module.lectures.reduce(
    (total, lecture) => total + lecture.exercises.length,
    0,
  );

  return (
    <section
      className={`overflow-hidden rounded-card border bg-card transition-colors ${
        expanded ? 'border-brand/30' : 'border-border'
      }`}
    >
      <h2>
        <button
          aria-expanded={expanded}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-canvas/60"
          onClick={onToggle}
          type="button"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft font-mono text-[13px] font-bold text-brand">
            {module.position}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold uppercase tracking-[0.07em] text-brand">
              {t('outline.module_label', { position: module.position })}
            </span>
            <span className="mt-0.5 block truncate text-[15px] font-bold">
              {module.title}
            </span>
          </span>
          <span className="hidden shrink-0 text-[12px] text-sub sm:block">
            {exerciseCount}
          </span>
          <ChevronDown
            className={`size-4 shrink-0 text-sub transition-transform ${
              expanded ? 'rotate-180 text-brand' : ''
            }`}
          />
        </button>
      </h2>

      {expanded ? (
        <div className="border-t border-border bg-canvas/40 p-3">
          <div className="flex flex-col gap-4">
            {module.lectures.map((lecture) => (
              <Collapsible.Root
                asChild
                key={lecture.id}
                onOpenChange={() => onToggleLecture(lecture.id)}
                open={isLectureExpanded(lecture.id)}
              >
                <section
                  id={`lecture-${lecture.id}`}
                  // A deep link needs a scroll target that survives the
                  // collapse state, so the anchor lives on the lecture.
                  className={`overflow-hidden rounded-lg border bg-card transition-colors ${
                    lecture.id === requestedLectureId
                      ? 'border-brand/40 ring-2 ring-brand/20'
                      : 'border-border'
                  }`}
                >
                  {lecture.exercises.length > 0 ? (
                    <header>
                      <Collapsible.Trigger asChild>
                        <button
                          aria-label={t('outline.toggle_lecture', {
                            title: lecture.title,
                          })}
                          className="flex w-full items-start gap-2.5 px-3 py-3 text-left transition-colors hover:bg-canvas/70"
                          type="button"
                        >
                          <ChevronDown
                            aria-hidden
                            className={`mt-0.5 size-4 shrink-0 text-sub transition-transform duration-200 motion-reduce:transition-none ${
                              isLectureExpanded(lecture.id)
                                ? 'rotate-180 text-brand'
                                : ''
                            }`}
                          />
                          {/* One column on a phone: the progress block below
                              needs its own line before the title starts
                              truncating to nothing. */}
                          <span className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                            <span className="min-w-0 flex-1">
                              <span className="block text-[10.5px] font-bold uppercase tracking-[0.07em] text-sub">
                                {t('outline.lecture_label', {
                                  position: lecture.position,
                                })}
                              </span>
                              <span className="mt-0.5 block truncate text-[13.5px] font-bold text-ink">
                                {lecture.title}
                              </span>
                              {lecture.description ? (
                                // Two lines: enough to say what the lecture
                                // covers, never enough to push the next one
                                // off the screen.
                                <span className="mt-1 line-clamp-2 text-[12.5px] leading-[1.5] text-sub">
                                  {lecture.description}
                                </span>
                              ) : null}
                            </span>
                            <LectureProgress lecture={lecture} />
                          </span>
                        </button>
                      </Collapsible.Trigger>
                    </header>
                  ) : (
                    <header className="px-3 py-2.5">
                      <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-sub">
                        {t('outline.lecture_label', {
                          position: lecture.position,
                        })}
                      </span>
                      <h3 className="mt-0.5 text-[13.5px] font-bold">
                        {lecture.title}
                      </h3>
                    </header>
                  )}

                  <Collapsible.Content className="cove-collapse">
                    {lecture.exercises.length === 0 ? (
                      <p className="border-t border-dashed border-border px-3 py-4 text-center text-[12.5px] text-sub">
                        {t('outline.lecture_empty')}
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-2 border-t border-border bg-canvas/35 p-2.5">
                        {lecture.exercises.map((exercise, index) => (
                          <ExerciseRow
                            academyId={academyId}
                            classId={classId}
                            exercise={exercise}
                            key={exercise.materialId}
                            label={formatProblemOutlineNumber(
                              module.position,
                              lecture.position,
                              index + 1,
                            )}
                          />
                        ))}
                      </ul>
                    )}
                  </Collapsible.Content>
                </section>
              </Collapsible.Root>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/**
 * The lecture card's scan line: how many problems, how many solved, and a bar.
 *
 * The count is always printed beside the bar rather than replaced by it —
 * width alone is not a number, and a bar is the first thing to become
 * unreadable at narrow widths or in high contrast.
 */
function LectureProgress({
  lecture,
}: {
  lecture: Module['lectures'][number];
}) {
  const { t } = useLayoutTranslation('learn');
  const progress = lectureProgress(lecture);
  if (progress.percent === null) return null;

  return (
    <span className="flex shrink-0 items-center gap-2 sm:w-44">
      <span className="whitespace-nowrap text-[12px] font-semibold text-sub">
        {t('outline.progress', {
          solved: progress.solved,
          total: progress.total,
        })}
      </span>
      <span
        aria-label={t('outline.lecture_progress_label', {
          title: lecture.title,
        })}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progress.percent}
        className="hidden h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-border sm:block"
        role="progressbar"
      >
        <span
          className="block h-full rounded-full bg-brand transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${progress.percent}%` }}
        />
      </span>
    </span>
  );
}
