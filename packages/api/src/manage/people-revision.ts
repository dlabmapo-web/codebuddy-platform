import type { Prisma } from "../generated/prisma/client.js";

/**
 * §8.1 — the counter every people mutation moves.
 *
 * One function, called from inside the transaction that changed something, so
 * the bump and the change either both happen or neither does. A revision
 * incremented afterwards would leave a window in which the roster has moved and
 * nothing says so — which is precisely the window a stale import preview or a
 * stale bulk selection would commit into.
 *
 * It is a counter rather than a hash or a timestamp on purpose. Two reads of an
 * academy either agree on an integer or visibly do not; a timestamp invites
 * comparisons like "close enough", and a hash of the roster would have to be
 * recomputed over every membership to be correct.
 *
 * Callers do not need to know the new value. Nothing is allowed to act on the
 * revision except by comparing two observations of it.
 */
export async function bumpPeopleRevision(
  transaction: Prisma.TransactionClient,
  academyId: string,
): Promise<void> {
  await transaction.academy.update({
    where: { id: academyId },
    data: { peopleRevision: { increment: 1 } },
  });
}
