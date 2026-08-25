'use client';

import type { PointRules } from '@cove/shared';
import { formatNumber } from '@cove/i18n/format';
import { BookOpen, CircleCheck, Clock, GraduationCap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useLocale } from '@/i18n';
import { cn } from '@/lib/utils';

import { Panel, toneStyles, type PanelTone } from '../../_components/overview-ui/panel';

/**
 * What each action pays.
 *
 * Read from the server, which reads it from the same policy the awarding
 * service pays out of. A hand-written list here would be a list a translator
 * could edit into disagreeing with the server, and a point system a child
 * cannot audit is a point system they will not trust.
 *
 * This panel is the legend for the board above it: the board prints what each
 * student *did*, this prints what each of those things *pays*, and the two
 * multiply out to every total on the screen. That is the whole of §10.5 — a
 * student can always work out why somebody is above them — and it only works
 * if these numbers are the server's own.
 *
 * ## Three cards, not ten rows
 *
 * Ten rows of identical weight is a price list, and a price list is read once
 * and never again. These ten are three *ways of earning*, each an ordered
 * ladder, and the thing a child actually needs to know is which ladder they
 * are standing on. So the verb lives in the card's heading — "Solve a
 * problem", "Study and show up", "Finish what you started" — and each rung
 * beneath it is only the qualifier: `Hard · +10P`. Reading the heading and one
 * rung gives a whole sentence.
 *
 * Each card carries one line of small print, and it is the part that was
 * missing before: **the time rungs do not stack.** A child reading `30 min
 * +3P` and `60 min +5P` as a running total has been told, by the layout, a
 * thing that is not true. `rules.note` says so in the card that needs it.
 *
 * Difficulty appears as a word, never as a colour. Three difficulty hues next
 * to seven reason hues is a palette nobody can learn.
 */
export function PointRulesPanel({ rules }: { rules: PointRules }) {
  const { t } = useTranslation('points');
  const locale = useLocale();
  const value = (points: number) =>
    t('rules.value', { points: formatNumber(points, locale) });

  const cards: EarningCard[] = [
    {
      key: 'solve',
      title: t('rules.group.solve'),
      note: t('rules.note.solve'),
      icon: CircleCheck,
      tone: 'success',
      rungs: [
        { key: 'easy', label: t('rules.solve_easy'), amount: value(rules.solve.easy) },
        {
          key: 'medium',
          label: t('rules.solve_medium'),
          amount: value(rules.solve.medium),
        },
        { key: 'hard', label: t('rules.solve_hard'), amount: value(rules.solve.hard) },
      ],
    },
    {
      key: 'work',
      title: t('rules.group.work'),
      note: t('rules.note.work'),
      icon: Clock,
      tone: 'teal',
      rungs: [
        {
          key: 'attendance',
          label: t('rules.in_class'),
          amount: value(rules.attendance),
        },
        ...rules.learningTiers.map((tier) => ({
          key: `time-${tier.minutes}`,
          label: t('rules.minutes', { minutes: formatNumber(tier.minutes, locale) }),
          amount: value(tier.points),
        })),
      ],
    },
    {
      key: 'finish',
      title: t('rules.group.finish'),
      note: t('rules.note.finish'),
      icon: GraduationCap,
      tone: 'brand',
      rungs: [
        {
          key: 'lecture',
          label: t('rules.lecture_short'),
          amount: value(rules.lectureCompleted),
        },
        {
          key: 'module',
          label: t('rules.module_short'),
          amount: value(rules.moduleCompleted),
        },
        {
          key: 'course',
          label: t('rules.course_short'),
          amount: value(rules.courseCompleted),
        },
      ],
    },
  ];

  return (
    <Panel
      description={t('rules.description')}
      icon={BookOpen}
      meta={t('rules.daily_cap', {
        points: formatNumber(rules.dailyCap, locale),
      })}
      title={t('rules.title')}
      tone="peer"
    >
      <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <EarningCardView card={card} key={card.key} />
        ))}
      </div>
    </Panel>
  );
}

type EarningCard = {
  key: string;
  title: string;
  note: string;
  icon: LucideIcon;
  tone: PanelTone;
  rungs: { key: string; label: string; amount: string }[];
};

/**
 * One way of earning, as a card that stands on its own.
 *
 * A bordered card rather than a column under a rail. Three columns of
 * different lengths sharing one background left the short ones trailing into
 * whitespace with nothing saying where they ended; a card with `h-full` ends
 * where it ends, and the row keeps a straight bottom edge whatever the policy
 * happens to hold.
 *
 * Rungs are smallest-first and the amount grows with the rung, so a fifty-fold
 * difference between the first row and the last is visible without arithmetic.
 * A page that renders `+3P` and `+150P` at one type size has thrown that away.
 */
function EarningCardView({ card }: { card: EarningCard }) {
  const tone = toneStyles[card.tone];
  const Icon = card.icon;
  const sizes = ['text-[13px]', 'text-[14px]', 'text-[15px]', 'text-[16px]'];

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      <header className={cn('flex items-center gap-2.5 px-3.5 py-3', tone.wash)}>
        <span
          aria-hidden
          className={cn('grid size-8 shrink-0 place-items-center rounded-lg', tone.chip)}
        >
          <Icon className="size-[1.05rem]" strokeWidth={2.25} />
        </span>
        <h3 className="min-w-0 text-[13.5px] font-bold leading-tight text-ink">
          {card.title}
        </h3>
      </header>

      <ul className="flex-1 divide-y divide-border/60 px-3.5">
        {card.rungs.map((rung, index) => (
          <li
            className="flex items-baseline justify-between gap-3 py-2.5"
            key={rung.key}
          >
            <span className="min-w-0 text-[13.5px] leading-snug text-ink">
              {rung.label}
            </span>
            <span
              className={cn(
                'shrink-0 font-mono font-bold tabular-nums text-success',
                sizes[Math.min(index, sizes.length - 1)],
              )}
            >
              {rung.amount}
            </span>
          </li>
        ))}
      </ul>

      {/* The small print, and the only place the page explains how a rule
          behaves rather than what it pays. The time card needs it most: read
          as a list, its rungs look like they add up, and they do not. */}
      <p className="border-t border-border px-3.5 py-2.5 text-[11.5px] leading-[1.45] text-sub">
        {card.note}
      </p>
    </section>
  );
}
