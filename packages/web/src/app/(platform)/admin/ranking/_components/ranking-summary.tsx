'use client';

import type { PlatformRankingSummary, PointsPeriodKind } from '@cove/shared';
import { formatNumber } from '@cove/i18n/format';
import { Building2, GraduationCap, Trophy, Users, ZapOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { toneStyles } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/overview-ui/panel';
import { useLocale } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * What the platform earned in the period, before a single row is read.
 *
 * `ContentSummary`'s strip, on this page's question. The rules it establishes
 * are kept: the academy count is the *denominator* the tiles are measured
 * against rather than a fourth kind of thing, so it sits in the header line
 * beside a `Building2` mark; and **the second line is the point** — a total
 * says the platform is large, `38 of 61 earning` says which morning's work
 * this is.
 *
 * ## Why the ratios and not the totals
 *
 * A points total across every academy is a number nobody can act on: it goes
 * up when a customer signs, down in the school holidays, and answers no
 * question an operator has. The two ratios beside it do — a platform where
 * half the classes earned nothing today is a platform with a problem, and
 * which half is one filter away.
 *
 * The last tile wears `danger` only when it is above zero, so an untroubled
 * platform is a quiet page. Points switched off is not a fault in itself —
 * it is a decision a manager made — which is why it is drawn as `warning`
 * rather than danger and reads "switched off" rather than "broken".
 */
export function RankingSummary({
  academy,
  period,
  summary,
}: {
  /** The one academy in scope, when the facet holds exactly one. */
  academy?: { name: string; slug: string } | null;
  period: PointsPeriodKind;
  summary: PlatformRankingSummary;
}) {
  const { t } = useTranslation('platform-ranking');
  const { t: points } = useTranslation('points');
  const locale = useLocale();

  const tiles = [
    {
      key: 'points',
      icon: Trophy,
      tone: 'primary' as const,
      value: formatNumber(summary.points, locale),
      label: t('summary.points'),
      lines: [{ text: points(`period.${period}`) }],
    },
    {
      key: 'classes',
      icon: GraduationCap,
      tone: 'teal' as const,
      value: `${formatNumber(summary.earningClasses, locale)} / ${formatNumber(
        summary.classes,
        locale,
      )}`,
      label: t('summary.classes'),
      lines: [
        {
          text: t('summary.quiet_classes', {
            count: summary.classes - summary.earningClasses,
          }),
        },
      ],
    },
    {
      key: 'students',
      icon: Users,
      tone: 'brand' as const,
      value: `${formatNumber(summary.earningStudents, locale)} / ${formatNumber(
        summary.students,
        locale,
      )}`,
      label: t('summary.students'),
      lines: [{ text: t('summary.students_hint') }],
    },
    {
      key: 'off',
      icon: ZapOff,
      tone: 'warning' as const,
      value: formatNumber(summary.pointsOffClasses, locale),
      label: t('summary.points_off'),
      lines: [
        {
          text: t('summary.points_off_hint'),
          warn: summary.pointsOffClasses > 0,
        },
      ],
    },
  ];

  return (
    <section
      aria-label={t('summary.label')}
      className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow-card)]"
      data-testid="ranking-summary"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-5">
        {academy ? (
          <>
            <h2 className="flex min-w-0 items-center gap-2 text-[15px] font-bold text-ink">
              <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-muted text-sub">
                <Building2 className="size-3.5" strokeWidth={2.5} />
              </span>
              <span className="truncate">{academy.name}</span>
            </h2>
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

      <ul className="grid gap-2 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => {
          const styles = toneStyles[tile.tone];
          return (
            <li
              className="relative h-full overflow-hidden rounded-xl border border-border bg-canvas px-4 py-3.5"
              key={tile.key}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'grid size-9 shrink-0 place-items-center rounded-lg',
                    styles.chip,
                  )}
                >
                  <tile.icon className="size-[1.15rem]" strokeWidth={2.25} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[22px] font-extrabold leading-none tabular-nums text-ink">
                    {tile.value}
                  </span>
                  <span className="mt-1 block truncate text-[12px] font-bold text-sub">
                    {tile.label}
                  </span>
                </span>
              </div>
              <div className="mt-3 grid gap-0.5 text-[12.5px] font-semibold text-sub">
                {tile.lines.map((line) => (
                  <span
                    className={
                      'warn' in line && line.warn ? 'text-warning' : undefined
                    }
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
