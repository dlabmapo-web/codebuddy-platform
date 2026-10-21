import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../database/prisma.service.js';

/** One lock precedes all integration row locks, including CLI and activation.
 * This intentionally serializes short integration transactions; no network IO
 * may occur inside. Local row-level restrictions can cause a retry, never a grant.
 */
export async function sourceLock(tx: Prisma.TransactionClient, _key?: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('cove:dlab:write', 0))::text`;
}
export async function sourceWrite(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT set_config('cove.dlab_sync', 'on', true)`;
}
export async function dlabTransaction<T>(prisma: PrismaService, run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async tx => { await sourceLock(tx); return run(tx); }, { timeout: 20_000 });
    } catch (error) {
      const detail = error as { code?: string; meta?: { code?: string } };
      if (attempt >= 2 || !(detail.code === 'P2034' || ['40P01', '40001'].includes(detail.meta?.code ?? ''))) throw error;
    }
  }
}
