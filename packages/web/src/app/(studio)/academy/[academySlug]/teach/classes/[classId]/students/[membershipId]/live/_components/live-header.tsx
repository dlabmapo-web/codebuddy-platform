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
  studentSwitcher,
  classId,
  connection,
  curriculum,
  exercise,
  liveStatus,
  unsaved,
  answer,
  helpMode,
  helpQueue,
}: {
  studentSwitcher: React.ReactNode;
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
  /**
   * The read-only / help control, owned by the page.
   *
   * Passed in rather than built here for the same reason `answer` is: the
   * header knows where things go, and the page knows what the server has
   * agreed to.
   */
  helpMode?: React.ReactNode;
  helpQueue?: React.ReactNode;
}) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('monitoring');
  const { t: tc } = useLayoutTranslation('courses');


  return (
    <header className="shrink-0 border-b border-border bg-card px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <Link data-monitoring-class-exit aria-label={t('workspace.back')}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-sub hover:bg-canvas hover:text-ink"
          href={`${routes.academy(academySlug)}/teach/classes/${classId}`}><ArrowLeft aria-hidden className="size-4" /></Link>
        {curriculum}
        <div className="min-w-0 flex-1">{studentSwitcher}</div>
        <span aria-live="polite" role="status" className={`shrink-0 text-xs font-semibold ${unsaved ? 'text-draft' : 'text-success'}`}>{unsaved ? t('workspace.unsaved') : t('workspace.saved')}</span>
        <ConnectionBadge state={connection} />
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-border pt-2.5">
        <div className="min-w-0 flex-1 basis-52">
          <p aria-live="polite" className="truncate text-xs text-sub">{liveStatus ?? exercise?.breadcrumb.course.title}</p>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <h1 className="truncate text-base font-bold leading-6">{exercise?.exercise.title ?? t('workspace.not_solving_title')}</h1>
            {exercise ? <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${difficultyStyles[exercise.exercise.difficulty]}`}>{tc(`exercise.difficulty.${exercise.exercise.difficulty}`)}</span> : null}
          </div>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">{helpQueue}{helpMode}{answer}</div>
      </div>
    </header>
  );
}
