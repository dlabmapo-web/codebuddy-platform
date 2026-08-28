import type { PointReasonName } from '@cove/shared';
import {
  BookOpenCheck,
  CalendarCheck,
  CalendarClock,
  CircleCheck,
  Clock,
  Crown,
  GraduationCap,
  Layers,
  Medal,
  type LucideIcon,
} from 'lucide-react';

import type { PanelTone } from '../../_components/overview-ui/panel';

/**
 * How a point reason and a rank position look.
 *
 * Neither table invents a colour. The reason tones are taken from what the
 * existing tokens already *mean* — `--teal` is documented as measured time, so
 * time and attendance read teal; a solve is an accepted verdict, so it reads
 * success — which is why eight reasons need no new hue and no legend.
 *
 * The metals are the only new colour on the page, and §11.4 of the student
 * points design confines them to the rank marker: they describe a position
 * inside a period that resets tomorrow, which is a measurement. A row, a name,
 * or an avatar tinted by rank would be colouring a child, which
 * `overview-ui/panel.tsx` rules out for every surface in this product.
 */

export const reasonIcons: Record<PointReasonName, LucideIcon> = {
  EXERCISE_SOLVED: CircleCheck,
  LECTURE_COMPLETED: BookOpenCheck,
  MODULE_COMPLETED: Layers,
  COURSE_COMPLETED: GraduationCap,
  LEARNING_TIME: Clock,
  ATTENDANCE: CalendarCheck,
  ATTENDANCE_LATE: CalendarClock,
};

export const reasonTones: Record<PointReasonName, PanelTone> = {
  EXERCISE_SOLVED: 'success',
  LECTURE_COMPLETED: 'success',
  MODULE_COMPLETED: 'success',
  // The one completion that deserves weight.
  COURSE_COMPLETED: 'brand',
  LEARNING_TIME: 'teal',
  ATTENDANCE: 'teal',
  // The same hue as being on time. Lateness is a fact, not a warning.
  ATTENDANCE_LATE: 'teal',
};

/** What marks one of the first three positions, and what marks the rest. */
export type RankMarker =
  | { kind: 'medal'; icon: LucideIcon; text: string; chip: string }
  | { kind: 'plain' };

const medals: Record<number, { icon: LucideIcon; text: string; chip: string }> = {
  1: {
    icon: Crown,
    text: 'text-rank-gold',
    chip: 'bg-rank-gold-soft text-rank-gold',
  },
  2: {
    icon: Medal,
    text: 'text-rank-silver',
    chip: 'bg-rank-silver-soft text-rank-silver',
  },
  3: {
    icon: Medal,
    text: 'text-rank-bronze',
    chip: 'bg-rank-bronze-soft text-rank-bronze',
  },
};

export function rankMarker(position: number): RankMarker {
  const medal = medals[position];
  return medal ? { kind: 'medal', ...medal } : { kind: 'plain' };
}

/**
 * The two ends of the chase, and where the reader sits between them.
 *
 * The template answer for a gap is a percentage bar, and a percentage bar has
 * no units: it says "you are 84% of something" and a child cannot check it.
 * This is a scale between two named quantities instead — the points you have
 * at one end, the points of the row you are chasing at the other — so the
 * distance stated underneath can be read off the picture rather than trusted.
 *
 * The three kinds are exhaustive on purpose, and `alone` is the one that
 * matters most: a student with nobody above them has no target, and a bar
 * filled to 100% under the words "solve today's first problem" is a picture
 * that contradicts its own caption. `alone` renders as an unfilled rail.
 *
 * §11.2 of the student points design.
 */
export type ChaseTrack =
  /** Somebody is above you. The bar fills from your total towards theirs. */
  | {
      kind: 'chase';
      percent: number;
      you: number;
      target: number;
      targetPosition: number;
    }
  /** You are first. The bar is full and the far end is the chaser's total. */
  | { kind: 'lead'; you: number; rival: number; rivalPosition: number }
  /** No board, or nobody else in it. There is no target to draw. */
  | { kind: 'alone'; you: number };

export function chaseTrack(standing: {
  points: number;
  position: number | null;
  gap: { kind: 'chase' | 'lead' | 'alone'; points?: number };
}): ChaseTrack {
  if (standing.gap.kind === 'chase') {
    const target = standing.points + (standing.gap.points ?? 0);
    return {
      kind: 'chase',
      // A student who has just started sees a sliver rather than an empty
      // rail, and the bar is full at the moment they draw level.
      percent: target > 0 ? Math.max(3, Math.round((standing.points / target) * 100)) : 0,
      you: standing.points,
      target,
      // The position above theirs. Ties mean it is not always `position - 1`
      // by arithmetic, but it is always the row printed above them.
      targetPosition: Math.max(1, (standing.position ?? 2) - 1),
    };
  }

  if (standing.gap.kind === 'lead') {
    return {
      kind: 'lead',
      you: standing.points,
      rival: Math.max(0, standing.points - (standing.gap.points ?? 0)),
      rivalPosition: 2,
    };
  }

  return { kind: 'alone', you: standing.points };
}

/**
 * The ledger, cut into the days it was earned on.
 *
 * A flat list of forty lines is a list nobody scrolls. Days are the unit a
 * student already thinks in — "what did I get yesterday" is the question — and
 * a day carries its own total, which is the one sum on this page a child can
 * check by adding the rows underneath it.
 *
 * Rows arrive newest first and stay in that order; `localDate` is the academy's
 * calendar day, and the rare row without one falls back to the day it was
 * written so it can never vanish into a group that is not rendered.
 *
 * Voided rows are shown but excluded from the day's total, for the same reason
 * they are excluded from every other sum: a void is an exclusion, not a
 * deduction.
 */
export function groupAwardsByDate<
  T extends { localDate: string | null; createdAt: string; amount: number; voided: boolean },
>(rows: readonly T[]): { date: string; total: number; rows: T[] }[] {
  const groups: { date: string; total: number; rows: T[] }[] = [];

  for (const row of rows) {
    const date = row.localDate ?? row.createdAt.slice(0, 10);
    const last = groups.at(-1);
    const group = last?.date === date ? last : null;
    if (group) {
      group.rows.push(row);
      if (!row.voided) group.total += row.amount;
    } else {
      groups.push({ date, total: row.voided ? 0 : row.amount, rows: [row] });
    }
  }

  return groups;
}
