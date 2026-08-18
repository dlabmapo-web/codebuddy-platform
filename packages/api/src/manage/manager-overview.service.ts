import { Injectable, Logger } from "@nestjs/common";
import {
  HIGHLIGHT_MIN_ACTIVE_STUDENTS,
  INVITATION_EXPIRY_WARNING_DAYS,
  MANAGER_MAX_CLASS_ROWS,
  MANAGER_MAX_PREVIEW_ROWS,
  MIN_STUDENTS_FOR_PROBLEM_SIGNAL,
  academyProfileCompletion,
  activeLearnerRate,
  attentionRank,
  buildStudentGrowth,
  classGaps,
  compareDifficultProblems,
  compareIncompleteClasses,
  exerciseCompletion,
  medianOf,
  meanOfScores,
  previousPeriodOf,
  resolveOverviewPeriod,
  selectHighlightClass,
  sharePercent,
  teacherOutlineNumber,
  academyDayStart,
  type AcademyScale,
  type AuditSummary,
  type ClassComparisonRow,
  type DifficultProblem,
  type GetManagerOverviewInput,
  type IncompleteClass,
  type ManagerOverview,
  type ManagerOverviewSection,
  type RecentJoin,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  memberAvatarSelect,
  noMemberAvatar,
  resolveMemberAvatars,
} from "../profile/member-avatars.js";
import { ProfileMediaService } from "../profile/profile-media.service.js";
import { buildStudentFacts, type StudentFact } from "../teach/student-facts.js";
import { aggregateScopeFor } from "../teach/teacher-overview.service.js";
import { TeacherOverviewRepository } from "../teach/teacher-overview.repository.js";
import { TeacherProgressRepository } from "../teach/teacher-progress.repository.js";
import { ManagerOverviewRepository } from "./manager-overview.repository.js";
import { ManagerScopeService } from "./manager-scope.service.js";
import { AcademyMediaService } from "./academy-media.service.js";

/**
 * The manager's academy overview, assembled once per request.
 *
 * §7.1's deep module. The unit coordinates and decides nothing: it establishes
 * one authorized scope, fixes one read timestamp, runs every independent
 * aggregate concurrently against that timestamp, and maps the results into the
 * shared contract. Every rule it applies — the rate, the growth arithmetic, the
 * class gaps, the highlight eligibility, the problem ordering — lives in
 * `@cove/shared`, where it can be tested at its boundaries without a database.
 *
 * One timestamp for the whole response is not a detail. Eight independently
 * clocked aggregates would let the scale ledger, the action queue, and the
 * growth chart describe three different moments while sitting on one screen,
 * and a manager comparing them would be right that they disagree.
 *
 * A failing aggregate marks its own section unavailable and leaves the rest
 * standing — §14. The one thing it must never do is return zero: a control
 * tower that renders an outage as an empty academy is worse than an error,
 * because a manager would believe it and act on it.
 *
 * The learning half of the page is not computed here at all. It comes from the
 * teacher repositories called with a manager scope, which is §7.4's whole
 * point: one measurement, two adapters, and no way for the two roles' numbers
 * to drift apart.
 *
 * See §9 and §14 of the manager control tower and scalable people operations
 * design.
 */
@Injectable()
export class ManagerOverviewService {
  private readonly logger = new Logger(ManagerOverviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ManagerScopeService,
    private readonly repository: ManagerOverviewRepository,
    private readonly learning: TeacherOverviewRepository,
    private readonly progress: TeacherProgressRepository,
    private readonly media: AcademyMediaService,
    private readonly profileMedia: ProfileMediaService,
  ) {}

