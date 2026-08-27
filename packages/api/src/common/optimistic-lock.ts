/**
 * Optimistic locking against a `timestamptz` column.
 *
 * Postgres stores these to the microsecond. Prisma reads one into a JavaScript
 * `Date`, which holds only milliseconds, so the microseconds are dropped on the
 * way out and never restored on the way back in: `where: { updatedAt: theDate }`
 * matches no row at all — not even the row the value was just read from.
 *
 * That is silent. The row is simply not claimed, `count` is zero, and a caller
 * checking for a lost race reports an edit conflict to someone who was the only
 * person editing. Every conditional update here failed that way.
 *
 * A caller only ever holds millisecond precision anyway — an ISO string from a
 * previous read — so the honest question is "is this still the revision I was
 * given", and the millisecond it names answers it. Two writes landing in the
 * same millisecond on one row would be indistinguishable, which is the same
 * guarantee the ISO string carried in the first place.
 */
export function atRevision(timestamp: Date): { gte: Date; lt: Date } {
  return {
    gte: timestamp,
    lt: new Date(timestamp.getTime() + 1),
  };
}
