import { Injectable, Logger } from "@nestjs/common";
import {
  MIN_ATTEMPTED_TO_INTERPRET,
  MIN_STUDENTS_FOR_COMPARISON,
  STUDENT_MAX_CONTINUE_ROWS,
  STUDENT_MAX_PRACTICE_ROWS,
  STUDENT_MAX_PREVIEW_ROWS,
  periodAcceptedRate,
  activityBucketFor,
  addLocalDays,
  attentionReasonsFor,
  averageBestScore,
  compareContinueTargets,
  compareCourseProgress,
  comparePracticeExercises,
  localDaysBetween,
  projectStanding,
  resolveOverviewPeriod,
  type ActivityBucket,
  type ClassStanding,
  type ContinueTarget,
  type GetStudentOverviewInput,
  type LocalDate,
  type PracticeExercise,
  type StandingCandidate,
  type StudentAcademyOverview,
  type StudentActivityPoint,
  type StudentCourseProgress,
  type StudentLedger,
  type StudentMessage,
  type StudentOverviewSection,
  type StudentRecord,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PrismaService } from "../database/prisma.service.js";
import { TeacherProgressRepository } from "../teach/teacher-progress.repository.js";
import {
  CurriculumOutlineService,
  nonemptyModules,
  type ProgressByMaterial,
} from "./curriculum-outline.service.js";
import {
  StudentOverviewAccessService,
  type StudentExercise,
  type StudentOverviewScopeInternal,
} from "./student-overview-access.service.js";
import {
  isoDate,
  StudentOverviewRepository,
} from "./student-overview.repository.js";

/**
 * The student's academy overview, assembled once per request.
 *
 * The unit coordinates: it establishes one authorized scope, fixes one read
 * timestamp, runs every independent aggregate concurrently against that
 * timestamp, and maps the results into the shared contract. It decides no rule
 * of its own — the score definition, the resume order, the standing
 * arithmetic, and the attention rules all live in `@cove/shared`, where they
 * can be tested at their boundaries without a database.
 *
 * One timestamp for the whole response is not a detail. Eight independently
 * clocked aggregates would let the ledger, the chart beside it, and the
 * standing below it describe three different moments, and a student comparing
 * them would be right that they disagree.
 *
 * A failing aggregate marks its own section unavailable and leaves the rest
 * standing. §12 — a page that renders an outage as an empty week is worse than
 * an error, because a child would believe it.
 *
 * See §8, §9, and §10 of the student academy overview design.
 */
@Injectable()
export class StudentOverviewService {
  private readonly logger = new Logger(StudentOverviewService.name);

  constructor(
    private readonly access: StudentOverviewAccessService,
    private readonly repository: StudentOverviewRepository,
    private readonly prisma: PrismaService,
    /**
     * Reused rather than reimplemented. The exercises this page suggests a
     * student revisit and the ones their teacher is told to check have to be
     * decided by the same rule, and one query is how that stays true.
     */
    private readonly progress: TeacherProgressRepository,
    private readonly curriculum: CurriculumOutlineService,
  ) {}

