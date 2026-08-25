'use client';

import type {
  AcademyProfile,
  AcademyProfileCompletion,
  AcademyScale,
  OverviewPeriod,
  OverviewRange,
} from '@cove/shared';
import {
  Clock,
  Mail,
  MapPin,
  PencilLine,
  Phone,
  TriangleAlert,
} from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import {
  academyClock,
  academyDateLabel,
  addressLine,
  managerRanges,
} from '../../_lib/manager-view';
import { formatLocalDate } from '../../_lib/overview-view';
import { ScaleCards } from './scale-cards';

/**
 * The academy, as a plate on the front of the building.
 *
 * This is the page's thesis and the one place it spends any boldness. Every
 * other manager dashboard opens with four identical stat boxes; this one opens
 * with the two things that are actually true about an academy before any
 * measurement is taken — *where and when it is*, and *who is in it*.
 *
 * The clock is not decoration. Every period, every growth bucket, and every
 * "today" below is counted in the academy's own zone, and a manager checking
 * the tower from another country needs the clock the numbers were counted
 * against rather than the one on their phone. It is the smallest possible
 * statement of the page's most easily missed assumption.
 *
 * The composition band underneath is the second half of the thesis. An academy
 * is a population, and the shape of that population — mostly students, three
 * teachers, one manager — is the first honest thing to show about it. Four
 * boxes with four numbers say the same facts and hide the proportion, which is
 * the part a manager reads in a quarter of a second.
 *
 * The band's order is fixed and never sorted by size. A bar that reordered
 * itself as the academy hired would be unreadable across two visits.
 *
 * §9.1 — a profile missing required information produces a completion action
 * here rather than a quiet gap, because the fields are what let a parent find
 * and reach the place.
 */
export function AcademyPlate({
  academy,
  completion,
  generatedAt,
  isStale,
  onEditProfile,
  onRangeChange,
  period,
  range,
  scale,
}: {
  academy: AcademyProfile;
  completion: AcademyProfileCompletion;
  generatedAt: string;
  isStale: boolean;
  onEditProfile: () => void;
  onRangeChange: (range: OverviewRange) => void;
  period: OverviewPeriod;
  range: OverviewRange;
  scale: AcademyScale;
}) {
  const { t, i18n } = useTranslation('manager');
  const now = useAcademyClock();
  const address = addressLine(academy);

  return (
    <section
      aria-labelledby="academy-plate-title"
      className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow-card)]"
    >
      {academy.cover ? (
        <div className="relative aspect-[8/3] max-h-72 overflow-hidden border-b border-border bg-accent">
          {/* Signed private URLs are intentionally rendered as ordinary images;
              Next's optimizer cannot fetch them after their short expiry. */}
          <img
            alt={academy.cover.isDecorative ? '' : (academy.cover.altText ?? '')}
            className="h-full w-full object-cover"
            src={academy.cover.url}
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink/25 to-transparent" />
        </div>
      ) : null}
      {/* The academy's own colour field. Tinted rather than filled: it has to
          carry body text in both themes, and a saturated plane behind small
          type is the fastest way to make a page tiring to read. */}
      <div className="bg-brand/8 border-b border-border px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-brand">
              {academy.slug}
            </p>
            <h1
              className="mt-1 text-[26px] font-extrabold leading-tight tracking-[-0.025em] sm:text-[30px]"
              id="academy-plate-title"
            >
              {academy.name}
            </h1>

            <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px]">
              <Detail
                icon={MapPin}
                label={t('identity.address')}
                value={address}
              />
              <Detail
                icon={Phone}
                label={t('identity.phone')}
                value={academy.contactPhone}
              />
              <Detail
                icon={Mail}
                label={t('identity.email')}
                value={academy.contactEmail}
              />
            </dl>
          </div>

          {/*
           * The clock, as its own object rather than a line of the address.
           * It answers a different question from everything beside it — not
           * "where is this academy" but "what time is it where the numbers were
           * counted" — and giving it a frame is what stops it being read as
           * another contact detail.
           */}
          <div className="flex items-stretch gap-3">
            <div className="rounded-xl border border-brand/25 bg-card px-4 py-2.5 text-right">
              <p className="flex items-center justify-end gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-sub">
                <Clock aria-hidden className="size-3" strokeWidth={2.5} />
                {t('identity.local_time')}
              </p>
              <p className="font-mono text-[26px] font-extrabold leading-none tabular-nums text-brand">
                {academyClock(now, academy.timeZone, i18n.language)}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-sub">
                {academyDateLabel(now, academy.timeZone, i18n.language)} ·{' '}
                {academy.timeZone}
              </p>
            </div>

            <button
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-brand/30 px-3 py-2',
                'text-[12.5px] font-bold text-brand transition-colors hover:bg-brand/10',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              )}
              onClick={onEditProfile}
              type="button"
            >
              <PencilLine aria-hidden className="size-3.5" strokeWidth={2.5} />
              <span className="hidden sm:inline">{t('identity.edit')}</span>
            </button>
          </div>
        </div>

        {completion.isComplete ? null : (
          <div
            className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-warning/30 bg-warning/8 px-3.5 py-2.5"
            role="status"
          >
            <TriangleAlert
              aria-hidden
              className="size-4 shrink-0 text-warning"
              strokeWidth={2.5}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-warning">
                {t('identity.complete_title')}
              </p>
              <p className="mt-0.5 text-[12px] leading-[1.5] text-sub">
                {t('identity.complete_body', { count: completion.missing.length })}{' '}
                {/* Named, not counted. "Two details missing" sends a manager
                    hunting through a form; the field names send them to it. */}
                <span className="font-semibold text-ink">
                  {completion.missing
                    .map((field) => t(`identity.field.${field}`))
                    .join(' · ')}
                </span>
              </p>
            </div>
            <button
              className="shrink-0 rounded-md bg-warning px-3 py-1.5 text-[12px] font-bold text-on-warning transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              onClick={onEditProfile}
              type="button"
            >
              {t('actions.profile')}
            </button>
          </div>
        )}
      </div>

      {academy.gallery.length > 0 ? (
        <div
          aria-label={t('identity.gallery')}
          className="grid grid-cols-2 gap-1 border-b border-border bg-border sm:grid-cols-3"
        >
          {academy.gallery.map((item) => (
            <div className="aspect-[3/2] overflow-hidden bg-accent" key={item.id}>
              <img
                alt={item.isDecorative ? '' : (item.altText ?? '')}
                className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02] motion-reduce:transition-none"
                loading="lazy"
                src={item.url}
              />
            </div>
          ))}
        </div>
      ) : null}

      {/* --------------------------------------------------- scale cards */}

      {scale.activeMembers === 0 ? (
        <p className="border-b border-border px-4 py-4 text-[13px] text-sub sm:px-6">
          {t('scale.empty_body')}
        </p>
      ) : (
        <div className="border-b border-border">
          <ScaleCards scale={scale} />
        </div>
      )}

      {/* -------------------------------------------------------- period */}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-border bg-muted px-4 py-3 sm:px-6">
        <RangePicker onChange={onRangeChange} value={range} />
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] font-semibold text-sub">
          <span className="font-mono tabular-nums text-ink">
            {period.startDate
              ? t('scope.dates', {
                  from: formatLocalDate(period.startDate, i18n.language),
                  to: formatLocalDate(period.endDate, i18n.language),
                })
              : t('scope.all_time', {
                  to: formatLocalDate(period.endDate, i18n.language),
                })}
          </span>
          <span aria-live="polite">
            {isStale
              ? t('updating')
              : t('scope.generated', {
                  time: new Intl.DateTimeFormat(i18n.language, {
                    timeZone: academy.timeZone,
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(generatedAt)),
                })}
          </span>
        </p>
      </div>
    </section>
  );
}

