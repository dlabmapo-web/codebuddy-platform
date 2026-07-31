'use client';

import type { LearnCourseOutline } from '@cove/shared';
import { ChevronDown } from 'lucide-react';
import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';

import { ExerciseRow } from './exercise-row';

type Module = LearnCourseOutline['modules'][number];

export function ModuleSection({
  academyId,
  expanded,
  module,
  onToggle,
  requestedLectureId,
}: {
  academyId: string;
  expanded: boolean;
  module: Module;
  onToggle: () => void;
  requestedLectureId: string | null;
}) {
  const { t } = useLayoutTranslation('learn');
  const exerciseCount = module.lectures.reduce(
    (total, lecture) => total + lecture.exercises.length,
    0,
  );

  return (
    <section
      className={`overflow-hidden rounded-card border bg-white transition-colors ${
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
              <section
                id={`lecture-${lecture.id}`}
                key={lecture.id}
                // A deep link needs a scroll target that survives the collapse
                // state, so the anchor lives on the lecture, not the module.
                className={
                  lecture.id === requestedLectureId
                    ? 'rounded-lg ring-2 ring-brand/30'
                    : undefined
                }
              >
                <header className="px-1 pb-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-sub">
                    {t('outline.lecture_label', { position: lecture.position })}
                  </span>
                  <h3 className="text-[13.5px] font-bold">{lecture.title}</h3>
                </header>
                {lecture.exercises.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[12.5px] text-sub">
                    {t('outline.lecture_empty')}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {lecture.exercises.map((exercise, index) => (
                      <ExerciseRow
                        academyId={academyId}
                        exercise={exercise}
                        key={exercise.materialId}
                        label={`${module.position}-${lecture.position}.${index + 1}`}
                      />
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
