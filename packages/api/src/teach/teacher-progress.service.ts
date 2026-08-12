import { HttpStatus, Injectable } from "@nestjs/common";
import {
  TEACHER_ATTEMPTS_PAGE_SIZE,
  TEACHER_EXERCISE_PAGE_SIZE,
  TEACHER_PROBLEM_STUDENTS_PAGE_SIZE,
  TEACHER_ROSTER_PAGE_SIZE,
  acceptedRate,
  attentionReasonsFor,
  completionPercent,
  resolveTeacherPage,
  teacherOutlineNumber,
  type GetTeacherStudentDetailInput,
  type GetTeacherSubmissionReviewInput,
  type ListTeacherAttemptsInput,
  type ListTeacherCourseOutlineInput,
  type ListTeacherCurriculumInput,
  type ListTeacherLectureProblemsInput,
  type ListTeacherProblemStudentsInput,
  type ListTeacherStudentsInput,
  type TeacherAttemptsResult,
  type TeacherAttentionKind,
  type TeacherAttentionReason,
  type TeacherClassProgressSummary,
  type TeacherCourseOutlineResult,
  type TeacherCourseProgressSummary,
  type TeacherCurriculumResult,
  type TeacherLectureProblemsResult,
  type TeacherLectureProgressSummary,
  type TeacherProblemProgressRow,
  type TeacherProblemStudentsResult,
  type TeacherProgressFacets,
  type TeacherProgressStatus,
  type TeacherStudentExerciseRow,
  type TeacherStudentProgressDetail,
  type TeacherStudentProgressRow,
  type TeacherStudentsResult,
  type TeacherSubmissionReview,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AppException } from "../common/app-exception.js";
import {
  TeacherProgressAccessService,
  type ScopedExercise,
  type ScopedStudent,
  type TeacherClassScope,
} from "./teacher-progress-access.service.js";
import {
  TeacherProgressRepository,
  type AttentionCandidate,
  type ExerciseProgressRecord,
} from "./teacher-progress.repository.js";

/**
 * Solution status, as contracts.
 *
 * The unit maps database records into the strict shared types, applies the
 * metric and attention definitions from `@cove/shared`, and converts a missing
 * or out-of-scope id into the one not-found answer the API gives for all of
 * them. It performs no authorization branching of its own: every method starts
 * by asking the access service for a scope and can only see what that scope
 * contains.
 *
 * Rosters and curricula are small — tens of students, hundreds of exercises —
 * so filtering, ordering, and paging over them happens here, after the
 * database has done the aggregation over the large table. Nothing in this file
 * is proportional to a class's submission count.
 *
 * See §7 and §13.3 of the teacher solution status design.
 */
@Injectable()
export class TeacherProgressService {
  constructor(
    private readonly access: TeacherProgressAccessService,
    private readonly repository: TeacherProgressRepository,
  ) {}

  /* ------------------------------------------------------- by student */

  async listStudents(
    identity: SupabaseIdentity,
    input: ListTeacherStudentsInput,
  ): Promise<TeacherStudentsResult> {
    const now = new Date();
    const scope = await this.access.requireClassScope(identity, input);
    const exercises = filterExercises(scope.exercises, {
      courseIds: input.courseIds,
    });
    const eligible = exercises.filter((exercise) => exercise.isRequired);

    const userIds = scope.studentUserIds;
    const materialIds = exercises.map((exercise) => exercise.materialId);
    const eligibleIds = eligible.map((exercise) => exercise.materialId);

    const [attempts, solved, candidates] = await Promise.all([
      this.repository.countedAttemptsByStudent({ userIds, materialIds }),
      this.repository.solvedCountsByStudent({
        userIds,
        materialIds: eligibleIds,
      }),
      this.repository.attentionCandidates({ userIds, materialIds, now }),
    ]);

    const attention = attentionByStudent(candidates, now);
    const attemptsByUser = new Map(attempts.map((row) => [row.userId, row]));
    const solvedByUser = new Map(solved.map((row) => [row.userId, row.solved]));

    const rows = scope.students.map((student) =>
      studentRow({
        student,
        eligibleCount: eligible.length,
        solved: solvedByUser.get(student.userId) ?? 0,
        totals: attemptsByUser.get(student.userId),
        reasons: attention.get(student.userId),
      }),
    );

    // The class facts describe the curriculum in view, not the table below
    // them: narrowing to one course changes what completion means, while
    // searching for a name must not make the class look smaller than it is.
    const summary: TeacherClassProgressSummary = {
      classId: scope.classId,
      className: scope.className,
      activeStudents: scope.students.length,
      solvedPairs: rows.reduce((total, row) => total + row.solvedProblems, 0),
      eligiblePairs: eligible.length * scope.students.length,
      completionPercent: completionPercent({
        solved: rows.reduce((total, row) => total + row.solvedProblems, 0),
        eligible: eligible.length * scope.students.length,
      }),
      studentsNeedingAttention: rows.filter((row) => row.attentionCount > 0)
        .length,
    };

    const visible = rows.filter((row) => matchesStudentFilters(row, input));
    const ordered = sortStudentRows(visible, input.sort, input.direction);
    const { page, pageCount, skip } = resolveTeacherPage({
      requestedPage: input.page ?? 1,
      totalCount: ordered.length,
      pageSize: TEACHER_ROSTER_PAGE_SIZE,
    });

    return {
      summary,
      rows: ordered.slice(skip, skip + TEACHER_ROSTER_PAGE_SIZE),
      facets: facetsFor(scope, attention),
      pagination: {
        page,
        pageSize: TEACHER_ROSTER_PAGE_SIZE,
        totalCount: ordered.length,
        pageCount,
      },
    };
  }

