'use client';

import type { LearnDraftSummary } from '@cove/shared';
import { Code2, PenLine, X } from 'lucide-react';
import * as React from 'react';

import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { TrackedExerciseLink } from '@/components/workspace/tracked-exercise-link';
import { useMinuteClock } from '@/hooks/use-minute-clock';
import { useLayoutTranslation, useLocale } from '@/i18n';
import { routes } from '@/lib/routes';

import { courseAccent, courseAccentClasses } from '../../_lib/course-accent';
import { byMostRecent, elapsedSince } from '../../_lib/elapsed';

/**
 * How many drafts stand above the fold.
 *
 * Four, because the panel is not the page. My Courses is about courses, and a
 * student with twenty saved drafts used to get ten rows of them before the
 * first course card — the thing they came for pushed off the screen by a
 * shortcut back to something they already left. Four fills two rows at the
 * two-column width and leaves the shelf visible underneath.
 */
const ABOVE_THE_FOLD = 4;

/**
 * v1's `이어서 풀기` drawer, kept because it is the fastest route back into
 * work a student already started.
 *
 * Ordered newest first and capped. Both follow from the same fact: the draft
 * somebody came back for is almost always the last one they touched, so the
 * list has one useful row and nineteen that are context. Sorting puts that row
 * where the eye lands, and the cap stops the other nineteen from taking the
 * page. The rest are one press away, in a region that scrolls itself rather
 * than growing without limit.
 *
 * Each row wears its course's colour — the same hue that course's card carries
 * in the shelf below, in the pale weight rather than the solid one. That is
 * what makes a long list scannable: four drafts from 알고리즘 입문 read as one
 * group without being labelled as one, and the row points at the card it came
 * from without a word of explanation.
 */
export function ContinuePanel({
  drafts,
  discard,
  discardingId,
}: {
  drafts: LearnDraftSummary[];
  discard: (materialId: string) => void;
  discardingId: string | null;
}) {
  const academySlug = useAcademySlug();
  const locale = useLocale();
  const { t } = useLayoutTranslation('learn');
  const [expanded, setExpanded] = React.useState(false);

  // `null` until the first client render, so no clock reaches the server HTML
  // and the rows carry no time until there is a real one to show.
  const now = useMinuteClock();

  const relative = React.useMemo(
    () => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }),
    [locale],
  );

  const ordered = React.useMemo(() => [...drafts].sort(byMostRecent), [drafts]);

  if (ordered.length === 0) return null;

  const shown = expanded ? ordered : ordered.slice(0, ABOVE_THE_FOLD);
  const hidden = ordered.length - shown.length;

  function savedWhen(draft: LearnDraftSummary) {
    if (now === null) return null;
    const elapsed = elapsedSince(draft.updatedAt, now);
    if (!elapsed) return null;
    const [value, unit] = elapsed;
    return value === 0 ? t('continue.saved_now') : relative.format(value, unit);
  }

  return (
    <section className="overflow-hidden rounded-card border border-brand/25 bg-brand-soft/40">
      <header className="flex items-center gap-2.5 px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-card text-brand">
          <PenLine className="size-4" />
        </span>
        <h2 className="text-[14px] font-bold">{t('continue.title')}</h2>
        <span className="text-[12.5px] text-sub">
          {t('continue.subtitle', { count: ordered.length })}
        </span>
      </header>

      {/*
       * Bounded once expanded. A student with forty drafts pressing "show more"
       * should get the rest of the list, not a page they have to scroll past
       * to reach their courses again.
       */}
      <ul
        className={
          expanded
            ? 'grid max-h-80 gap-px overflow-y-auto bg-border sm:grid-cols-2'
            : 'grid gap-px bg-border sm:grid-cols-2'
        }
      >
        {shown.map((draft) => {
          const accent = courseAccentClasses[courseAccent(draft.courseId)];
          const when = savedWhen(draft);
          return (
            <li
              className="flex items-center gap-3 bg-card px-4 py-3"
              key={draft.materialId}
            >
              <span
                aria-hidden
                className={`grid size-9 shrink-0 place-items-center rounded-lg ${accent.tint}`}
              >
                <Code2 className="size-4" />
              </span>
              <TrackedExerciseLink
                className="min-w-0 flex-1 outline-none focus-visible:underline"
                href={routes.academyLearnExercise(academySlug, draft.materialId)}
              >
                <span className="block truncate text-[13.5px] font-semibold">
                  {draft.exerciseTitle}
                </span>
                <span className="block truncate text-[11.5px] text-sub">
                  {draft.courseTitle} ·{' '}
                  {draft.lineCount > 0
                    ? t('continue.lines', { count: draft.lineCount })
                    : t('continue.empty_lines')}
                  {when ? (
                    <time dateTime={draft.updatedAt}>{` · ${when}`}</time>
                  ) : null}
                </span>
              </TrackedExerciseLink>
              <button
                aria-label={t('continue.discard')}
                className="grid size-7 shrink-0 place-items-center rounded-lg text-sub transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                disabled={discardingId === draft.materialId}
                onClick={() => discard(draft.materialId)}
                title={t('continue.discard')}
                type="button"
              >
                <X className="size-3.5" />
              </button>
            </li>
          );
        })}
      </ul>

      {ordered.length > ABOVE_THE_FOLD ? (
        <div className="border-t border-brand/15 bg-card">
          <button
            aria-expanded={expanded}
            className="w-full px-4 py-2.5 text-[12.5px] font-bold text-brand transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40"
            onClick={() => setExpanded((open) => !open)}
            type="button"
          >
            {expanded
              ? t('continue.show_fewer')
              : t('continue.show_all', { count: hidden })}
          </button>
        </div>
      ) : null}
    </section>
  );
}
