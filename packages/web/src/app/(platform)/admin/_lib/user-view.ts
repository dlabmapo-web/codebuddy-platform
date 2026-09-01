import type {
  AcademyRole,
  PlatformUserMembership,
  PlatformUserSummary,
  UserStatus,
} from '@cove/shared';

import { roleIcons, roleTones } from '@/app/(studio)/academy/[academySlug]/(framed)/_lib/manager-view';
import { toneStyles } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/overview-ui/panel';

export { roleIcons, roleTones, toneStyles };

/**
 * How the console reads a person, in one place.
 *
 * The console's second view module, and a sibling of `platform-view.ts` rather
 * than an addition to it: that one derives an academy's condition, this one
 * derives a person's, and the two share no vocabulary. Keeping them apart is
 * what stops "state" meaning two things in one folder.
 */

/* ------------------------------------------------------------ affiliation */

/**
 * Which academy leads when a person belongs to several.
 *
 * Lower sorts first. Active before anything else, because a suspended
 * membership is history and the operator is looking at who this person *is*;
 * then by authority, because "Manager at Gangnam" answers more support
 * questions than "Student at Mapo" and only one of the two fits on the row.
 */
const membershipRank: Record<PlatformUserMembership['role'], number> = {
  MANAGER: 0,
  TEAM_LEAD: 1,
  TEACHER: 2,
  STUDENT: 3,
};

export function orderMemberships(
  memberships: readonly PlatformUserMembership[],
): PlatformUserMembership[] {
  return [...memberships].sort((left, right) => {
    const leftActive = left.status === 'ACTIVE' ? 0 : 1;
    const rightActive = right.status === 'ACTIVE' ? 0 : 1;
    return (
      leftActive - rightActive ||
      membershipRank[left.role] - membershipRank[right.role] ||
      left.academyName.localeCompare(right.academyName) ||
      left.academyId.localeCompare(right.academyId)
    );
  });
}

export type Affiliation = {
  /** The one membership the row prints, or null for an account in no academy. */
  lead: PlatformUserMembership | null;
  /** How many more there are. Zero for the ordinary case. */
  others: number;
};

/**
 * What the affiliation cell shows.
 *
 * One membership and a count, never a wrapped pile of chips. A person in four
 * academies would otherwise make one row four times the height of its
 * neighbours, and a table whose rows are different heights cannot be scanned —
 * which is the only thing this table is for. The rest are on the account page,
 * one click away, where there is room to list them properly.
 */
export function affiliationOf(person: PlatformUserSummary): Affiliation {
  const ordered = orderMemberships(person.memberships);
  return {
    lead: ordered[0] ?? null,
    others: Math.max(0, ordered.length - 1),
  };
}

/* ------------------------------------------------------------------ names */

/**
 * What the directory prints for a person.
 *
 * The account's own name, then their sign-in handle, then their email. The
 * academy-local display name is deliberately absent: it is what one academy
 * calls them, and this row spans all of them.
 *
 * Falls back to a marker rather than an empty cell. An account can genuinely
 * have no name — an invitation accepted seconds ago, before the profile step —
 * and a blank cell reads as a broken row rather than as a real answer.
 */
export function userDisplayName(person: {
  displayName: string | null;
  username: string | null;
  email: string | null;
}): string {
  return (
    person.displayName?.trim() ||
    person.username?.trim() ||
    person.email ||
    '—'
  );
}


/* ----------------------------------------------------------------- status */

/**
 * The colour an account's state wears.
 *
 * A filled chip in every state, matching the membership status chips on the
 * manager's own people table. The console showed a quiet grey dot for `ACTIVE`
 * and reserved colour for trouble, on the reasoning that a green pill on three
 * hundred rows teaches the eye to skip the column. That reasoning holds for a
 * column nobody is looking at, and this is not one: an operator opens this
 * table *because* somebody cannot sign in, so the state of the account is the
 * first thing they read, and a grey dot is the slowest possible way to say
 * "this one is fine".
 *
 * It also made the same fact look different in two places. A manager reading a
 * green `Active` and an operator reading a grey dot were being shown one
 * status by one product in two vocabularies.
 *
 * Colour still carries the difference between fine and not: green reads as
 * settled, amber as unfinished, red as stopped, grey as gone. Nothing here
 * colours a *person* — that rule is untouched, and it is why the role hues and
 * these four never share a swatch.
 */
export type StatusTone = 'settled' | 'warning' | 'danger' | 'retired';

export const accountStatusTone: Record<UserStatus, StatusTone> = {
  ACTIVE: 'settled',
  // Not an error — it is where every account starts — but it explains why
  // somebody says they cannot get in, so it has to be visible.
  PENDING_PROFILE: 'warning',
  SUSPENDED: 'danger',
  DELETED: 'retired',
};

export const statusToneStyles: Record<StatusTone, string> = {
  settled: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  retired: 'bg-muted text-sub',
};

export const statusDotStyles: Record<StatusTone, string> = {
  settled: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  retired: 'bg-border',
};

/* ------------------------------------------------------------------- role */

/**
 * The one solid chip in the table (§3.3).
 *
 * Platform authority reads as weight rather than hue: an operator is not a
 * fifth academy role, so it never borrows `roleTones`. It is inverted against
 * every other chip in the table, which is exactly right for the rarest and
 * most consequential thing a row can be.
 */
export const operatorPlateStyles = 'bg-ink text-canvas';

/** The role chip's icon and tone, from the shared academy-role palette. */
export function roleChipStyles(role: AcademyRole) {
  return { icon: roleIcons[role], className: toneStyles[roleTones[role]].chip };
}
