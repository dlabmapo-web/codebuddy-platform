'use client';

import type { LearnExerciseWorkspace } from '@cove/shared';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Lightbulb,
  RotateCcw,
  Send,
} from 'lucide-react';
import Link from 'next/link';

import { useLayoutTranslation } from '@/i18n';

import type { DraftSaveState } from '../_lib/draft-store';
import { ExerciseTimer } from './exercise-timer';

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
  onSubmit,
  onReset,
  onRevealHint,
  submitting,
  hintsRemaining,
  indicator,
  feedback,
}: {
  academyId: string;
  workspace: LearnExerciseWorkspace;
  /** The generic "a teacher is here" badge, or nothing when nobody is. */
  indicator?: React.ReactNode;
  /**
   * The teacher's written notes. Renders nothing until one exists, so an
   * unwatched student's header is exactly the header it always was.
   */
  feedback?: React.ReactNode;
  saveState: DraftSaveState;
  onNavigate: (materialId: string) => void;
  navigating: boolean;
  onSubmit: () => void;
  onReset: () => void;
  onRevealHint: () => void;
  submitting: boolean;
  hintsRemaining: number;
}) {
  const { t } = useLayoutTranslation(['learn', 'content']);
  const { breadcrumb, exercise, neighbors } = workspace;

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-white px-4 py-2">
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
        <div className="flex items-center gap-2">
          <h1 className="truncate text-[15px] font-bold leading-tight">
            {exercise.title}
          </h1>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
              difficultyStyles[exercise.difficulty]
            }`}
          >
            {t(`content:exercise.difficulty.${exercise.difficulty}`)}
          </span>
        </div>
      </div>

      {/* Kept beside the indicator: both say something about the teacher, and
          a note is easiest to connect to "somebody is watching" when the two
          sit together rather than at opposite ends of the bar. */}
      {indicator}
      {feedback}

      <ExerciseTimer key={exercise.materialId} />

      {saveState === 'idle' ? null : (
        <span
          aria-live="polite"
          className={`hidden shrink-0 text-[12px] font-medium sm:inline ${saveStateStyles[saveState]}`}
        >
          {t(`learn:workspace.save_state.${saveState}`)}
        </span>
      )}

      {/* Quiet controls: available, but never competing with Submit. */}
      {hintsRemaining > 0 ? (
        <QuietButton icon={Lightbulb} label={t('learn:workspace.hint')} onClick={onRevealHint} />
      ) : null}
      <QuietButton icon={RotateCcw} label={t('learn:workspace.reset')} onClick={onReset} />

      <nav className="flex shrink-0 items-center gap-1">
        <NavButton
          direction="previous"
          disabled={!neighbors.previous || navigating}
          label={t('learn:workspace.previous')}
          onClick={() =>
            neighbors.previous && onNavigate(neighbors.previous.materialId)
          }
        />
        <NavButton
          direction="next"
          disabled={!neighbors.next || navigating}
          label={t('learn:workspace.next')}
          onClick={() => neighbors.next && onNavigate(neighbors.next.materialId)}
        />
      </nav>

      <div className="flex shrink-0 items-center gap-1.5">
        {/* A light success treatment reads as the final/done action without
            competing with the terminal's blue Run control. */}
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3.5 text-[13px] font-bold text-success transition-colors hover:bg-success/20 disabled:opacity-50"
          disabled={submitting}
          onClick={onSubmit}
          type="button"
        >
          {submitting ? (
            <LoaderCircle className="size-3 animate-spin" />
          ) : (
            <Send className="size-3" />
          )}
          {t('learn:workspace.submit')}
        </button>
      </div>
    </header>
  );
}

function QuietButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Lightbulb;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-sub transition-colors hover:bg-canvas hover:text-ink md:px-2.5"
      onClick={onClick}
      type="button"
    >
      <Icon className="size-3.5" />
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}

/**
 * Labelled, not bare chevrons.
 *
 * Two unlabelled arrows side by side make the reader infer meaning from
 * position. The label collapses only below `sm`, where space genuinely forces
 * it, and the accessible name survives.
 */
function NavButton({
  direction,
  disabled,
  label,
  onClick,
}: {
  direction: 'previous' | 'next';
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  const Icon = direction === 'previous' ? ChevronLeft : ChevronRight;
  return (
    <button
      aria-label={label}
      className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-[13px] font-semibold text-sub transition-colors hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40 sm:px-2.5"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {direction === 'previous' ? <Icon className="size-3.5" /> : null}
      <span className="hidden sm:inline">{label}</span>
      {direction === 'next' ? <Icon className="size-3.5" /> : null}
    </button>
  );
}
