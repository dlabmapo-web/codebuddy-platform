import { AppException } from '../../common/app-exception.js';
import type { Prisma } from '../../generated/prisma/client.js';

/** Call only after the caller's normal academy/platform authorization and row lock.
 * The DB trigger clears only the local marker; source-blocked access stays blocked.
 */
export async function restoreDlabMembership(tx: Prisma.TransactionClient, membershipId: string) {
  const binding = await tx.dlabMembershipBinding?.findUnique({ where: { membershipId } });
  if (!binding) return false;
  await tx.$queryRaw`SELECT set_config('cove.dlab_restore', 'on', true)`;
  await tx.academyMembership.update({ where: { id: membershipId }, data: { status: 'ACTIVE', suspendedAt: null } });
  await tx.$queryRaw`SELECT set_config('cove.dlab_restore', 'off', true)`;
  return true;
}

/** Presentation and API validation complement the database guard. */
export async function assertDlabRoleEditable(tx: Prisma.TransactionClient, membershipId: string) {
  if (await tx.dlabMembershipBinding?.findUnique({ where: { membershipId } })) {
    throw new AppException('DLAB_MANAGED_FIELDS', 403);
  }
}
