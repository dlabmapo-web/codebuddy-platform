import { displayableEmail } from "@cove/shared";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";

/**
 * The operational reads the control tower makes, and only those.
 *
 * Everything the page says about *learning* comes from
 * `TeacherOverviewRepository` and `TeacherProgressRepository`, called with a
 * manager scope. §7.4 — the measurement is one implementation with two
 * adapters, and a second copy of "counted attempt" or "active learning time"
 * living here is exactly how the manager's numbers and the teacher's would come
 * to disagree about the same class.
 *
 * What is left is what only an academy-wide operator asks: how many people of
 * each role, how many classes, what is waiting to be decided, who joined, and
 * what changed. Each one aggregates in PostgreSQL and returns a bounded shape;
 * §15 gives the whole page 1.5 seconds at 2,000 members and 100 classes, and
 * counting memberships in Node would spend it on the cheapest figure there.
 *
 * Nothing here selects a token, a password hash, an auth id, or an audit
 * `before`/`after` payload. §9.9 — raw audit values stay in the protected
 * detail interface and there is no column in any result that could carry one.
 */

export type RoleTotalRow = { role: string; status: string; total: number };
export type GrowthRow = { date: string; joined: number };
export type RecentJoinRow = {
  membershipId: string;
  displayName: string;
  role: string;
  joinedAt: Date;
};
export type AuditSummaryRow = {
  id: string;
  action: string;
  actorName: string | null;
  targetType: string;
  targetId: string | null;
  createdAt: Date;
};

/**
 * The audit actions a manager overview will summarise.
 *
 * An allow-list rather than a filter on what to hide. Audit actions are added
 * by every feature, and a deny-list would silently publish the next one — which
 * might be a password reset or an identity link. §9.9 restricts the panel to
 * membership and class changes, so those are named here and nothing else can
 * reach the page by being written later.
 */
const SUMMARISABLE_AUDIT_TARGETS = [
  "AcademyMembership",
  "AcademyInvitation",
  "AcademyJoinRequest",
  "Class",
  // Bulk and import summaries are membership changes too — the largest ones an
  // academy sees. Filtering them out meant "suspended 40 members" was the one
  // change this panel could not report, which is the opposite of useful.
  "PeopleBulkOperation",
  "PeopleImportSession",
];

