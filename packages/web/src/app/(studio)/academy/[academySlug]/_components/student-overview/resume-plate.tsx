'use client';

import { routes } from '@/lib/routes';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import type { ContinueTarget } from '@cove/shared';
import { ArrowRight, BookOpen, PenLine, Play, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { TrackedExerciseLink } from '@/components/workspace/tracked-exercise-link';
import { cn } from '@/lib/utils';

import {
  CurriculumPath,
  EmptyState,
  OutlineChip,
  Panel,
  useRelativeDay,
} from './student-primitives';

/**
 * The signature surface: the door, with the coordinate written on it.
 *
 * Everything else on this page is a measurement. This is the one section that
 * is an *action*, and it is first because the question a child opens the app
 * with is not "how am I doing" — it is "what was I doing". A dashboard that
 * answered the second question first would be a dashboard built for the adult
 * reading over their shoulder.
 *
 * The coordinate is the anchor rather than an ornament. `2-3-4` is the module,
 * the lecture, and the problem, and it is what a student and a teacher both
 * say out loud in a classroom — so it is set large, in monospace, and the
 * title sits beside it rather than above it. A generic card would have put an
 * icon there instead, which would say nothing about which exercise this is.
 *
 * The plate carries the page's only action colour. §7.1 — orange means "do
 * this", and it appears exactly once so it keeps meaning it.
 *
 * See §7.3 of the student academy overview design.
 */
export function ResumePlate({
  academyId,
  isStale,
  targets,
}: {
  academyId: string;
  isStale: boolean;
  targets: ContinueTarget[];
}) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('learning');
  const relativeDay = useRelativeDay();
  const [primary, ...rest] = targets;

  if (!primary) {
    return (
      <Panel
        icon={BookOpen}
        id="resume"
        testId="resume-plate"
        title={t('resume.title')}
        tone="primary"
      >
        <EmptyState
          body={t('resume.empty_body')}
          icon={BookOpen}
          title={t('resume.empty_title')}
          tone="primary"
        />
      </Panel>
    );
  }

  const href = routes.academyLearnExercise(academySlug, primary.materialId);
  const when = relativeDay(primary.lastTouchedAt);

  return (
    <Panel
      description={t(`resume.description_${primary.kind}`)}
      icon={primary.kind === 'draft' ? PenLine : Sparkles}
      id="resume"
      testId="resume-plate"
      title={t('resume.title')}
      tone="primary"
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        {/*
         * The coordinate, at the size of a heading. It is the one piece of
         * text on this page a child reads before the words — a numbered card
         * pulled out of the box — so it gets the space that implies.
         */}
        <span
          aria-hidden
          className="grid shrink-0 place-items-center rounded-2xl bg-primary/10 px-3 py-2.5 text-center"
        >
          <span className="font-mono text-[22px] font-bold leading-none tracking-[-0.03em] text-primary tabular-nums sm:text-[26px]">
            {primary.outlineNumber ?? '•'}
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[19px] font-bold leading-tight tracking-[-0.015em] sm:text-[21px]">
            {primary.title}
          </h3>
          <div className="mt-1.5">
            <CurriculumPath
              course={primary.courseTitle}
              lecture={primary.lectureTitle}
              module={primary.moduleTitle}
            />
          </div>
          {primary.lineCount !== null || when ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-semibold text-primary">
              {primary.lineCount !== null ? (
                <span className="inline-flex items-center gap-1">
                  <PenLine aria-hidden className="size-3.5" />
                  {t('resume.lines', { count: primary.lineCount })}
                </span>
              ) : null}
              {when ? <span className="text-sub">{when}</span> : null}
            </p>
          ) : null}
        </div>

        <TrackedExerciseLink
          className={cn(
            'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5',
            'text-[14.5px] font-bold text-on-primary shadow-[var(--shadow-card)]',
            'transition-[opacity,transform] hover:opacity-90 active:scale-[0.98]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            'motion-reduce:transition-none motion-reduce:active:scale-100',
            isStale && 'pointer-events-none opacity-50',
          )}
          href={href}
        >
          <Play aria-hidden className="size-4" fill="currentColor" />
          {t(`resume.action_${primary.kind}`)}
        </TrackedExerciseLink>
      </div>

      {rest.length > 0 ? (
        <ul className="grid gap-px border-t border-border bg-border sm:grid-cols-2">
          {rest.map((target) => (
            <li key={target.materialId}>
              <TrackedExerciseLink
                className={cn(
                  'flex items-center gap-2.5 bg-card px-4 py-3 transition-colors hover:bg-accent',
                  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                  isStale && 'pointer-events-none opacity-50',
                )}
                href={routes.academyLearnExercise(
                  academySlug,
                  target.materialId,
                )}
              >
                <OutlineChip tone="primary" value={target.outlineNumber} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">
                    {target.title}
                  </span>
                  <CurriculumPath
                    course={target.courseTitle}
                    lecture={target.lectureTitle}
                  />
                </span>
                <ArrowRight aria-hidden className="size-4 shrink-0 text-sub" />
              </TrackedExerciseLink>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}
