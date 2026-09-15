import { Injectable } from "@nestjs/common";
import type { MonitoringVisitEndReason } from "@cove/shared";

import { PrismaService } from "../database/prisma.service.js";
import type { MonitoringMaterialClaim } from "./monitoring-access.service.js";

/**
 * The record of who could see whom, and when.
 *
 * Opening a visit used to double as the enforcement of one watched student per
 * teacher: a teacher-wide advisory lock closed every other open visit in the
 * same transaction, so a second browser tab moved the watch instead of adding
 * one. That is exactly what five live workspaces cannot tolerate, so the
 * replacement is now scoped to the *session* that asked — a reconnect or a
 * follow closes its own previous visit, and another tab's visit is untouched.
 *
 * Nothing here is retroactive. Historical rows and their end reasons are
 * preserved; the only change is which rows a new visit is allowed to close.
 */
@Injectable()
export class MonitoringVisitService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Opens one audit visit for one watch session.
   *
   * `replacesVisitId` is the visit this same session previously held — a
   * reconnect, or the teacher following the student to another exercise. It is
   * closed in the same transaction so the audit log never shows one session
   * holding two open visits, and it is named explicitly rather than discovered
   * by querying the teacher, because "this teacher's other open visit" is now
   * a legitimate state belonging to a different tab.
   *
   * The advisory lock is keyed on the session for the same reason: competing
   * starts from one workspace are serialized, and two workspaces never wait
   * on each other.
   */
  async start(
    claim: MonitoringMaterialClaim,
    session: { sessionId: string; replacesVisitId: string | null },
  ): Promise<{
    id: string;
    startedAt: Date;
    /** The visit this one displaced, so its rooms can be left. */
    replaced: { id: string; studentMembershipRef: string } | null;
  }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))::text AS locked",
        `monitoring-watch-session:${claim.membershipId}:${session.sessionId}`,
      );
      const open = session.replacesVisitId
        ? await tx.teacherMonitoringVisit.findFirst({
            where: {
              id: session.replacesVisitId,
              teacherMembershipRef: claim.membershipId,
              endedAt: null,
            },
            select: { id: true, studentMembershipRef: true },
          })
        : null;
      if (open) {
        await tx.teacherMonitoringVisit.updateMany({
          where: { id: open.id, endedAt: null },
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
      academyId?: string;
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
      ...(scope.academyId ? { academyId: scope.academyId } : {}),
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
