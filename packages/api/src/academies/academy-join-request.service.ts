import { HttpStatus, Injectable } from "@nestjs/common";
import {
  canApproveAs,
  type AcademyRole,
  type ReviewAcademyJoinRequest,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { bumpPeopleRevision } from "../manage/people-revision.js";
import { NotificationBroadcaster } from "../notifications/notification-broadcaster.js";
import {
  noMemberAvatar,
  resolveMemberAvatars,
} from "../profile/member-avatars.js";
import { ProfileMediaService } from "../profile/profile-media.service.js";
import { AuditService } from "./audit.service.js";
import {
  requestInclude,
  toJoinRequestDetail,
} from "./academy-onboarding.service.js";

@Injectable()
export class AcademyJoinRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly audit: AuditService,
    /** The applications table shows faces, like every other people surface. */
    private readonly profileMedia: ProfileMediaService,
    /**
     * Tells the applicant, on whatever screen they are already looking at.
     * Called after the transaction below commits, never inside it.
     */
    private readonly notifications: NotificationBroadcaster,
  ) {}

  async list(identity: SupabaseIdentity, academyId: string) {
    await this.access.requirePermission(
      identity.authUserId,
      academyId,
      "academy.applications.review",
    );
    const requests = await this.prisma.academyJoinRequest.findMany({
      where: { academyId, status: "PENDING" },
      include: requestInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    // Applicants have no academy photo — they are not members yet — so only
    // their own account image is signed. `map(toJoinRequestDetail)` would pass
    // the array index as the avatar argument, hence the explicit arrow.
    const avatars = await resolveMemberAvatars(
      this.profileMedia,
      requests.map((request) => ({
        user: request.user,
        memberProfile: null,
        key: request.id,
      })),
    );
    return {
      requests: requests.map((request) =>
        toJoinRequestDetail(request, avatars.get(request.id) ?? noMemberAvatar),
      ),
    };
  }

  /**
   * The count behind the nav badge.
   *
   * Gated exactly as `list` is: the number of people waiting to be let into an
   * academy is a fact about that academy, and somebody who may not read the
   * queue may not read its size either.
   */
  async pendingCount(identity: SupabaseIdentity, academyId: string) {
    await this.access.requirePermission(
      identity.authUserId,
      academyId,
      "academy.applications.review",
    );
    const count = await this.prisma.academyJoinRequest.count({
      where: { academyId, status: "PENDING" },
    });
    return { count };
  }

  async review(identity: SupabaseIdentity, input: ReviewAcademyJoinRequest) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "academy.applications.review",
    );

    if (input.decision === "APPROVE" && !canApproveAs(actor.role, input.role)) {
      throw new AppException(
        "JOIN_REQUEST_ROLE_NOT_PERMITTED",
        HttpStatus.FORBIDDEN,
      );
    }

    const reviewed = await this.reviewInTransaction(actor, input);

    /*
     * The applicant is told here, after the decision is durable.
     *
     * Inside the transaction this would announce an approval that a rollback
     * would unmake, and the applicant would be looking at a membership that
     * does not exist. Awaited rather than left floating so a test can observe
     * it, and internally best-effort so it can never fail the review a manager
     * has already made.
     */
    await this.notifications.decisionMade(reviewed.userId, reviewed.detail.id);
    return reviewed.detail;
  }

  private async reviewInTransaction(
    actor: { userId: string; role: AcademyRole },
    input: ReviewAcademyJoinRequest,
  ) {
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
        if (sameApproval || sameRejection) {
          return {
            detail: toJoinRequestDetail(request),
            userId: request.userId,
          };
        }
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
        return {
          detail: toJoinRequestDetail(rejected),
          userId: rejected.userId,
        };
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

      // §8.1 — an approved application is a new member, so the revision
      // moves with it.
      await bumpPeopleRevision(transaction, request.academyId);
      return {
        detail: toJoinRequestDetail(approved),
        userId: approved.userId,
      };
    });
  }
}
