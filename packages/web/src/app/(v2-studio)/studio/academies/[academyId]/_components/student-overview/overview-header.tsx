'use client';

import {
  overviewRanges,
  type OverviewPeriod,
  type OverviewRange,
  type StudentOverviewClass,
} from '@cove/shared';
import { CalendarRange, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { formatLocalDate } from '../../_lib/overview-view';

/** Beyond this many classes the header summarises instead of listing. */
const MAX_CLASS_CHIPS = 2;

/**
 * Whose page this is, over which days — in two rows, not five.
 *
 * This is the page's only heading. The studio shell's own title is switched
 * off for this route (`showPageHeading={false}`) because the heading here is
 * live: it carries the period control, and a static title above it repeated
 * the same sentence the first panel already says.
 *
 * The greeting is by name because the page belongs to one person. Never by an
 * email, a username, or an id — a student with no display name set gets the
 * generic greeting rather than an identifier they never chose.
 *
 * The class list is deliberately allowed to stop. A student in one class is
 * told who teaches it; a student in five is told they are in five and pointed
 * at My Classes, which is the page that owns that list. Printing all of them
 * with their teachers pushed the first useful thing on the page below the
 * fold, and a header that costs a scroll is a header that failed.
 *
 * The period control states the period it resolves to, inside itself. "30
 * days" means different days at 00:30 than at 23:30, and the thing that
 * chooses the window should be the thing that names it — set forty pixels
 * apart, the two eventually disagree.
 */
export function OverviewHeader({
  academyId,
  classes,
  displayName,
  isStale,
  onRangeChange,
  period,
  range,
}: {
  academyId: string;
  classes: StudentOverviewClass[];
  displayName: string | null;
  isStale: boolean;
  onRangeChange: (range: OverviewRange) => void;
  period: OverviewPeriod;
  range: OverviewRange;
}) {
  const { t, i18n } = useTranslation('learning');
  const index = overviewRanges.indexOf(range);

  const shown =
    classes.length > MAX_CLASS_CHIPS + 1
      ? classes.slice(0, MAX_CLASS_CHIPS)
      : classes;
  const hidden = classes.length - shown.length;
  // One class is context a student reads; five teachers' names is a roster.
  const withTeacher = classes.length === 1;

  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h1 className="min-w-0 text-[22px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[26px]">
          {displayName
            ? t('header.greeting', { name: displayName })
            : t('header.greeting_anonymous')}
        </h1>

        <div
          className={cn(
            'inline-flex shrink-0 items-stretch overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]',
            isStale && 'opacity-70',
          )}
        >
          <fieldset className="relative grid grid-cols-3 gap-0 p-1">
            <legend className="sr-only">{t('header.range')}</legend>

            {/*
             * One indicator for three segments, moved by transform rather than
             * by re-painting a background per button: the columns are equal, so
             * its position is entirely a function of the selected index, and it
             * cannot end up under two segments or under none.
             */}
            <span
              aria-hidden
              className={cn(
                'absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-lg bg-brand',
                'transition-transform duration-300 ease-out motion-reduce:transition-none',
              )}
              style={{ transform: `translateX(${index * 100}%)` }}
            />

            {overviewRanges.map((entry) => (
              <button
                aria-pressed={range === entry}
                className={cn(
                  'relative z-10 h-8 whitespace-nowrap rounded-lg px-3 text-[12.5px] font-bold transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  range === entry ? 'text-on-brand' : 'text-sub hover:text-ink',
                )}
                key={entry}
                onClick={() => onRangeChange(entry)}
                type="button"
              >
                {t(`header.range_${entry}`)}
              </button>
            ))}
          </fieldset>

          <p className="hidden items-center gap-2 border-l border-border px-3 py-1 sm:flex">
            <CalendarRange aria-hidden className="size-4 shrink-0 text-brand" />
            {/*
             * A floor rather than a fixed width: "Aug 8 – Aug 14" and "Up to
             * Aug 14" are different lengths, and without it the control would
             * shift sideways each time the period changed.
             */}
            <span className="flex min-w-[8.5rem] flex-col leading-tight">
              <span className="font-mono text-[12px] font-bold tabular-nums text-ink">
                {period.startDate
                  ? t('header.window', {
                      from: formatLocalDate(period.startDate, i18n.language),
                      to: formatLocalDate(period.endDate, i18n.language),
                    })
                  : t('header.window_all', {
                      to: formatLocalDate(period.endDate, i18n.language),
                    })}
              </span>
              <span className="text-[10.5px] font-semibold text-sub">
                {period.timeZone}
              </span>
            </span>
          </p>
        </div>
      </div>

      {classes.length === 0 ? (
        <p className="text-[13px] text-sub">{t('header.no_classes')}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px]">
          <GraduationCap aria-hidden className="size-4 shrink-0 text-brand" />
          {shown.map((entry, position) => (
            <span className="flex items-center gap-2" key={entry.classId}>
              {position > 0 ? (
                <span aria-hidden className="text-sub/50">
                  ·
                </span>
              ) : null}
              <span className="font-semibold">{entry.name}</span>
              {withTeacher ? (
                <span className="text-sub">
                  {entry.teacherName
                    ? t('header.taught_by', { name: entry.teacherName })
                    : t('header.no_teacher')}
                </span>
              ) : null}
            </span>
          ))}
          {hidden > 0 ? (
            <Link
              className={cn(
                'rounded-md px-1.5 py-0.5 font-semibold text-brand transition-colors hover:bg-brand/10',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              )}
              href={`/studio/academies/${academyId}/learn/classes`}
            >
              {t('header.more_classes', { count: hidden })}
            </Link>
          ) : null}
        </div>
      )}
    </header>
  );
}
