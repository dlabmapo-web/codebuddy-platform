import { HttpStatus, Injectable } from "@nestjs/common";
import type { NotificationItem, NotificationList } from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";

/**
 * How many decisions the bell will carry at once.
 *
 * A person holds one or two applications, ever. The cap is here so a row count
 * can never become a payload size, not because anybody is expected to reach
 * it.
 */
const maxItems = 20;

const reviewedSelect = {
  id: true,
  status: true,
  approvedRole: true,
  reviewReason: true,
  reviewedAt: true,
  acknowledgedAt: true,
  academy: { select: { name: true, slug: true } },
} as const;

/**
 * The bell.
 *
 * Every item is an `AcademyJoinRequest` row projected, not a notification
 * written beside the review that decided it. That is what makes the bell
 * incapable of disagreeing with the membership the same transaction created,
 * makes a retried review incapable of producing two of it, and makes every
 * application that already existed already correct — no backfill, no dedupe
 * key, nothing to write.
 *
 * The moment a notification arrives that is *not* already a fact on a row —
 * the manager's "people are waiting", which is academy-scoped and addressed to
 * many — that is what earns a table. The contract these methods implement is
 * shaped so it can arrive without the bell being rewritten.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(identity: SupabaseIdentity): Promise<NotificationList> {
    const user = await this.requireUser(identity.authUserId);

    const decided = await this.prisma.academyJoinRequest.findMany({
      where: { userId: user.id, status: { in: ["APPROVED", "REJECTED"] } },
      select: reviewedSelect,
      orderBy: [{ reviewedAt: "desc" }, { id: "desc" }],
      take: maxItems,
    });

    const items = decided.map((request) => toItem(request));
    return {
      items,
      unreadCount: items.filter((item) => item.acknowledgedAt === null).length,
    };
  }

  /**
   * Dismisses one decision, and only one the caller owns.
   *
   * Idempotent: acknowledging twice keeps the first timestamp rather than
   * moving it, so a double click does not rewrite when somebody read their own
   * news. `updateMany` scoped by user id is what makes another person's row
   * unreachable — a `where: { id }` guarded by a separate ownership read has a
   * gap between the two.
   */
  async acknowledge(
    identity: SupabaseIdentity,
    requestId: string,
  ): Promise<{ success: true }> {
    const user = await this.requireUser(identity.authUserId);
    const { count } = await this.prisma.academyJoinRequest.updateMany({
      where: {
        id: requestId,
        userId: user.id,
        status: { in: ["APPROVED", "REJECTED"] },
        acknowledgedAt: null,
      },
      data: { acknowledgedAt: new Date() },
    });
    if (count === 0) {
      // Either already acknowledged, or not theirs. The two are deliberately
      // indistinguishable, and an already-acknowledged item is not an error.
      const exists = await this.prisma.academyJoinRequest.count({
        where: { id: requestId, userId: user.id },
      });
      if (exists === 0) {
        throw new AppException("JOIN_REQUEST_NOT_FOUND", HttpStatus.NOT_FOUND);
      }
    }
    return { success: true };
  }

  /**
   * The item a decision produces, for the broadcaster to put on the wire.
   *
   * Built from the same projection `list` uses, so what arrives over the
   * socket and what a refetch returns cannot describe the same decision
   * differently.
   */
  async itemFor(requestId: string): Promise<NotificationItem | null> {
    const request = await this.prisma.academyJoinRequest.findUnique({
      where: { id: requestId },
      select: reviewedSelect,
    });
    if (!request) return null;
    if (request.status !== "APPROVED" && request.status !== "REJECTED") {
      return null;
    }
    return toItem(request);
  }

  private async requireUser(authUserId: string) {
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

function toItem(request: {
  id: string;
  status: string;
  approvedRole: NotificationItem["role"];
  reviewReason: string | null;
  reviewedAt: Date | null;
  acknowledgedAt: Date | null;
  academy: { name: string; slug: string };
}): NotificationItem {
  return {
    id: request.id,
    kind: request.status === "APPROVED"
      ? "APPLICATION_APPROVED"
      : "APPLICATION_REJECTED",
    academy: { name: request.academy.name, slug: request.academy.slug },
    // Null on a rejection, which grants no role.
    role: request.status === "APPROVED" ? request.approvedRole : null,
    reason: request.reviewReason,
    // When the decision was made, not when the application was: the bell is
    // about news, and its age is the age of the news.
    createdAt: (request.reviewedAt ?? new Date()).toISOString(),
    acknowledgedAt: request.acknowledgedAt?.toISOString() ?? null,
  };
}
