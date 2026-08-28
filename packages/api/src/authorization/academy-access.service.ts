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
    if (user.status === "PENDING_PROFILE") {
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

  /**
   * Whether this account is a student of any academy.
   *
   * The thirty-minute inactivity lease is a *student* policy, but the lease
   * itself is keyed on the Supabase session rather than on a membership — one
   * session, one lease, whatever academies the person belongs to. So the
   * question the guard has to ask is the session-shaped one: is this person a
   * student anywhere. Asking per academy would be a different question, and
   * the lease has no way to answer it.
   *
   * Staff answer `false` and are not held to the policy. That is not leniency:
   * §5.2 keeps staff session policy separate, and until now a manager was
   * being given a student's lease at sign-in with nothing to renew it — which
   * expired thirty minutes later and locked them out of curriculum they are
   * entitled to read.
   *
   * A `count` against the composite index, not a membership load: the answer
   * is one bit and this runs on every request to the learning surfaces.
   */
  async isStudentAnywhere(authUserId: string): Promise<boolean> {
    const count = await this.prisma.academyMembership.count({
      where: {
        role: "STUDENT",
        status: "ACTIVE",
        user: { authUserId },
        academy: { status: "ACTIVE" },
      },
    });
    return count > 0;
  }
}
