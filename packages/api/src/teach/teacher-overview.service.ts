import { Injectable, Logger } from "@nestjs/common";
import {
  LECTURE_READY_SOLVED_PERCENT,
  MIN_STUDENTS_FOR_COMPARISON,
  OVERVIEW_MAX_LIST_ROWS,
  OVERVIEW_MAX_PARTICIPATION_STUDENTS,
  OVERVIEW_MAX_READINESS_ROWS,
  compareCurriculumReadiness,
  compareDifficultProblems,
  compareTeachingQueue,
  lectureReadiness,
  meanOfScores,
  resolveOverviewPeriod,
  sharePercent,
  sortStudents,
  teacherOutlineNumber,
  type AcademyTeacherOverview,
  type ActiveTimePreviewRow,
  type CurriculumReadinessRow,
  type DifficultProblem,
  type GetAcademyTeacherOverviewInput,
  type OverviewLedger,
  type OverviewSection,
  type ParticipationRow,
  type ScorePreviewRow,
  type TeachingQueueStudent,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { buildStudentFacts, type StudentFact } from "./student-facts.js";
import {
  TeacherOverviewAccessService,
  type OverviewExercise,
  type TeacherOverviewScope,
} from "./teacher-overview-access.service.js";
import {
  TeacherOverviewRepository,
  type LectureSolvedRow,
  type OverviewAggregateScope,
  type ProblemDifficultyRow,
} from "./teacher-overview.repository.js";
import { TeacherProgressRepository } from "./teacher-progress.repository.js";

/**
 * The academy overview, assembled once per request.
 *
 * The unit coordinates: it establishes one authorized scope, fixes one read
 * timestamp, runs every independent aggregate concurrently against that
 * timestamp, and maps the results into the shared contract. It decides no rule
 * of its own — the score definition, readiness, the queue order, and the
 * previews' tie-breaks all live in `@cove/shared`, where they can be tested at
 * their boundaries without a database.
 *
 * One timestamp for the whole response is not a detail. Seven independently
 * clocked aggregates would let the ledger, the chart beside it, and the queue
 * above it describe three different moments, and a teacher comparing them would
 * be right that they disagree.
 *
 * A failing aggregate marks its own section unavailable and leaves the rest
 * standing. §6.10 — a page that renders an outage as an empty class is worse
 * than an error, because a teacher would believe it.
 *
 * See §6 and §10.1 of the teacher overview and student analytics redesign.
 */
@Injectable()
export class TeacherOverviewService {
  private readonly logger = new Logger(TeacherOverviewService.name);

  constructor(
    private readonly access: TeacherOverviewAccessService,
    private readonly repository: TeacherOverviewRepository,
    /**
     * Reused rather than reimplemented. The overview's Teaching queue and the
     * class Solution status page have to name the same students for the same
     * reasons, and one query is how that stays true.
     */
    private readonly progress: TeacherProgressRepository,
  ) {}

  async get(
    identity: SupabaseIdentity,
    input: GetAcademyTeacherOverviewInput,
  ): Promise<AcademyTeacherOverview> {
    const scope = await this.access.requireScope(identity, input);
    const now = new Date();
    const period = resolveOverviewPeriod({
      range: input.range ?? "7d",
      now,
      timeZone: scope.timeZone,
    });
    const unavailable: OverviewSection[] = [];
    const settle = settler(unavailable, this.logger);

    const filters = { classes: scope.classOptions, courses: scope.courseOptions };
    const courseAssignments = scope.classes.reduce(
      (total, entry) => total + entry.courseIds.length,
      0,
    );
    const baseScope = {
      academyId: scope.actor.academyId,
      classId: scope.selectedClassId,
      courseId: scope.selectedCourseId,
      classCount: scope.classes.length,
      courseCount: scope.courseIds.length,
      enrolledStudents: scope.students.length,
      period,
      activityTrackedSince: null as string | null,
      generatedAt: now.toISOString(),
    };

    // No assigned class, or a class with nobody in it. §6.10 — the page says so
    // rather than rendering zeros that read as a poorly performing class.
    if (scope.students.length === 0 || scope.materialIds.length === 0) {
      const trackedSince = await this.repository
        .activityTrackedSince(scope.actor.academyId)
        .catch(() => null);
      return {
        scope: { ...baseScope, activityTrackedSince: trackedSince },
        filters,
        queue: [],
        queueTotal: 0,
        ledger: emptyLedger({
          enrolled: scope.students.length,
          courses: scope.courseIds.length,
          assignments: courseAssignments,
          periodDays: period.days,
        }),
        participation: [],
        participationTruncated: false,
        scorePreview: [],
        mostActive: [],
        leastActive: [],
        readiness: [],
        problems: [],
        unavailable: [],
      };
    }

    const workScope = aggregateScopeFor(scope);
    const currentPeriod = {
      startAt: period.startAt ? new Date(period.startAt) : null,
      endAt: new Date(period.endAt),
    };
    const activityWindow = {
      scope: workScope,
      startDate: period.startDate,
      endDate: period.endDate,
    };

    // Independent aggregates, run together against one scope. Each one is
    // settled on its own so a single failure narrows the page rather than
    // emptying it.
    const [
      activity,
      activityDays,
      activeCalendarDays,
      work,
      lectureProgress,
      problemRows,
      candidates,
      trackedSince,
    ] = await Promise.all([
      settle(
        ["ledger", "participation", "activity"],
        () => this.repository.activityByStudentCourse(activityWindow),
        [],
      ),
      settle(
        ["ledger", "activity"],
        () => this.repository.activityDaysByStudent(activityWindow),
        [],
      ),
      settle(["ledger"], () => this.repository.activeCalendarDays(activityWindow), 0),
      settle(
        ["ledger", "participation", "scores"],
        () => this.repository.workByStudent(workScope, currentPeriod),
        [],
      ),
      settle(
        ["readiness"],
        () => this.repository.lectureProgressByStudent(workScope),
        [],
      ),
      settle(
        ["problems"],
        () => this.repository.problemDifficulty(workScope, currentPeriod),
        [],
      ),
      settle(
        ["queue"],
        () =>
          this.progress.attentionCandidates({
            userIds: scope.userIds,
            materialIds: scope.materialIds,
            overviewScope: workScope,
            now,
          }),
        [],
      ),
      settle([], () => this.repository.activityTrackedSince(scope.actor.academyId), null),
    ]);

    const facts = buildStudentFacts({
      scope,
      activity,
      activityDays,
      work,
      candidates,
      period,
      now,
    });

    /* ------------------------------------------------------ metrics ledger */

    const enrolled = facts.length;
    const activeStudents = facts.filter(
      (fact) => fact.activeSeconds > 0 || fact.submissions > 0,
    ).length;
    const totalSeconds = facts.reduce((total, fact) => total + fact.activeSeconds, 0);
    const scores = facts.map((fact) => fact.averageScore);

    const ledger: OverviewLedger = {
      students: { total: enrolled, active: activeStudents },
      courses: { distinct: scope.courseIds.length, assignments: courseAssignments },
      activeLearning: {
        totalSeconds,
        // Over the enrolled roster, not over the students who happened to show
        // up: "an hour each" and "an hour between the three who came" are
        // different facts, and the roster is the one a teacher is asking about.
        averageSecondsPerStudent:
          enrolled > 0 ? Math.round(totalSeconds / enrolled) : null,
      },
      activeDays: {
        days: activeCalendarDays,
        periodDays: period.days,
        activeStudents,
        enrolledStudents: enrolled,
      },
      averageScore: {
        value: meanOfScores(scores),
        scoredStudents: scores.filter((score) => score !== null).length,
        withoutScore: scores.filter((score) => score === null).length,
        attemptedProblems: facts.reduce(
          (total, fact) => total + fact.attemptedProblems,
          0,
        ),
      },
    };

    /* ------------------------------------------------------- teaching queue */

    const flagged = facts.filter((fact) => fact.reasons.length > 0);
    const queue: TeachingQueueStudent[] = flagged
      .filter((fact) => fact.primaryClassId !== null)
      .map((fact) => ({
        membershipId: fact.student.membershipId,
        displayName: fact.student.displayName,
        classId: fact.primaryClassId!,
        className:
          fact.classes.find((entry) => entry.value === fact.primaryClassId)
            ?.label ?? fact.classes[0]?.label ?? "—",
        reasons: fact.reasons,
        activeSeconds: fact.activeSeconds,
        activeDays: fact.activeDays,
        averageScore: fact.averageScore,
        attemptedProblems: fact.attemptedProblems,
        curriculumLabel: fact.curriculumLabel,
        materialId: fact.materialId,
        courseId: fact.courseId,
        lastActivityAt: fact.lastActivityAt?.toISOString() ?? null,
      }))
      .sort(compareTeachingQueue)
      .slice(0, OVERVIEW_MAX_LIST_ROWS);

    /* -------------------------------------------------------- participation */

    // Display-name order, not submission order. §6.5 — the chart the CEO asked
    // for must not become a ranking by being sorted like one.
    const singleClass = scope.selectedClassId !== null;
    const participation: ParticipationRow[] = facts
      .slice(0, OVERVIEW_MAX_PARTICIPATION_STUDENTS)
      .map((fact) => ({
        membershipId: fact.student.membershipId,
        displayName: fact.student.displayName,
        className: singleClass ? (fact.classes[0]?.label ?? null) : null,
        submissions: fact.submissions,
        solvedProblems: fact.solvedProblems,
        activeSeconds: fact.activeSeconds,
        averageScore: fact.averageScore,
      }));

    /* ------------------------------------------------------------ previews */

    const scorePreview: ScorePreviewRow[] = sortStudents(
      facts.map(orderingOf),
      "score",
      "desc",
    )
      .slice(0, OVERVIEW_MAX_LIST_ROWS)
      .map((row) => {
        const fact = row.fact;
        return {
          membershipId: fact.student.membershipId,
          displayName: fact.student.displayName,
          classId: fact.classes[0]?.value ?? null,
          className: fact.classes[0]?.label ?? null,
          averageScore: fact.averageScore,
          attemptedProblems: fact.attemptedProblems,
          lastActivityAt: fact.lastActivityAt?.toISOString() ?? null,
        };
      });

    const byTime = sortStudents(facts.map(orderingOf), "activeTime", "desc");
    const timeRow = (row: ReturnType<typeof orderingOf>): ActiveTimePreviewRow => ({
      membershipId: row.fact.student.membershipId,
      displayName: row.fact.student.displayName,
      classId: row.fact.classes[0]?.value ?? null,
      className: row.fact.classes[0]?.label ?? null,
      activeSeconds: row.fact.activeSeconds,
      activeDays: row.fact.activeDays,
      lastActivityAt: row.fact.lastActivityAt?.toISOString() ?? null,
    });

    /* ------------------------------------------------------------ curriculum */

    const readiness = buildReadiness({ scope, rows: lectureProgress });

    /* -------------------------------------------------------------- problems */

    const problems = buildProblems({ scope, rows: problemRows });

    return {
      scope: { ...baseScope, activityTrackedSince: trackedSince },
      filters,
      queue,
      queueTotal: flagged.length,
      ledger,
      participation,
      participationTruncated: facts.length > OVERVIEW_MAX_PARTICIPATION_STUDENTS,
      scorePreview,
      mostActive: byTime.slice(0, OVERVIEW_MAX_LIST_ROWS).map(timeRow),
      // Reversed rather than re-sorted, so "least active" is exactly the other
      // end of the same total order and the two lists cannot disagree about a
      // student sitting in the middle.
      leastActive: [...byTime].reverse().slice(0, OVERVIEW_MAX_LIST_ROWS).map(timeRow),
      readiness,
      problems,
      unavailable,
    };
  }
}

/* --------------------------------------------------------------- helpers */

/** The comparator's view of a fact, with the fact itself along for the ride. */
function orderingOf(fact: StudentFact) {
  return {
    fact,
    membershipId: fact.student.membershipId,
    displayName: fact.student.displayName,
    averageScore: fact.averageScore,
    attemptedProblems: fact.attemptedProblems,
    solvedProblems: fact.solvedProblems,
    submissions: fact.submissions,
    activeSeconds: fact.activeSeconds,
    activeDays: fact.activeDays,
    lastActivityAt: fact.lastActivityAt?.toISOString() ?? null,
  };
}

export function aggregateScopeFor(
  scope: TeacherOverviewScope,
): OverviewAggregateScope {
  return {
    studentClasses: scope.classes.flatMap((entry) =>
      entry.students.map((student) => ({
        classId: entry.classId,
        userId: student.userId,
        membershipId: student.membershipId,
      })),
    ),
    materialClasses: scope.classes.flatMap((entry) =>
      entry.exercises.map((exercise) => ({
        classId: entry.classId,
        courseId: exercise.courseId,
        materialId: exercise.materialId,
      })),
    ),
  };
}

/**
 * §6.8's lowest three lectures, from per-student solved counts.
 *
 * The eligible denominator comes from the roster the lecture is assigned to
 * rather than from the students who happen to have a progress row, so a lecture
 * nobody has opened reports "0 of 12 ready" rather than being absent from a
 * page whose whole job is to say what the class is not ready for.
 */
function buildReadiness(input: {
  scope: TeacherOverviewScope;
  rows: LectureSolvedRow[];
}): CurriculumReadinessRow[] {
  const { scope, rows } = input;
  const byLecture = new Map<
    string,
    {
      exercise: OverviewExercise;
      classId: string;
      scoredExercises: number;
      eligible: Set<string>;
      position: number;
    }
  >();

  for (const entry of scope.classes) {
    for (const exercise of entry.exercises) {
      const found = byLecture.get(exercise.lectureId);
      const lectureExercises = entry.exercises.filter(
        (other) => other.lectureId === exercise.lectureId,
      ).length;
      if (!found) {
        byLecture.set(exercise.lectureId, {
          exercise,
          classId: entry.classId,
          scoredExercises: lectureExercises,
          eligible: new Set(entry.userIds),
          position:
            exercise.modulePosition * 10_000 + exercise.lecturePosition * 100,
        });
        continue;
      }
      // A lecture taught to two classes is one lecture: the roster is the union
      // and the exercise count is the widest set either class is assigned.
      found.scoredExercises = Math.max(found.scoredExercises, lectureExercises);
      for (const userId of entry.userIds) found.eligible.add(userId);
    }
  }

  const solvedByLecture = new Map<string, LectureSolvedRow[]>();
  for (const row of rows) {
    const list = solvedByLecture.get(row.lectureId) ?? [];
    list.push(row);
    solvedByLecture.set(row.lectureId, list);
  }

  const built = [...byLecture].map(([lectureId, entry]) => {
    const students = (solvedByLecture.get(lectureId) ?? []).filter((row) =>
      entry.eligible.has(row.userId),
    );
    const attempting = students.filter((row) => row.attempted > 0).length;
    const { readiness, readyStudents } = lectureReadiness({
      perStudentSolvedPercent: students.map((row) =>
        entry.scoredExercises > 0
          ? Math.round((row.solved / entry.scoredExercises) * 100)
          : 0,
      ),
      eligibleStudents: entry.eligible.size,
      attemptingStudents: attempting,
    });
    return {
      lectureId,
      lectureTitle: entry.exercise.lectureTitle,
      moduleTitle: entry.exercise.moduleTitle,
      courseTitle: entry.exercise.courseTitle,
      outlineNumber: teacherOutlineNumber({
        modulePosition: entry.exercise.modulePosition,
        lecturePosition: entry.exercise.lecturePosition,
      }),
      eligibleStudents: entry.eligible.size,
      attemptingStudents: attempting,
      readyStudents,
      readiness,
      classId: entry.classId,
      courseId: entry.exercise.courseId,
      position: entry.position,
    };
  });

  return built
    .filter((row) => row.attemptingStudents >= MIN_STUDENTS_FOR_COMPARISON)
    .sort(compareCurriculumReadiness)
    .slice(0, OVERVIEW_MAX_READINESS_ROWS)
    .map(({ position: _position, ...row }) => row);
}

/**
 * §6.9's top five, lowest solve rate first.
 *
 * The comparison floor is applied before the sort rather than after: a problem
 * two children tried has a solve rate, but it is not evidence about a class,
 * and letting it sort to the top would fill the section with coincidences.
 */
function buildProblems(input: {
  scope: TeacherOverviewScope;
  rows: ProblemDifficultyRow[];
}): DifficultProblem[] {
  const { scope, rows } = input;
  const exerciseById = new Map(
    scope.exercises.map((exercise) => [exercise.materialId, exercise]),
  );
  const classByMaterial = new Map<string, string>();
  for (const entry of scope.classes) {
    for (const materialId of entry.materialIds) {
      if (!classByMaterial.has(materialId)) {
        classByMaterial.set(materialId, entry.classId);
      }
    }
  }

  return rows
    .filter((row) => row.attemptingStudents >= MIN_STUDENTS_FOR_COMPARISON)
    .flatMap((row, index) => {
      const exercise = exerciseById.get(row.materialId);
      const classId = classByMaterial.get(row.materialId);
      if (!exercise || !classId) return [];
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
          position: index,
        },
      ];
    })
    .sort(compareDifficultProblems)
    .slice(0, OVERVIEW_MAX_LIST_ROWS)
    .map(({ position: _position, ...row }) => row);
}

