import type { NotificationItem } from "@cove/shared";
import { Prisma } from "../generated/prisma/client.js";
/** Additional roles grant the same review access as a primary role. */
export const courseReviewer = Prisma.sql `m.status='ACTIVE' AND EXISTS (
  SELECT 1 FROM academies active_academy WHERE active_academy.id=m.academy_id AND active_academy.status='ACTIVE'
) AND (
  m.role IN ('MANAGER','TEAM_LEAD') OR EXISTS (
    SELECT 1 FROM academy_membership_roles mr WHERE mr.membership_id=m.id
      AND mr.role IN ('MANAGER','TEAM_LEAD')))`;
export type ReviewNoticeRow = {
    id: string;
    title: string;
    academy_name: string;
    academy_slug: string;
    review_version: number;
    pending_count: number;
    created_at: Date;
    acknowledged_at: Date | null;
};
export function courseReviewItem(row: ReviewNoticeRow): NotificationItem {
    return {
        id: row.id, kind: "COURSE_CONTENT_REVIEW",
        academy: { name: row.academy_name, slug: row.academy_slug },
        role: null, reason: null,
        createdAt: row.created_at.toISOString(),
        acknowledgedAt: row.acknowledged_at?.toISOString() ?? null,
        course: { id: row.id, title: row.title, reviewVersion: row.review_version, pendingCount: row.pending_count },
    };
}
