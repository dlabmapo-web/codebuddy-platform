'use client';

import type { ContentLens, PlatformContentSummary } from '@cove/shared';
import { Building2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { toneStyles } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/overview-ui/panel';
import { cn } from '@/lib/utils';

import { lensIcons, lensTones } from '../../_lib/content-view';

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
 * Nothing here is a link. A tile that filtered on click would be the lens tabs
 * again with the pills repainted; the type chip in the toolbar is the control.
 */
export function ContentSummary({
  active,
  summary,
}: {
  active: ContentLens;
  summary: PlatformContentSummary;
}) {
  const { t } = useTranslation('platform-content');
  const stats = [
    {
      lens: 'courses' as const,
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
      lens: 'classes' as const,
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
      lens: 'problems' as const,
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
        <h2 className="text-[15px] font-bold text-ink">{t('title')}</h2>
        <p className="flex items-center gap-1.5 text-[13.5px] font-bold text-sub">
          <span className="grid size-6 place-items-center rounded-lg bg-muted text-sub">
            <Building2 className="size-3.5" strokeWidth={2.5} />
          </span>
          {t('summary.scope', { count: summary.academies })}
        </p>
      </div>
      <ul className="grid gap-2 px-5 pb-5 sm:grid-cols-3">
        {stats.map((stat) => {
          const Icon = lensIcons[stat.lens];
          const styles = toneStyles[lensTones[stat.lens]];
          return (
            <li
              className="relative overflow-hidden rounded-xl border border-border bg-canvas px-4 py-3.5"
              key={stat.lens}
            >
              {stat.lens === active ? (
                <span
                  aria-hidden
                  className={cn('absolute inset-y-0 left-0 w-1', styles.rail)}
                />
              ) : null}
              <div className="flex items-center gap-3">
                <span className={cn('grid size-9 place-items-center rounded-lg', styles.chip)}>
                  <Icon className="size-[1.15rem]" strokeWidth={2.25} />
                </span>
                <span>
                  <span className="block font-mono text-[22px] font-extrabold leading-none tabular-nums text-ink">
                    {stat.total}
                  </span>
                  <span className="mt-1 block text-[12px] font-bold text-sub">
                    {t(`lens.${stat.lens}`)}
                  </span>
                </span>
              </div>
              <div className="mt-3 grid gap-0.5 text-[12.5px] font-semibold text-sub">
                {stat.lines.map((line) => (
                  <span
                    className={'danger' in line && line.danger ? 'text-danger' : undefined}
                    key={line.text}
                  >
                    {line.text}
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
