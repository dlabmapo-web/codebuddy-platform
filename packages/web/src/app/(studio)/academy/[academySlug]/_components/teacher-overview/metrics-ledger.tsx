'use client';

import type { OverviewLedger } from '@cove/shared';
import {
  BookOpen,
  CalendarDays,
  Gauge,
  Target,
  Timer,
  Users,
  type LucideIcon,
} from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { durationDisplay } from '../../_lib/overview-view';
import { Meter, Panel, toneStyles, type PanelTone } from './overview-primitives';

/**
 * The five measurements §6.4 asks for, as one ledger.
 *
 * Deliberately one section rather than five cards. Five equally sized boxes
 * above an action list say that all five are equally worth acting on, and none
 * of them is: they are the denominators that make the queue above and the
 * chart below mean something.
 *
 * Each entry carries the hue of the section it is a denominator *for* — the
 * students figure is violet like participation, the time figure is teal like
 * active learning, the score is green like the score order below. That is what
 * turns five numbers into a table of contents for the rest of the page rather
 * than five unrelated facts, and it is why the colours are not a rainbow chosen
 * for variety.
 *
 * Every entry also states its own denominator underneath. A number a teacher
 * cannot check is a number they will either over-trust or ignore, and both are
 * worse than one extra line of small type.
 *
 * See §6.4 of the teacher overview and student analytics redesign.
 */
export function MetricsLedger({ ledger }: { ledger: OverviewLedger }) {
  const { t } = useTranslation('teaching');
  const learning = durationDisplay(ledger.activeLearning.totalSeconds);
  const average = durationDisplay(ledger.activeLearning.averageSecondsPerStudent);

  const averageLabel =
    average.kind === 'hours'
      ? t('duration.hours', { hours: average.hours, minutes: average.minutes })
      : average.kind === 'minutes'
        ? t('duration.minutes', { minutes: average.minutes })
        : null;

  return (
    <Panel
      description={t('ledger.description')}
      icon={Gauge}
      id="metrics-ledger"
      testId="metrics-ledger"
      title={t('ledger.title')}
      tone="brand"
    >
      {/*
       * The rules between entries are the grid's own gap showing through, not
       * borders on the cells. Five entries do not divide evenly into two or
       * three columns, and per-cell borders would leave a stray rule hanging at
       * whichever wrap point the viewport lands on; a gap cannot, at any width.
       */}
      <dl className="grid grid-cols-2 gap-px bg-border md:grid-cols-3 xl:grid-cols-5">
        <Entry
          caption={t('ledger.students_caption', { count: ledger.students.active })}
          icon={Users}
          label={t('ledger.students')}
          // The share of the roster that turned up, drawn rather than described:
          // "1 of 3" is a sentence a teacher has to parse, and a bar is not.
          meter={{
            percent: share(ledger.students.active, ledger.students.total),
            label: t('ledger.students_meter', {
              active: ledger.students.active,
              total: ledger.students.total,
            }),
          }}
          tone="peer"
          value={ledger.students.total}
        />
        <Entry
          caption={t('ledger.courses_caption', {
            count: ledger.courses.assignments,
          })}
          icon={BookOpen}
          label={t('ledger.courses')}
          tone="brand"
          value={ledger.courses.distinct}
        />
        <Entry
          caption={
            averageLabel
              ? t('ledger.learning_caption', { time: averageLabel })
              : t('ledger.learning_caption_empty')
          }
          icon={Timer}
          label={t('ledger.learning')}
          tone="teal"
          value={
            learning.kind === 'none' ? (
              <Missing />
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
          caption={t('ledger.days_caption', {
            active: ledger.activeDays.activeStudents,
            enrolled: ledger.activeDays.enrolledStudents,
          })}
          denominator={
            ledger.activeDays.periodDays
              ? t('ledger.of_days', { count: ledger.activeDays.periodDays })
              : null
          }
          icon={CalendarDays}
          label={t('ledger.days')}
          meter={
            ledger.activeDays.periodDays
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
          value={ledger.activeDays.days}
        />
        <Entry
          caption={
            ledger.averageScore.value === null
              ? t('ledger.score_caption_empty')
              : t('ledger.score_caption', {
                  count: ledger.averageScore.attemptedProblems,
                  students: ledger.averageScore.scoredStudents,
                })
          }
          // §6.4 — students with no scored attempt are named, not folded into
          // the mean as zeros. The disclosure sits with the value it qualifies.
          extra={
            ledger.averageScore.withoutScore > 0
              ? t('ledger.without_score', {
                  count: ledger.averageScore.withoutScore,
                })
              : null
          }
          icon={Target}
          label={t('ledger.score')}
          meter={
            ledger.averageScore.value === null
              ? undefined
              : {
                  percent: ledger.averageScore.value,
                  label: t('ledger.score_meter', {
                    value: ledger.averageScore.value,
                  }),
                }
          }
          tone="success"
          value={
            ledger.averageScore.value === null ? (
              <Missing />
            ) : (
              <>
                {ledger.averageScore.value}
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
  extra,
  icon: Icon,
  label,
  meter,
  tone,
  value,
}: {
  caption: string;
  denominator?: string | null;
  extra?: string | null;
  icon: LucideIcon;
  label: string;
  meter?: { percent: number | null; label: string };
  tone: PanelTone;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col bg-card px-4 py-4">
      <dt className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-lg',
            toneStyles[tone].chip,
          )}
        >
          <Icon className="size-4" strokeWidth={2.25} />
        </span>
        <span className="text-[11.5px] font-bold uppercase tracking-[0.05em] text-sub">
          {label}
        </span>
      </dt>
      <dd className="mt-2.5 flex flex-1 flex-col">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span
            className={cn(
              'font-mono text-[30px] font-extrabold leading-none tabular-nums',
              toneStyles[tone].text,
            )}
          >
            {value}
          </span>
          {denominator ? (
            <span className="font-mono text-[12.5px] tabular-nums text-sub">
              {denominator}
            </span>
          ) : null}
        </div>
        {/*
         * The slot is always here, even for the two entries that have nothing
         * to fill. Rendering it conditionally left the five captions at three
         * different heights, which made a ruled row of figures read as five
         * cards that had drifted apart.
         */}
        <div className="mt-2.5 h-2">
          {meter ? (
            <Meter label={meter.label} percent={meter.percent} tone={tone} />
          ) : null}
        </div>
        <p className="mt-2 text-[11.5px] leading-[1.5] text-sub">{caption}</p>
        {extra ? (
          <p className="mt-auto pt-1.5 text-[11.5px] font-semibold leading-[1.5] text-warning">
            {extra}
          </p>
        ) : null}
      </dd>
    </div>
  );
}

/** A whole-percent share, or nothing to draw. */
function share(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

/** The unit, small and quiet, so the figure keeps the weight. */
function Unit({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-0.5 mr-1 text-[15px] font-bold opacity-70">
      {children}
    </span>
  );
}

/**
 * Not measured. Never a zero, which is a different and much stronger claim.
 *
 * Set at the same size as the figures it stands in for, so an unmeasured entry
 * holds its place in the row rather than looking like a value that failed to
 * render.
 */
function Missing() {
  const { t } = useTranslation('teaching');
  return (
    <span className="text-sub/60" title={t('no_data')}>
      <span aria-hidden>—</span>
      <span className="sr-only">{t('no_data')}</span>
    </span>
  );
}
