/**
 * Live counts for one class, as the presence room reports them.
 * Absent until the room has answered, and while realtime is unavailable.
 */
export type ClassLiveCounts = { online: number; solving: number };

/** A class has somebody in it right now. */
export function isClassActive(counts: ClassLiveCounts | undefined): boolean {
  return Boolean(counts && (counts.online > 0 || counts.solving > 0));
}

/**
 * Classes with students in them first (QA T-01).
 *
 * Most solving first, then most online, then the order the server gave. The
 * last key is what keeps the page calm: classes only move when their activity
 * actually differs, never because two equal ones swapped places.
 */
export function orderClassesByActivity<T extends { classId: string }>(
  classes: readonly T[],
  counts: Readonly<Record<string, ClassLiveCounts | undefined>>,
): T[] {
  return classes
    .map((item, index) => ({ item, index, live: counts[item.classId] }))
    .sort(
      (left, right) =>
        (right.live?.solving ?? 0) - (left.live?.solving ?? 0) ||
        (right.live?.online ?? 0) - (left.live?.online ?? 0) ||
        left.index - right.index,
    )
    .map(({ item }) => item);
}
