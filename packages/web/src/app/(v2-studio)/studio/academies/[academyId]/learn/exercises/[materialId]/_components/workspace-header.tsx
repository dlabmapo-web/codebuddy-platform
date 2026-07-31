'use client';

import type { LearnExerciseWorkspace } from '@cove/shared';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { useLayoutTranslation } from '@/i18n';

import type { DraftSaveState } from '../_lib/draft-store';

const difficultyStyles = {
  EASY: 'bg-success/10 text-success',
  MEDIUM: 'bg-warning/10 text-warning',
  HARD: 'bg-danger/10 text-danger',
} as const;

/** `idle` is absent on purpose: an untouched draft has nothing to report. */
const saveStateStyles: Record<Exclude<DraftSaveState, 'idle'>, string> = {
  local: 'text-sub',
  saving: 'text-sub',
  saved: 'text-success',
  error: 'text-danger',
};

export function WorkspaceHeader({
  academyId,
  workspace,
  saveState,
  onNavigate,
  navigating,
}: {
  academyId: string;
  workspace: LearnExerciseWorkspace;
  saveState: DraftSaveState;
  onNavigate: (materialId: string) => void;
  navigating: boolean;
}) {
  const { t } = useLayoutTranslation(['learn', 'content']);
  const { breadcrumb, exercise, neighbors } = workspace;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-white px-4">
      <Link
        aria-label={t('learn:workspace.back')}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-sub transition-colors hover:bg-canvas hover:text-ink"
        href={`/studio/academies/${academyId}/learn/courses/${breadcrumb.course.id}?lecture=${breadcrumb.lecture.id}`}
      >
        <ArrowLeft className="size-4" />
      </Link>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[11.5px] text-sub">
          {breadcrumb.course.title} · {breadcrumb.module.title} ·{' '}
          {breadcrumb.lecture.title}
        </p>
        <h1 className="truncate text-[15px] font-bold leading-tight">
          {exercise.title}
        </h1>
      </div>

      <span
        className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold sm:inline ${
          difficultyStyles[exercise.difficulty]
        }`}
      >
        {t(`content:exercise.difficulty.${exercise.difficulty}`)}
      </span>

      {saveState === 'idle' ? null : (
        <span
          aria-live="polite"
          className={`hidden shrink-0 text-[12px] font-medium sm:inline ${saveStateStyles[saveState]}`}
        >
          {t(`learn:workspace.save_state.${saveState}`)}
        </span>
      )}

      <div className="flex shrink-0 items-center gap-1">
        <button
          aria-label={t('learn:workspace.previous')}
          className="grid size-8 place-items-center rounded-lg border border-border text-sub transition-colors hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!neighbors.previous || navigating}
          onClick={() =>
            neighbors.previous && onNavigate(neighbors.previous.materialId)
          }
          type="button"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          aria-label={t('learn:workspace.next')}
          className="grid size-8 place-items-center rounded-lg border border-border text-sub transition-colors hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!neighbors.next || navigating}
          onClick={() => neighbors.next && onNavigate(neighbors.next.materialId)}
          type="button"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </header>
  );
}
