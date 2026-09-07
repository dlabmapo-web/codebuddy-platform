import { HttpStatus, Injectable } from "@nestjs/common";
import { displayableEmail } from "@cove/shared";
import type {
  CreateAcademyJoinRequest,
  JoinRequestKind,
  MemberAvatarUrls,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  memberAvatarSelect,
  noMemberAvatar,
} from "../profile/member-avatars.js";

/**
 * An applicant, with the photo they set on their own account.
 *
 * No academy-scoped image is selected because there is no membership yet — the
 * whole point of a join request is that they are not in the academy. The
 * fallback chain handles the absence.
 */
export const requestInclude = {
  user: {
    select: {
      id: true,
      email: true,
      displayName: true,
      ...memberAvatarSelect.user.select,
    },
  },
} as const;

@Injectable()
export class AcademyOnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `requestedKind` is what the signup form's Student/Staff control chose. It
   * travels onto the request so the lobby can show the right empty navigation
   * while the applicant waits, and it decides nothing else — the academy role
   * still comes only from the manager who approves.
   *
   * Defaulted rather than required so an identity that predates the column, or
   * one arriving through OAuth with no such choice recorded, still produces a
   * request.
   */
  async ensureSignupRequest(
    userId: string,
    requestedAcademyId: string | null,
    emailVerified: boolean,
    requestedKind: JoinRequestKind = "STUDENT",
  ): Promise<void> {
    if (!requestedAcademyId || !emailVerified) return;

    const academy = await this.prisma.academy.findFirst({
      where: { id: requestedAcademyId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!academy) {
      throw new AppException("ACADEMY_NOT_FOUND", HttpStatus.NOT_FOUND);
    }

    const membership = await this.prisma.academyMembership.findUnique({
      where: {
        academyId_userId: { academyId: requestedAcademyId, userId },
      },
      select: { id: true },
    });
    if (membership) return;

    const previousRequest = await this.prisma.academyJoinRequest.findFirst({
      where: { academyId: requestedAcademyId, userId },
      select: { id: true },
    });
    if (previousRequest) return;

    try {
      await this.prisma.academyJoinRequest.create({
        data: { academyId: requestedAcademyId, userId, requestedKind },
      });
    } catch (error) {
      if (!hasPrismaCode(error, "P2002")) throw error;
    }
  }

  /**
   * What this person last asked to be at this academy.
   *
   * Read only when a reapplication carries no kind of its own. Falls back to
   * STUDENT, which is the narrower shape and the common case.
   */
  private async previousKind(
    academyId: string,
    userId: string,
  ): Promise<JoinRequestKind> {
    const previous = await this.prisma.academyJoinRequest.findFirst({
      where: { academyId, userId },
      select: { requestedKind: true },
      orderBy: { createdAt: "desc" },
    });
    return previous?.requestedKind ?? "STUDENT";
  }

  async create(identity: SupabaseIdentity, input: CreateAcademyJoinRequest) {
    if (!identity.emailVerified) {
      throw new AppException(
        "EMAIL_VERIFICATION_REQUIRED",
        HttpStatus.FORBIDDEN,
      );
    }
    const user = await this.requireActiveUser(identity.authUserId);
    const academy = await this.prisma.academy.findFirst({
      where: { id: input.academyId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!academy) {
      throw new AppException("ACADEMY_NOT_FOUND", HttpStatus.NOT_FOUND);
    }

    const membership = await this.prisma.academyMembership.findUnique({
      where: {
        academyId_userId: { academyId: input.academyId, userId: user.id },
      },
      select: { id: true },
    });
    if (membership) {
      throw new AppException("MEMBERSHIP_ALREADY_EXISTS", HttpStatus.CONFLICT);
    }

    const pending = await this.prisma.academyJoinRequest.findFirst({
      where: {
        academyId: input.academyId,
        userId: user.id,
        status: "PENDING",
      },
      include: requestInclude,
    });
    if (pending) {
      throw new AppException(
        "JOIN_REQUEST_ALREADY_PENDING",
        HttpStatus.CONFLICT,
      );
    }

    try {
      const created = await this.prisma.academyJoinRequest.create({
        data: {
          academyId: input.academyId,
          userId: user.id,
          message: input.message,
          // Reapplying from the pending screen sends no kind, and the kind of
          // the request being replaced is the right answer: somebody rejected
          // as staff is still applying as staff.
          requestedKind: input.kind ?? (await this.previousKind(
            input.academyId,
            user.id,
          )),
        },
        include: requestInclude,
      });
      return toJoinRequestDetail(created);
    } catch (error) {
      if (hasPrismaCode(error, "P2002")) {
        throw new AppException(
          "JOIN_REQUEST_ALREADY_PENDING",
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async cancel(identity: SupabaseIdentity, requestId: string) {
    const user = await this.requireActiveUser(identity.authUserId);
    const request = await this.prisma.academyJoinRequest.findUnique({
      where: { id: requestId },
      include: requestInclude,
    });
    if (!request || request.userId !== user.id) {
      throw new AppException("JOIN_REQUEST_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    if (request.status !== "PENDING") {
      throw new AppException(
        "JOIN_REQUEST_STATE_CONFLICT",
        HttpStatus.CONFLICT,
      );
    }

    const cancelled = await this.prisma.academyJoinRequest.update({
      where: { id: request.id },
      data: { status: "CANCELLED", reviewedAt: new Date() },
      include: requestInclude,
    });
    return toJoinRequestDetail(cancelled);
  }

  private async requireActiveUser(authUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { authUserId },
      select: { id: true, status: true },
    });
    if (!user) {
      throw new AppException("PROFILE_INCOMPLETE", HttpStatus.FORBIDDEN);
    }
    if (user.status === "SUSPENDED" || user.status === "DELETED") {
      throw new AppException("USER_SUSPENDED", HttpStatus.FORBIDDEN);
    }
    return user;
  }
}

export function toJoinRequestDetail(request: {
  id: string;
  academyId: string;
  message: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  requestedKind: JoinRequestKind;
  approvedRole: "STUDENT" | "TEACHER" | "TEAM_LEAD" | "MANAGER" | null;
  reviewReason: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  user: { id: string; email: string | null; displayName: string | null };
}, avatar: MemberAvatarUrls = noMemberAvatar) {
  return {
    id: request.id,
    academyId: request.academyId,
    // An applicant is not a member yet, so there is no academy-scoped photo to
    // find — only whatever they set on their own account. The three fields
    // still travel, so the same avatar component renders here as everywhere.
    //
    // The address goes through `displayableEmail` for the reason that helper
    // exists: a student signs up without one, Supabase requires one anyway, and
    // the generated `s-<uuid>@no-email.cove.invalid` reached this queue intact
    // — sixty characters of machine noise under the applicant's name, which a
    // manager reads as Cove being broken. Null is the honest answer, and every
    // other people surface already gives it.
    user: {
      ...request.user,
      email: displayableEmail(request.user.email),
      ...avatar,
    },
    message: request.message,
    status: request.status,
    // The reviewer's copy of the signup answer. Recorded since the lobby
    // needed it; it was simply never carried out to the queue that has to act
    // on it, which is how a Staff applicant reached a manager looking like
    // every other row.
    requestedKind: request.requestedKind,
    approvedRole: request.approvedRole,
    reviewReason: request.reviewReason,
    createdAt: request.createdAt.toISOString(),
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
  };
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && error.code === code;
}