  async getStudentDetail(
    identity: SupabaseIdentity,
    input: GetTeacherStudentDetailInput,
  ): Promise<TeacherStudentProgressDetail> {
    const now = new Date();
    const scope = await this.access.requireClassScope(identity, input);
    const student = this.access.requireStudent(scope, input.membershipId);

    // The student's whole class curriculum, so the summary above the table
    // keeps meaning the same thing while the table itself is filtered.
    const all = scope.exercises;
    const allIds = all.map((exercise) => exercise.materialId);
    const eligibleIds = all
      .filter((exercise) => exercise.isRequired)
      .map((exercise) => exercise.materialId);
    const userIds = [student.userId];

    const [attempts, progress, candidates, totals, solved] = await Promise.all([
      this.repository.countedAttemptsByExercise({
        userIds,
        materialIds: allIds,
      }),
      this.repository.progressFor({ userIds, materialIds: allIds }),
      this.repository.attentionCandidates({
        userIds,
        materialIds: allIds,
        now,
      }),
      this.repository.countedAttemptsByStudent({
        userIds,
        materialIds: allIds,
      }),
      this.repository.solvedCountsByStudent({
        userIds,
        materialIds: eligibleIds,
      }),
    ]);

    const reasons = attentionByPair(candidates, now);
    const perStudent = attentionByStudent(candidates, now);
    const attemptsByMaterial = new Map(
      attempts.map((row) => [row.materialId, row]),
    );
    const progressByMaterial = new Map(
      progress.map((row) => [row.materialId, row]),
    );

    const rows: TeacherStudentExerciseRow[] = all.map((exercise) => {
      const record = progressByMaterial.get(exercise.materialId);
      const totalsFor = attemptsByMaterial.get(exercise.materialId);
      return {
        materialId: exercise.materialId,
        title: exercise.title,
        courseTitle: exercise.courseTitle,
        outlineNumber: teacherOutlineNumber({
          modulePosition: exercise.modulePosition,
          lecturePosition: exercise.lecturePosition,
          problemPosition: exercise.position,
        }),
        difficulty: exercise.difficulty,
        isRequired: exercise.isRequired,
        status: statusOf(record),
        bestScore: record?.revisionMatches ? record.bestScore : 0,
        attempts: totalsFor?.attempts ?? 0,
        lastAttemptAt: totalsFor?.lastActivityAt?.toISOString() ?? null,
        attentionReasons:
          reasons.get(pairKey(student.userId, exercise.materialId)) ?? [],
      };
    });

    const visible = rows.filter((row, index) =>
      matchesExerciseFilters({ row, exercise: all[index]!, input }),
    );
    const { page, pageCount, skip } = resolveTeacherPage({
      requestedPage: input.page ?? 1,
      totalCount: visible.length,
      pageSize: TEACHER_EXERCISE_PAGE_SIZE,
    });

    return {
      student: studentRow({
        student,
        eligibleCount: eligibleIds.length,
        solved: solved[0]?.solved ?? 0,
        totals: totals[0],
        reasons: perStudent.get(student.userId),
      }),
      rows: visible.slice(skip, skip + TEACHER_EXERCISE_PAGE_SIZE),
      facets: facetsFor(scope, perStudent),
      pagination: {
        page,
        pageSize: TEACHER_EXERCISE_PAGE_SIZE,
        totalCount: visible.length,
        pageCount,
      },
    };
  }

