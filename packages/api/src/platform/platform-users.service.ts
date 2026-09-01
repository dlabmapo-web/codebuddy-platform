import { HttpStatus, Injectable } from "@nestjs/common";
import type {
  DirectoryComposition,
  ListPlatformUsersResult,
  MembershipParticipation,
  PlatformUserDetail,
  ResolvedListPlatformUsersInput,
  SetPlatformMembershipRoleInput,
  SetPlatformUserRoleInput,
  SetPlatformUserStatusInput,
  UserExportRow,
  WorkbookLocale,
} from "@cove/shared";
import {
  PLATFORM_USERS_EXPORT_MAX_ACCOUNTS,
  buildUserExportSheet,
  toUserExportRows,
  userExportCopy,
  userExportFilename,
} from "@cove/shared";

import { applyMembershipRoleChange } from "../academies/academy-membership.operations.js";
import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PlatformAccessService } from "../authorization/platform-access.service.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { writeWorkbook } from "../common/workbook-writer.js";
import { MonitoringRevocationService } from "../monitoring/monitoring-revocation.service.js";
import { PlatformParticipationRepository } from "./platform-participation.repository.js";
import {
  toUserDetail,
  toUserInvitation,
  toUserSummary,
  userDetailSelect,
  userSummarySelect,
} from "./platform-user.mapper.js";

/**
 * The platform's directory of people, across every academy.
 *
 * A sibling of `PeopleDirectoryService`, never a mode of it. That one lists
 * memberships inside one academy; this lists accounts across all of them, and
 * the difference is the row: somebody who teaches at two campuses is two rows
 * there and one row here. Neither query can produce the other's shape, and a
 * shared service with a flag would have to choose one and lie about the other.
 *
 * What this service will not return is as much of its definition as what it
 * will. No submission, no grade, no point balance, and no field of
 * `StudentAcademyProfile` — guardian names, guardian phone numbers, dates of
 * birth, school names — through `list`, `get`, or any of its mutations.
 * `participation` alone widens that, and only to structure and totals: §3.4 of
 * the console people operations design draws the line, and it is its own
 * permission and its own audited read (§3.5) rather than a field folded onto
 * `get`.
 */
