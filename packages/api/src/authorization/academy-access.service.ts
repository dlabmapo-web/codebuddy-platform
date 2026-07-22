import { HttpStatus, Injectable } from "@nestjs/common";
import {
  roleHasPermission,
  type AcademyPermission,
  type AcademyRole,
} from "@cove/shared";

import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";

export type AcademyAccess = {
  userId: string;
  academyId: string;
  role: AcademyRole;
};

@Injectable()
export class AcademyAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async requirePermission(
    authUserId: string,
    academyId: string,
    permission: AcademyPermission,
  ): Promise<AcademyAccess> {
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

    const membership = await this.prisma.academyMembership.findUnique({
      where: { academyId_userId: { academyId, userId: user.id } },
      include: { academy: { select: { status: true } } },
    });
    if (!membership) {
      throw new AppException(
        "ACADEMY_MEMBERSHIP_REQUIRED",
        HttpStatus.FORBIDDEN,
      );
    }
    if (membership.status !== "ACTIVE" || membership.academy.status !== "ACTIVE") {
      throw new AppException(
        "ACADEMY_MEMBERSHIP_SUSPENDED",
        HttpStatus.FORBIDDEN,
      );
    }
    if (!roleHasPermission(membership.role, permission)) {
      throw new AppException("PERMISSION_DENIED", HttpStatus.FORBIDDEN);
    }

    return { userId: user.id, academyId, role: membership.role };
  }
}