  /**
   * One student's attempts at one exercise.
   *
   * The single attempt-history operation. By student and By problem both call
   * it, so the two views cannot drift into telling different stories about the
   * same work.
   */
  async listAttempts(
    identity: SupabaseIdentity,
    input: ListTeacherAttemptsInput,
  ): Promise<TeacherAttemptsResult> {
    const scope = await this.access.requireClassScope(identity, input);
    const student = this.access.requireStudent(scope, input.membershipId);
    const exercise = this.access.requireExercise(scope, input.materialId);

    const totalCount = await this.repository.countAttempts({
      userId: student.userId,
      materialId: exercise.materialId,
    });
    const { page, pageCount, skip } = resolveTeacherPage({
      requestedPage: input.page ?? 1,
      totalCount,
      pageSize: TEACHER_ATTEMPTS_PAGE_SIZE,
    });
    const rows = await this.repository.listAttempts({
      userId: student.userId,
      materialId: exercise.materialId,
      skip,
      take: TEACHER_ATTEMPTS_PAGE_SIZE,
    });

    return {
      problemTitle: exercise.title,
      studentName: student.displayName,
      attempts: rows.map((row) => ({
        submissionId: row.id,
        accepted: row.status === "PASSED",
        score: row.score,
        passedCount: row.passedCount,
        totalCount: row.totalCount,
        runtimeMs: row.runtimeMs,
        solveElapsedSec: row.solveElapsedSec,
        createdAt: row.createdAt.toISOString(),
      })),
      pagination: {
        page,
        pageSize: TEACHER_ATTEMPTS_PAGE_SIZE,
        totalCount,
        pageCount,
      },
    };
  }

  /* ------------------------------------------------------- by problem */

  async listCurriculum(
    identity: SupabaseIdentity,
    input: ListTeacherCurriculumInput,
  ): Promise<TeacherCurriculumResult> {
    const now = new Date();
    const scope = await this.access.requireClassScope(identity, input);
    const exercises = filterExercises(scope.exercises, {
      courseIds: input.courseIds,
    });
    const rollup = await this.rollupFor(scope, exercises, now);

    const needle = input.q?.trim().toLowerCase() ?? "";
    const courses: TeacherCourseProgressSummary[] = scope.courses
      .map((course) => {
        const owned = exercises.filter(
          (exercise) => exercise.courseId === course.id,
        );
        const modules = new Set(owned.map((exercise) => exercise.moduleId));
        const totals = rollup.totalsFor(owned, scope.students.length);
        return {
          courseId: course.id,
          title: course.title,
          description: course.description,
          moduleCount: modules.size,
          exerciseCount: owned.length,
          ...totals,
        };
      })
      // A course whose curriculum is entirely hidden is not a course this
      // class can be measured on, so it is not offered as one to open.
      .filter((course) => course.exerciseCount > 0)
      .filter(
        (course) =>
          !needle ||
          course.title.toLowerCase().includes(needle) ||
          exercises.some(
            (exercise) =>
              exercise.courseId === course.courseId && matches(exercise, needle),
          ),
      );

    return { summary: this.summaryFrom(scope, exercises, rollup), courses };
  }

  async listCourseOutline(
    identity: SupabaseIdentity,
    input: ListTeacherCourseOutlineInput,
  ): Promise<TeacherCourseOutlineResult> {
    const now = new Date();
    const scope = await this.access.requireClassScope(identity, input);
    const course = scope.courses.find((item) => item.id === input.courseId);
    const owned = scope.exercises.filter(
      (exercise) => exercise.courseId === input.courseId,
    );
    if (!course || owned.length === 0) {
      throw new AppException(
        "TEACHER_PROGRESS_NOT_FOUND",
        HttpStatus.NOT_FOUND,
      );
    }

    const rollup = await this.rollupFor(scope, owned, now);
    const students = scope.students.length;
    const needle = input.q?.trim().toLowerCase() ?? "";

    const modules = groupBy(owned, (exercise) => exercise.moduleId).map(
      ([, group]) => {
        const first = group[0]!;
        const lectures = groupBy(group, (exercise) => exercise.lectureId)
          .map(([, lectureGroup]) => {
            const lecture = lectureGroup[0]!;
            return {
              lectureId: lecture.lectureId,
              title: lecture.lectureTitle,
              description: lecture.lectureDescription,
              outlineNumber:
                teacherOutlineNumber({
                  modulePosition: lecture.modulePosition,
                  lecturePosition: lecture.lecturePosition,
                }) ?? "",
              problemCount: lectureGroup.length,
              ...rollup.totalsFor(lectureGroup, students),
            } satisfies TeacherLectureProgressSummary;
          })
          .filter(
            (lecture) =>
              !needle ||
              lecture.title.toLowerCase().includes(needle) ||
              group.some(
                (exercise) =>
                  exercise.lectureId === lecture.lectureId &&
                  matches(exercise, needle),
              ),
          );
        return {
          moduleId: first.moduleId,
          title: first.moduleTitle,
          position: first.modulePosition,
          ...rollup.totalsFor(group, students),
          lectures,
        };
      },
    );

    return {
      course: {
        courseId: course.id,
        title: course.title,
        description: course.description,
        moduleCount: modules.length,
        exerciseCount: owned.length,
        ...rollup.totalsFor(owned, students),
      },
      modules: modules.filter(
        (item) => !needle || item.lectures.length > 0,
      ),
    };
  }

