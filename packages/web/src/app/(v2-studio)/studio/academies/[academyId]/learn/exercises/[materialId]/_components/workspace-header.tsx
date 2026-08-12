'use client';

import type { LearnExerciseWorkspace } from '@cove/shared';
import { formatDateTime } from '@cove/i18n/format';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  History,
  LoaderCircle,
  RotateCcw,
  Send,
} from 'lucide-react';
import Link from 'next/link';

import { useLayoutTranslation, useLocale } from '@/i18n';

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
  curriculum,
  workspace,
  saveState,
  onNavigate,
  navigationDisabled,
  onSubmit,
  onReset,
  reviewing,
  solveStartedAt,
  backHref,
  backToRecords = false,
  submitting,
  indicator,
  feedback,
}: {
  /**
   * The curriculum trigger, owned by the page so focus can return to it.
   *
   * Passed in rather than rendered here: the panel it controls lives beside
   * the workspace panes, and the two have to agree on one open state.
   */
  curriculum?: React.ReactNode;
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
  /** Running, submitting, or changing exercise owns navigation exclusively. */
  navigationDisabled: boolean;
  onSubmit: () => void;
  onReset: () => void;
  /**
   * The historical attempt this workspace was opened on, if any. Named in the
   * header so the reader knows which code they are looking at; everything
   * else about the workspace stays exactly as it always is.
   */
  reviewing?: { createdAt: string } | null;
  /** The server-issued origin the visible clock counts from. */
  solveStartedAt: string | null;
  /** Where Back goes — the validated records location, or the course. */
  backHref: string;
  /** True when Back returns to Answer records, so the label says so. */
  backToRecords?: boolean;
  submitting: boolean;
}) {
  const { t } = useLayoutTranslation(['learn', 'content']);
  const locale = useLocale();
  const { exercise, neighbors } = workspace;

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card px-4 py-2">
      <Link
        aria-label={
          backToRecords
            ? t('learn:workspace.back_to_records')
            : t('learn:workspace.back')
        }
        className="grid size-8 shrink-0 place-items-center rounded-lg text-sub transition-colors hover:bg-canvas hover:text-ink"
        href={backHref}
      >
        <ArrowLeft className="size-4" />
      </Link>

      {curriculum}

      <div className="min-w-0 flex-1">
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
          {/* Compact and factual: which attempt is on screen. Nothing here
              disables anything — the workspace stays fully editable. */}
          {reviewing ? (
            <span className="hidden shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand lg:inline-flex">
              <History className="size-3" />
              {t('learn:workspace.reviewing', {
                submitted: formatDateTime(reviewing.createdAt, locale),
              })}
            </span>
          ) : null}
        </div>
      </div>

      {/* Kept beside the indicator: both say something about the teacher, and
          a note is easiest to connect to "somebody is watching" when the two
          sit together rather than at opposite ends of the bar. */}
      {indicator}
      {feedback}

      <ExerciseTimer startedAt={solveStartedAt} />

      {saveState === 'idle' ? null : (
        <span
          aria-live="polite"
          className={`hidden shrink-0 text-[12px] font-medium sm:inline ${saveStateStyles[saveState]}`}
        >
          {t(`learn:workspace.save_state.${saveState}`)}
        </span>
      )}

      {/* Quiet control: available, but never competing with Submit. Reset acts
          on the workspace, so it belongs here; asking for a hint acts on the
          problem, and lives in the statement beside the text it explains. */}
      <QuietButton icon={RotateCcw} label={t('learn:workspace.reset')} onClick={onReset} />

      <nav className="flex shrink-0 items-center gap-1">
        <NavButton
          direction="previous"
          disabled={!neighbors.previous || navigationDisabled}
          label={t('learn:workspace.previous')}
          onClick={() =>
            neighbors.previous && onNavigate(neighbors.previous.materialId)
          }
        />
        <NavButton
          direction="next"
          disabled={!neighbors.next || navigationDisabled}
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
  icon: typeof RotateCcw;
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
