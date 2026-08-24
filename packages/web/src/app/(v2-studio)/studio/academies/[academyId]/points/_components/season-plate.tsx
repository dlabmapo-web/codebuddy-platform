'use client';

import type { PointsPage, PointsPeriodKind } from '@cove/shared';
import { formatNumber } from '@cove/i18n/format';
import { CalendarDays, CircleCheck, Hourglass } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useLocale } from '@/i18n';
import { cn } from '@/lib/utils';

import { chaseTrack, rankMarker, type ChaseTrack } from '../_lib/points-view';

/**
 * The signature element: the gap, not the number.
 *
 * A total is a fact about the past, and this page exists to be a reason to
 * come back tomorrow. So the plate's largest claim is the distance to the row
 * above — always the smallest gap available to this student, and therefore
 * always the most reachable thing on the page. For the leader it inverts into
 * a margin to defend, so the top of the board has something to do rather than
 * nothing to chase.
 *
 * Every student sees the same widget, and for every student it points one row
 * up. §11.2 of the student points design.
 *
 * ## Why the track carries its own endpoints
 *
 * The obvious rendering is a percentage bar. A percentage bar has no units: it
 * claims "84% of something" and a nine-year-old cannot check it. This one is a
 * scale between two labelled quantities — your points at one end, the points
 * of the row you are chasing at the other — so the sentence underneath is
 * something the picture *shows* rather than something it asserts.
 *
 * The state that decided the shape is `alone`. A student with nobody above
 * them has no target, and a bar filled solid under the words "solve today's
 * first problem" is a picture arguing with its own caption. So that state
 * draws an unfilled rail with a start marker instead — the page never shows a
 * finished-looking bar to a student who has not started.
 */