  async listLectureProblems(
    identity: SupabaseIdentity,
    input: ListTeacherLectureProblemsInput,
  ): Promise<TeacherLectureProblemsResult> {
    const now = new Date();
    const scope = await this.access.requireClassScope(identity, input);
    const owned = scope.exercises.filter(
      (exercise) => exercise.lectureId === input.lectureId,
    );
    if (owned.length === 0) {
      throw new AppException(
        "TEACHER_PROGRESS_NOT_FOUND",
        HttpStatus.NOT_FOUND,
      );
    }

    const userIds = scope.studentUserIds;
    const materialIds = owned.map((exercise) => exercise.materialId);
    const [rollup, medians] = await Promise.all([
      this.rollupFor(scope, owned, now),
      this.repository.medianSolveByExercise({ userIds, materialIds }),
    ]);
    const medianByMaterial = new Map(
      medians.map((row) => [row.materialId, row.medianSolveSec]),
    );
    const first = owned[0]!;
    const students = scope.students.length;

    return {
      lecture: {
        lectureId: first.lectureId,
        title: first.lectureTitle,
        description: first.lectureDescription,
        outlineNumber:
          teacherOutlineNumber({
            modulePosition: first.modulePosition,
            lecturePosition: first.lecturePosition,
          }) ?? "",
        problemCount: owned.length,
        ...rollup.totalsFor(owned, students),
      },
      rows: owned.map((exercise) => problemRow(exercise, rollup, students, {
        medianSolveSec: medianByMaterial.get(exercise.materialId) ?? null,
      })),
    };
  }

  async listProblemStudents(
    identity: SupabaseIdentity,
    input: ListTeacherProblemStudentsInput,
  ): Promise<TeacherProblemStudentsResult> {
    const now = new Date();
    const scope = await this.access.requireClassScope(identity, input);
    const exercise = this.access.requireExercise(scope, input.materialId);

    const userIds = scope.studentUserIds;
    const materialIds = [exercise.materialId];
    const [progress, attempts, latestSolve, medians, rollup] =
      await Promise.all([
        this.repository.progressFor({ userIds, materialIds }),
        this.repository.countedAttemptsByStudent({ userIds, materialIds }),
        this.repository.latestSolveByStudent({ userIds, materialIds }),
        this.repository.medianSolveByExercise({ userIds, materialIds }),
        this.rollupFor(scope, [exercise], now),
      ]);

    const progressByUser = new Map(progress.map((row) => [row.userId, row]));
    const attemptsByUser = new Map(attempts.map((row) => [row.userId, row]));
    const solveByUser = new Map(
      latestSolve.map((row) => [row.userId, row.latestSolveSec]),
    );

    const rows = scope.students
      .map((student) => {
        const record = progressByUser.get(student.userId);
        const totals = attemptsByUser.get(student.userId);
        return {
          membershipId: student.membershipId,
          displayName: student.displayName,
          status: statusOf(record),
          bestScore: record?.revisionMatches ? record.bestScore : 0,
          attempts: totals?.attempts ?? 0,
          lastActivityAt: totals?.lastActivityAt?.toISOString() ?? null,
          latestSolveElapsedSec: solveByUser.get(student.userId) ?? null,
          attentionReasons:
            rollup.reasons.get(pairKey(student.userId, exercise.materialId)) ??
            [],
        };
      })
      // Attention first, then unsolved before solved: the teacher opened one
      // problem to find out who is stuck on it, and a solved student is the
      // one row that cannot answer that question.
      .sort(
        (left, right) =>
          right.attentionReasons.length - left.attentionReasons.length ||
          Number(left.status === "solved") - Number(right.status === "solved") ||
          left.displayName.localeCompare(right.displayName) ||
          left.membershipId.localeCompare(right.membershipId),
      );

    const { page, pageCount, skip } = resolveTeacherPage({
      requestedPage: input.page ?? 1,
      totalCount: rows.length,
      pageSize: TEACHER_PROBLEM_STUDENTS_PAGE_SIZE,
    });

    return {
      problem: problemRow(exercise, rollup, scope.students.length, {
        medianSolveSec: medians[0]?.medianSolveSec ?? null,
      }),
      rows: rows.slice(skip, skip + TEACHER_PROBLEM_STUDENTS_PAGE_SIZE),
      pagination: {
        page,
        pageSize: TEACHER_PROBLEM_STUDENTS_PAGE_SIZE,
        totalCount: rows.length,
        pageCount,
      },
    };
  }

