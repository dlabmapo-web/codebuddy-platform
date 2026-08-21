'use client';

import type { CurriculumCatalog } from '@cove/shared';
import {
  BookOpen,
  GraduationCap,
  Layers,
  Presentation,
  Puzzle,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { visibilitySpine } from '../../_lib/lead-view';

/**
 * The curriculum, as one bar and five figures — and the first thing on the page.
 *
 * The spine is this page's signature, so it is drawn at the size of a claim
 * rather than the size of a footnote. Every authored exercise in the academy is
 * in this bar, split by what a student can actually reach, which is a question
 * no course editor can answer because burying is something an *ancestor* does.
 *
 * The three counts are set at display size in their own hues and read left to
 * right *before* the bar, because the number is the answer and the bar is the
 * proportion. Underneath, they are one bar rather than three cards: they are
 * parts of one whole and they sum to it, and three cards would invite the
 * reader to compare them as independent quantities — the reading that makes
 * "6 buried" look small beside "340 total" instead of looking like six
 * exercises somebody wrote and nobody can open.
 *
 * A segment with nothing in it draws as nothing and still appears in the
 * legend. "No buried exercises" is an answer and a missing label is not.
 *
 * ## Why the four figures are four colours
 *
 * Course, module, lecture, exercise is a containment order, not four unrelated
 * counts, and the hues run in that order so the eye reads the hierarchy before
 * it reads a single word. This is the one place on the page where colour marks
 * a *level* rather than a section, and it is safe precisely because these four
 * always appear together and always in this order.
 */
export function CatalogPlate({ catalog }: { catalog: CurriculumCatalog }) {
  const { t } = useTranslation('lead');
  const segments = visibilitySpine(catalog.exercises);

  return (
    <div className="flex flex-col">
      {/* ------------------------------------------------------- the spine */}
      <section
        aria-labelledby="spine-title"
        className="border-b border-border px-4 pb-5 pt-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3
            className="text-[12px] font-bold uppercase tracking-[0.06em] text-sub"
            id="spine-title"
          >
            {t('catalog.spine_title')}
          </h3>
          <p className="font-mono text-[12px] font-bold tabular-nums text-sub">
            {t('catalog.spine_total', { count: catalog.exercises.total })}
          </p>
        </div>

        {/* The counts first, at the size of the claim they are. */}
        <ul className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
          {segments.map((segment) => (
            <li className="flex flex-col gap-1" key={segment.key}>
              <span
                className={cn(
                  'font-mono text-[30px] font-extrabold leading-none tabular-nums tracking-[-0.02em]',
                  // A nought stays grey. "0 buried" is the best answer this bar
                  // can give, and set at display size in amber it is the
                  // loudest thing on the page saying nothing is wrong.
                  segment.count > 0 ? segment.text : 'text-sub/50',
                )}
              >
                {segment.count}
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={cn('size-2 shrink-0 rounded-full', segment.fill)}
                />
                <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-sub">
                  {t(`catalog.spine_${segment.key}`)}
                </span>
              </span>
            </li>
          ))}
        </ul>

        {/*
         * One bar, three segments, drawn from raw shares rather than rounded
         * percentages: three rounded values do not add to a hundred and would
         * leave a visible seam at the right edge on most academies.
         */}
        <div
          aria-hidden
          className="mt-4 flex h-3.5 w-full gap-0.5 overflow-hidden rounded-full bg-accent"
        >
          {segments.map((segment) =>
            segment.count > 0 ? (
              <span
                className={cn(
                  'h-full transition-[width] duration-500 first:rounded-l-full last:rounded-r-full motion-reduce:transition-none',
                  segment.fill,
                )}
                key={segment.key}
                style={{ width: `${segment.percent}%` }}
              />
            ) : null,
          )}
        </div>

        {/*
         * The one segment worth a sentence. Buried content is the only state on
         * this bar a Team Lead did not choose, so it gets an explanation rather
         * than leaving them to work out how an exercise they set visible is not.
         */}
        {catalog.exercises.buried > 0 ? (
          <p className="mt-3.5 flex items-start gap-2 rounded-xl bg-draft/10 px-3 py-2.5 text-[12.5px] leading-[1.5] text-draft">
            <TriangleAlert
              aria-hidden
              className="mt-px size-4 shrink-0"
              strokeWidth={2.25}
            />
            <span>{t('catalog.buried_hint', { count: catalog.exercises.buried })}</span>
          </p>
        ) : null}
      </section>

      {/* -------------------------------------------------- the four levels */}
      <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          icon={BookOpen}
          label={t('catalog.courses')}
          sub={t('catalog.of_visible', {
            visible: catalog.courses.visible,
            total: catalog.courses.total,
          })}
          tone="text-brand"
          value={catalog.courses.total}
          wash="bg-brand/10 text-brand"
        />
        <Figure
          icon={Layers}
          label={t('catalog.modules')}
          sub={t('catalog.of_visible', {
            visible: catalog.modules.visible,
            total: catalog.modules.total,
          })}
          tone="text-peer"
          value={catalog.modules.total}
          wash="bg-peer/10 text-peer"
        />
        <Figure
          icon={Presentation}
          label={t('catalog.lectures')}
          sub={t('catalog.of_visible', {
            visible: catalog.lectures.visible,
            total: catalog.lectures.total,
          })}
          tone="text-teal"
          value={catalog.lectures.total}
          wash="bg-teal/10 text-teal"
        />
        <Figure
          icon={Puzzle}
          label={t('catalog.exercises')}
          sub={t('catalog.difficulty_mix', {
            easy: catalog.difficulty.EASY,
            medium: catalog.difficulty.MEDIUM,
            hard: catalog.difficulty.HARD,
          })}
          tone="text-primary"
          value={catalog.exercises.total}
          wash="bg-primary/10 text-primary"
        />
      </div>

      {/*
       * Reach, as a sentence rather than two more tiles. "Taught" and "shelved"
       * are facts about the same courses counted above, and giving them their
       * own tiles would imply they add to something.
       */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border bg-muted px-4 py-3">
        {/*
         * Two clauses rather than one sentence with two numbers in it. Only one
         * can drive a plural form, and "2 courses taught to 1 students" is what
         * a single interpolated string produces.
         */}
        <span className="flex items-center gap-2">
          <GraduationCap aria-hidden className="size-4 shrink-0 text-brand" />
          <span className="text-[12.5px] font-semibold text-ink">
            {t('catalog.taught', { count: catalog.taughtCourses })}
            {', '}
            {t('catalog.students_reached', { count: catalog.studentsReached })}
          </span>
        </span>
        {catalog.shelvedCourses > 0 ? (
          <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-sub">
            <span aria-hidden className="size-1.5 rounded-full bg-draft" />
            {t('catalog.shelved', { count: catalog.shelvedCourses })}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** One level of the curriculum, with the icon and hue that say which. */
function Figure({
  icon: Icon,
  label,
  sub,
  tone,
  value,
  wash,
}: {
  icon: LucideIcon;
  label: string;
  sub: string;
  tone: string;
  value: number;
  wash: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-card p-4">
      <span
        aria-hidden
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-xl',
          wash,
        )}
      >
        <Icon className="size-[1.15rem]" strokeWidth={2.25} />
      </span>
      <div className="min-w-0">
        <p className="flex items-baseline gap-1.5">
          <span
            className={cn(
              'font-mono text-[22px] font-extrabold leading-none tabular-nums',
              tone,
            )}
          >
            {value}
          </span>
          <span className="truncate text-[12.5px] font-bold">{label}</span>
        </p>
        <p className="mt-1 truncate text-[11.5px] text-sub">{sub}</p>
      </div>
    </div>
  );
}