export function SeasonPlate({
  periodKind,
  periodLabel,
  rangeLabel,
  standing,
}: {
  periodKind: PointsPeriodKind;
  periodLabel: string;
  rangeLabel: string;
  standing: PointsPage['standing'];
}) {
  const { t } = useTranslation('points');
  const locale = useLocale();
  const points = useCountUp(standing.points);
  const track = chaseTrack(standing);

  const gapLine =
    track.kind === 'chase'
      ? t('plate.gap_chase', {
          points: formatNumber(track.target - track.you, locale),
          position: t('plate.rank_short', {
            position: formatNumber(track.targetPosition, locale),
          }),
        })
      : track.kind === 'lead'
        ? t('plate.gap_lead', {
            points: formatNumber(track.you - track.rival, locale),
          })
        : t('plate.gap_alone');

  return (
    <section className="relative overflow-hidden rounded-card border border-brand/20 bg-brand-soft shadow-[var(--shadow-card)]">
      {/* The plate is the one element allowed a full-width tint, and a flat
          field of it reads as a placeholder. One gradient, no second layer. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand/[0.07] via-transparent to-brand/[0.05]"
      />

      <div className="relative flex flex-col gap-6 px-5 py-6 sm:px-7 sm:py-7">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-brand">
            {periodLabel}
          </p>
          <p className="flex items-center gap-1.5 font-mono text-[12.5px] tabular-nums text-sub">
            <CalendarDays aria-hidden className="size-3.5" />
            {rangeLabel}
          </p>
        </header>

        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <p className="min-w-0">
            {/* The unit is set apart from the figure rather than glued to it:
                at this size "38P" reads as a word, and 38 is a quantity. */}
            <span className="flex items-baseline gap-1">
              <span
                className={cn(
                  'font-mono text-[clamp(3rem,11vw,4.25rem)] font-bold',
                  'leading-[0.85] tracking-[-0.045em] tabular-nums text-brand',
                )}
              >
                {formatNumber(points, locale)}
              </span>
              <span className="font-mono text-[clamp(1.25rem,4vw,1.75rem)] font-bold leading-none text-brand/50">
                P
              </span>
            </span>
            <span className="mt-2.5 block text-[13px] font-medium text-sub">
              {t(`plate.total_label_${periodKind}`)}
            </span>
          </p>

          <RankBadge
            locale={locale}
            participants={standing.participants}
            position={standing.position}
          />
        </div>

        <ChaseTrackBar locale={locale} sentence={gapLine} track={track} />

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-brand/15 pt-4">
          <span className="inline-flex items-center gap-1.5 font-mono text-[13px] font-semibold tabular-nums text-ink">
            <CircleCheck aria-hidden className="size-4 text-success" />
            {t('plate.solved', { count: standing.solvedProblems })}
          </span>
          {/* On the daily plate this reads 0 or 1 for everyone, which is the
              same reason the board drops its own days column there. */}
          {periodKind === 'day' ? null : (
            <span className="inline-flex items-center gap-1.5 font-mono text-[13px] font-semibold tabular-nums text-ink">
              <CalendarDays aria-hidden className="size-4 text-teal" />
              {t('plate.days', { count: standing.activeDays })}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Where this student sits, worn as a badge rather than printed as a headline.
 *
 * The rank is the second-largest thing on the plate and it has to be legible
 * as a rank, not as another big number beside the total. When there is no
 * board it says so in words, in the calm register of a status — the earlier
 * treatment set "No ranking yet" in the same display mono as the total, which
 * gave a non-answer the visual weight of a measurement.
 */
function RankBadge({
  locale,
  participants,
  position,
}: {
  locale: ReturnType<typeof useLocale>;
  participants: number | null;
  position: number | null;
}) {
  const { t } = useTranslation('points');

  if (position === null || participants === null) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-[13px] font-semibold text-sub">
        <Hourglass aria-hidden className="size-4" />
        {t('plate.no_position')}
      </span>
    );
  }

  const marker = rankMarker(position);
  const medal = marker.kind === 'medal' ? marker : null;
  const MedalIcon = medal?.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2.5 rounded-full border border-brand/20 bg-card',
        'pr-4 shadow-[var(--shadow-card)]',
        medal ? 'py-1.5 pl-1.5' : 'py-2.5 pl-4',
      )}
    >
      {/* Positions 4 and below get no marker — and no disc printing the same
          numeral the sentence beside it already carries. §11.4. */}
      {medal && MedalIcon ? (
        <span
          aria-hidden
          className={cn('grid size-8 place-items-center rounded-full', medal.chip)}
        >
          <MedalIcon className="size-[1.05rem]" strokeWidth={2.25} />
        </span>
      ) : null}
      <span className="font-mono text-[15px] font-bold tabular-nums text-ink">
        {t('plate.position', {
          position: formatNumber(position, locale),
          participants: formatNumber(participants, locale),
        })}
      </span>
    </span>
  );
}

/**
 * The scale, its two ends, and the sentence that reads it out.
 *
 * The bar always ascends left to right, in all three states: chasing, the far
 * end is the row above; leading, the near end is the row below and the far end
 * is you. That consistency is what lets a student glance at the plate and know
 * which way is up without reading anything.
 */
