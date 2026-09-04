'use client';

import type { LearnCourseSummary } from '@cove/shared';
import { BookOpen, Check } from 'lucide-react';
import Link from 'next/link';

import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { useLayoutTranslation } from '@/i18n';
import { routes } from '@/lib/routes';

import { courseAccent, courseAccentClasses } from '@/lib/course-accent';

/**
 * One course, wherever a student meets it.
 *
 * Shared by **My Courses** and a class detail page rather than owned by the
 * catalog route. Both show the same course, and a second copy is how the two
 * surfaces would start reporting different counts or progress for it. The
 * destination is the academy-level course route on purpose: access means
 * access through any eligible class, so the URL a student remembers keeps
 * working when one class path goes away and another still grants the course.
 *
 * A shelf, not a grid of forms. The coloured spine down the left edge and the
 * tinted tile beside the title are the course's own identity — derived from
 * its id, so it is the same colour every time — and together they are what
 * lets somebody find 파이썬 기초 among four cards without reading four titles.
 * Nothing else on the card takes that colour; see the `--course-*` note in
 * `globals.css`.
 *
 * The footer says where you are, and says it differently depending on where
 * that is. A course nobody has opened leads with what it is offering — its
 * problem count, and an invitation — and draws no progress bar at all, because
 * an empty bar is a promise of nothing and four of them in a row read as a
 * page that is broken. A course underway gets the bar, because then it has
 * something to show. A finished one gets a check and stops measuring.
 */
export function CourseCard({
  academyId,
  classId,
  course,
}: {
  academyId: string;
  classId?: string;
  course: LearnCourseSummary;
}) {
  const academySlug = useAcademySlug();
  const { t } = useLayoutTranslation('learn');
  const { counts, progress } = course;
  const accent = courseAccentClasses[courseAccent(course.courseId)];

  const completion =
    progress.total > 0
      ? Math.round((progress.solved / progress.total) * 100)
      : 0;
  const done = progress.total > 0 && progress.solved === progress.total;
  const underway = !done && (progress.solved > 0 || progress.started > 0);
  // The course is published but nothing inside it is visible yet. The card is
  // still here — a student told they have this course should find it — but
  // "Start →" would be a promise the outline behind it cannot keep.
  const notReady = counts.exercises === 0;

  return (
    <Link
      className="group relative flex flex-col overflow-hidden rounded-card border border-border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      href={`${routes.academy(academySlug)}/learn/courses/${course.courseId}${classId ? `?classId=${classId}` : ''}`}
    >
      {/* The spine. Widens on hover the way a book tips out of a shelf — the
          one piece of motion here that is about this card rather than about
          cards in general. */}
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-1 transition-[width] duration-200 group-hover:w-1.5 motion-reduce:transition-none ${accent.spine}`}
      />

      <div className="flex items-start gap-3">
        {/* Solid, not tinted. This is the course itself, and a pale wash
            behind a book glyph reads as a placeholder for an icon rather than
            as the course's own mark. The `tint` weight is for rows that point
            back here from somewhere else — see `courseAccentClasses`. */}
        <span
          aria-hidden
          className={`grid size-10 shrink-0 place-items-center rounded-lg ${accent.mark}`}
        >
          <BookOpen className="size-5" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[16px] font-extrabold tracking-[-0.015em]">
            {course.title}
          </h3>
          {/* No reserved height. A one-line description used to leave a blank
              line under it on every card in the grid; the footer is pinned to
              the bottom instead, which keeps the row even without padding the
              text out. */}
          <p className="mt-1 line-clamp-2 text-[13px] leading-[1.6] text-sub">
            {course.description}
          </p>
        </div>
      </div>

      {/* `mt-auto` rather than a fixed gap: cards in a row share a height, and
          this puts every footer on the same line regardless of title wrap. */}
      {/* `mt-auto` pins every footer in a row to the same line: grid items
          stretch to the tallest card, and without it a short description
          left its counts floating halfway up. `mt-5` was doing that job
          with a reserved height on the description instead, which padded
          out one-line copy on every card in the grid. */}
      <div className="mt-auto flex items-end justify-between gap-3 border-t border-border pt-5">
        <div className="min-w-0">
          {/*
           * The problem count is what a student actually compares courses by,
           * and it was the smallest, greyest text on the card. It leads now.
           *
           * Kept as one phrase rather than a big numeral with a noun beside it:
           * Korean puts the count after the noun and closes it with a counter
           * — 문제 194개 — so isolating the digit would leave the label
           * stranded in the wrong order for most of the people reading this.
           * Weight carries the emphasis instead of layout.
           */}
          <p className="text-[15px] font-extrabold tracking-[-0.01em] tabular">
            {t('catalog.problems', { count: counts.exercises })}
          </p>
          <p className="mt-1 truncate text-[12px] text-sub">
            {t('catalog.structure', {
              count: counts.modules,
              modules: counts.modules,
              lectures: counts.lectures,
            })}
          </p>
        </div>

        {done ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[12px] font-bold text-success">
            <Check className="size-3.5" strokeWidth={2.5} />
            {t('catalog.complete')}
          </span>
        ) : underway ? (
          <span className="shrink-0 text-[12px] font-bold text-brand tabular">
            {t('catalog.solved_of', {
              solved: progress.solved,
              total: progress.total,
            })}
          </span>
        ) : notReady ? (
          <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[12px] font-bold text-sub">
            {t('catalog.not_ready')}
          </span>
        ) : (
          <span className="shrink-0 text-[12.5px] font-bold text-brand transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none">
            {t('catalog.start')} →
          </span>
        )}
      </div>

      {/* Only once there is something to show. */}
      {underway ? (
        <div
          aria-hidden
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-accent"
        >
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${completion}%` }}
          />
        </div>
      ) : null}
    </Link>
  );
}