  async get(
    identity: SupabaseIdentity,
    input: GetStudentOverviewInput,
  ): Promise<StudentAcademyOverview> {
    const scope = await this.access.requireScope(identity, input);
    const now = new Date();
    const period = resolveOverviewPeriod({
      range: input.range ?? "30d",
      now,
      timeZone: scope.timeZone,
    });
    const unavailable: StudentOverviewSection[] = [];
    const settle = settler(unavailable, this.logger);

    const window = {
      startDate: period.startDate,
      endDate: period.endDate,
    };
    const periodBounds = { startAt: period.startAt, endAt: period.endAt };

    const [
      statuses,
      work,
      activityDays,
      submissionDays,
      trackedSince,
      messages,
      unreadMessages,
      records,
      attention,
      standing,
    ] = await Promise.all([
      settle(
        ["continue", "courses", "practice"],
        () => this.curriculum.statusByMaterial(scope.userId, scope.materialIds),
        new Map() as ProgressByMaterial,
      ),
      settle(
        ["ledger"],
        () =>
          this.repository.work({
            userId: scope.userId,
            materialIds: scope.materialIds,
            period: periodBounds,
          }),
        {
          submissions: 0,
          passed: 0,
          attemptedProblems: 0,
          solvedProblems: 0,
          scoreSum: 0,
        },
      ),
      settle(
        ["ledger", "activity"],
        () =>
          this.repository.activityByDay({
            membershipId: scope.membershipId,
            courseIds: scope.courseIds,
            window,
          }),
        [],
      ),
      settle(
        ["activity"],
        () =>
          this.repository.submissionsByDay({
            userId: scope.userId,
            materialIds: scope.materialIds,
            period: periodBounds,
            timeZone: scope.timeZone,
          }),
        [],
      ),
      settle(
        ["activity", "ledger"],
        () => this.repository.activityTrackedSince(scope.membershipId),
        null,
      ),
      settle(
        ["messages"],
        () =>
          this.repository.messages({
            membershipId: scope.membershipId,
            academyId: scope.academyId,
            limit: STUDENT_MAX_PREVIEW_ROWS,
          }),
        [],
      ),
      settle(
        ["messages"],
        () =>
          this.repository.unreadMessageCount({
            membershipId: scope.membershipId,
            academyId: scope.academyId,
          }),
        0,
      ),
      settle(
        ["records"],
        () =>
          this.repository.recentRecords({
            userId: scope.userId,
            materialIds: scope.materialIds,
            limit: STUDENT_MAX_PREVIEW_ROWS,
          }),
        [],
      ),
      settle(
        ["practice"],
        () =>
          this.progress.attentionCandidates({
            userIds: [scope.userId],
            materialIds: scope.materialIds,
            now,
          }),
        [],
      ),
      settle(
        ["standing"],
        () => this.resolveStanding(scope, periodBounds, window),
        null,
      ),
    ]);

    const drafts = await settle(
      ["continue"],
      () =>
        this.prisma.exerciseDraft.findMany({
          where: {
            userId: scope.userId,
            materialId: { in: scope.materialIds },
          },
          orderBy: { updatedAt: "desc" },
          take: STUDENT_MAX_CONTINUE_ROWS,
          select: { materialId: true, code: true, updatedAt: true },
        }),
      [],
    );

    const activitySeconds = activityDays.reduce(
      (total, day) => total + day.activeSeconds,
      0,
    );
    const activityIntervals = activityDays.reduce(
      (total, day) => total + day.intervals,
      0,
    );

    const ledger: StudentLedger = {
      solved: {
        problems: work.solvedProblems,
        attempted: work.attemptedProblems,
      },
      score: {
        value: averageBestScore({
          scoreSum: work.scoreSum,
          attemptedProblems: work.attemptedProblems,
        }),
        attemptedProblems: work.attemptedProblems,
      },
      activeLearning: {
        totalSeconds: activitySeconds,
        intervals: activityIntervals,
      },
      activeDays: {
        days: activityDays.filter((day) => day.activeSeconds > 0).length,
        periodDays: period.days,
      },
      accepted: {
        rate: periodAcceptedRate({
          passed: work.passed,
          attempts: work.submissions,
        }),
        passed: work.passed,
        attempts: work.submissions,
      },
    };

    const bucket = activityBucketFor(period.days);

    return {
      scope: {
        academyId: scope.academyId,
        academyName: scope.academyName,
        displayName: scope.displayName,
        classes: scope.classes.map((entry) => ({
          classId: entry.classId,
          name: entry.name,
          teacherName: entry.teacherName,
        })),
        courseCount: scope.courses.length,
        period,
        activityTrackedSince: trackedSince,
        generatedAt: now.toISOString(),
      },
      continueTargets: this.buildContinue(scope, statuses, drafts),
      ledger,
      courses: this.buildCourses(scope, statuses),
      activity: {
        bucket,
        points: buildActivitySeries({
          activityDays,
          submissionDays,
          startDate: period.startDate,
          endDate: period.endDate,
          bucket,
        }),
      },
      messages: messages.map(
        (row): StudentMessage => ({
          id: row.id,
          body: row.body,
          materialId: row.materialId,
          exerciseTitle: row.materialId
            ? (scope.exerciseById.get(row.materialId)?.title ?? null)
            : null,
          createdAt: row.createdAt.toISOString(),
          readAt: row.readAt?.toISOString() ?? null,
        }),
      ),
      unreadMessages,
      practice: this.buildPractice(scope, statuses, attention, now),
      records: records.map(
        (row): StudentRecord => ({
          id: row.id,
          materialId: row.materialId,
          problemTitle: row.problemTitle,
          courseTitle: row.courseTitle,
          passed: row.status === "PASSED",
          score: row.score,
          solveElapsedSec: row.solveElapsedSec,
          createdAt: row.createdAt.toISOString(),
        }),
      ),
      standing,
      standingClasses: scope.standingEnabled
        ? scope.classes.map((entry) => ({
            classId: entry.classId,
            name: entry.name,
            teacherName: entry.teacherName,
          }))
        : [],
      unavailable,
    };
  }