  /* -------------------------------------------------- submission review */

  async getSubmissionReview(
    identity: SupabaseIdentity,
    input: GetTeacherSubmissionReviewInput,
  ): Promise<TeacherSubmissionReview> {
    const scope = await this.access.requireClassScope(identity, input);
    const student = this.access.requireStudent(scope, input.membershipId);

    // Deliberately not "find the submission, then check it": the read is
    // scoped to this student and to the exercises this class is currently
    // taught, so an attempt on a since-removed course is never selected.
    const submission = await this.repository.findSubmissionForReview({
      userId: student.userId,
      submissionId: input.submissionId,
      materialIds: scope.exercises.map((exercise) => exercise.materialId),
    });
    // The frozen id has to agree with the live relation. A row whose exercise
    // was replaced under it keeps its printed history but is not reviewable
    // as the problem it now points at.
    if (!submission || submission.sourceMaterialId !== submission.materialId) {
      throw new AppException(
        "TEACHER_PROGRESS_NOT_FOUND",
        HttpStatus.NOT_FOUND,
      );
    }
    const statement = await this.repository.findStatement(
      submission.sourceMaterialId,
    );

    const sampleByPosition = new Map(
      submission.gradingCases.map((item) => [item.position, item]),
    );
    const hidden = submission.cases.filter((item) => !item.isSample);

    return {
      submissionId: submission.id,
      membershipId: student.membershipId,
      studentName: student.displayName,
      problemTitle: submission.problemTitle,
      courseTitle: submission.courseTitle,
      moduleTitle: submission.moduleTitle,
      lectureTitle: submission.lectureTitle,
      outlineNumber: teacherOutlineNumber({
        modulePosition: submission.modulePosition,
        lecturePosition: submission.lecturePosition,
        problemPosition: submission.problemPosition,
      }),
      accepted: submission.status === "PASSED",
      score: submission.score,
      passedCount: submission.passedCount,
      totalCount: submission.totalCount,
      runtimeMs: submission.runtimeMs,
      solveElapsedSec: submission.solveElapsedSec,
      createdAt: submission.createdAt.toISOString(),
      code: submission.code,
      language: submission.language,
      // Context, not authorization: a statement that has since been deleted
      // leaves the attempt perfectly reviewable.
      statement,
      cases: submission.cases.map((item) => {
        const sample = item.isSample
          ? sampleByPosition.get(item.position)
          : undefined;
        return {
          position: item.position,
          isSample: item.isSample,
          outcome: item.outcome,
          runtimeMs: item.runtimeMs,
          // A hidden case reports a position and an outcome. Its input,
          // expected output, and actual output are absent by construction —
          // a teacher who could read them could hand them to a student.
          input: sample?.input ?? null,
          expectedOutput: sample?.expectedOutput ?? null,
          actualOutput: item.isSample ? item.actualOutput : null,
        };
      }),
      hiddenPassed: hidden.filter((item) => item.outcome === "PASSED").length,
      hiddenTotal: hidden.length,
    };
  }

  /* ----------------------------------------------------------- internals */

  /**
   * Solved pairs and attention, for any subtree of the curriculum.
   *
   * Computed once per request from two grouped queries and then sliced by
   * course, module, lecture, or problem in memory. Every node of the By-problem
   * hierarchy therefore reads the same numbers, and expanding a lecture costs
   * no additional aggregate.
   */
  private async rollupFor(
    scope: TeacherClassScope,
    exercises: ScopedExercise[],
    now: Date,
  ): Promise<Rollup> {
    const userIds = scope.studentUserIds;
    const materialIds = exercises.map((exercise) => exercise.materialId);
    const [solved, candidates, attempts] = await Promise.all([
      this.repository.solvedCountsByExercise({
        userIds,
        materialIds: exercises
          .filter((exercise) => exercise.isRequired)
          .map((exercise) => exercise.materialId),
      }),
      this.repository.attentionCandidates({ userIds, materialIds, now }),
      this.repository.countedAttemptsByExercise({ userIds, materialIds }),
    ]);
    return buildRollup({ solved, attempts, candidates, now });
  }

