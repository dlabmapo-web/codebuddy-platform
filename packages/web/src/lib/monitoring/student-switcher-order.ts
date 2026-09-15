import type { RosterRow } from './roster';

export function switcherOrder(rows: readonly RosterRow[], current: string, locale: string, previous: readonly string[] = []): string[] {
  const ids = new Set(rows.map((row) => row.membershipId));
  const retained = previous.filter((id) => ids.has(id));
  const known = new Set(retained);
  const rank = (row: RosterRow) => row.membershipId === current ? 0 : row.canOpenLive ? 1 : 2;
  const added = rows.filter((row) => !known.has(row.membershipId)).sort((a, b) =>
    rank(a) - rank(b) || (a.displayName ?? a.email ?? '').localeCompare(b.displayName ?? b.email ?? '', locale) || a.membershipId.localeCompare(b.membershipId),
  );
  return [...retained, ...added.map((row) => row.membershipId)];
}
