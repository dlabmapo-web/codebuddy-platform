import { HttpStatus, Injectable } from "@nestjs/common";
import type {
  CreateAcademyJoinRequest,
} from "@cove/shared";

import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";

const requestInclude = {
  user: {
    select: { id: true, email: true, displayName: true },
  },
} as const;

@Injectable()
export class AcademyOnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureSignupRequest(
    userId: string,
    requestedAcademyId: string | null,
    emailVerified: boolean,
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
        data: { academyId: requestedAcademyId, userId },
      });
    } catch (error) {
      if (!hasPrismaCode(error, "P2002")) throw error;
    }
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
  approvedRole: "STUDENT" | "TEACHER" | "TEAM_LEAD" | "MANAGER" | null;
  reviewReason: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  user: { id: string; email: string | null; displayName: string | null };
}) {
  return {
    id: request.id,
    academyId: request.academyId,
    user: request.user,
    message: request.message,
    status: request.status,
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
