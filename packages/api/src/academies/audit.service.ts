import { Injectable } from "@nestjs/common";

import type { Prisma } from "../generated/prisma/client.js";

export type AuditInput = {
  actorUserId: string;
  academyId: string;
  action: string;
  targetType: string;
  targetId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  reason?: string;
  requestId?: string;
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
      },
    });
  }
}
