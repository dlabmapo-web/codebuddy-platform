import { Injectable } from "@nestjs/common";
import type { MonitoringVisitEndReason } from "@cove/shared";

import { PrismaService } from "../database/prisma.service.js";
import type { MonitoringMaterialClaim } from "./monitoring-access.service.js";

/**
 * The record of who could see whom, and when.
 *
 * Opening a visit is also what enforces one watched student per teacher: the
 * previous visit is closed as replaced in the same step, so a second browser
 * tab moves the watch rather than creating a second, invisible one.
 */
@Injectable()
export class MonitoringVisitService {
  constructor(private readonly prisma: PrismaService) {}

  async start(claim: MonitoringMaterialClaim): Promise<{
    id: string;
    startedAt: Date;
    /** The visit this one displaced, so its rooms can be left. */
    replaced: { id: string; studentMembershipRef: string } | null;
  }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))::text AS locked",
        `monitoring-teacher:${claim.membershipId}`,
      );
      const open = await tx.teacherMonitoringVisit.findFirst({
        where: {
          teacherMembershipRef: claim.membershipId,
          endedAt: null,
        },
        select: { id: true, studentMembershipRef: true },
        orderBy: { startedAt: "desc" },
      });
      if (open) {
        await tx.teacherMonitoringVisit.updateMany({
          where: { teacherMembershipRef: claim.membershipId, endedAt: null },
          data: { endedAt: new Date(), endReason: "WATCH_REPLACED" },
        });
      }

      const visit = await tx.teacherMonitoringVisit.create({
        data: {
          academyId: claim.academyId,
          classId: claim.classId,
          teacherMembershipId: claim.membershipId,
          studentMembershipId: claim.studentMembershipId,
          // The immutable pair: these stay readable after either membership
          // row is deleted, which is what makes the record accountability
          // rather than a foreign key that quietly nulls itself away.
          teacherMembershipRef: claim.membershipId,
          studentMembershipRef: claim.studentMembershipId,
          materialId: claim.materialId,
        },
        select: { id: true, startedAt: true },
      });

      return {
        id: visit.id,
        startedAt: visit.startedAt,
        replaced: open ?? null,
      };
    });
  }

  /**
   * Closes a visit. Idempotent by construction: a revocation that arrives
   * twice, or races the teacher's own disconnect, writes once.
   */
  async end(
    visitId: string,
    reason: MonitoringVisitEndReason,
  ): Promise<boolean> {
    const { count } = await this.prisma.teacherMonitoringVisit.updateMany({
      where: { id: visitId, endedAt: null },
      data: { endedAt: new Date(), endReason: reason },
    });
    return count === 1;
  }

  /**
   * Closes every open visit matching a revoked scope, and reports whose they
   * were so their rooms can be emptied on this and every other instance.
   */
  async endOpenVisits(
    scope: {
      classId?: string;
      teacherMembershipRef?: string;
      studentMembershipRef?: string;
    },
    reason: MonitoringVisitEndReason,
  ): Promise<
    Array<{
      id: string;
      academyId: string;
      classId: string;
      teacherMembershipRef: string;
      studentMembershipRef: string;
    }>
  > {
    const where = {
      endedAt: null,
      ...(scope.classId ? { classId: scope.classId } : {}),
      ...(scope.teacherMembershipRef
        ? { teacherMembershipRef: scope.teacherMembershipRef }
        : {}),
      ...(scope.studentMembershipRef
        ? { studentMembershipRef: scope.studentMembershipRef }
        : {}),
    };
    const open = await this.prisma.teacherMonitoringVisit.findMany({
      where,
      select: {
        id: true,
        academyId: true,
        classId: true,
        teacherMembershipRef: true,
        studentMembershipRef: true,
      },
    });
    if (open.length === 0) return [];
    await this.prisma.teacherMonitoringVisit.updateMany({
      where: { id: { in: open.map((visit) => visit.id) } },
      data: { endedAt: new Date(), endReason: reason },
    });
    return open;
  }
}
