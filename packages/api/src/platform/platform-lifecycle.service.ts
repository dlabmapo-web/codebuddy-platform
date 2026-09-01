import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import {
  canTransitionAcademyStatus,
  type AcademyStatus,
  type PlatformAcademyDetail,
  type SetAcademyStatusInput,
} from "@cove/shared";

import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PlatformAccessService } from "../authorization/platform-access.service.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { MonitoringRevocationService } from "../monitoring/monitoring-revocation.service.js";
import { readAcademyStats } from "./academy-stats.js";
import { toAcademyDetail } from "./platform-academy.mapper.js";
import { academyDetailSelect } from "./platform-academy.select.js";

const auditActions: Record<AcademyStatus, string> = {
  ACTIVE: "platform.academy.restored",
  SUSPENDED: "platform.academy.suspended",
  ARCHIVED: "platform.academy.archived",
};

/**
 * Moving an academy between ACTIVE, SUSPENDED, and ARCHIVED — and making that
 * move real everywhere it has to be.
 *
 * Separate from `PlatformAcademyService` because suspension has collaborators
 * creation does not: the request path already refuses a non-ACTIVE academy, but
 * a check that runs once at connection time does not un-run itself, so anything
 * long-lived has to be told. Today that is live monitoring. The judge queue is
 * deliberately not told — grading is idempotent and already-queued work is a
 * student's submitted answer, which is worth finishing even as the academy
 * goes dark. The access service refuses the *next* one.
 */
@Injectable()
export class PlatformLifecycleService {
  private readonly logger = new Logger(PlatformLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlatformAccessService,
    private readonly audit: AuditService,
    private readonly revocation: MonitoringRevocationService,
  ) {}

  async setStatus(
    identity: SupabaseIdentity,
    input: SetAcademyStatusInput,
  ): Promise<PlatformAcademyDetail> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      "platform.academies.lifecycle",
    );

    const { academy, changed } = await this.prisma.$transaction(
      async (transaction) => {
        // Locked for the same reason a membership change locks: two operators
        // acting at once must not both read ACTIVE and both write a different
        // next state.
        const rows = await transaction.$queryRaw<
          { id: string; status: AcademyStatus }[]
        >`SELECT id, status FROM academies WHERE id = ${input.academyId}::uuid FOR UPDATE`;
        const current = rows[0];
        if (!current) {
          throw new AppException("ACADEMY_NOT_FOUND", HttpStatus.NOT_FOUND);
        }

        if (current.status === input.status) {
          // A no-op writes no audit record. An operator clicking twice has not
          // intervened twice, and a trail that says otherwise is worse than
          // one that says nothing.
          return {
            academy: await readDetail(transaction, input.academyId),
            changed: false,
          };
        }
        if (!canTransitionAcademyStatus(current.status, input.status)) {
          throw new AppException(
            "ACADEMY_STATE_CONFLICT",
            HttpStatus.CONFLICT,
          );
        }

        await transaction.academy.update({
          where: { id: input.academyId },
          data: { status: input.status, statusChangedAt: new Date() },
        });
        await this.audit.write(transaction, {
          actorUserId: actor.userId,
          academyId: input.academyId,
          action: auditActions[input.status],
          targetType: "Academy",
          targetId: input.academyId,
          before: { status: current.status },
          after: { status: input.status },
          reason: input.reason,
        });

        return {
          academy: await readDetail(transaction, input.academyId),
          changed: true,
        };
      },
    );

    if (changed && academy.status !== "ACTIVE") {
      // After the commit, never inside it: a rolled-back suspension must not
      // have already disconnected a classroom.
      await this.revocation.revokeAcademy(input.academyId, "ACADEMY_SUSPENDED");
      this.logger.log(
        `academy ${input.academyId} moved to ${academy.status} by ${actor.userId}`,
      );
    }

    return toAcademyDetail(academy, await readAcademyStats(this.prisma, academy.id));
  }
}

async function readDetail(
  transaction: Prisma.TransactionClient,
  academyId: string,
) {
  return transaction.academy.findUniqueOrThrow({
    where: { id: academyId },
    select: academyDetailSelect,
  });
}
