import { HttpStatus, Injectable } from "@nestjs/common";
import type { ReviewAcademyJoinRequest } from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { AuditService } from "./audit.service.js";
import { toJoinRequestDetail } from "./academy-onboarding.service.js";

const requestInclude = {
  user: {
    select: { id: true, email: true, displayName: true },
  },
} as const;

@Injectable()
export class AcademyJoinRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly audit: AuditService,
  ) {}

  async list(identity: SupabaseIdentity, academyId: string) {
    await this.access.requirePermission(
      identity.authUserId,
      academyId,
      "academy.members.manage",
    );
    const requests = await this.prisma.academyJoinRequest.findMany({
      where: { academyId, status: "PENDING" },
      include: requestInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return { requests: requests.map(toJoinRequestDetail) };
  }

  async review(identity: SupabaseIdentity, input: ReviewAcademyJoinRequest) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "academy.members.manage",
    );

    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id
        FROM academy_join_requests
        WHERE id = ${input.requestId}::uuid
        FOR UPDATE
      `;
      const request = await transaction.academyJoinRequest.findUnique({
        where: { id: input.requestId },
        include: requestInclude,
      });
      if (!request || request.academyId !== input.academyId) {
        throw new AppException("JOIN_REQUEST_NOT_FOUND", HttpStatus.NOT_FOUND);
      }

      if (request.status !== "PENDING") {
        const sameApproval = input.decision === "APPROVE" &&
          request.status === "APPROVED" &&
          request.approvedRole === input.role;
        const sameRejection = input.decision === "REJECT" &&
          request.status === "REJECTED";
        if (sameApproval || sameRejection) return toJoinRequestDetail(request);
        throw new AppException(
          "JOIN_REQUEST_STATE_CONFLICT",
          HttpStatus.CONFLICT,
        );
      }

      if (input.decision === "REJECT") {
        const rejected = await transaction.academyJoinRequest.update({
          where: { id: request.id },
          data: {
            status: "REJECTED",
            reviewedByUserId: actor.userId,
            reviewedAt: new Date(),
            reviewReason: input.reason,
          },
          include: requestInclude,
        });
        await this.audit.write(transaction, {
          actorUserId: actor.userId,
          academyId: input.academyId,
          action: "academy.join_request.rejected",
          targetType: "AcademyJoinRequest",
          targetId: request.id,
          before: { status: request.status },
          after: { status: rejected.status },
          reason: input.reason,
        });
        return toJoinRequestDetail(rejected);
      }

      const membership = await transaction.academyMembership.findUnique({
        where: {
          academyId_userId: {
            academyId: input.academyId,
            userId: request.userId,
          },
        },
        select: { id: true },
      });
      if (membership) {
        throw new AppException(
          "MEMBERSHIP_ALREADY_EXISTS",
          HttpStatus.CONFLICT,
        );
      }

      const now = new Date();
      const createdMembership = await transaction.academyMembership.create({
        data: {
          academyId: input.academyId,
          userId: request.userId,
          role: input.role,
          status: "ACTIVE",
          approvedByUserId: actor.userId,
          joinedAt: now,
        },
      });
      const approved = await transaction.academyJoinRequest.update({
        where: { id: request.id },
        data: {
          status: "APPROVED",
          approvedRole: input.role,
          reviewedByUserId: actor.userId,
          reviewedAt: now,
          reviewReason: input.reason,
        },
        include: requestInclude,
      });
      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "academy.join_request.approved",
        targetType: "AcademyMembership",
        targetId: createdMembership.id,
        before: { requestStatus: request.status },
        after: {
          requestStatus: approved.status,
          membershipStatus: createdMembership.status,
          role: createdMembership.role,
        },
        reason: input.reason,
      });
      return toJoinRequestDetail(approved);
    });
  }
}
