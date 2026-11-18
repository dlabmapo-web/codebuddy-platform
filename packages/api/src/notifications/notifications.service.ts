import { HttpStatus, Injectable } from "@nestjs/common";
import type { NotificationItem, NotificationList } from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { courseReviewer, courseReviewItem, type ReviewNoticeRow } from "./course-review-notifications.js";

/** A bounded, shared bell for application decisions and pending course reviews. */
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

/** Applications are projected from their decisions; course reviews are grouped
 * by copy and joined to the caller's active staff membership. Per-person read
 * receipts never accept content and never fan out writes to every recipient. */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(identity: SupabaseIdentity): Promise<NotificationList> {
    const user = await this.requireUser(identity.authUserId);

    const [decided, reviews] = await Promise.all([this.prisma.$queryRaw<DecidedRequest[]>`
      SELECT r.id,r.status,r.approved_role AS "approvedRole",r.review_reason AS "reviewReason",
        r.reviewed_at AS "reviewedAt",r.acknowledged_at AS "acknowledgedAt",
        jsonb_build_object('name',a.name,'slug',a.slug) AS academy
      FROM academy_join_requests r JOIN academies a ON a.id=r.academy_id
      WHERE r.user_id=${user.id}::uuid AND r.status IN ('APPROVED','REJECTED')
      ORDER BY r.reviewed_at DESC,r.id DESC LIMIT ${maxItems}`,
      this.prisma.$queryRaw<ReviewNoticeRow[]>`
      SELECT c.id,c.title,a.name AS academy_name,a.slug AS academy_slug,
        s.review_version,s.open_conflict_count AS pending_count,s.review_updated_at AS created_at,
        CASE WHEN rd.review_version>=s.review_version THEN rd.acknowledged_at ELSE NULL END AS acknowledged_at
      FROM course_sync_states s JOIN courses c ON c.id=s.course_id
      JOIN academies a ON a.id=c.academy_id
      JOIN academy_memberships m ON m.academy_id=a.id AND m.user_id=${user.id}::uuid
      LEFT JOIN library_sync_notification_reads rd ON rd.course_id=c.id AND rd.user_id=m.user_id
      WHERE ${courseReviewer} AND s.open_conflict_count>0 AND s.review_version>0
      ORDER BY s.review_updated_at DESC,c.id DESC LIMIT ${maxItems}`]);

    const items = [...decided.map((request) => toItem(request)), ...reviews.map(courseReviewItem)]
      .sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0,maxItems);
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
    reviewVersion?: number,
  ): Promise<{ success: true }> {
    const user = await this.requireUser(identity.authUserId);
    if (reviewVersion !== undefined) {
      // Record the version actually displayed, never a newer publication that
      // raced this click. Re-reading the same version preserves its timestamp.
      const count = await this.prisma.$executeRaw`
        INSERT INTO library_sync_notification_reads(course_id,user_id,review_version)
        SELECT s.course_id,m.user_id,${reviewVersion} FROM course_sync_states s
        JOIN courses c ON c.id=s.course_id
        JOIN academy_memberships m ON m.academy_id=c.academy_id AND m.user_id=${user.id}::uuid
        WHERE s.course_id=${requestId}::uuid AND ${courseReviewer} AND s.review_version>=${reviewVersion}
        ON CONFLICT(course_id,user_id) DO UPDATE SET
          review_version=GREATEST(library_sync_notification_reads.review_version,EXCLUDED.review_version),
          acknowledged_at=CASE WHEN EXCLUDED.review_version>library_sync_notification_reads.review_version
            THEN now() ELSE library_sync_notification_reads.acknowledged_at END`;
      if (!count) throw new AppException("JOIN_REQUEST_NOT_FOUND", HttpStatus.NOT_FOUND);
      return { success: true };
    }
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

  async reviewRecipients(courseId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ user_id: string }>>`
      SELECT m.user_id FROM academy_memberships m JOIN users u ON u.id=m.user_id AND u.status='ACTIVE'
      JOIN courses c ON c.academy_id=m.academy_id
      WHERE c.id=${courseId}::uuid AND ${courseReviewer}`;
    return rows.map(row => row.user_id);
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

type DecidedRequest = {
  id: string;
  status: string;
  approvedRole: NotificationItem["role"];
  reviewReason: string | null;
  reviewedAt: Date | null;
  acknowledgedAt: Date | null;
  academy: { name: string; slug: string };
};

function toItem(request: DecidedRequest): NotificationItem {
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
