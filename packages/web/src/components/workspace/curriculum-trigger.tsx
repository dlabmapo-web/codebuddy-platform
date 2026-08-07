'use client';

import type { NavigatorPath } from '@cove/shared';
import { ListTree } from 'lucide-react';
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
    <button
      aria-controls={panelId}
      aria-expanded={open}
      // A ceiling that grows with the header rather than one fixed width.
      // Without it this button's basis is the whole path, so on a narrow
      // header it outbids the exercise title beside it — which is how the
      // title ended up rendered as a single letter. The path is context; the
      // title is the answer to "what am I solving", and it wins ties.
      className={`flex h-8 min-w-0 max-w-[8rem] shrink items-center gap-1.5 rounded-lg border px-2 text-[12px] font-semibold transition-colors lg:max-w-[12rem] xl:max-w-[16rem] ${
        open
          ? 'border-brand/40 bg-brand-soft text-brand'
          : 'border-border text-sub hover:border-brand/40 hover:text-brand'
      }`}
      onClick={onToggle}
      ref={ref}
      title={full}
      type="button"
    >
      <ListTree aria-hidden className="size-3.5 shrink-0" />
      <span className="sr-only">{t('navigator.toggle')}</span>
      {/* Truncated rather than dropped: the complete path stays reachable at
          every width through the tooltip and the accessible name. */}
      <span className="min-w-0 truncate">{full}</span>
    </button>
  );
});
