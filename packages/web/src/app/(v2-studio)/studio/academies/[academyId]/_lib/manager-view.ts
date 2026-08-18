import type {
  AcademyRole,
  AcademyScale,
  ClassGapKind,
  MembershipStatus,
  OverviewRange,
} from '@cove/shared';
import {
  BookOpenCheck,
  GraduationCap,
  ShieldCheck,
  UserCog,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';

import type { PanelTone } from '../_components/overview-ui/panel';

/**
 * How control tower data becomes something on a screen.
 *
 * Presentation only. Every threshold, rate, and ordering is decided in
 * `@cove/shared` where it can be tested without a browser; what lives here is
 * genuinely about reading — which hue a role wears, how a stacked band is laid
 * out, how a clock is spelled — and it is kept out of the components so a chart
 * and the accessible table beside it cannot describe the same academy
 * differently.
 *
 * ## The role palette
 *
 * Four roles, four hues, and the assignment is not arbitrary. Students are the
 * academy's blue because they are its subject and its largest population.
 * Teachers are violet, which is already the product's colour for "the other
 * person in the room". Team leads are teal, the colour of measured work.
 * Managers are the action orange this page uses for everything a manager
 * personally owns.
 *
 * Green is deliberately absent from the roles. It means growth on this page —
 * the arrivals chart — and a green role would read as the good one.
 */

export const roleTones: Record<AcademyRole, PanelTone> = {
  STUDENT: 'brand',
  TEACHER: 'peer',
  TEAM_LEAD: 'teal',
  MANAGER: 'primary',
};

export const roleIcons: Record<AcademyRole, LucideIcon> = {
  STUDENT: GraduationCap,
  TEACHER: UserRound,
  TEAM_LEAD: ShieldCheck,
  MANAGER: UserCog,
};

/**
 * The role band's segments, in a fixed order with their share of the whole.
 *
 * Fixed rather than sorted by size: a band that reordered itself as an academy
 * hired would be unreadable across two visits, and the shape of the population
 * is the thing it exists to show. Roles with nobody in them are returned with a
 * zero share so the legend can still state "no team leads", which is an answer.
 */
export type CompositionSegment = {
  role: AcademyRole;
  count: number;
  percent: number;
  tone: PanelTone;
};

export function compositionSegments(scale: AcademyScale): CompositionSegment[] {
  const counts: [AcademyRole, number][] = [
    ['STUDENT', scale.students],
    ['TEACHER', scale.teachers],
    ['TEAM_LEAD', scale.teamLeads],
    ['MANAGER', scale.managers],
  ];
  const total = scale.activeMembers;
  return counts.map(([role, count]) => ({
    role,
    count,
    // Raw share, not rounded: the band is drawn from these and four rounded
    // percentages do not add to a hundred, which would leave a visible seam at
    // the right edge on most academies.
    percent: total > 0 ? (count / total) * 100 : 0,
    tone: roleTones[role],
  }));
}

/** The tone a membership status wears wherever it appears. */
export const statusTones: Record<MembershipStatus, string> = {
  ACTIVE: 'bg-success/10 text-success',
  INVITED: 'bg-brand/10 text-brand',
  SUSPENDED: 'bg-warning/10 text-warning',
  LEFT: 'bg-retired/10 text-retired',
};

/**
 * The three ways a class is not ready, and what each one looks like.
 *
 * A gap is a missing prerequisite rather than a judgement, so all three take
 * the page's action orange rather than a severity ramp: none of them is worse
 * than the others, and all three are one decision away from being fixed.
 */
export const classGapIcons: Record<ClassGapKind, LucideIcon> = {
  no_teacher: UserRound,
  no_students: Users,
  no_course: BookOpenCheck,
};

/**
 * The academy's own wall clock.
 *
 * Every period, growth bucket, and "today" on this page is drawn in the
 * academy's zone, so the page shows that zone's time rather than the reader's.
 * A manager checking the tower from a train in another country should see the
 * clock the numbers were counted against, not the one on their phone.
 */
export function academyClock(now: Date, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
}

/** The academy's local weekday and date, for the line under the clock. */
export function academyDateLabel(
  now: Date,
  timeZone: string,
  locale: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(now);
}

/**
 * A postal address on one line, with the empty parts closed up.
 *
 * Returns null rather than an empty string when nothing is set, so the caller
 * renders the "not set" affordance instead of an address-shaped blank.
 */
export function addressLine(academy: {
  addressLine1: string | null;
  addressLine2: string | null;
  locality: string | null;
  region: string | null;
  postalCode: string | null;
}): string | null {
  const parts = [
    academy.addressLine1,
    academy.addressLine2,
    academy.locality,
    academy.region,
    academy.postalCode,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * The height of one bar in the growth chart, as a percentage of the tallest.
 *
 * A day with arrivals never draws as nothing: the floor is what separates "one
 * student joined" from "nobody did" at a glance, and it is the distinction the
 * chart exists to make. A day with none draws as none.
 */
export function growthBarHeight(joined: number, peak: number): string {
  if (joined <= 0) return '0%';
  if (peak <= 0) return '0%';
  return `${Math.max(8, Math.round((joined / peak) * 100))}%`;
}

/**
 * How many day labels an axis can carry without overlapping.
 *
 * Thirty labels do not fit on a phone and seven do fit anywhere, so the axis
 * thins itself by taking every nth day. The first and last are always kept —
 * an axis whose ends are unlabelled does not say which period it covers.
 */
export function axisLabelStride(days: number): number {
  if (days <= 8) return 1;
  if (days <= 16) return 2;
  return Math.ceil(days / 8);
}

/** The comparison caption's own words, chosen by the sign of the change. */
export function growthTrend(
  changePercent: number | null,
): { key: 'up' | 'down' | 'flat' | 'no_baseline'; value: number } {
  if (changePercent === null) return { key: 'no_baseline', value: 0 };
  if (changePercent > 0) return { key: 'up', value: changePercent };
  if (changePercent < 0) return { key: 'down', value: Math.abs(changePercent) };
  return { key: 'flat', value: 0 };
}

/** The ranges the control tower offers, in the order they widen. */
export const managerRanges: readonly OverviewRange[] = ['7d', '30d', 'all'];