  /* -------------------------------------------------------------- continue */

  /**
   * The doors, in the order §7.3 opens them.
   *
   * A draft first, because a student who stopped mid-problem yesterday is
   * resuming that problem whatever the curriculum thinks comes next. Then the
   * next unsolved exercise where they were last working. Then, for a student
   * who has never started anything, the very first exercise available — which
   * is the one case where this page is the whole onboarding.
   */
  private buildContinue(
    scope: StudentOverviewScopeInternal,
    statuses: ProgressByMaterial,
    drafts: { materialId: string | null; code: string; updatedAt: Date }[],
  ): ContinueTarget[] {
    const targets: ContinueTarget[] = [];
    const seen = new Set<string>();

    for (const draft of drafts) {
      if (!draft.materialId) continue;
      const exercise = scope.exerciseById.get(draft.materialId);
      if (!exercise) continue;
      seen.add(exercise.materialId);
      targets.push(
        targetFor(exercise, {
          kind: "draft",
          lineCount: countLines(draft.code),
          lastTouchedAt: draft.updatedAt.toISOString(),
        }),
      );
    }

    if (targets.length < STUDENT_MAX_CONTINUE_ROWS) {
      const next = scope.exercises.find(
        (exercise) =>
          !seen.has(exercise.materialId) &&
          statuses.get(exercise.materialId)?.status !== "SOLVED",
      );
      if (next) {
        seen.add(next.materialId);
        targets.push(
          targetFor(next, {
            kind: statuses.has(next.materialId) ? "next" : "start",
            lineCount: null,
            lastTouchedAt: null,
          }),
        );
      }
    }

    return targets
      .sort(compareContinueTargets)
      .slice(0, STUDENT_MAX_CONTINUE_ROWS);
  }

  /* --------------------------------------------------------------- courses */

  /**
   * Course progress, from the projection the catalog already prints.
   *
   * Not recomputed here. A dashboard that derived its own copy would
   * eventually disagree with the catalog a student can see on the next screen,
   * and there is no version of that a child could diagnose.
   */
  private buildCourses(
    scope: StudentOverviewScopeInternal,
    statuses: ProgressByMaterial,
  ): StudentCourseProgress[] {
    return scope.courses
      .flatMap((course): StudentCourseProgress[] => {
        const modules = nonemptyModules(course);
        const exercises = scope.exercises.filter(
          (exercise) => exercise.courseId === course.id,
        );
        if (modules.length === 0 || exercises.length === 0) return [];

        let solved = 0;
        let started = 0;
        let lastLectureLabel: string | null = null;
        let next: StudentExercise | null = null;

        for (const exercise of exercises) {
          const status = statuses.get(exercise.materialId)?.status;
          if (status === "SOLVED") {
            solved += 1;
            lastLectureLabel = exercise.lectureTitle;
          } else if (status === "IN_PROGRESS") {
            started += 1;
            lastLectureLabel = exercise.lectureTitle;
          }
          if (!next && status !== "SOLVED") next = exercise;
        }

        return [
          {
            courseId: course.id,
            title: course.title,
            solved,
            started,
            total: exercises.length,
            percent: Math.round((solved / exercises.length) * 100),
            lastLectureLabel,
            nextMaterialId: next?.materialId ?? null,
            nextTitle: next?.title ?? null,
            lastActivityAt: null,
          },
        ];
      })
      .sort(compareCourseProgress);
  }

  /* -------------------------------------------------------------- practice */

