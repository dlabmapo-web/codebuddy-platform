'use client';

import { routes } from '@/lib/routes';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import type {
  MonitoringExercisePreview,
  MonitoringStudentContext,
} from '@cove/shared';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { useLayoutTranslation } from '@/i18n';

import { ConnectionBadge } from '@/app/(studio)/academy/[academySlug]/(framed)/teach/_components/live-badges';

const difficultyStyles = {
  EASY: 'bg-success/10 text-success',
  MEDIUM: 'bg-warning/10 text-warning',
  HARD: 'bg-danger/10 text-danger',
} as const;

/**
 * Whose workspace this is, and where it is.
 *
 * The student comes first and the exercise second, because a teacher arrives
 * here from a roster of people rather than a list of problems — and because
 * every pane below inherits the question this line answers: whose screen am I
 * on?
 */
export function LiveHeader({
  classId,
  connection,
  context,
  curriculum,
  exercise,
  liveStatus,
  unsaved,
  answer,
}: {
  classId: string;
  connection: React.ComponentProps<typeof ConnectionBadge>['state'];
  context: MonitoringStudentContext;
  /** The curriculum trigger, owned by the page so focus can return to it. */
  curriculum?: React.ReactNode;
  /**
   * The exercise on screen, which during a preview is not the student's.
   *
   * Deliberately the public projection: a header that took the live context
   * would be a second place holding a draft id, and it has no use for one.
   */
  exercise: MonitoringExercisePreview | null;
  /** Where the student actually is, said separately from where the screen is. */
  liveStatus?: string;
  unsaved: boolean;
  answer?: React.ReactNode;
}) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('monitoring');
  const { t: tc } = useLayoutTranslation('content');
  const student =
    context.student.displayName ??
    context.student.email ??
    context.student.membershipId;

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card px-3 py-2">
      <Link
        aria-label={t('workspace.back')}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-sub transition-colors hover:bg-canvas hover:text-ink"
        href={`${routes.academy(academySlug)}/teach/classes/${classId}`}
      >
        <ArrowLeft className="size-4" />
      </Link>

      {curriculum}

      <div className="flex min-w-0 items-center gap-2.5">
        {/* The peer violet, the same one their caret draws in. */}
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-peer-soft text-[13px] font-bold text-peer"
        >
          {[...student][0]?.toUpperCase() ?? '?'}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-bold leading-tight">
            {student}
          </p>
          <p className="truncate text-[11.5px] text-sub">{context.class.name}</p>
        </div>
      </div>

      {exercise ? (
        <div className="hidden min-w-0 flex-1 border-l border-border pl-3 xl:block">
          {/* Where the student is, which the path above deliberately does not
              say: during a preview those are two different exercises. */}
          <p aria-live="polite" className="truncate text-[11.5px] text-sub">
            {liveStatus ?? exercise.breadcrumb.course.title}
          </p>
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[14px] font-bold leading-tight">
              {exercise.exercise.title}
            </h1>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                difficultyStyles[exercise.exercise.difficulty]
              }`}
            >
              {tc(`exercise.difficulty.${exercise.exercise.difficulty}`)}
            </span>
          </div>
        </div>
      ) : (
        <p className="hidden flex-1 truncate border-l border-border pl-3 text-[12.5px] text-sub xl:block">
          {t('workspace.not_solving_title')}
        </p>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-3">
        {answer}
        <span
          aria-live="polite"
          className={`text-[12px] font-semibold ${
            unsaved ? 'text-draft' : 'text-success'
          }`}
          role="status"
        >
          {unsaved ? t('workspace.unsaved') : t('workspace.saved')}
        </span>
        <ConnectionBadge state={connection} />
      </div>
    </header>
  );
}
