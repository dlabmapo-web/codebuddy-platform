'use client';

import type { ContentLens, PlatformContentSummary } from '@cove/shared';
import { ArrowUpRight, Building2, Zap } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { toneStyles } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/overview-ui/panel';
import { cn } from '@/lib/utils';

import { contentLensHrefs, lensIcons, lensTones } from '../../_lib/content-view';

/**
 * The wash a reachable tile takes on hover, spelled out per tone.
 *
 * Written as whole class names rather than assembled from `toneStyles.wash`:
 * Tailwind scans source text, so a class built at runtime is a class that was
 * never compiled — the tile would simply not respond.
 */
const tileHover = {
  brand: 'hover:border-brand/30 hover:bg-brand/[0.06]',
  teal: 'hover:border-teal/30 hover:bg-teal/[0.06]',
} as const satisfies Record<(typeof lensTones)[ContentLens], string>;

/**
 * What the platform holds, before a single row is read.
 *
 * Three tiles, not four. The academy count is the *denominator* the other
 * three are measured against rather than a fourth kind of content, so it sits
 * in the header line beside a `Building2` mark — exactly where
 * `UserComposition` puts its own — and a fourth identical tile would read as a
 * fourth content type.
 *
 * No proportion band either, for the reason `UserComposition` draws one:
 * students, teachers and managers are parts of one whole. Courses, classes and
 * problems are three different things at three different scales, and a bar
 * splitting 148 against 1,284 would be a picture of nothing.
 *
 * **The second line is the point.** A total tells an operator the platform is
 * large; `37 cannot grade` tells them what to do this morning. Each tile names
 * the one fault its kind can have and wears `danger` only when that number is
 * above zero — so an untroubled platform is a quiet page.
 *
 * ## Whose numbers these are
 *
 * The counts have always followed the academy facet — narrow to one academy and
 * the three tiles are that academy's — but the strip only ever said *"across 1
 * academy"*, which is a number, not an answer. An operator handling a support
 * call about D.Lab Mapo had to remember that they were the one who set the
 * filter.
 *
 * So the header states its own scope. Narrowed to a single academy, the strip
 * takes that academy's name and slug and becomes its card; on the whole
 * platform, or on several academies at once, it keeps the totals heading and
 * counts the academies behind them. One glance answers "how many courses and
 * problems does this academy have", which is the question that brings anybody
 * to this page in the first place.
 *
 * ## Two tiles navigate, one does not
 *
 * This component was written under the rule *nothing here is a link*, on the
 * grounds that a tile which **filtered** on click would be the lens tabs again
 * with the pills repainted. That objection stands, and this is not it: the type
 * chip that used to switch lists is gone, Courses and Classes are pages in the
 * rail now, and a tile that **navigates** to the page it is already naming is
 * the shortest honest path between two numbers an operator reads together.
 *
 * The Problems tile stays a plain read-out, because there is no problems page
 * to send anybody to — a problem is reached by opening its course. The
 * difference is drawn, not explained: the two destinations carry a hover arrow
 * and a focus ring, and the statistic carries neither. Its `cannot grade`
 * number is acted on one level up, in the Courses table's own column.
 */
