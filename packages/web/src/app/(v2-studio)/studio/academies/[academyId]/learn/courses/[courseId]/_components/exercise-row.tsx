'use client';

import type { LearnExerciseSummary } from '@cove/shared';
import { CheckCircle2, ChevronRight, Circle, Clock3 } from 'lucide-react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';

/** Matches the difficulty scale the course builder and exercise preview use. */
const difficultyStyles = {
  EASY: 'bg-success/10 text-success',
  MEDIUM: 'bg-warning/10 text-warning',
  HARD: 'bg-danger/10 text-danger',
} as const;

const statusStyles: Record<
  LearnExerciseSummary['status'],
  { className: string; Icon: LucideIcon }
> = {
  NOT_STARTED: { className: 'bg-canvas text-sub', Icon: Circle },
  IN_PROGRESS: { className: 'bg-draft-soft text-draft', Icon: Clock3 },
  SOLVED: { className: 'bg-success/10 text-success', Icon: CheckCircle2 },
};

export function ExerciseRow({
  academyId,
  exercise,
  label,
}: {
  academyId: string;
  exercise: LearnExerciseSummary;
  /** Position within the course, e.g. `2-3`, shown as a stable handle. */
  label: string;
}) {
  const { t } = useLayoutTranslation(['learn', 'content']);
  const status = statusStyles[exercise.status];

  return (
    <li>
      <Link
        className="group flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-all hover:border-brand/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        href={`/studio/academies/${academyId}/learn/exercises/${exercise.materialId}`}
      >
        <span className="grid h-7 min-w-11 shrink-0 place-items-center rounded-md bg-canvas px-1.5 font-mono text-[11.5px] font-bold text-sub">
          {label}
        </span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold transition-colors group-hover:text-brand">
          {exercise.title}
        </span>
        <span
          className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold sm:inline ${
            difficultyStyles[exercise.difficulty]
          }`}
        >
          {t(`content:exercise.difficulty.${exercise.difficulty}`)}
        </span>
        {exercise.bestScore > 0 ? (
          <span className="shrink-0 font-mono text-[11.5px] font-bold text-sub">
            {t('learn:outline.score', { score: exercise.bestScore })}
          </span>
        ) : null}
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${status.className}`}
        >
          <status.Icon className="size-3" />
          <span className="hidden sm:inline">
            {t(`learn:status.${exercise.status}`)}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-sub transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
      </Link>
    </li>
  );
}