  /**
   * Unfinished work worth returning to.
   *
   * The candidates and the rule are the teacher's — `attentionReasonsFor`
   * decides which exercises qualify, so the child and the adult are looking at
   * the same list. What is dropped on the way out is the evidence: the reason
   * kind, the failure count, and the measured minutes never reach the student's
   * schema. §7.8 — a teacher needs to know why, and a child needs the door.
   */
  private buildPractice(
    scope: StudentOverviewScopeInternal,
    statuses: ProgressByMaterial,
    candidates: {
      materialId: string;
      consecutiveFailures: number;
      lastAttemptAt: Date;
      latestSolveSec: number | null;
      latestAccepted: boolean;
      progressStatus: "NOT_STARTED" | "IN_PROGRESS" | "SOLVED" | null;
      revisionMatches: boolean;
    }[],
    now: Date,
  ): PracticeExercise[] {
    const rows: PracticeExercise[] = [];
    for (const candidate of candidates) {
      const exercise = scope.exerciseById.get(candidate.materialId);
      if (!exercise) continue;

      const status =
        !candidate.revisionMatches || candidate.progressStatus === null
          ? "not_started"
          : candidate.progressStatus === "SOLVED"
            ? "solved"
            : candidate.progressStatus === "IN_PROGRESS"
              ? "in_progress"
              : "not_started";

      const reasons = attentionReasonsFor({
        status,
        latestAccepted: candidate.latestAccepted
          ? [true]
          : Array.from(
              { length: Math.max(1, candidate.consecutiveFailures) },
              () => false,
            ),
        lastAttemptAt: candidate.lastAttemptAt,
        latestFailedSolveSec: candidate.latestAccepted
          ? null
          : candidate.latestSolveSec,
        now,
      });
      if (reasons.length === 0) continue;

      rows.push({
        materialId: exercise.materialId,
        title: exercise.title,
        courseTitle: exercise.courseTitle,
        moduleTitle: exercise.moduleTitle,
        lectureTitle: exercise.lectureTitle,
        outlineNumber: exercise.outlineNumber,
        bestScore: statuses.get(exercise.materialId)?.bestScore ?? null,
        lastAttemptAt: candidate.lastAttemptAt.toISOString(),
      });
    }
    return rows
      .sort(comparePracticeExercises)
      .slice(0, STUDENT_MAX_PRACTICE_ROWS);
  }

  /* -------------------------------------------------------------- standing */

  /**
   * Where the student sits in one class, or why they are not being told.
   *
   * The floors come first and are checked before any row is projected: below
   * three students there is nothing to compare, and below three attempts by
   * this student there is nothing to compare *them* on. A child who has barely
   * started must not learn from this page that they are last.
   */
  private async resolveStanding(
    scope: StudentOverviewScopeInternal,
    period: { startAt: string | null; endAt: string },
    window: { startDate: string | null; endDate: string },
  ): Promise<ClassStanding | null> {
    const target = scope.standingClass;
    if (!scope.standingEnabled || !target) return null;

    const [work, days] = await Promise.all([
      this.repository.standingWork({
        membershipIds: target.membershipIds,
        materialIds: scope.materialIds,
        period,
      }),
      this.repository.standingActiveDays({
        membershipIds: target.membershipIds,
        courseIds: scope.courseIds,
        window,
      }),
    ]);

    const mine = work.find((row) => row.membershipId === scope.membershipId);
    if (!mine || mine.attemptedProblems < MIN_ATTEMPTED_TO_INTERPRET) {
      return {
        eligible: false,
        classId: target.classId,
        className: target.name,
        reason: "too_few_attempts",
        needed: Math.max(
          0,
          MIN_ATTEMPTED_TO_INTERPRET - (mine?.attemptedProblems ?? 0),
        ),
      };
    }

    const dayByMembership = new Map(
      days.map((row) => [row.membershipId, row.activeDays]),
    );
    // Only students with a signal in the period take part. A comparison whose
    // population included a child who was never here would read as a ranking
    // of attendance, which §9.3 refuses.
    const candidates: StandingCandidate[] = work
      .filter(
        (row) =>
          row.attemptedProblems > 0 ||
          (dayByMembership.get(row.membershipId) ?? 0) > 0,
      )
      .map((row) => ({
        membershipId: row.membershipId,
        solvedProblems: row.solvedProblems,
        averageScore: averageBestScore({
          scoreSum: row.scoreSum,
          attemptedProblems: row.attemptedProblems,
        }),
        activeDays: dayByMembership.get(row.membershipId) ?? 0,
      }));

    if (candidates.length < MIN_STUDENTS_FOR_COMPARISON) {
      return {
        eligible: false,
        classId: target.classId,
        className: target.name,
        reason: "too_few_students",
        needed: MIN_STUDENTS_FOR_COMPARISON - candidates.length,
      };
    }

    return (
      projectStanding({
        candidates,
        membershipId: scope.membershipId,
        classId: target.classId,
        className: target.name,
      }) ?? {
        eligible: false,
        classId: target.classId,
        className: target.name,
        reason: "too_few_attempts",
        needed: MIN_ATTEMPTED_TO_INTERPRET,
      }
    );
  }
}

