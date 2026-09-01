import type {
  UserLens,
  PlatformUserMembership,
  PlatformUserSummary,
  UserStatus,
} from '@cove/shared';

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
 * How loudly a row's account status should read.
 *
 * `quiet` renders as a muted dot and a word; the rest render as a filled chip.
 * The distinction is the whole design of the column: a table that puts a green
 * ACTIVE pill on every row teaches the eye to skip the column, and then the one
 * suspended account in three hundred is the row nobody notices. Only trouble
 * gets colour, so colour keeps meaning trouble.
 */
export type StatusTone = 'quiet' | 'warning' | 'danger' | 'retired';

export const accountStatusTone: Record<UserStatus, StatusTone> = {
  ACTIVE: 'quiet',
  // Not an error — it is where every account starts — but it explains why
  // somebody says they cannot get in, so it has to be visible.
  PENDING_PROFILE: 'warning',
  SUSPENDED: 'danger',
  DELETED: 'retired',
};

export const statusToneStyles: Record<StatusTone, string> = {
  quiet: 'text-sub',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  retired: 'bg-muted text-sub',
};

export const statusDotStyles: Record<StatusTone, string> = {
  quiet: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  retired: 'bg-border',
};

/* ------------------------------------------------------------------ lenses */

/** Where each lens lives, so the switcher and the router agree. */
export const lensHrefs: Record<UserLens, string> = {
  everyone: '/admin/users',
  students: '/admin/users/students',
  teachers: '/admin/users/teachers',
  staff: '/admin/users/staff',
};