@Injectable()
export class PlatformUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlatformAccessService,
    private readonly audit: AuditService,
    private readonly participationRepo: PlatformParticipationRepository,
    private readonly revocation: MonitoringRevocationService,
  ) {}

  async list(
    identity: SupabaseIdentity,
    input: ResolvedListPlatformUsersInput,
  ): Promise<ListPlatformUsersResult> {
    await this.access.requirePermission(
      identity.authUserId,
      "platform.users.read",
    );

    const where = buildUsersWhere(input);

    const [total, records, academies, composition] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: userSummarySelect,
        // Newest first, then by id. The id is not decoration: `createdAt` is
        // not unique — a bulk import writes a hundred accounts in the same
        // millisecond — and without a tiebreaker page 2 can repeat or skip a
        // row that page 1 already showed.
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      // Every academy, for the facet. Read whatever the filter currently is,
      // so clearing a narrow filter does not require the operator to reload
      // the page to get their options back.
      this.prisma.academy.findMany({
        select: { id: true, name: true, slug: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
      this.computeComposition(input),
    ]);

    return {
      people: records.map(toUserSummary),
      total,
      page: input.page,
      pageSize: input.pageSize,
      academyOptions: academies,
      composition,
    };
  }

  /**
   * Who the operator is currently looking at, as one line of counts.
   *
   * Six `User` counts rather than one grouped read, deliberately: the count is
   * of **accounts**, not memberships, so somebody who teaches at two campuses
   * must count once under Teachers — `prisma.user.count` counts distinct
   * accounts by construction, where a `groupBy` over `AcademyMembership` would
   * double them.
   *
   * Every count drops the caller's own `roles` narrowing and keeps every other
   * facet. Filtering the table to teachers must not collapse the strip to
   * "7 teachers and nothing else": the strip describes the population the
   * facet selects *from*.
   *
   * The academy spread is the one read that is not a `User` count. It asks
   * which academies these accounts are in, so it groups memberships and counts
   * the distinct academies — an academy with no matching member is not part of
   * where these people are.
   */
  private async computeComposition(
    input: ResolvedListPlatformUsersInput,
  ): Promise<DirectoryComposition> {
    const unroled = { ...input, roles: undefined };
    const countWith = (extra: Partial<ResolvedListPlatformUsersInput>) =>
      this.prisma.user.count({ where: buildUsersWhere({ ...unroled, ...extra }) });

    const [total, students, teachers, teamLeads, managers, operators, spread] =
      await Promise.all([
        countWith({}),
        countWith({ roles: ["STUDENT"] }),
        countWith({ roles: ["TEACHER"] }),
        countWith({ roles: ["TEAM_LEAD"] }),
        countWith({ roles: ["MANAGER"] }),
        // The platform axis, not a fifth role (§3.3). An operator who also
        // manages an academy is counted in both, which is why this is never a
        // segment of the band.
        countWith({ platformRoles: ["ADMIN"] }),
        this.prisma.academyMembership.groupBy({
          by: ["academyId"],
          where: { user: buildUsersWhere(unroled) },
        }),
      ]);

    return {
      total,
      students,
      teachers,
      teamLeads,
      managers,
      operators,
      academies: spread.length,
    };
  }

  /**
   * The directory as a spreadsheet.
   *
   * The filter is the directory's own — `buildUsersWhere` over
   * `userSummarySelect` — so a row this can return is a row the table would
   * show. If those two ever diverge, this method is the bug.
   *
   * No new permission. `platform.users.read` already lets the caller page
   * through every one of these rows, and a permission that cannot be withheld
   * independently of another is theatre. What *is* different is that the rows
   * leave the system in bulk, in a file that outlives the session — so the act
   * is audited, and unlike the participation read it is not deduplicated. A
   * refresh is not a second look; a second download is a second extraction.
   *
   * The count and the read share a transaction so a file cannot be written
   * against a set that grew past the cap between the two statements.
   *
   * §2 of the console user directory export design.
   */
  async exportDirectory(
    identity: SupabaseIdentity,
    input: ResolvedListPlatformUsersInput & {
      locale: WorkbookLocale;
      timeZone: string;
    },
  ): Promise<{ filename: string; bytes: Buffer }> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      "platform.users.read",
    );

    const where = buildUsersWhere(input);
    const { accounts, records } = await this.prisma.$transaction(
      async (transaction) => {
        const total = await transaction.user.count({ where });
        if (total > PLATFORM_USERS_EXPORT_MAX_ACCOUNTS) {
          // Refused, never truncated. A file holding the first five thousand
          // of six looks complete, and the reconciliation it was pulled for
          // then comes out quietly wrong.
          throw new AppException(
            "PLATFORM_EXPORT_TOO_LARGE",
            HttpStatus.PAYLOAD_TOO_LARGE,
            String(PLATFORM_USERS_EXPORT_MAX_ACCOUNTS),
          );
        }
        return {
          accounts: total,
          records: await transaction.user.findMany({
            where,
            select: userSummarySelect,
            // The directory's own order, so a file and the page it came from
            // start the same way round.
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          }),
        };
      },
    );

    const rows: UserExportRow[] = records
      .map(toUserSummary)
      .flatMap((person) => toUserExportRows(person));

    const filename = userExportFilename({
      accounts,
      // Named for the role only when the filter picks out exactly one. Two
      // roles have no shorter honest name than "users".
      role: input.roles?.length === 1 ? input.roles[0] : null,
      today: new Date(),
    });

    await this.prisma.$transaction((transaction) =>
      this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: null,
        action: "platform.users.exported",
        targetType: "platform",
        targetId: "users",
        after: {
          accounts,
          rows: rows.length,
          filter: {
            query: input.query ?? null,
            academyIds: input.academyIds ?? [],
            roles: input.roles ?? [],
            accountStatuses: input.accountStatuses ?? [],
            membershipStatuses: input.membershipStatuses ?? [],
            platformRoles: input.platformRoles ?? [],
            unaffiliatedOnly: input.unaffiliatedOnly ?? false,
          },
        },
      }),
    );

    return {
      filename,
      bytes: writeWorkbook({
        sheets: [
          {
            name: userExportCopy[input.locale].sheet,
            rows: buildUserExportSheet(rows, input.locale, input.timeZone),
          },
        ],
      }),
    };
  }

  async get(
    identity: SupabaseIdentity,
    userId: string,
  ): Promise<PlatformUserDetail> {
    await this.access.requirePermission(
      identity.authUserId,
      "platform.users.read",
    );

    return this.readDetail(userId);
  }

  /**
   * One account in full, in two reads.
   *
   * The second exists because an invitation is keyed on an email address, not
   * on a user id — it is written before the account that accepts it, and may
   * name an address this person has since changed. Matching on the current
   * address is the honest answer to "what was sent to them", and an account
   * with no email simply has no invitations to show.
   */
  private async readDetail(userId: string): Promise<PlatformUserDetail> {
    const record = await this.prisma.user.findUnique({
      where: { id: userId },
      select: userDetailSelect,
    });
    if (!record) {
      throw new AppException("PLATFORM_USER_NOT_FOUND", HttpStatus.NOT_FOUND);
    }

    const invitations = record.email
      ? await this.prisma.academyInvitation.findMany({
          where: { email: record.email },
          select: {
            id: true,
            email: true,
            role: true,
            status: true,
            expiresAt: true,
            createdAt: true,
            academy: { select: { id: true, name: true, slug: true } },
            deliveryAttempts: {
              select: {
                state: true,
                failureCode: true,
                updatedAt: true,
              },
              orderBy: { attemptNumber: "desc" },
              take: 1,
            },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : [];

    return toUserDetail(record, invitations.map(toUserInvitation));
  }

  /**
   * Suspend, restore, or delete an account, platform-wide.
   *
   * Global the moment it is written, with nothing to enforce per surface:
   * `AcademyAccessService` and `PlatformAccessService` both refuse `SUSPENDED`
   * and `DELETED` before reading any role, so the next request from this
   * account is refused everywhere at once.
   *
   * `platform.users.suspend` authorizes the mutation; `DELETED` additionally
   * requires `platform.users.delete`, apart for the reason the permission's
   * own comment gives — suspension is routine, this is not. Two refusals guard
   * the two ways this locks somebody out of their own platform: an operator
   * may not act on themselves, and may not strand the last active manager of a
   * running academy. `DELETED` also requires the account's current email or
   * username typed back — §3.7 — checked here, against the current value,
   * never against one that has since changed.
   */
  async setStatus(
    identity: SupabaseIdentity,
    input: SetPlatformUserStatusInput,
  ): Promise<PlatformUserDetail> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      "platform.users.suspend",
    );
    if (input.status === "DELETED") {
      await this.access.requirePermission(
        identity.authUserId,
        "platform.users.delete",
      );
    }

    if (actor.userId === input.userId) {
      throw new AppException("PERMISSION_DENIED", HttpStatus.FORBIDDEN);
    }

    const detail = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.user.findUnique({
        where: { id: input.userId },
        select: { id: true, status: true, email: true, username: true },
      });
      if (!existing) {
        throw new AppException("PLATFORM_USER_NOT_FOUND", HttpStatus.NOT_FOUND);
      }

      if (input.status === "SUSPENDED" || input.status === "DELETED") {
        await assertNotLastActiveManager(transaction, input.userId);
      }

      if (input.status === "DELETED") {
        const typed = (input.confirmHandle ?? "").trim().toLowerCase();
        const matches =
          typed.length > 0 &&
          (typed === existing.email?.toLowerCase() ||
            typed === existing.username?.toLowerCase());
        if (!matches) {
          throw new AppException(
            "CONFIRMATION_MISMATCH",
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      // A no-op still writes an audit record. An operator who suspends an
      // already-suspended account has stated a reason, and that reason is
      // sometimes the one worth reading later.
      const updated = await transaction.user.update({
        where: { id: input.userId },
        data: { status: input.status },
        select: { id: true },
      });

      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        // Platform-scoped: this account may belong to several academies or to
        // none, and attributing the act to one of them would be a guess.
        academyId: null,
        action:
          input.status === "SUSPENDED"
            ? "platform.user.suspended"
            : input.status === "DELETED"
              ? "platform.user.deleted"
              : "platform.user.restored",
        targetType: "user",
        targetId: input.userId,
        before: { status: existing.status },
        after: { status: input.status },
        reason: input.reason,
      });

      return updated.id;
    });

    return this.readDetail(detail);
  }

  /**
   * One membership's participation — structure and totals, never an artefact.
   * §3.4.
   *
   * A student's card is audited (§3.5): opening it writes one `AuditLog` row,
   * deduplicated per (actor, membership) per hour, so the academy sees on its
   * own audit page that Cove looked. A teacher's class list is operational
   * metadata about the academy's configuration rather than a named child's
   * participation, so it carries no audit row.
   */
  async participation(
    identity: SupabaseIdentity,
    input: { userId: string; membershipId: string },
  ): Promise<MembershipParticipation> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      "platform.users.participation.read",
    );

    const membership = await this.prisma.academyMembership.findUnique({
      where: { id: input.membershipId },
      select: {
        id: true,
        userId: true,
        role: true,
        status: true,
        joinedAt: true,
        academyId: true,
        academy: { select: { name: true, slug: true, timeZone: true } },
      },
    });
    if (!membership || membership.userId !== input.userId) {
      throw new AppException("PLATFORM_USER_NOT_FOUND", HttpStatus.NOT_FOUND);
    }

    const base = {
      membershipId: membership.id,
      academyId: membership.academyId,
      academySlug: membership.academy.slug,
      academyName: membership.academy.name,
      role: membership.role,
      status: membership.status,
      joinedAt: membership.joinedAt?.toISOString() ?? null,
    };

    if (membership.role === "STUDENT") {
      const student = await this.buildStudentParticipation(
        membership.userId,
        membership.id,
        membership.academy.timeZone,
      );
      await this.auditParticipationRead(
        actor.userId,
        membership.id,
        membership.academyId,
      );
      return { ...base, student, teacher: null, lead: null, manager: null };
    }
    if (membership.role === "TEACHER") {
      const teacher = await this.buildTeacherParticipation(membership.id);
      return { ...base, student: null, teacher, lead: null, manager: null };
    }
    if (membership.role === "TEAM_LEAD") {
      const lead = await this.buildLeadParticipation(
        membership.academyId,
        membership.userId,
      );
      return { ...base, student: null, teacher: null, lead, manager: null };
    }
    const manager = await this.buildManagerParticipation(membership.academyId);
    return { ...base, student: null, teacher: null, lead: null, manager };
  }

  private async buildStudentParticipation(
    userId: string,
    membershipId: string,
    academyTimeZone: string,
  ) {
    const classes = await this.participationRepo.studentClasses(membershipId);
    const courseIds = [
      ...new Set(classes.flatMap((cls) => cls.courses.map((course) => course.courseId))),
    ];
    const courseTitles = new Map(
      classes.flatMap((cls) => cls.courses).map((course) => [course.courseId, course.title]),
    );

    const [exerciseTotals, learningDays, lastActiveAt, pointsEarned] =
      await Promise.all([
        this.participationRepo.studentExerciseTotals({ userId, courseIds }),
        this.participationRepo.studentLearningDays(membershipId, courseIds),
        this.participationRepo.studentLastActiveAt(membershipId),
        this.participationRepo.studentPoints(membershipId),
      ]);

    const activeSecondsByCourse = new Map(
      learningDays.byCourse.map((row) => [row.courseId, row.activeSeconds]),
    );
    const exerciseByCourse = new Map(
      exerciseTotals.byCourse.map((row) => [row.courseId, row]),
    );

    return {
      classes: classes.map((cls) => ({
        classId: cls.classId,
        name: cls.name,
        status: cls.status,
        enrolledAt: cls.enrolledAt.toISOString(),
        teacherName: cls.teacherName,
        courses: cls.courses,
      })),
      solvedCount: exerciseTotals.overall.solvedCount,
      attemptedCount: exerciseTotals.overall.attemptedCount,
      totalAttempts: exerciseTotals.overall.totalAttempts,
      activeSeconds: learningDays.byCourse.reduce(
        (sum, row) => sum + row.activeSeconds,
        0,
      ),
      activeDays: learningDays.distinctDates.length,
      streakDays: computeStreakDays(academyTimeZone, learningDays.distinctDates),
      pointsEarned,
      lastActiveAt: lastActiveAt?.toISOString() ?? null,
      courses: courseIds.map((courseId) => ({
        courseId,
        title: courseTitles.get(courseId) ?? "",
        solved: exerciseByCourse.get(courseId)?.solved ?? 0,
        total: exerciseByCourse.get(courseId)?.total ?? 0,
        activeSeconds: activeSecondsByCourse.get(courseId) ?? 0,
      })),
    };
  }

  private async buildTeacherParticipation(membershipId: string) {
    const [classes, studentReach] = await Promise.all([
      this.participationRepo.teacherClasses(membershipId),
      this.participationRepo.teacherRosterReach(membershipId),
    ]);
    const courseIds = new Set(
      classes.flatMap((cls) => cls.courses.map((course) => course.courseId)),
    );
    return {
      classes: classes.map((cls) => ({
        classId: cls.classId,
        name: cls.name,
        status: cls.status,
        enrolledAt: cls.enrolledAt.toISOString(),
        teacherName: cls.teacherName,
        courses: cls.courses,
        studentCount: cls.studentCount,
      })),
      studentReach,
      courseCount: courseIds.size,
    };
  }

  private async buildLeadParticipation(academyId: string, userId: string) {
    const courses = await this.participationRepo.leadCourses(academyId, userId);
    return {
      courses: courses.map((course) => ({
        courseId: course.courseId,
        title: course.title,
        isVisible: course.isVisible,
        classCount: course.classCount,
        updatedAt: course.updatedAt.toISOString(),
      })),
    };
  }

  private async buildManagerParticipation(academyId: string) {
    const [scale, counts] = await Promise.all([
      this.participationRepo.managerScale(academyId),
      this.participationRepo.managerCounts(academyId),
    ]);
    return {
      scale,
      classCount: counts.classCount,
      courseCount: counts.courseCount,
    };
  }

  /**
   * §3.5 — opening a student's membership card is an audited act, deduped per
   * (actor, membership) per hour so a page refresh is not a fresh row and a
   * trail of identical entries does not drown the one worth reading.
   */
  private async auditParticipationRead(
    actorUserId: string,
    membershipId: string,
    academyId: string,
  ): Promise<void> {
    const dedupeSince = new Date(Date.now() - 60 * 60 * 1000);
    await this.prisma.$transaction(async (transaction) => {
      const recent = await transaction.auditLog.findFirst({
        where: {
          action: "platform.user.participation.read",
          targetId: membershipId,
          actorUserId,
          createdAt: { gt: dedupeSince },
        },
        select: { id: true },
      });
      if (recent) return;

      await this.audit.write(transaction, {
        actorUserId,
        academyId,
        action: "platform.user.participation.read",
        targetType: "AcademyMembership",
        targetId: membershipId,
      });
    });
  }

  /**
   * A role change reached from the console rather than from inside an
   * academy. `applyMembershipRoleChange` holds the four invariants (§3.8);
   * this method contributes only its own authorization check and the
   * membership lookup that resolves which academy it belongs to.
   */
  async setMembershipRole(
    identity: SupabaseIdentity,
    input: SetPlatformMembershipRoleInput,
  ): Promise<PlatformUserDetail> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      "platform.users.role",
    );

    const membership = await this.prisma.academyMembership.findUnique({
      where: { id: input.membershipId },
      select: { id: true, userId: true, academyId: true },
    });
    if (!membership || membership.userId !== input.userId) {
      throw new AppException("PLATFORM_USER_NOT_FOUND", HttpStatus.NOT_FOUND);
    }

    const { changed } = await this.prisma.$transaction((transaction) =>
      applyMembershipRoleChange(transaction, this.audit, {
        academyId: membership.academyId,
        membershipId: membership.id,
        role: input.role,
        actorUserId: actor.userId,
        reason: input.reason,
      }),
    );
    if (changed) {
      await this.revocation.revokeMembership(membership.id, "ROLE_CHANGED");
    }

    return this.readDetail(input.userId);
  }

  /**
   * Granting or revoking platform operator status.
   *
   * Its own permission and its own confirmation (§3.6) — a radio group beside
   * the academy role would imply an exclusivity that does not hold, since
   * `platformRole` is a different axis (§3.3). The same two refusals as
   * `setStatus`: an operator may not revoke their own access, and may not
   * revoke the platform's last one.
   */
  async setPlatformRole(
    identity: SupabaseIdentity,
    input: SetPlatformUserRoleInput,
  ): Promise<PlatformUserDetail> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      "platform.operators.manage",
    );
    if (actor.userId === input.userId) {
      throw new AppException("PERMISSION_DENIED", HttpStatus.FORBIDDEN);
    }

    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.user.findUnique({
        where: { id: input.userId },
        select: { id: true, platformRole: true },
      });
      if (!existing) {
        throw new AppException("PLATFORM_USER_NOT_FOUND", HttpStatus.NOT_FOUND);
      }

      if (existing.platformRole === "ADMIN" && input.platformRole !== "ADMIN") {
        const others = await transaction.user.count({
          where: { platformRole: "ADMIN", id: { not: input.userId } },
        });
        if (others === 0) {
          throw new AppException("LAST_ADMIN_REQUIRED", HttpStatus.CONFLICT);
        }
      }

      await transaction.user.update({
        where: { id: input.userId },
        data: { platformRole: input.platformRole },
      });

      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: null,
        action:
          input.platformRole === "ADMIN"
            ? "platform.user.operator_granted"
            : "platform.user.operator_revoked",
        targetType: "user",
        targetId: input.userId,
        before: { platformRole: existing.platformRole },
        after: { platformRole: input.platformRole },
        reason: input.reason,
      });
    });

    return this.readDetail(input.userId);
  }
}

