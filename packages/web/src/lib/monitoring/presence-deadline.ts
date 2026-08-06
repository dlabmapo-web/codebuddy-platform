import type { PresenceEntry } from '@cove/shared';

/** Earliest server-authored instant at which a roster label becomes stale. */
export function nextPresenceDeadline(
  entries: readonly PresenceEntry[],
): number | null {
  let earliest: number | null = null;
  for (const entry of entries) {
    if (!entry.stateExpiresAt) continue;
    const deadline = Date.parse(entry.stateExpiresAt);
    if (!Number.isFinite(deadline)) continue;
    earliest = earliest === null ? deadline : Math.min(earliest, deadline);
  }
  return earliest;
}
