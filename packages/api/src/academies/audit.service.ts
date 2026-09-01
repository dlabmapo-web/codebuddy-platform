import { Injectable } from "@nestjs/common";

import { currentSupportGrantId } from "../common/request-context.js";
import type { Prisma } from "../generated/prisma/client.js";

export type AuditInput = {
  actorUserId: string;
  /**
   * Null for platform-scoped acts, which belong to no academy — promoting
   * the first admin and creating the platform organization both happen
   * before any academy is in play. The column has always been nullable; the
   * type was the narrower of the two, and an audit trail that cannot record
   * its most privileged entries is the wrong trade.
   */
  academyId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  reason?: string;
  requestId?: string;
  /**
   * Normally omitted. The writer reads the request's own grant, so an act
   * performed under support access is attributed whether or not the service
   * doing it knows support access exists.
   */
  supportGrantId?: string;
};

@Injectable()
export class AuditService {
  async write(transaction: Prisma.TransactionClient, input: AuditInput) {
    return transaction.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        academyId: input.academyId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        before: input.before,
        after: input.after,
        reason: input.reason,
        requestId: input.requestId,
        supportGrantId: input.supportGrantId ?? currentSupportGrantId(),
      },
    });
  }
}