  private summaryFrom(
    scope: TeacherClassScope,
    exercises: ScopedExercise[],
    rollup: Rollup,
  ): TeacherClassProgressSummary {
    const eligible = exercises.filter((exercise) => exercise.isRequired);
    const totals = rollup.totalsFor(exercises, scope.students.length);
    return {
      classId: scope.classId,
      className: scope.className,
      activeStudents: scope.students.length,
      solvedPairs: totals.solvedPairs,
      eligiblePairs: eligible.length * scope.students.length,
      completionPercent: totals.completionPercent,
      studentsNeedingAttention: rollup.studentsWithAttention.size,
    };
  }
}

/* -------------------------------------------------------------- helpers */

type Rollup = {
  reasons: Map<string, TeacherAttentionReason[]>;
  studentsWithAttention: Set<string>;
  solvedByMaterial: Map<string, number>;
  attemptsByMaterial: Map<
    string,
    { attempts: number; distinctStudents: number }
  >;
  attentionByMaterial: Map<string, number>;
  totalsFor(
    exercises: ScopedExercise[],
    students: number,
  ): {
    solvedPairs: number;
    eligiblePairs: number;
    completionPercent: number;
    attentionCount: number;
  };
};

function buildRollup(input: {
  solved: { materialId: string; solved: number }[];
  attempts: {
    materialId: string;
    attempts: number;
    distinctStudents: number;
  }[];
  candidates: AttentionCandidate[];
  now: Date;
}): Rollup {
  const reasons = attentionByPair(input.candidates, input.now);
  const studentsWithAttention = new Set<string>();
  const attentionByMaterial = new Map<string, number>();
  for (const candidate of input.candidates) {
    const found = reasons.get(pairKey(candidate.userId, candidate.materialId));
    if (!found?.length) continue;
    studentsWithAttention.add(candidate.userId);
    attentionByMaterial.set(
      candidate.materialId,
      (attentionByMaterial.get(candidate.materialId) ?? 0) + 1,
    );
  }

  const solvedByMaterial = new Map(
    input.solved.map((row) => [row.materialId, row.solved]),
  );
  const attemptsByMaterial = new Map(
    input.attempts.map((row) => [
      row.materialId,
      { attempts: row.attempts, distinctStudents: row.distinctStudents },
    ]),
  );

  return {
    reasons,
    studentsWithAttention,
    solvedByMaterial,
    attemptsByMaterial,
    attentionByMaterial,
    totalsFor(exercises, students) {
      // Optional exercises are shown and counted for activity but never
      // reduce completion: §6.3 refuses to penalize a student for extra work
      // nobody required of them.
      const eligible = exercises.filter((exercise) => exercise.isRequired);
      const solvedPairs = eligible.reduce(
        (total, exercise) =>
          total + (solvedByMaterial.get(exercise.materialId) ?? 0),
        0,
      );
      const eligiblePairs = eligible.length * students;
      return {
        solvedPairs,
        eligiblePairs,
        completionPercent: completionPercent({
          solved: solvedPairs,
          eligible: eligiblePairs,
        }),
        attentionCount: exercises.reduce(
          (total, exercise) =>
            total + (attentionByMaterial.get(exercise.materialId) ?? 0),
          0,
        ),
      };
    },
  };
}

function problemRow(
  exercise: ScopedExercise,
  rollup: Rollup,
  students: number,
  extra: { medianSolveSec: number | null },
): TeacherProblemProgressRow {
  const totals = rollup.attemptsByMaterial.get(exercise.materialId);
  const solved = rollup.solvedByMaterial.get(exercise.materialId) ?? 0;
  return {
    materialId: exercise.materialId,
    title: exercise.title,
    outlineNumber:
      teacherOutlineNumber({
        modulePosition: exercise.modulePosition,
        lecturePosition: exercise.lecturePosition,
        problemPosition: exercise.position,
      }) ?? "",
    difficulty: exercise.difficulty,
    isRequired: exercise.isRequired,
    studentsAttempted: totals?.distinctStudents ?? 0,
    studentsSolved: solved,
    attempts: totals?.attempts ?? 0,
    solvedPercent: completionPercent({ solved, eligible: students }),
    medianSolveSec: extra.medianSolveSec,
    attentionCount: rollup.attentionByMaterial.get(exercise.materialId) ?? 0,
  };
}