/**
 * The account may not be the last person able to run an academy.
 *
 * `LAST_MANAGER_REQUIRED` already means exactly this inside one academy's
 * membership service; suspending or deleting an account is the same rule
 * reached from the other side, and reusing the code keeps one answer for one
 * situation.
 *
 * Only `ACTIVE` academies count. A suspended or archived academy has nobody
 * signing in to be stranded, and refusing there would make an operator unable
 * to act on an account precisely when it is least risky.
 */
async function assertNotLastActiveManager(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const managed = await transaction.academyMembership.findMany({
    where: {
      userId,
      role: "MANAGER",
      status: "ACTIVE",
      academy: { status: "ACTIVE" },
    },
    select: { academyId: true },
  });
  if (managed.length === 0) return;

  for (const membership of managed) {
    const others = await transaction.academyMembership.count({
      where: {
        academyId: membership.academyId,
        role: "MANAGER",
        status: "ACTIVE",
        userId: { not: userId },
      },
    });
    if (others === 0) {
      throw new AppException("LAST_MANAGER_REQUIRED", HttpStatus.CONFLICT);
    }
  }
}

/**
 * Consecutive academy-local days of activity, ending today or yesterday.
 *
 * `distinctDates` is `YYYY-MM-DD` strings from `StudentCourseLearningDay`'s
 * `@db.Date` column, already in the academy's own calendar day. "Today" and
 * "yesterday" are read in the academy's own zone — a student's streak must not
 * flicker depending on which time zone the operator reading it happens to be
 * in — and the walk stops at the first gap.
 */