  async get(
    identity: SupabaseIdentity,
    input: GetManagerOverviewInput,
  ): Promise<ManagerOverview> {
    const actor = await this.scopes.requireManager(
      identity,
      input.academyId,
      "academy.analytics.read",
    );

    const now = new Date();
    const period = resolveOverviewPeriod({
      range: input.range ?? "30d",
      now,
      timeZone: actor.timeZone,
    });
    const unavailable: ManagerOverviewSection[] = [];
    const settle = settler(unavailable, this.logger);

    /* ------------------------------------------------------------ identity */

    // Core, and deliberately not settled: §14 makes academy identity and the
    // operational totals the page's own claim. If they cannot be read there is
    // no narrower page to render, so the failure reaches the caller as an error
    // and the interface offers a retry.
    //
    // The cover and gallery are deliberately *not* in here. They are the one
    // part of the academy plate that is decoration rather than a claim, and
    // they fail for reasons that say nothing about the academy: object storage
    // unreachable, a signing key rotating, a migration not yet applied on this
    // deployment. Folding them into the core read meant any of those rendered
    // the whole control tower as "the academy's own totals are missing" — a
    // sentence that was not true, on a page whose entire value is being
    // trusted.
    const [academy, analytics] = await Promise.all([
      this.prisma.academy.findUniqueOrThrow({
        where: { id: actor.academyId },
        select: {
          id: true,
          name: true,
          slug: true,
          addressLine1: true,
          addressLine2: true,
          locality: true,
          region: true,
          postalCode: true,
          countryCode: true,
          contactPhone: true,
          contactEmail: true,
          timeZone: true,
          profileUpdatedAt: true,
          peopleRevision: true,
        },
      }),
      this.scopes.resolveAnalyticsScope(actor),
    ]);

    // No images is a legitimate answer — most academies have none — so a
    // failure and the empty case land in the same place and the plate renders
    // identically for both.
    const academyMedia = await this.media
      .presentForAcademy(actor.academyId)
      .catch((error: unknown) => {
        this.logger.warn(
          `academy media unavailable: ${
            error instanceof Error ? error.message : "unknown"
          }`,
        );
        return { cover: null, gallery: [] };
      });

    const scope = analytics.scope;
    const [roleTotals, classTotals] = await Promise.all([
      this.repository.roleTotals(actor.academyId),
      this.repository.classTotals(actor.academyId),
    ]);
    const scale = buildScale(roleTotals, classTotals);

    /* -------------------------------------------------------- the evidence */

    const workScope = aggregateScopeFor(scope);
    const previous = previousPeriodOf(period);
    const expiringBefore = new Date(
      now.getTime() + INVITATION_EXPIRY_WARNING_DAYS * 86_400_000,
    );

    const [
      pendingApplications,
      invitations,
      enrollmentCounts,
      joinsByDate,
      previousJoined,
      recentJoinRows,
      auditRows,
      activity,
      activityDays,
      work,
      workByMaterial,
      candidates,
      problemRows,
      trackedSince,
    ] = await Promise.all([
      settle(["attention"], () =>
        this.repository.pendingApplications(actor.academyId), 0),
      settle(
        ["attention"],
        () =>
          this.repository.invitationCounts({
            academyId: actor.academyId,
            expiringBefore,
          }),
        { pending: 0, expiring: 0 },
      ),
      settle(
        ["attention"],
        () =>
          this.repository.enrollmentCounts(
            actor.academyId,
            scope.classes.map((entry) => entry.classId),
          ),
        new Map<string, number>(),
      ),
      settle(
        ["growth"],
        () =>
          this.repository.studentJoinsByDay({
            academyId: actor.academyId,
            timeZone: actor.timeZone,
            startAt: period.startAt ? new Date(period.startAt) : null,
            endAt: new Date(period.endAt),
          }),
        [],
      ),
      settle(
        ["growth"],
        () =>
          previous
            ? this.repository.studentJoinCount({
                academyId: actor.academyId,
                startAt: academyDayStart(previous.startDate, actor.timeZone),
                endAt: academyDayStart(period.startDate!, actor.timeZone),
              })
            : Promise.resolve(null),
        null,
      ),
      settle(
        ["growth"],
        () =>
          this.repository.recentJoins({
            academyId: actor.academyId,
            limit: MANAGER_MAX_PREVIEW_ROWS,
          }),
        [],
      ),
      settle(
        ["activity"],
        () =>
          this.repository.recentChanges({
            academyId: actor.academyId,
            limit: MANAGER_MAX_PREVIEW_ROWS,
          }),
        [],
      ),
      settle(
        ["learning", "attention"],
        () =>
          this.learning.activityByStudentCourse({
            scope: workScope,
            startDate: period.startDate,
            endDate: period.endDate,
          }),
        [],
      ),
      settle(
        ["learning"],
        () =>
          this.learning.activityDaysByStudent({
            scope: workScope,
            startDate: period.startDate,
            endDate: period.endDate,
          }),
        [],
      ),
      settle(
        ["learning", "attention"],
        () =>
          this.learning.workByStudent(workScope, {
            startAt: period.startAt ? new Date(period.startAt) : null,
            endAt: new Date(period.endAt),
          }),
        [],
      ),
      settle(
        ["learning"],
        () =>
          this.learning.workByStudentMaterial(workScope, {
            startAt: period.startAt ? new Date(period.startAt) : null,
            endAt: new Date(period.endAt),
          }),
        [],
      ),
      settle(
        ["attention"],
        () =>
          this.progress.attentionCandidates({
            userIds: scope.userIds,
            materialIds: scope.materialIds,
            overviewScope: workScope,
            now,
          }),
        [],
      ),
      settle(
        ["problems"],
        () =>
          this.learning.problemDifficulty(workScope, {
            startAt: period.startAt ? new Date(period.startAt) : null,
            endAt: new Date(period.endAt),
          }),
        [],
      ),
      settle([], () => this.learning.activityTrackedSince(actor.academyId), null),
    ]);

    /* --------------------------------------------------------------- facts */

    // The same builder the teacher overview uses, on a manager's scope. Every
    // threshold, every reason, and every tie-break is therefore identical, and
    // a student flagged on one page is flagged on the other for the same stated
    // measurement — which is the whole reason §7.4 forbids a second adapter
    // with its own arithmetic.
    const facts = buildStudentFacts({
      scope,
      activity,
      activityDays,
      work,
      candidates,
      period,
      now,
    });
    const factByMembership = new Map(
      facts.map((fact) => [fact.student.membershipId, fact]),
    );

    /* ------------------------------------------------------ class comparison */

    const activityByMembership = groupBy(
      activity,
      (row) => row.membershipId,
    );
    const workByUser = groupBy(workByMaterial, (row) => row.userId);

    const classes: ClassComparisonRow[] = scope.classes
      .slice(0, MANAGER_MAX_CLASS_ROWS)
      .map((entry) => {
      const roster = entry.membershipIds
        .map((membershipId) => factByMembership.get(membershipId))
        .filter((fact): fact is StudentFact => fact !== undefined);
      const materialIds = new Set(entry.materialIds);
      const courseIds = new Set(entry.courseIds);
      const classWork = roster.flatMap((fact) =>
        (workByUser.get(fact.student.userId) ?? []).filter((row) =>
          materialIds.has(row.materialId),
        ),
      );
      const activityByStudent = new Map(
        roster.map((fact) => {
          const rows = (activityByMembership.get(fact.student.membershipId) ?? [])
            .filter((row) => courseIds.has(row.courseId));
          return [
            fact.student.membershipId,
            {
              seconds: rows.reduce((sum, row) => sum + row.activeSeconds, 0),
              lastAt: rows
                .map((row) => row.lastActiveAt)
                .sort((left, right) => right.getTime() - left.getTime())[0] ?? null,
            },
          ] as const;
        }),
      );
      const submissionsByUser = new Set(classWork.map((row) => row.userId));
      const active = roster.filter((fact) =>
        (activityByStudent.get(fact.student.membershipId)?.seconds ?? 0) > 0 ||
        submissionsByUser.has(fact.student.userId),
      );
      const solved = classWork.filter((row) => row.solved).length;
      const lastActivity = [
        ...[...activityByStudent.values()].map((row) => row.lastAt),
        ...classWork.map((row) => row.lastSubmissionAt),
      ]
        .filter((at): at is Date => at !== null)
        .sort((left, right) => right.getTime() - left.getTime())[0];

      return {
        classId: entry.classId,
        className: entry.className,
        teacherName: analytics.teacherNames.get(entry.classId) ?? null,
        enrolledStudents: roster.length,
        activeStudents: active.length,
        activeLearnerRate:
          roster.length > 0 ? sharePercent(active.length, roster.length) : null,
        // The median over the enrolled roster rather than over the students who
        // turned up: "half of this class did more than an hour" and "half of
        // the three who came did" are different claims, and the roster is the
        // one a manager is asking about.
        medianActiveSeconds:
          roster.length > 0
            ? medianOf(
                roster.map(
                  (fact) =>
                    activityByStudent.get(fact.student.membershipId)?.seconds ?? 0,
                ),
              )
            : null,
        exerciseCompletion: exerciseCompletion({
          solvedProblems: solved,
          enrolledStudents: roster.length,
          assignedExercises: entry.materialIds.length,
        }),
        conceptMastery: meanOfScores(classWork.map((row) => row.bestScore)),
        studentsNeedingAttention: roster.filter(
          (fact) => fact.reasons.length > 0,
        ).length,
        lastActivityAt: lastActivity?.toISOString() ?? null,
      };
    });

    const highlight = selectHighlightClass(
      classes,
      HIGHLIGHT_MIN_ACTIVE_STUDENTS,
    );

    /* --------------------------------------------------------- action queue */

    const incompleteClasses: IncompleteClass[] = scope.classes
      .map((entry) => {
        const enrolled = enrollmentCounts.get(entry.classId) ?? 0;
        return {
          classId: entry.classId,
          className: entry.className,
          gaps: classGaps({
            hasActiveTeacher: !analytics.classesWithoutTeacher.has(entry.classId),
            enrolledStudents: enrolled,
            assignedCourses: analytics.classesWithoutCourse.has(entry.classId)
              ? 0
              : entry.courseIds.length,
          }),
          enrolledStudents: enrolled,
        };
      })
      .filter((row): row is IncompleteClass => row.gaps.length > 0)
      .sort(compareIncompleteClasses);

    const flagged = facts
      .filter((fact) => fact.reasons.length > 0)
      .sort(compareAttentionFacts);

    /* -------------------------------------------------------------- growth */

    const growth = buildStudentGrowth({
      joinsByDate: joinsByDate.map((row) => ({
        date: row.date,
        joined: row.joined,
      })),
      period,
      previousJoined,
    });

    /* ------------------------------------------------------------ problems */

    const exerciseById = new Map(
      scope.exercises.map((exercise) => [exercise.materialId, exercise]),
    );
    const problems: DifficultProblem[] = problemRows
      .flatMap((row) => {
        const exercise = exerciseById.get(row.materialId);
        if (!exercise || row.attemptingStudents < MIN_STUDENTS_FOR_PROBLEM_SIGNAL) {
          return [];
        }
        // The class a drill-down should open. A problem taught in several
        // classes gets the first in name order rather than an arbitrary one, so
        // the same link comes back on the next request.
        const classId = scope.classes.find((entry) =>
          entry.materialIds.includes(row.materialId),
        )?.classId;
        if (!classId) return [];
        return [
          {
            materialId: row.materialId,
            title: exercise.title,
            courseTitle: exercise.courseTitle,
            moduleTitle: exercise.moduleTitle,
            lectureTitle: exercise.lectureTitle,
            outlineNumber: teacherOutlineNumber({
              modulePosition: exercise.modulePosition,
              lecturePosition: exercise.lecturePosition,
              problemPosition: exercise.position,
            }),
            attemptingStudents: row.attemptingStudents,
            solvedStudents: row.solvedStudents,
            solveRate:
              sharePercent(row.solvedStudents, row.attemptingStudents) ?? 0,
            submissions: row.submissions,
            classId,
            position: exercise.position,
          },
        ];
      })
      .sort(compareDifficultProblems)
      .slice(0, MANAGER_MAX_PREVIEW_ROWS)
      .map(({ position: _position, ...problem }) => problem);

    /* ------------------------------------------------------ recent changes */

    const recentChanges = await this.resolveAuditLabels(
      actor.academyId,
      auditRows,
    ).catch(() => [] as AuditSummary[]);

    /* -------------------------------------------------------------- avatars */

    // Both previews at once. Ten people between them, so one query and one
    // signing batch — the alternative is two of each for two lists that sit
    // four hundred pixels apart on the same page.
    const previewFlagged = flagged.slice(0, MANAGER_MAX_PREVIEW_ROWS);
    const avatars = await this.avatarsFor([
      ...previewFlagged.map((fact) => fact.student.membershipId),
      ...recentJoinRows.map((row) => row.membershipId),
    ]);

    /* -------------------------------------------------------------- answer */

    const enrolledStudents = scope.students.length;
    const activeStudents = facts.filter(
      (fact) => fact.activeSeconds > 0 || fact.submissions > 0,
    ).length;

    return {
      academy: {
        ...academy,
        ...academyMedia,
        profileUpdatedAt: academy.profileUpdatedAt?.toISOString() ?? null,
      },
      completion: academyProfileCompletion(academy),
      period,
      generatedAt: now.toISOString(),
      // The projection's first day, as an instant. A page whose activity data
      // begins after the selected period must say so rather than presenting an
      // honest absence as a decline. §14.
      activityTrackedSince: trackedSince
        ? academyDayStart(trackedSince, actor.timeZone).toISOString()
        : null,
      scale,
      activeLearnerRate: activeLearnerRate({ activeStudents, enrolledStudents }),
      queue: {
        pendingApplications,
        expiringInvitations: invitations.expiring,
        pendingInvitations: invitations.pending,
        incompleteClasses: {
          total: incompleteClasses.length,
          preview: incompleteClasses.slice(0, MANAGER_MAX_PREVIEW_ROWS),
        },
        studentsNeedingAttention: {
          total: flagged.length,
          preview: previewFlagged.map((fact) => ({
            membershipId: fact.student.membershipId,
            displayName: fact.student.displayName,
            classId: fact.primaryClassId,
            className:
              fact.classes.find((entry) => entry.value === fact.primaryClassId)
                ?.label ??
              fact.classes[0]?.label ??
              null,
            reasons: fact.reasons,
            ...(avatars.get(fact.student.membershipId) ?? noMemberAvatar),
          })),
        },
      },
      growth,
      recentJoins: recentJoinRows.map(
        (row): RecentJoin => ({
          membershipId: row.membershipId,
          displayName: row.displayName,
          role: row.role as RecentJoin["role"],
          joinedAt: row.joinedAt.toISOString(),
          ...(avatars.get(row.membershipId) ?? noMemberAvatar),
        }),
      ),
      classes,
      classesTruncated: analytics.truncated,
      highlightClassId: highlight?.classId ?? null,
      problems,
      recentChanges,
      unavailable,
    };
  }

