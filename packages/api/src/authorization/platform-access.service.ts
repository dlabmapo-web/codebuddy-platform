import { HttpStatus, Injectable } from "@nestjs/common";
import {
  platformRoleHasPermission,
  type PlatformPermission,
} from "@cove/shared";

import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";

export type PlatformAccess = { userId: string };

/**
 * The authority a Cove operator holds over the platform itself.
 *
 * Deliberately the sibling of `AcademyAccessService` rather than a branch
 * inside it: this service reads no membership, because a platform admin's
 * authority does not come from one. That is the whole distinction the
 * authorization design draws in §5.2, and folding the two together would make
 * it possible to acquire academy data access by holding a platform role.
 *
 * The account-status checks below mirror `AcademyAccessService` exactly, and
 * must keep mirroring it. A suspended account is suspended everywhere; the two
 * services disagreeing about that would be a hole shaped like a platform admin
 * who was suspended and could still act.
 */
@Injectable()
export class PlatformAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async requirePermission(
    authUserId: string,
    permission: PlatformPermission,
  ): Promise<PlatformAccess> {
    const user = await this.prisma.user.findUnique({
      where: { authUserId },
      select: { id: true, status: true, platformRole: true },
    });
    if (!user) {
      throw new AppException("PROFILE_INCOMPLETE", HttpStatus.FORBIDDEN);
    }
    if (user.status === "PENDING_PROFILE") {
      throw new AppException("PROFILE_INCOMPLETE", HttpStatus.FORBIDDEN);
    }
    if (user.status === "SUSPENDED" || user.status === "DELETED") {
      throw new AppException("USER_SUSPENDED", HttpStatus.FORBIDDEN);
    }
    if (!platformRoleHasPermission(user.platformRole, permission)) {
      // Not `PERMISSION_DENIED`. The web layer answers this one with a 404 so
      // a non-admin never learns the surface exists, and one shared code would
      // make an ordinary member's denial indistinguishable from a probe at the
      // platform surface in the logs.
      throw new AppException("PLATFORM_ACCESS_DENIED", HttpStatus.FORBIDDEN);
    }

    return { userId: user.id };
  }
}