export function computeStreakDays(
  timeZone: string,
  distinctDates: readonly string[],
): number {
  if (distinctDates.length === 0) return 0;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayKey = formatter.format(new Date());
  const yesterdayKey = formatter.format(new Date(Date.now() - 86_400_000));

  const present = new Set(distinctDates);
  let cursor: string;
  if (present.has(todayKey)) cursor = todayKey;
  else if (present.has(yesterdayKey)) cursor = yesterdayKey;
  else return 0;

  let streak = 0;
  while (present.has(cursor)) {
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The filter, as one `where`.
 *
 * The membership facets — academy, role, membership status — are folded into a
 * single `some`, not three. Three would ask whether the account has *a*
 * teacher membership, and *a* membership in this academy, and *a* suspended
 * membership, which a person with three different memberships satisfies while
 * holding none that is all three. One `some` asks the question an operator
 * actually typed.
 *
 * Exported for its unit test: the difference above is invisible in a passing
 * page and expensive to discover in production.
 */
export function buildUsersWhere(
  input: ResolvedListPlatformUsersInput,
): Prisma.UserWhereInput {
  const clauses: Prisma.UserWhereInput[] = [];

  if (input.accountStatuses?.length) {
    clauses.push({ status: { in: input.accountStatuses } });
  }
  if (input.platformRoles?.length) {
    clauses.push({ platformRole: { in: input.platformRoles } });
  }

  if (input.unaffiliatedOnly) {
    // Wins over every membership facet rather than combining with them: "in
    // no academy" and "in academy X" have no intersection, and answering an
    // impossible pair with an empty list reads as a broken filter.
    clauses.push({ memberships: { none: {} } });
  } else {
    const membership: Prisma.AcademyMembershipWhereInput = {
      ...(input.academyIds?.length
        ? { academyId: { in: input.academyIds } }
        : {}),
      ...(input.roles?.length ? { role: { in: input.roles } } : {}),
      ...(input.membershipStatuses?.length
        ? { status: { in: input.membershipStatuses } }
        : {}),
    };
    if (Object.keys(membership).length > 0) {
      clauses.push({ memberships: { some: membership } });
    }
  }

  const query = input.query?.trim();
  if (query) {
    clauses.push({
      OR: [
        { email: { contains: query, mode: "insensitive" } },
        { username: { contains: query, mode: "insensitive" } },
        { displayName: { contains: query, mode: "insensitive" } },
        // The academy-local numbers. A manager searches for "20241"; the
        // operator taking their support call searches for the same string.
        {
          memberships: {
            some: {
              studentProfile: {
                studentNumber: { contains: query, mode: "insensitive" },
              },
            },
          },
        },
        {
          memberships: {
            some: {
              staffProfile: {
                employeeNumber: { contains: query, mode: "insensitive" },
              },
            },
          },
        },
      ],
    });
  }

  return clauses.length > 0 ? { AND: clauses } : {};
}
