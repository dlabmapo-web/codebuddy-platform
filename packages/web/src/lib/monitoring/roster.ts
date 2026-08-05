import {
  canOpenLiveWorkspace,
  enrollmentGrantsAccess,
  type MonitoringLiveState,
  type MonitoringRosterStudent,
  type PresenceEntry,
} from '@cove/shared';

/**
 * The roster the teacher actually sees: durable enrollment data from the oRPC
 * query, merged with whatever the presence room has said since.
 *
 * The merge is one-directional on purpose. Enrollment decides who is on the
 * list; presence only decorates a row that is already there. A presence entry
 * for somebody who is no longer enrolled is dropped rather than rendered,
 * which is what stops a stale delta from resurrecting a removed student.
 */

export type RosterFilter = 'all' | 'online' | 'solving' | 'idle' | 'offline';

export type RosterRow = MonitoringRosterStudent & {
  state: MonitoringLiveState;
  materialId: string | null;
  run: PresenceEntry['run'];
  /** False while the enrollment row exists but grants nothing. */
  active: boolean;
  canOpenLive: boolean;
};

export function mergeRoster(
  students: readonly MonitoringRosterStudent[],
  presence: readonly PresenceEntry[],
): RosterRow[] {
  const byMembership = new Map(
    presence.map((entry) => [entry.studentMembershipId, entry]),
  );
  return students.map((student) => {
    const entry = byMembership.get(student.membershipId);
    const state = entry?.state ?? 'OFFLINE';
    const materialId = entry?.materialId ?? null;
    const active = enrollmentGrantsAccess({
      membershipStatus: student.membershipStatus,
      role: 'STUDENT',
    }) && student.userStatus === 'ACTIVE';
    return {
      ...student,
      state,
      materialId,
      run: entry?.run ?? null,
      active,
      // A suspended member is on the roster so the teacher can see why they
      // are unreachable, but they are never openable.
      canOpenLive: active && canOpenLiveWorkspace({ state, materialId }),
    };
  });
}

/**
 * `online` means "any live connection", which includes solving and idle. A
 * teacher scanning for who is around should not have to select three filters
 * to see everybody who is there.
 */
export function matchesFilter(row: RosterRow, filter: RosterFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'online':
      return row.state !== 'OFFLINE';
    case 'solving':
      return row.state === 'SOLVING';
    case 'idle':
      return row.state === 'IDLE';
    case 'offline':
      return row.state === 'OFFLINE';
  }
}

/** Case-insensitive, over the two identifiers a teacher actually knows. */
export function matchesSearch(row: RosterRow, search: string): boolean {
  const term = search.trim().toLowerCase();
  if (term.length === 0) return true;
  return (
    (row.displayName ?? '').toLowerCase().includes(term) ||
    (row.email ?? '').toLowerCase().includes(term)
  );
}

export function filterRoster(
  rows: readonly RosterRow[],
  { filter, search }: { filter: RosterFilter; search: string },
): RosterRow[] {
  return rows.filter((row) => matchesFilter(row, filter) && matchesSearch(row, search));
}

/**
 * Counts come from the merged rows rather than from the snapshot's own totals,
 * so a card can never disagree with the list printed underneath it.
 */
export function countRoster(rows: readonly RosterRow[]): {
  total: number;
  online: number;
  solving: number;
} {
  return {
    total: rows.length,
    online: rows.filter((row) => row.state !== 'OFFLINE').length,
    solving: rows.filter((row) => row.state === 'SOLVING').length,
  };
}

/**
 * Who to show first: students who need attention, then everyone else by name.
 *
 * Solving above idle above online above reconnecting above offline. A teacher
 * opens this page to find someone to help, and alphabetical order buries them.
 */
const stateOrder: Record<MonitoringLiveState, number> = {
  SOLVING: 0,
  IDLE: 1,
  ONLINE: 2,
  RECONNECTING: 3,
  OFFLINE: 4,
};

export function sortRoster(rows: readonly RosterRow[]): RosterRow[] {
  return [...rows].sort((left, right) => {
    const byState = stateOrder[left.state] - stateOrder[right.state];
    if (byState !== 0) return byState;
    return (left.displayName ?? left.email ?? '').localeCompare(
      right.displayName ?? right.email ?? '',
    );
  });
}