function studentRow(input: {
  student: ScopedStudent;
  eligibleCount: number;
  solved: number;
  totals?: { attempts: number; accepted: number; lastActivityAt: Date | null };
  reasons?: Map<string, TeacherAttentionReason[]>;
}): TeacherStudentProgressRow {
  const attempts = input.totals?.attempts ?? 0;
  const accepted = input.totals?.accepted ?? 0;
  const kinds = new Set<TeacherAttentionKind>();
  for (const list of input.reasons?.values() ?? []) {
    for (const reason of list) kinds.add(reason.kind);
  }

  return {
    membershipId: input.student.membershipId,
    displayName: input.student.displayName,
    solvedProblems: Math.min(input.solved, input.eligibleCount),
    eligibleProblems: input.eligibleCount,
    completionPercent: completionPercent({
      solved: input.solved,
      eligible: input.eligibleCount,
    }),
    attempts,
    acceptedPercent: acceptedRate({
      accepted,
      notAccepted: attempts - accepted,
    }),
    lastActivityAt: input.totals?.lastActivityAt?.toISOString() ?? null,
    attentionCount: input.reasons?.size ?? 0,
    attentionKinds: [...kinds],
  };
}

/** Reasons per student/exercise pair, decided by the one shared rule. */
function attentionByPair(
  candidates: AttentionCandidate[],
  now: Date,
): Map<string, TeacherAttentionReason[]> {
  const reasons = new Map<string, TeacherAttentionReason[]>();
  for (const candidate of candidates) {
    const list = attentionReasonsFor({
      status: statusOf({
        status: candidate.progressStatus ?? "NOT_STARTED",
        revisionMatches: candidate.revisionMatches,
      }),
      // The rule reads a newest-first list of verdicts; the streak the query
      // measured is exactly that list's leading failures.
      latestAccepted: candidate.latestAccepted
        ? [true]
        : Array.from({ length: Math.max(1, candidate.consecutiveFailures) }, () => false),
      lastAttemptAt: candidate.lastAttemptAt,
      latestFailedSolveSec: candidate.latestAccepted
        ? null
        : candidate.latestSolveSec,
      now,
    });
    if (list.length > 0) {
      reasons.set(pairKey(candidate.userId, candidate.materialId), list);
    }
  }
  return reasons;
}

/** The same reasons, regrouped per student and keyed by exercise. */
function attentionByStudent(
  candidates: AttentionCandidate[],
  now: Date,
): Map<string, Map<string, TeacherAttentionReason[]>> {
  const pairs = attentionByPair(candidates, now);
  const byStudent = new Map<string, Map<string, TeacherAttentionReason[]>>();
  for (const candidate of candidates) {
    const list = pairs.get(pairKey(candidate.userId, candidate.materialId));
    if (!list?.length) continue;
    const existing = byStudent.get(candidate.userId) ?? new Map();
    existing.set(candidate.materialId, list);
    byStudent.set(candidate.userId, existing);
  }
  return byStudent;
}

function pairKey(userId: string, materialId: string): string {
  return `${userId}:${materialId}`;
}

/**
 * A progress row as the page states it.
 *
 * A projection written against an older grading revision reads as not started,
 * matching what the learning workspace already shows the student. A teacher
 * and a student looking at the same problem must not disagree about whether it
 * is done.
 */
function statusOf(
  record:
    | Pick<ExerciseProgressRecord, "status" | "revisionMatches">
    | undefined,
): TeacherProgressStatus {
  if (!record || !record.revisionMatches) return "not_started";
  if (record.status === "SOLVED") return "solved";
  if (record.status === "IN_PROGRESS") return "in_progress";
  return "not_started";
}

function filterExercises(
  exercises: ScopedExercise[],
  filters: { courseIds?: string[]; moduleId?: string; lectureId?: string },
): ScopedExercise[] {
  const courses = new Set(filters.courseIds ?? []);
  return exercises.filter(
    (exercise) =>
      (courses.size === 0 || courses.has(exercise.courseId)) &&
      (!filters.moduleId || exercise.moduleId === filters.moduleId) &&
      (!filters.lectureId || exercise.lectureId === filters.lectureId),
  );
}

function matches(exercise: ScopedExercise, needle: string): boolean {
  return (
    exercise.title.toLowerCase().includes(needle) ||
    exercise.lectureTitle.toLowerCase().includes(needle) ||
    exercise.moduleTitle.toLowerCase().includes(needle)
  );
}

/**
 * A student's overall state, for the Progress status facet.
 *
 * Stated in terms of the class's required curriculum rather than any single
 * exercise: finished means every required problem is solved, and a student who
 * has attempted nothing has not started. It is a filter, never a grade.
 */
