import { Injectable } from "@nestjs/common";
import {
  grantHasPermission,
  type AcademyPermission,
  type SupportAssumedRole,
} from "@cove/shared";

import { PrismaService } from "../database/prisma.service.js";

export type LiveSupportGrant = {
  id: string;
  academyId: string;
  assumedRole: SupportAssumedRole;
  readOnly: boolean;
  allowMonitoring: boolean;
  reason: string;
  expiresAt: Date;
};

/**
 * Whether this account currently holds support authority inside this academy.
 *
 * Separated from `AcademyAccessService` rather than written inside it, for the
 * reason the two access services are separate in the first place: the day a
 * second kind of delegation exists, it becomes a branch here instead of a
 * second membership-shaped path through the service every academy read goes
 * through.
 *
 * "Live" is a time comparison, not a status column. A grant has no `state`
 * field precisely so that expiry cannot be a row somebody forgot to update —
 * the clock decides, on every request, and a grant that ends while an operator
 * is mid-page takes effect on their next call.
 */
@Injectable()
export class SupportGrantResolver {
  constructor(private readonly prisma: PrismaService) {}

  async findLive(
    userId: string,
    academyId: string,
    now: Date = new Date(),
  ): Promise<LiveSupportGrant | null> {
    const grant = await this.prisma.platformSupportGrant.findFirst({
      where: {
        academyId,
        adminUserId: userId,
        revokedAt: null,
        startsAt: { lte: now },
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        academyId: true,
        assumedRole: true,
        readOnly: true,
        allowMonitoring: true,
        reason: true,
        expiresAt: true,
      },
      // Newest wins if two somehow overlap. The service refuses to open a
      // second live grant, so this is a tiebreak that should never be needed —
      // and picking arbitrarily would make which authority applied unknowable.
      orderBy: { createdAt: "desc" },
    });
    if (!grant) return null;
    return { ...grant, assumedRole: grant.assumedRole as SupportAssumedRole };
  }

  /**
   * The grant that authorizes this exact permission, or null.
   *
   * The permission test is `grantHasPermission` from `@cove/shared` — the same
   * pure function the console's tests exhaust — so the rule about what support
   * access may never do lives in one place and is checked without a database.
   */
  async authorize(
    userId: string,
    academyId: string,
    permission: AcademyPermission,
    now: Date = new Date(),
  ): Promise<LiveSupportGrant | null> {
    const grant = await this.findLive(userId, academyId, now);
    if (!grant) return null;
    return grantHasPermission(grant, permission) ? grant : null;
  }
}