/* ------------------------------------------------------------- projection */

function targetFor(
  exercise: StudentExercise,
  extra: Pick<ContinueTarget, "kind" | "lineCount" | "lastTouchedAt">,
): ContinueTarget {
  return {
    ...extra,
    materialId: exercise.materialId,
    title: exercise.title,
    courseId: exercise.courseId,
    courseTitle: exercise.courseTitle,
    moduleTitle: exercise.moduleTitle,
    lectureTitle: exercise.lectureTitle,
    outlineNumber: exercise.outlineNumber,
  };
}

/**
 * One point per day the period contains, whether or not anything happened.
 *
 * Gaps are filled with zeros rather than skipped: a chart that only drew the
 * days a student worked would space a quiet fortnight the same as a busy one,
 * and the shape of a week is most of what this section says.
 *
 * Above a month the days are folded into weeks, which is the point at which a
 * daily bar stops being wide enough to compare against its neighbour.
 */
export function buildActivitySeries(input: {
  activityDays: { date: Date; activeSeconds: number; intervals: number }[];
  submissionDays: { date: string; submissions: number; solved: number }[];
  startDate: string | null;
  endDate: string;
  bucket: ActivityBucket;
}): StudentActivityPoint[] {
  const seconds = new Map(
    input.activityDays.map((row) => [isoDate(row.date), row.activeSeconds]),
  );
  const work = new Map(
    input.submissionDays.map((row) => [row.date, row]),
  );

  const first =
    input.startDate ??
    earliest([...seconds.keys(), ...work.keys()]) ??
    input.endDate;

  const days: StudentActivityPoint[] = [];
  const span = localDaysBetween(first as LocalDate, input.endDate as LocalDate);
  for (let offset = 0; offset <= span; offset += 1) {
    const date = addLocalDays(first as LocalDate, offset);
    const row = work.get(date);
    days.push({
      date,
      activeSeconds: seconds.get(date) ?? 0,
      submissions: row?.submissions ?? 0,
      solved: row?.solved ?? 0,
    });
  }

  if (input.bucket === "day") return days;

  const weeks: StudentActivityPoint[] = [];
  for (let index = 0; index < days.length; index += 7) {
    const chunk = days.slice(index, index + 7);
    weeks.push({
      date: chunk[0].date,
      activeSeconds: chunk.reduce((total, day) => total + day.activeSeconds, 0),
      submissions: chunk.reduce((total, day) => total + day.submissions, 0),
      solved: chunk.reduce((total, day) => total + day.solved, 0),
    });
  }
  return weeks;
}

function earliest(dates: string[]): string | null {
  return dates.length === 0 ? null : dates.reduce((a, b) => (a < b ? a : b));
}

function countLines(code: string): number {
  const trimmed = code.trim();
  return trimmed.length === 0 ? 0 : trimmed.split("\n").length;
}

/**
 * One aggregate's failure, contained.
 *
 * Names the sections that depended on it and returns the fallback, so the page
 * renders everything that did load. The log carries the section and the
 * message and no student, score, or identifier.
 */
function settler(unavailable: StudentOverviewSection[], logger: Logger) {
  return async function settle<T>(
    sections: StudentOverviewSection[],
    run: () => Promise<T>,
    fallback: T,
  ): Promise<T> {
    try {
      return await run();
    } catch (error) {
      for (const section of sections) {
        if (!unavailable.includes(section)) unavailable.push(section);
      }
      logger.warn(
        `student overview aggregate ${sections.join("+")} failed: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
      return fallback;
    }
  };
}