function ChaseTrackBar({
  locale,
  sentence,
  track,
}: {
  locale: ReturnType<typeof useLocale>;
  sentence: string;
  track: ChaseTrack;
}) {
  const { t } = useTranslation('points');
  const you = t('plate.you');

  const [left, right] =
    track.kind === 'lead'
      ? [
          {
            label: t('plate.rank_short', {
              position: formatNumber(track.rivalPosition, locale),
            }),
            points: track.rival,
            self: false,
          },
          { label: you, points: track.you, self: true },
        ]
      : [
          { label: you, points: track.you, self: true },
          track.kind === 'chase'
            ? {
                label: t('plate.rank_short', {
                  position: formatNumber(track.targetPosition, locale),
                }),
                points: track.target,
                self: false,
              }
            : { label: t('plate.next_up'), points: null, self: false },
        ];

  const percent = track.kind === 'chase' ? track.percent : 100;

  return (
    <div className="space-y-2.5">
      <div className="flex items-end justify-between gap-4">
        <TrackCap {...left} locale={locale} />
        <TrackCap {...right} align="right" locale={locale} />
      </div>

      {track.kind === 'alone' ? (
        // No target, so nothing to fill towards. A dashed rail with a start
        // marker says "this has not begun" — which is exactly what the
        // sentence underneath says, rather than contradicting it.
        <span
          aria-label={t('plate.track_label')}
          className="flex h-2.5 w-full items-center rounded-full border border-dashed border-brand/40 px-0.5"
          role="img"
        >
          <span aria-hidden className="size-1.5 rounded-full bg-brand" />
        </span>
      ) : (
        <span
          aria-label={t('plate.track_label')}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percent}
          className="block h-2.5 w-full overflow-hidden rounded-full bg-card"
          role="progressbar"
        >
          {/*
            The one piece of motion on the page. It fills once on load, behind
            `prefers-reduced-motion`, and never animates again — a bar that
            re-runs on every re-render reads as a slot machine.
          */}
          <span
            className="block h-full rounded-full bg-brand transition-[width] duration-700 ease-out motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </span>
      )}

      <p className="text-[13.5px] font-semibold leading-snug text-ink">
        {sentence}
      </p>
    </div>
  );
}

/** One end of the scale: whose it is, and what it holds. */
function TrackCap({
  align = 'left',
  label,
  locale,
  points,
  self,
}: {
  align?: 'left' | 'right';
  label: string;
  locale: ReturnType<typeof useLocale>;
  points: number | null;
  self: boolean;
}) {
  return (
    <span
      className={cn(
        'flex min-w-0 flex-col gap-0.5',
        align === 'right' && 'items-end text-right',
      )}
    >
      <span className="truncate text-[11px] font-bold uppercase tracking-[0.1em] text-sub">
        {label}
      </span>
      <span
        className={cn(
          'font-mono text-[14px] font-bold tabular-nums',
          self ? 'text-brand' : 'text-ink',
        )}
      >
        {points === null ? (
          // A missing measurement is an em dash with a spoken label, never 0.
          <span aria-hidden>—</span>
        ) : (
          <>
            {formatNumber(points, locale)}
            <span className="text-sub">P</span>
          </>
        )}
      </span>
    </span>
  );
}

/**
 * Counts a number up on first paint, then reports it exactly.
 *
 * A child watching their total arrive is the difference between a page that
 * reports and a page that rewards. It runs once per value, in one animation
 * frame loop, and yields the true figure immediately under reduced motion —
 * where an animated count is not a flourish but a number that lies for 400ms.
 */
function useCountUp(target: number, durationMs = 400): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = React.useState(target);
  const previous = React.useRef(target);

  React.useEffect(() => {
    if (reduced || target === previous.current) {
      previous.current = target;
      setValue(target);
      return;
    }

    const from = previous.current;
    previous.current = target;
    const startedAt = performance.now();
    let frame = 0;

    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      // Ease-out: the number decelerates into its final value rather than
      // stopping dead, which is what makes it read as arriving.
      const eased = 1 - (1 - progress) ** 3;
      setValue(Math.round(from + (target - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [durationMs, reduced, target]);

  return value;
}

/**
 * Whether this reader has asked the system to stop things moving.
 *
 * `useSyncExternalStore` rather than an effect that seeds state: the media
 * query is an external store, and reading it through one means the very first
 * client render already knows the answer instead of counting up once and then
 * correcting itself. The server snapshot is `false`, which is the honest
 * answer — the preference is not knowable there, and the count-up only ever
 * starts on the client.
 */
function usePrefersReducedMotion(): boolean {
  return React.useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(reducedMotionQuery).matches,
    () => false,
  );
}

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

function subscribeToReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