/**
 * One contact fact, or the fact that nobody has set it.
 *
 * "Not set" is rendered rather than the row being dropped. A missing phone
 * number that simply is not there looks like a page that forgot to show it;
 * saying so is what makes the completion prompt above make sense.
 */
function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string | null;
}) {
  const { t } = useTranslation('manager');
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Icon aria-hidden className="size-3.5 shrink-0 text-sub" strokeWidth={2.25} />
      <dt className="sr-only">{label}</dt>
      <dd
        className={cn(
          'truncate',
          value ? 'font-medium text-ink' : 'italic text-sub',
        )}
      >
        {value ?? t('identity.not_set')}
      </dd>
    </div>
  );
}

/**
 * The period control, and the period it resolves to, as one object.
 *
 * The three ranges are not three unrelated choices — each window contains the
 * one before it — so the selected segment is a single indicator that slides
 * between them rather than three lamps that light independently. Reduced-motion
 * readers get the same indicator without the travel.
 */
function RangePicker({
  onChange,
  value,
}: {
  onChange: (range: OverviewRange) => void;
  value: OverviewRange;
}) {
  const { t } = useTranslation('manager');
  const index = managerRanges.indexOf(value);

  return (
    <fieldset className="relative grid grid-cols-3 gap-0 rounded-xl border border-border bg-card p-1">
      <legend className="sr-only">{t('range.label')}</legend>
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-lg bg-brand',
          'transition-transform duration-300 ease-out motion-reduce:transition-none',
        )}
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {managerRanges.map((option) => (
        <button
          aria-pressed={value === option}
          className={cn(
            'relative z-10 h-8 whitespace-nowrap rounded-lg px-3.5 text-[12.5px] font-bold transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            value === option ? 'text-on-brand' : 'text-sub hover:text-ink',
          )}
          key={option}
          onClick={() => onChange(option)}
          type="button"
        >
          {t(`range.${option}`)}
        </button>
      ))}
    </fieldset>
  );
}

/**
 * The academy's wall clock, ticking once a minute.
 *
 * A minute rather than a second: the display has no seconds, so a per-second
 * timer would re-render the plate sixty times to change nothing. The first
 * value comes from a state initializer rather than from render, so the server
 * and the client agree on the first paint and React does not report a
 * hydration mismatch on a page whose whole point is being trusted.
 */
function useAcademyClock(): Date {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