export function ContentSummary({
  academy,
  active,
  summary,
}: {
  /** The one academy in scope, when the facet holds exactly one. */
  academy?: { name: string; slug: string } | null;
  active: ContentLens;
  summary: PlatformContentSummary;
}) {
  const { t } = useTranslation('platform-content');
  const stats = [
    {
      kind: 'courses' as const,
      label: t('lens.courses'),
      total: summary.courses.total,
      lines: [
        { text: t('summary.published', { count: summary.courses.published }) },
        {
          text: t('summary.draft', {
            count: summary.courses.total - summary.courses.published,
          }),
        },
      ],
    },
    {
      kind: 'classes' as const,
      label: t('lens.classes'),
      total: summary.classes.total,
      lines: [
        { text: t('summary.running', { count: summary.classes.running }) },
        {
          text: t('summary.no_teacher', { count: summary.classes.withoutTeacher }),
          danger: summary.classes.withoutTeacher > 0,
        },
      ],
    },
    {
      kind: 'problems' as const,
      label: t('summary.problems'),
      total: summary.problems.total,
      lines: [
        {
          text: t('summary.no_tests', { count: summary.problems.withoutTests }),
          danger: summary.problems.withoutTests > 0,
        },
      ],
    },
  ];

  return (
    <section
      aria-label={t('summary.label')}
      className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow-card)]"
      data-testid="content-summary"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-5">
        {academy ? (
          <>
            {/* The mark moves to the front of the name: scoped, the strip is
                that academy's card, and the thing to read first is whose. */}
            <h2 className="flex min-w-0 items-center gap-2 text-[15px] font-bold text-ink">
              <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-muted text-sub">
                <Building2 className="size-3.5" strokeWidth={2.5} />
              </span>
              <span className="truncate">{academy.name}</span>
            </h2>
            {/* The slug, as the academy column of every console table prints
                it — the operator's own handle for one academy. */}
            <p className="truncate font-mono text-[13px] font-bold text-sub">
              /{academy.slug}
            </p>
          </>
        ) : (
          <>
            <h2 className="text-[15px] font-bold text-ink">
              {t('summary.heading')}
            </h2>
            <p className="flex items-center gap-1.5 text-[13.5px] font-bold text-sub">
              <span className="grid size-6 place-items-center rounded-lg bg-muted text-sub">
                <Building2 className="size-3.5" strokeWidth={2.5} />
              </span>
              {t('summary.scope', { count: summary.academies })}
            </p>
          </>
        )}
      </div>
      <ul className="grid gap-2 px-5 pb-5 sm:grid-cols-3">
        {stats.map((stat) => {
          // Null for problems, which is the whole difference: a tile with a
          // page behind it, and a tile that is only a number.
          const lens: ContentLens | null =
            stat.kind === 'problems' ? null : stat.kind;
          const here = stat.kind === active;
          const goes = lens && !here ? lens : null;
          const Icon = lens ? lensIcons[lens] : Zap;
          const styles = toneStyles[lens ? lensTones[lens] : 'peer'];
          const body = (
            <>
              {/* The rail is reserved for "you are here". A tile that is
                  merely reachable earns a wash on hover instead, so the two
                  states never look like the same claim. */}
              {here ? (
                <span
                  aria-hidden
                  className={cn('absolute inset-y-0 left-0 w-1', styles.rail)}
                />
              ) : null}
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'grid size-9 place-items-center rounded-lg',
                    styles.chip,
                  )}
                >
                  <Icon className="size-[1.15rem]" strokeWidth={2.25} />
                </span>
                <span>
                  <span className="block font-mono text-[22px] font-extrabold leading-none tabular-nums text-ink">
                    {stat.total}
                  </span>
                  <span className="mt-1 block text-[12px] font-bold text-sub">
                    {stat.label}
                  </span>
                </span>
                {goes ? (
                  <ArrowUpRight
                    aria-hidden
                    className="ml-auto size-4 shrink-0 text-sub opacity-0 transition-opacity group-hover/tile:opacity-100 group-focus-visible/tile:opacity-100"
                  />
                ) : null}
              </div>
              <div className="mt-3 grid gap-0.5 text-[12.5px] font-semibold text-sub">
                {stat.lines.map((line) => (
                  <span
                    className={
                      'danger' in line && line.danger ? 'text-danger' : undefined
                    }
                    key={line.text}
                  >
                    {line.text}
                  </span>
                ))}
              </div>
            </>
          );
          // `h-full` because the box moved inside the `li` when two of the
          // three became links: the grid stretches the item, and without this
          // the Problems tile — one fault line where the others have two —
          // would sit a row shorter than its neighbours.
          const shell =
            'relative block h-full overflow-hidden rounded-xl border border-border px-4 py-3.5';
          return (
            <li key={stat.kind}>
              {goes ? (
                <Link
                  className={cn(
                    shell,
                    'group/tile bg-canvas transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    tileHover[lensTones[goes]],
                  )}
                  href={contentLensHrefs[goes]}
                >
                  {body}
                </Link>
              ) : (
                <div
                  aria-current={here ? 'page' : undefined}
                  className={cn(shell, here ? 'bg-card' : 'bg-canvas')}
                >
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
