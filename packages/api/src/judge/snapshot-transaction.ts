import type { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
/** Nested relation reads share one revision; conflicting author edits have a finite retry budget. */
export async function snapshotTransaction<T>(db: PrismaService, action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(action, { isolationLevel: "RepeatableRead", timeout: 10_000 }); }
    catch (error) {
      if (attempt >= 2 || typeof error !== "object" || !error || !("code" in error) || error.code !== "P2034") throw error;
    }
  }
}
