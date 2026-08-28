'use client';

import type { StudentLedger } from '@cove/shared';
import {
  CalendarDays,
  CheckCircle2,
  Gauge,
  Target,
  Timer,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { durationDisplay } from '../../_lib/overview-view';
import {
  Meter,
  Missing,
  Panel,
  toneStyles,
  type PanelTone,
} from './student-primitives';

/**
 * The five measurements §7.4 asks for, as one ledger.
 *
 * Deliberately one section rather than five cards. Five equally sized boxes
 * under an action say all five are equally worth acting on, and none of them
 * is: they are the denominators that make the sections below mean anything.
 *
 * Each entry carries the hue of the section it is a denominator *for* — the
 * solved figure is green like course progress, the time figure is teal like
 * the activity chart. That turns five numbers into a table of contents for the
 * rest of the page rather than five unrelated facts.
 *
 * Every entry also states its own denominator underneath, and every one of
 * them can print nothing at all. A student who has not started is not a
 * student scoring nought, and this ledger has an em dash for exactly that.
 *
 * See §7.4 of the student academy overview design.
 */
export function LearningLedger({
  activityTracked,
  ledger,
}: {
  /**
   * Whether counted learning time exists for this student at all.
   *
   * False is not the same as zero. A student with a hundred submissions and no
   * heartbeats has not "worked zero days" — nothing has been counting — and
   * printing `0 of 30` beside a full submission history is the one thing on
   * this ledger a child would be right to call wrong.
   */
  activityTracked: boolean;
  ledger: StudentLedger;
}) {
  const { t } = useTranslation('learning');
  const learning = durationDisplay(ledger.activeLearning.totalSeconds);

  return (
    <Panel
      description={t('ledger.description')}
      icon={Gauge}
      id="learning-ledger"
      testId="learning-ledger"
      title={t('ledger.title')}
      tone="brand"
    >
      {/*
       * The rules between entries are the grid's own gap showing through, not
       * borders on the cells. Five entries do not divide evenly into two or
       * three columns, and per-cell borders would leave a stray rule hanging
       * at whichever wrap point the viewport lands on; a gap cannot.
       */}
      <dl className="grid grid-cols-2 gap-px bg-border md:grid-cols-3 xl:grid-cols-5">
        <Entry
          caption={t('ledger.solved_caption', {
            count: ledger.solved.attempted,
          })}
          icon={Trophy}
          label={t('ledger.solved')}
          meter={
            ledger.solved.attempted > 0
              ? {
                  percent: share(ledger.solved.problems, ledger.solved.attempted),
                  label: t('ledger.solved_meter', {
                    solved: ledger.solved.problems,
                    attempted: ledger.solved.attempted,
                  }),
                }
              : undefined
          }
          tone="success"
          value={ledger.solved.problems}
        />

        <Entry
          caption={
            ledger.score.value === null
              ? t('ledger.score_caption_empty')
              : t('ledger.score_caption', {
                  count: ledger.score.attemptedProblems,
                })
          }
          icon={Target}
          label={t('ledger.score')}
          meter={
            ledger.score.value === null
              ? undefined
              : {
                  percent: ledger.score.value,
                  label: t('ledger.score_meter', { value: ledger.score.value }),
                }
          }
          tone="brand"
          value={
            ledger.score.value === null ? (
              <Missing className="text-[20px]" label={t('ledger.score_caption_empty')} />
            ) : (
              <>
                {ledger.score.value}
                <Unit>%</Unit>
              </>
            )
          }
        />

        <Entry
          caption={
            !activityTracked
              ? t('ledger.time_caption_untracked')
              : ledger.activeLearning.intervals > 0
                ? t('ledger.time_caption', {
                    count: ledger.activeLearning.intervals,
                  })
                : t('ledger.time_caption_empty')
          }
          icon={Timer}
          label={t('ledger.time')}
          tone="teal"
          value={
            learning.kind === 'none' ? (
              <Missing
                className="text-[20px]"
                label={
                  activityTracked
                    ? t('ledger.time_caption_empty')
                    : t('ledger.time_caption_untracked')
                }
              />
            ) : learning.kind === 'hours' ? (
              <>
                {learning.hours}
                <Unit>{t('ledger.unit_hours')}</Unit>
                {learning.minutes > 0 ? (
                  <>
                    {learning.minutes}
                    <Unit>{t('ledger.unit_minutes')}</Unit>
                  </>
                ) : null}
              </>
            ) : (
              <>
                {learning.minutes}
                <Unit>{t('ledger.unit_minutes')}</Unit>
              </>
            )
          }
        />

        <Entry
          caption={
            activityTracked
              ? t('ledger.days_caption')
              : t('ledger.days_caption_untracked')
          }
          denominator={
            activityTracked && ledger.activeDays.periodDays
              ? t('ledger.of_days', { count: ledger.activeDays.periodDays })
              : null
          }
          icon={CalendarDays}
          label={t('ledger.days')}
          meter={
            activityTracked && ledger.activeDays.periodDays
              ? {
                  percent: share(
                    ledger.activeDays.days,
                    ledger.activeDays.periodDays,
                  ),
                  label: t('ledger.days_meter', {
                    days: ledger.activeDays.days,
                    total: ledger.activeDays.periodDays,
                  }),
                }
              : undefined
          }
          tone="teal"
          value={
            activityTracked ? (
              ledger.activeDays.days
            ) : (
              <Missing
                className="text-[20px]"
                label={t('ledger.days_caption_untracked')}
              />
            )
          }
        />

        <Entry
          caption={
            ledger.accepted.rate === null
              ? t('ledger.accepted_caption_empty')
              : t('ledger.accepted_caption', {
                  passed: ledger.accepted.passed,
                  attempts: ledger.accepted.attempts,
                })
          }
          icon={CheckCircle2}
          label={t('ledger.accepted')}
          meter={
            ledger.accepted.rate === null
              ? undefined
              : {
                  percent: ledger.accepted.rate,
                  label: t('ledger.accepted_meter', {
                    value: ledger.accepted.rate,
                  }),
                }
          }
          tone="peer"
          value={
            ledger.accepted.rate === null ? (
              <Missing className="text-[20px]" label={t('ledger.accepted_caption_empty')} />
            ) : (
              <>
                {ledger.accepted.rate}
                <Unit>%</Unit>
              </>
            )
          }
        />
      </dl>
    </Panel>
  );
}

function Entry({
  caption,
  denominator,
  icon: Icon,
  label,
  meter,
  tone,
  value,
}: {
  caption: string;
  denominator?: string | null;
  icon: LucideIcon;
  label: string;
  meter?: { percent: number | null; label: string };
  tone: PanelTone;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col bg-card p-3.5">
      <dt className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[0.05em] text-sub">
        <Icon
          aria-hidden
          className={cn('size-3.5', toneStyles[tone].text)}
          strokeWidth={2.5}
        />
        {label}
      </dt>
      <dd className="mt-1.5 flex flex-col gap-2">
        <span className="flex items-baseline gap-1 font-mono text-[26px] font-bold leading-none tracking-[-0.03em] tabular-nums">
          {value}
          {denominator ? (
            <span className="text-[13px] font-semibold text-sub">
              {denominator}
            </span>
          ) : null}
        </span>
        {meter ? (
          <Meter label={meter.label} percent={meter.percent} tone={tone} />
        ) : null}
        <span className="text-[11.5px] leading-[1.45] text-sub">{caption}</span>
      </dd>
    </div>
  );
}

function Unit({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[14px] font-bold text-sub">{children}</span>
  );
}

function share(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
}
