import type { MonitoringFeedback } from '@cove/shared';

/**
 * The student's feedback thread, as pure folds.
 *
 * Separated from the hook for the same reason the roster reducer is: the
 * interesting behavior here is reconciliation, and it is worth testing without
 * a socket, a fetch, or a React renderer in the way.
 *
 * The thread is newest-first throughout, which is the order the server returns
 * and the order the panel renders.
 */

/**
 * Identifies a note *and the wording it currently has*.
 *
 * A teacher rewrites their note in place, so the row keeps its id: an identity
 * built on the id alone would treat a correction as a duplicate and never show
 * it. Pairing the id with `updatedAt` makes a revision a distinct thing to
 * have seen, which is what the panel needs to decide whether to open.
 */
export function revisionOf(note: MonitoringFeedback): string {
  return `${note.id}@${note.updatedAt}`;
}

/**
 * Folds one live arrival into the notes the client holds.
 *
 * Reconciled by id, replacing rather than appending: the same note arrives
 * twice — once over the socket and once in a history read that raced it — and
 * a rewrite arrives under the id it already had. Returns the original array
 * when nothing changed, so an unchanged thread does not re-render or reopen a
 * panel the student just closed.
 */
export function mergeFeedback(
  current: readonly MonitoringFeedback[],
  incoming: MonitoringFeedback,
): readonly MonitoringFeedback[] {
  const index = current.findIndex((note) => note.id === incoming.id);
  if (index === -1) return [incoming, ...current];
  if (revisionOf(current[index]!) === revisionOf(incoming)) return current;
  const next = [...current];
  next[index] = incoming;
  return next;
}

/**
 * Folds a history page into a thread that may already hold live arrivals.
 *
 * The page wins on content — it is the server's copy — but a message that
 * arrived over the socket while the request was in flight is kept rather than
 * dropped, which is the race that would otherwise lose a note written in the
 * same second the student opened the exercise.
 */
export function mergeFeedbackPage(
  current: readonly MonitoringFeedback[],
  page: readonly MonitoringFeedback[],
): readonly MonitoringFeedback[] {
  const fromPage = new Set(page.map((message) => message.id));
  const liveOnly = current.filter((message) => !fromPage.has(message.id));
  return [...liveOnly, ...page].sort(byNewestFirst);
}

/** Ids the student has not opened yet. Server truth, mirrored locally. */
export function unreadIds(
  messages: readonly MonitoringFeedback[],
): readonly string[] {
  return messages
    .filter((message) => message.readAt === null)
    .map((message) => message.id);
}

/**
 * Stamps every unread row.
 *
 * Local only: it clears the badge the moment the panel opens, and the request
 * that follows makes it durable. A student should never watch a count linger
 * while a round trip completes.
 */
export function markThreadRead(
  messages: readonly MonitoringFeedback[],
  readAt: string,
): readonly MonitoringFeedback[] {
  if (messages.every((message) => message.readAt !== null)) return messages;
  return messages.map((message) =>
    message.readAt === null ? { ...message, readAt } : message,
  );
}

function byNewestFirst(a: MonitoringFeedback, b: MonitoringFeedback): number {
  const delta = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  // Ties broken on id, matching the server's `[createdAt desc, id desc]`, so
  // two notes written in the same millisecond do not swap places on refetch.
  return delta !== 0 ? delta : b.id.localeCompare(a.id);
}