function emptyLedger(input: {
  enrolled: number;
  courses: number;
  assignments: number;
  periodDays: number | null;
}): OverviewLedger {
  return {
    students: { total: input.enrolled, active: 0 },
    courses: { distinct: input.courses, assignments: input.assignments },
    activeLearning: { totalSeconds: 0, averageSecondsPerStudent: null },
    activeDays: {
      days: 0,
      periodDays: input.periodDays,
      activeStudents: 0,
      enrolledStudents: input.enrolled,
    },
    averageScore: {
      value: null,
      scoredStudents: 0,
      withoutScore: input.enrolled,
      attemptedProblems: 0,
    },
  };
}

/**
 * Runs one aggregate, or gives up on it alone.
 *
 * A rejected promise here must never reject the page. The fallback is the
 * section's empty value and the sections it feeds are recorded as unavailable,
 * so the panel can say what could not load instead of showing a class that
 * appears to have done nothing.
 */
function settler(unavailable: OverviewSection[], logger: Logger) {
  return async function settle<T>(
    sections: OverviewSection[],
    run: () => Promise<T>,
    fallback: T,
  ): Promise<T> {
    try {
      return await run();
    } catch (error) {
      for (const section of sections) {
        if (!unavailable.includes(section)) unavailable.push(section);
      }
      // §13 — the named query and its failure, with no student, score, or id.
      logger.warn(
        `overview aggregate ${sections.join("+")} failed: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
      return fallback;
    }
  };
}

export { LECTURE_READY_SOLVED_PERCENT };
