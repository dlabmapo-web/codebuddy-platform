'use client';

import type { NavigatorPath } from '@cove/shared';
import { Menu } from 'lucide-react';
import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';

/**
 * Where the workspace is, and the control that opens the course beside it.
 *
 * The path describes the exercise on screen — which, on a teacher's screen
 * during a preview, is deliberately not the one the student is solving. The
 * live position is reported separately, by the banner that owns that fact.
 *
 * Held by both fullscreen headers so the two cannot drift into different
 * ideas of what "expanded" means or which element focus returns to.
 */
export const CurriculumTrigger = React.forwardRef<
  HTMLButtonElement,
  {
    open: boolean;
    onToggle: () => void;
    panelId: string;
    path: NavigatorPath | null;
  }
>(function CurriculumTrigger({ open, onToggle, panelId, path }, ref) {
  const { t } = useLayoutTranslation('learn');
  // The complete text, for a reader whose pointer is nowhere near it and for
  // one whose course titles are longer than the header is wide.
  const full = path
    ? [
        path.course.title,
        path.module.title,
        path.lecture.title,
        path.exercise.title,
      ].join(' › ')
    : t('navigator.title');

  return (
    <div className="flex min-w-0 items-center gap-2">
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={t('navigator.toggle')}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-sub hover:bg-canvas hover:text-ink"
        onClick={onToggle}
        ref={ref}
        type="button"
      >
        <Menu aria-hidden className="size-4" />
      </button>
      <span className="max-w-[8rem] truncate text-[12px] font-semibold text-sub lg:max-w-[12rem] xl:max-w-[16rem]" title={full}>
        {full}
      </span>
    </div>
  );
});