@Injectable()
export class ManagerOverviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  /* --------------------------------------------------------- scale ledger */

  /**
   * The academy by role and membership state, in one grouped query.
   *
   * Grouped rather than eight counts because §9.2's claim is that the role
   * totals are mutually exclusive and sum to the population — which is only
   * checkable when they come from one pass over one predicate.
   *
   * A deleted account is excluded. Its membership row survives so history
   * stays readable, but a manager counting "how many teachers do we have" is
   * not asking about accounts that no longer exist.
   */
  async roleTotals(academyId: string): Promise<RoleTotalRow[]> {
    return this.prisma.$queryRaw<RoleTotalRow[]>`
      SELECT m.role::text AS "role",
             m.status::text AS "status",
             COUNT(*)::int AS "total"
      FROM academy_memberships m
      JOIN users u ON u.id = m.user_id
      WHERE m.academy_id = ${academyId}::uuid
        AND m.status IN ('ACTIVE', 'SUSPENDED')
        AND u.status <> 'DELETED'
      GROUP BY m.role, m.status
    `;
  }

  async classTotals(
    academyId: string,
  ): Promise<{ active: number; archived: number }> {
    const [row] = await this.prisma.$queryRaw<
      { active: number; archived: number }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS "active",
        COUNT(*) FILTER (WHERE status <> 'ACTIVE')::int AS "archived"
      FROM classes
      WHERE academy_id = ${academyId}::uuid
    `;
    return row ?? { active: 0, archived: 0 };
  }

  /* --------------------------------------------------------- action queue */

  async pendingApplications(academyId: string): Promise<number> {
    return this.prisma.academyJoinRequest.count({
      where: { academyId, status: "PENDING" },
    });
  }

  /**
   * Pending invitations, and how many of them are near expiry.
   *
   * One query rather than two: both appear on the same row of the action
   * queue, and two round trips could report a subset larger than the set it
   * came from if somebody accepted an invitation in between.
   */
  async invitationCounts(input: {
    academyId: string;
    expiringBefore: Date;
  }): Promise<{ pending: number; expiring: number }> {
    const [row] = await this.prisma.$queryRaw<
      { pending: number; expiring: number }[]
    >`
      SELECT
        COUNT(*)::int AS "pending",
        COUNT(*) FILTER (WHERE expires_at <= ${input.expiringBefore})::int
          AS "expiring"
      FROM academy_invitations
      WHERE academy_id = ${input.academyId}::uuid
        AND status = 'PENDING'
    `;
    return row ?? { pending: 0, expiring: 0 };
  }

  /** Enrolled active students per class, for §9.3's "no students" gap. */
  async enrollmentCounts(
    academyId: string,
    classIds: string[],
  ): Promise<Map<string, number>> {
    if (classIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<
      { classId: string; total: number }[]
    >`
      SELECT e.class_id AS "classId", COUNT(*)::int AS "total"
      FROM class_enrollments e
      JOIN academy_memberships m ON m.id = e.membership_id
      WHERE e.class_id = ANY(${classIds}::uuid[])
        AND m.academy_id = ${academyId}::uuid
        AND m.role = 'STUDENT'
        AND m.status = 'ACTIVE'
      GROUP BY e.class_id
    `;
    return new Map(rows.map((row) => [row.classId, row.total]));
  }

  /* -------------------------------------------------------------- growth */

  /**
   * New active student memberships per academy-local day.
   *
   * The zone is applied in SQL rather than by bucketing UTC rows afterwards: a
   * 21:30 Seoul enrolment belongs to that evening, and a boundary drawn at UTC
   * midnight would move every evening enrolment into the day before —
   * silently, and only for evening enrolments.
   *
   * `joined_at` rather than `created_at`, so a restored membership is not
   * counted as a new join. §9.4.
   */
  async studentJoinsByDay(input: {
    academyId: string;
    timeZone: string;
    startAt: Date | null;
    endAt: Date;
  }): Promise<GrowthRow[]> {
    const from = input.startAt
      ? Prisma.sql`AND m.joined_at >= ${input.startAt}`
      : Prisma.empty;
    return this.prisma.$queryRaw<GrowthRow[]>`
      SELECT
        to_char(
          (m.joined_at AT TIME ZONE ${input.timeZone}::text)::date, 'YYYY-MM-DD'
        ) AS "date",
        COUNT(*)::int AS "joined"
      FROM academy_memberships m
      WHERE m.academy_id = ${input.academyId}::uuid
        AND m.role = 'STUDENT'
        AND m.status = 'ACTIVE'
        AND m.joined_at IS NOT NULL
        AND m.joined_at < ${input.endAt}
        ${from}
      GROUP BY 1
      ORDER BY 1
    `;
  }

  /** The same count over the previous equal-length period, for §9.4. */
  async studentJoinCount(input: {
    academyId: string;
    startAt: Date;
    endAt: Date;
  }): Promise<number> {
    return this.prisma.academyMembership.count({
      where: {
        academyId: input.academyId,
        role: "STUDENT",
        status: "ACTIVE",
        joinedAt: { gte: input.startAt, lt: input.endAt },
      },
    });
  }

  /**
   * The most recent arrivals, whatever their role.
   *
   * Not restricted to students, unlike the growth chart above. The chart
   * answers "is the academy growing"; this answers "who is new here", and a
   * newly hired teacher is the answer a manager most wants to recognise.
   */
  async recentJoins(input: {
    academyId: string;
    limit: number;
  }): Promise<RecentJoinRow[]> {
    return this.prisma.$queryRaw<RecentJoinRow[]>`
      SELECT m.id AS "membershipId",
             COALESCE(
               NULLIF(TRIM(p.academy_display_name), ''),
               NULLIF(TRIM(u.display_name), ''),
               NULLIF(TRIM(u.username), ''),
               u.email,
               '—'
             ) AS "displayName",
             m.role::text AS "role",
             m.joined_at AS "joinedAt"
      FROM academy_memberships m
      JOIN users u ON u.id = m.user_id
      LEFT JOIN academy_member_profiles p ON p.membership_id = m.id
      WHERE m.academy_id = ${input.academyId}::uuid
        AND m.status = 'ACTIVE'
        AND m.joined_at IS NOT NULL
        AND u.status <> 'DELETED'
      ORDER BY m.joined_at DESC, m.id ASC
      LIMIT ${input.limit}
    `;
  }

  /* ------------------------------------------------------- recent changes */

  /**
   * The last few membership and class changes, as summaries.
   *
   * `before` and `after` are not selected, and the target allow-list is applied
   * in the query rather than after it — §9.9. A panel that fetched the payloads
   * and then dropped them would still have put a member's previous phone number
   * into a response body, and this dashboard sits open on a staffroom screen.
   */
  async recentChanges(input: {
    academyId: string;
    limit: number;
  }): Promise<AuditSummaryRow[]> {
    return this.prisma.$queryRaw<AuditSummaryRow[]>`
      SELECT a.id,
             a.action,
             NULLIF(TRIM(COALESCE(u.display_name, u.username, '')), '')
               AS "actorName",
             a.target_type AS "targetType",
             a.target_id AS "targetId",
             a.created_at AS "createdAt"
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE a.academy_id = ${input.academyId}::uuid
        AND a.target_type = ANY(${SUMMARISABLE_AUDIT_TARGETS}::text[])
      ORDER BY a.created_at DESC, a.id ASC
      LIMIT ${input.limit}
    `;
  }

  /**
   * A readable label for each audited target, resolved in one pass.
   *
   * Names rather than ids, because "Suspended 3f2a…" is not a sentence anybody
   * can act on. Resolved separately from the audit read so a target that has
   * since been deleted leaves the entry standing with a null label instead of
   * dropping the change from the history.
   */
  async auditTargetLabels(input: {
    academyId: string;
    membershipIds: string[];
    classIds: string[];
    invitationIds: string[];
    joinRequestIds: string[];
  }): Promise<Map<string, string>> {
    const labels = new Map<string, string>();

    const [memberships, classes, invitations, joinRequests] = await Promise.all([
      input.membershipIds.length > 0
        ? this.prisma.academyMembership.findMany({
            where: { academyId: input.academyId, id: { in: input.membershipIds } },
            select: {
              id: true,
              user: {
                select: { displayName: true, username: true, email: true },
              },
              memberProfile: { select: { academyDisplayName: true } },
            },
          })
        : Promise.resolve([]),
      input.classIds.length > 0
        ? this.prisma.class.findMany({
            where: { academyId: input.academyId, id: { in: input.classIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      // An invitation's only human label is the address it was sent to. It is
      // already on the invitations page for this same manager, so naming it
      // here publishes nothing new — and without it, "Revoked an invitation"
      // names no invitation.
      input.invitationIds.length > 0
        ? this.prisma.academyInvitation.findMany({
            where: { academyId: input.academyId, id: { in: input.invitationIds } },
            select: { id: true, email: true },
          })
        : Promise.resolve([]),
      input.joinRequestIds.length > 0
        ? this.prisma.academyJoinRequest.findMany({
            where: { academyId: input.academyId, id: { in: input.joinRequestIds } },
            select: {
              id: true,
              user: {
                select: { displayName: true, username: true, email: true },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    for (const membership of memberships) {
      labels.set(
        membership.id,
        membership.memberProfile?.academyDisplayName?.trim() ||
          membership.user.displayName?.trim() ||
          membership.user.username?.trim() ||
          displayableEmail(membership.user.email) ||
          "—",
      );
    }
    for (const record of classes) labels.set(record.id, record.name);
    for (const invitation of invitations) {
      labels.set(invitation.id, invitation.email);
    }
    for (const request of joinRequests) {
      labels.set(
        request.id,
        request.user.displayName?.trim() ||
          request.user.username?.trim() ||
          displayableEmail(request.user.email) ||
          "—",
      );
    }
    return labels;
  }
}
