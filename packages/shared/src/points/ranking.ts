/**
 * Positions, and the one number that makes a position worth looking at.
 *
 * Competition ranking: equal measurements share a position and the next
 * position skips, the way a race reports a dead heat.
 *
 * The ordering keys are deliberate and their order is the design. Active
 * learning time is **not** among them, unchanged from §9.3 of the student
 * academy overview design: a child who understands the material solves the
 * same problem in less time, and ranking on minutes would place them below a
 * child who struggled. Time earns points through a threshold ladder, which is
 * not a race.
 *
 * §10.1 and §10.3 of the student points design.
 */

export type RankableEntry = {
  membershipId: string;
  points: number;
  solvedProblems: number;
  activeDays: number;
};

export type RankedEntry = RankableEntry & { position: number };

/**
 * Orders entries and assigns positions.
 *
 * Membership id is the final tiebreak so two identical rows always come back
 * in the same order — it decides nothing a student can see and is never
 * emitted.
 */
export function rankEntries<T extends RankableEntry>(
  entries: readonly T[],
): (T & { position: number })[] {
  const ordered = [...entries].sort(
    (a, b) =>
      b.points - a.points ||
      b.solvedProblems - a.solvedProblems ||
      b.activeDays - a.activeDays ||
      a.membershipId.localeCompare(b.membershipId),
  );

  let position = 0;
  let previous: RankableEntry | null = null;

  return ordered.map((entry, index) => {
    const tied =
      previous !== null &&
      previous.points === entry.points &&
      previous.solvedProblems === entry.solvedProblems &&
      previous.activeDays === entry.activeDays;

    if (!tied) position = index + 1;
    previous = entry;
    return { ...entry, position };
  });
}

/**
 * The distance to the row above, or the lead over the row below.
 *
 * This is the page's signature measurement. For every student on the board it
 * points exactly one row up, which is always the smallest gap available to
 * them and therefore always the most reachable thing on the page. For the
 * leader it inverts into a margin to defend, so the top of the board has
 * something to do rather than nothing to chase.
 */
export type RankGap =
  | { kind: "chase"; points: number }
  | { kind: "lead"; points: number }
  | { kind: "alone" };

export function rankGap(
  rows: readonly RankedEntry[],
  membershipId: string,
): RankGap {
  const me = rows.find((row) => row.membershipId === membershipId);
  if (!me) return { kind: "alone" };

  // The nearest row strictly above. Ties are not "above" — a student level
  // with somebody is not behind them.
  const above = rows
    .filter((row) => row.points > me.points)
    .reduce<RankedEntry | null>(
      (closest, row) =>
        closest === null || row.points < closest.points ? row : closest,
      null,
    );
  if (above) return { kind: "chase", points: above.points - me.points };

  const below = rows
    .filter((row) => row.points < me.points)
    .reduce<RankedEntry | null>(
      (closest, row) =>
        closest === null || row.points > closest.points ? row : closest,
      null,
    );
  if (below) return { kind: "lead", points: me.points - below.points };

  return { kind: "alone" };
}