function studentStatusOf(row: TeacherStudentProgressRow): TeacherProgressStatus {
  if (row.eligibleProblems > 0 && row.solvedProblems >= row.eligibleProblems) {
    return "solved";
  }
  if (row.attempts === 0 && row.solvedProblems === 0) return "not_started";
  return "in_progress";
}

function matchesStudentFilters(
  row: TeacherStudentProgressRow,
  input: ListTeacherStudentsInput,
): boolean {
  const needle = input.q?.trim().toLowerCase();
  if (needle && !row.displayName.toLowerCase().includes(needle)) return false;
  if (input.statuses?.length && !input.statuses.includes(studentStatusOf(row))) {
    return false;
  }
  if (
    input.attention?.length &&
    !input.attention.some((kind) => row.attentionKinds.includes(kind))
  ) {
    return false;
  }
  return true;
}

function matchesExerciseFilters(input: {
  row: TeacherStudentExerciseRow;
  exercise: ScopedExercise;
  input: GetTeacherStudentDetailInput;
}): boolean {
  const { row, exercise } = input;
  const filters = input.input;
  const needle = filters.q?.trim().toLowerCase();
  if (needle && !matches(exercise, needle)) return false;
  if (filters.courseIds?.length && !filters.courseIds.includes(exercise.courseId)) {
    return false;
  }
  if (filters.moduleId && exercise.moduleId !== filters.moduleId) return false;
  if (filters.lectureId && exercise.lectureId !== filters.lectureId) return false;
  if (filters.statuses?.length && !filters.statuses.includes(row.status)) {
    return false;
  }
  if (
    filters.attention?.length &&
    !row.attentionReasons.some((reason) =>
      filters.attention!.includes(reason.kind),
    )
  ) {
    return false;
  }
  return true;
}

/**
 * The roster's order.
 *
 * The default puts students with attention first and says so in the interface:
 * it is a reading order, not a ranking, and there is no score anywhere in it.
 * Every branch ends on the membership id so two students sharing a name, a
 * completion, or a timestamp cannot swap places between two requests.
 */
function sortStudentRows(
  rows: TeacherStudentProgressRow[],
  sort: ListTeacherStudentsInput["sort"],
  direction: ListTeacherStudentsInput["direction"],
): TeacherStudentProgressRow[] {
  const factor = direction === "desc" ? -1 : 1;
  const byName = (a: TeacherStudentProgressRow, b: TeacherStudentProgressRow) =>
    a.displayName.localeCompare(b.displayName) ||
    a.membershipId.localeCompare(b.membershipId);

  const compare = (
    left: TeacherStudentProgressRow,
    right: TeacherStudentProgressRow,
  ): number => {
    switch (sort) {
      case "student":
        return factor * byName(left, right);
      case "completion":
        return (
          factor * (left.completionPercent - right.completionPercent) ||
          byName(left, right)
        );
      case "attempts":
        return factor * (left.attempts - right.attempts) || byName(left, right);
      case "accepted":
        return (
          factor * (left.acceptedPercent - right.acceptedPercent) ||
          byName(left, right)
        );
      case "lastActivity":
        return (
          factor * (timeOf(left.lastActivityAt) - timeOf(right.lastActivityAt)) ||
          byName(left, right)
        );
      case "attention":
        return (
          factor * (left.attentionCount - right.attentionCount) ||
          byName(left, right)
        );
      default:
        return (
          right.attentionCount - left.attentionCount || byName(left, right)
        );
    }
  };

  return [...rows].sort(compare);
}

/** Never is the oldest possible activity, in both directions. */
function timeOf(value: string | null): number {
  return value ? Date.parse(value) : 0;
}

function facetsFor(
  scope: TeacherClassScope,
  attention: Map<string, Map<string, TeacherAttentionReason[]>>,
): TeacherProgressFacets {
  const kinds = new Set<TeacherAttentionKind>();
  for (const perStudent of attention.values()) {
    for (const list of perStudent.values()) {
      for (const reason of list) kinds.add(reason.kind);
    }
  }
  return {
    courses: scope.courses.map((course) => ({
      value: course.id,
      label: course.title,
    })),
    statuses: ["not_started", "in_progress", "solved"],
    attention: [...kinds],
  };
}

/** Stable grouping that preserves the input's already-sorted order. */
function groupBy<T>(items: T[], key: (item: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const id = key(item);
    const existing = groups.get(id);
    if (existing) existing.push(item);
    else groups.set(id, [item]);
  }
  return [...groups.entries()];
}