  /**
   * The avatar sources for a handful of memberships, signed together.
   *
   * A separate read because the two previews it serves are built from raw SQL
   * and from student facts respectively — neither carries the asset columns —
   * and adding two joins to `media_assets` in a hand-written growth query to
   * save one bounded lookup would be the wrong trade.
   */
  private async avatarsFor(membershipIds: string[]) {
    const unique = [...new Set(membershipIds)];
    if (unique.length === 0) return new Map<string, typeof noMemberAvatar>();

    const rows = await this.prisma.academyMembership.findMany({
      where: { id: { in: unique } },
      select: { id: true, ...memberAvatarSelect },
    });
    return resolveMemberAvatars(
      this.profileMedia,
      rows.map((row) => ({ ...row, key: row.id })),
    );
  }

  /**
   * Audit rows with a name where the id was.
   *
   * A second query rather than a join, because the targets span two tables and
   * a target that has since been deleted must leave its entry standing with a
   * null label — an academy's history should not lose the record of a class
   * being archived because the class was then removed.
   */
  private async resolveAuditLabels(
    academyId: string,
    rows: {
      id: string;
      action: string;
      actorName: string | null;
      targetType: string;
      targetId: string | null;
      createdAt: Date;
    }[],
  ): Promise<AuditSummary[]> {
    const idsOfType = (targetType: string) =>
      rows
        .filter((row) => row.targetType === targetType)
        .map((row) => row.targetId)
        .filter((id): id is string => id !== null);

    const labels = await this.repository.auditTargetLabels({
      academyId,
      membershipIds: idsOfType("AcademyMembership"),
      classIds: idsOfType("Class"),
      invitationIds: idsOfType("AcademyInvitation"),
      joinRequestIds: idsOfType("AcademyJoinRequest"),
    });

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      actorName: row.actorName,
      targetLabel: row.targetId ? (labels.get(row.targetId) ?? null) : null,
      targetType: row.targetType,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}

/**
 * §9.2's ledger, from one grouped read.
 *
 * The four role totals count active memberships only and are mutually
 * exclusive, so `activeMembers` is their sum rather than a separate count that
 * could disagree with the bar drawn from them.
 */
function buildScale(
  rows: { role: string; status: string; total: number }[],
  classes: { active: number; archived: number },
): AcademyScale {
  const active = (role: string) =>
    rows.find((row) => row.role === role && row.status === "ACTIVE")?.total ?? 0;

  const students = active("STUDENT");
  const teachers = active("TEACHER");
  const teamLeads = active("TEAM_LEAD");
  const managers = active("MANAGER");

  return {
    students,
    teachers,
    teamLeads,
    managers,
    activeMembers: students + teachers + teamLeads + managers,
    suspendedMembers: rows
      .filter((row) => row.status === "SUSPENDED")
      .reduce((total, row) => total + row.total, 0),
    activeClasses: classes.active,
    archivedClasses: classes.archived,
  };
}

/**
 * §9.8's reading order.
 *
 * Not a severity score, and deliberately not storable as one: it is a function
 * of the reasons currently on the row, it is recomputed every request, and the
 * measurements travel beside it so a manager can disagree.
 */
function compareAttentionFacts(left: StudentFact, right: StudentFact): number {
  return (
    attentionRank(left.reasons.map((reason) => reason.kind)) -
      attentionRank(right.reasons.map((reason) => reason.kind)) ||
    right.reasons.length - left.reasons.length ||
    (left.lastActivityAt?.getTime() ?? 0) -
      (right.lastActivityAt?.getTime() ?? 0) ||
    left.student.displayName.localeCompare(right.student.displayName) ||
    left.student.membershipId.localeCompare(right.student.membershipId)
  );
}

/**
 * One aggregate's failure, narrowed to the sections it feeds.
 *
 * The fallback is always the shape the section renders as "no data", never a
 * plausible zero — §14 makes a fabricated zero the one outcome worse than an
 * error, because a manager cannot tell it from a quiet week.
 */
function settler(unavailable: ManagerOverviewSection[], logger: Logger) {
  return async function settle<T>(
    sections: ManagerOverviewSection[],
    run: () => Promise<T>,
    fallback: T,
  ): Promise<T> {
    try {
      return await run();
    } catch (error) {
      for (const section of sections) {
        if (!unavailable.includes(section)) unavailable.push(section);
      }
      // §15 — the named aggregate and its failure, with no member, id, or
      // measurement that could identify a child.
      logger.warn(
        `manager overview aggregate ${sections.join("+")} failed: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
      return fallback;
    }
  };
}

function groupBy<T, K>(rows: T[], keyOf: (row: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(row);
    else grouped.set(key, [row]);
  }
  return grouped;
}
