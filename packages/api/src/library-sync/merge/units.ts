/**
 * The five rules (design §8.1), and the keyed-list table (§8.2), as one
 * decision over hashes. Pure: no database, no values.
 *
 * A null hash means "absent": an item that does not exist on that side. Fixed
 * units are always present on both sides of a node that exists, so absence
 * only matters for keyed-list items and structural presence.
 */

export type BaseRef =
  | { state: "VALUE"; hash: string }
  | { state: "ABSENT" }
  | { state: "UNKNOWN" };

export const ABSENT: BaseRef = { state: "ABSENT" };
export const UNKNOWN: BaseRef = { state: "UNKNOWN" };
export const valueRef = (hash: string | null | undefined): BaseRef =>
  hash ? { state: "VALUE", hash } : ABSENT;

export type UnitOutcome = "CONVERGED" | "APPLIED" | "KEPT" | "CONFLICT";

export type ConflictKind =
  | "CONCURRENT_EDIT"
  | "UNKNOWN_BASE"
  | "REMOVED_UPSTREAM_EDITED_LOCALLY"
  | "EDITED_UPSTREAM_DELETED_LOCALLY"
  | "REMOVED_UPSTREAM_HAS_LOCAL_CONTENT"
  | "PARENT_MISSING"
  | "PLACEMENT"
  | "INVALID_RESULT";

export type UnitDecision = {
  outcome: UnitOutcome;
  conflictKind?: ConflictKind;
};

const baseHash = (base: BaseRef) => (base.state === "VALUE" ? base.hash : null);

export function decideUnit(
  base: BaseRef,
  ours: string | null,
  theirs: string | null,
): UnitDecision {
  // Both sides agree, whatever base was: nothing to write and nothing to ask.
  if (ours === theirs) return { outcome: "CONVERGED" };
  if (base.state === "UNKNOWN")
    return { outcome: "CONFLICT", conflictKind: "UNKNOWN_BASE" };
  const before = baseHash(base);
  if (ours === before) return { outcome: "APPLIED" };
  if (theirs === before) return { outcome: "KEPT" };
  if (theirs === null)
    return {
      outcome: "CONFLICT",
      conflictKind: "REMOVED_UPSTREAM_EDITED_LOCALLY",
    };
  if (ours === null)
    return {
      outcome: "CONFLICT",
      conflictKind: "EDITED_UPSTREAM_DELETED_LOCALLY",
    };
  return { outcome: "CONFLICT", conflictKind: "CONCURRENT_EDIT" };
}

/** The hash the copy holds after a decision: theirs when applied, ours otherwise. */
export function mergedHash(
  decision: UnitDecision,
  ours: string | null,
  theirs: string | null,
) {
  return decision.outcome === "APPLIED" ? theirs : ours;
}
