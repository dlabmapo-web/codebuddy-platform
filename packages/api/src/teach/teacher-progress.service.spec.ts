import {
  teacherStudentsResultSchema,
  teacherSubmissionReviewSchema,
} from "@cove/shared";
import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type {
  ScopedExercise,
  TeacherClassScope,
  TeacherProgressAccessService,
} from "./teacher-progress-access.service.js";
import type { TeacherProgressRepository } from "./teacher-progress.repository.js";
import { TeacherProgressService } from "./teacher-progress.service.js";

const identity = { authUserId: "auth" } as SupabaseIdentity;
const academyId = "20000000-0000-4000-8000-000000000001";
const classId = "30000000-0000-4000-8000-000000000001";
const courseId = "40000000-0000-4000-8000-000000000001";
const lectureId = "50000000-0000-4000-8000-000000000001";
const moduleId = "60000000-0000-4000-8000-000000000001";
const required = "70000000-0000-4000-8000-000000000001";
const optional = "70000000-0000-4000-8000-000000000002";
const alice = {
  membershipId: "80000000-0000-4000-8000-000000000001",
  userId: "90000000-0000-4000-8000-000000000001",
  displayName: "Alice",
};
const bob = {
  membershipId: "80000000-0000-4000-8000-000000000002",
  userId: "90000000-0000-4000-8000-000000000002",
  displayName: "Bob",
};

function exercise(overrides: Partial<ScopedExercise> = {}): ScopedExercise {
  return {
    materialId: required,
    title: "Sum two numbers",
    position: 1,
    isRequired: true,
    difficulty: "EASY",
    gradingRevision: 1,
    lectureId,
    lectureTitle: "Adding numbers",
    lectureDescription: "Combine two numbers.",
    lecturePosition: 1,
    moduleId,
    moduleTitle: "Arithmetic",
    modulePosition: 2,
    courseId,
    courseTitle: "Basics",
    ...overrides,
  };
}

const scope: TeacherClassScope = {
  actor: { userId: "teacher", academyId, membershipId: "m" },
  classId,
  className: "Level 1",
  students: [alice, bob],
  studentUserIds: [alice.userId, bob.userId],
  courses: [{ id: courseId, title: "Basics", description: "" }],
  exercises: [
    exercise(),
    exercise({
      materialId: optional,
      title: "Extra practice",
      position: 2,
      isRequired: false,
    }),
  ],
};

type RepositoryStub = Partial<Record<keyof TeacherProgressRepository, unknown>>;

function createService(repository: RepositoryStub = {}) {
  const access = {
    requireClassScope: vi.fn(async () => scope),
    requireStudent: vi.fn((_scope: TeacherClassScope, membershipId: string) => {
      const student = scope.students.find(
        (candidate) => candidate.membershipId === membershipId,
      );
      if (!student) throw new Error("not found");
      return student;
    }),
    requireExercise: vi.fn((_scope: TeacherClassScope, materialId: string) => {
      const found = scope.exercises.find(
        (candidate) => candidate.materialId === materialId,
      );
      if (!found) throw new Error("not found");
      return found;
    }),
  } as unknown as TeacherProgressAccessService;

  const stub = {
    countedAttemptsByStudent: vi.fn(async () => []),
    countedAttemptsByExercise: vi.fn(async () => []),
    solvedCountsByStudent: vi.fn(async () => []),
    solvedCountsByExercise: vi.fn(async () => []),
    medianSolveByExercise: vi.fn(async () => []),
    attentionCandidates: vi.fn(async () => []),
    progressFor: vi.fn(async () => []),
    latestSolveByStudent: vi.fn(async () => []),
    countAttempts: vi.fn(async () => 0),
    listAttempts: vi.fn(async () => []),
    findSubmissionForReview: vi.fn(async () => null),
    findStatement: vi.fn(async () => null),
    ...repository,
  } as unknown as TeacherProgressRepository;

  return {
    service: new TeacherProgressService(access, stub),
    repository: stub as unknown as Record<string, ReturnType<typeof vi.fn>>,
  };
}

describe("listStudents", () => {
  it("counts only required exercises in completion", async () => {
    const { service } = createService({
      solvedCountsByStudent: vi.fn(async () => [
        { userId: alice.userId, solved: 1 },
      ]),
    });
    const result = await service.listStudents(identity, { academyId, classId });

    const row = result.rows.find((item) => item.membershipId === alice.membershipId);
    // One required exercise in the class, and the optional one never enters
    // the denominator however it is going.
    expect(row).toMatchObject({
      eligibleProblems: 1,
      solvedProblems: 1,
      completionPercent: 100,
    });
    expect(result.summary).toMatchObject({
      activeStudents: 2,
      eligiblePairs: 2,
      solvedPairs: 1,
      completionPercent: 50,
    });
  });

  it("excludes non-final and judge-fault attempts from the accepted rate", async () => {
    // The repository only ever returns counted attempts, so the rate is
    // measured against what a student actually submitted for grading.
    const { service } = createService({
      countedAttemptsByStudent: vi.fn(async () => [
        {
          userId: alice.userId,
          attempts: 4,
          accepted: 1,
          lastActivityAt: new Date("2026-08-11T00:00:00Z"),
        },
      ]),
    });
    const result = await service.listStudents(identity, { academyId, classId });
    expect(
      result.rows.find((row) => row.membershipId === alice.membershipId),
    ).toMatchObject({ attempts: 4, acceptedPercent: 25 });
  });

  it("asks the database only for the exercises the course facet keeps", async () => {
    const { service, repository } = createService();
    await service.listStudents(identity, {
      academyId,
      classId,
      courseIds: ["c0000000-0000-4000-8000-000000000009"],
    });
    expect(repository.countedAttemptsByStudent).toHaveBeenCalledWith(
      expect.objectContaining({ materialIds: [] }),
    );
  });

  it("puts students with attention first without scoring them", async () => {
    const { service } = createService({
      attentionCandidates: vi.fn(async () => [
        {
          userId: bob.userId,
          materialId: required,
          consecutiveFailures: 4,
          lastAttemptAt: new Date(),
          latestSolveSec: null,
          latestAccepted: false,
          progressStatus: "IN_PROGRESS",
          revisionMatches: true,
        },
      ]),
    });
    const result = await service.listStudents(identity, { academyId, classId });

    expect(result.rows[0]?.displayName).toBe("Bob");
    expect(result.rows[0]?.attentionKinds).toEqual(["repeated_failures"]);
    expect(result.summary.studentsNeedingAttention).toBe(1);
    // Alphabetical order otherwise, so an untroubled class reads as a roster.
    expect(result.rows[1]?.displayName).toBe("Alice");
  });

  it("suppresses every reason once the exercise is solved", async () => {
    const { service } = createService({
      attentionCandidates: vi.fn(async () => [
        {
          userId: bob.userId,
          materialId: required,
          consecutiveFailures: 9,
          lastAttemptAt: new Date("2020-01-01T00:00:00Z"),
          latestSolveSec: 9_000,
          latestAccepted: true,
          progressStatus: "SOLVED",
          revisionMatches: true,
        },
      ]),
    });
    const result = await service.listStudents(identity, { academyId, classId });
    expect(result.summary.studentsNeedingAttention).toBe(0);
  });

  it("treats a stale grading revision as not started", async () => {
    const { service } = createService({
      // The progress row says SOLVED, but against an older version of the
      // problem — which is exactly what the student's own workspace shows as
      // unsolved.
      progressFor: vi.fn(async () => [
        {
          userId: alice.userId,
          materialId: required,
          status: "SOLVED",
          bestScore: 100,
          lastAttemptAt: new Date(),
          revisionMatches: false,
        },
      ]),
    });
    const detail = await service.getStudentDetail(identity, {
      academyId,
      classId,
      membershipId: alice.membershipId,
    });
    const row = detail.rows.find((item) => item.materialId === required);
    expect(row).toMatchObject({ status: "not_started", bestScore: 0 });
  });

  it("returns a result the strict contract accepts", async () => {
    const { service } = createService();
    const result = await service.listStudents(identity, { academyId, classId });
    expect(teacherStudentsResultSchema.safeParse(result).success).toBe(true);
  });

  it("filters by attention kind without changing the class facts", async () => {
    const { service } = createService({
      attentionCandidates: vi.fn(async () => [
        {
          userId: bob.userId,
          materialId: required,
          consecutiveFailures: 0,
          lastAttemptAt: new Date("2020-01-01T00:00:00Z"),
          latestSolveSec: null,
          latestAccepted: false,
          progressStatus: "IN_PROGRESS",
          revisionMatches: true,
        },
      ]),
    });
    const result = await service.listStudents(identity, {
      academyId,
      classId,
      attention: ["stalled"],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.displayName).toBe("Bob");
    expect(result.summary.activeStudents).toBe(2);
  });
});

describe("by problem", () => {
  it("reports a problem's solved rate against the whole class", async () => {
    const { service } = createService({
      solvedCountsByExercise: vi.fn(async () => [
        { materialId: required, solved: 1 },
      ]),
      countedAttemptsByExercise: vi.fn(async () => [
        {
          materialId: required,
          attempts: 7,
          accepted: 1,
          distinctStudents: 2,
          lastActivityAt: new Date(),
        },
      ]),
      medianSolveByExercise: vi.fn(async () => [
        { materialId: required, medianSolveSec: 420 },
      ]),
    });
    const result = await service.listLectureProblems(identity, {
      academyId,
      classId,
      lectureId,
    });

    expect(result.rows[0]).toMatchObject({
      studentsAttempted: 2,
      studentsSolved: 1,
      attempts: 7,
      solvedPercent: 50,
      medianSolveSec: 420,
      outlineNumber: "2-1-1",
    });
  });

  it("renders an unmeasured median as an absence, never a zero", async () => {
    const { service } = createService();
    const result = await service.listLectureProblems(identity, {
      academyId,
      classId,
      lectureId,
    });
    expect(result.rows[0]?.medianSolveSec).toBeNull();
  });

  it("keeps the lecture's own description beside its title", async () => {
    const { service } = createService();
    const result = await service.listLectureProblems(identity, {
      academyId,
      classId,
      lectureId,
    });
    expect(result.lecture).toMatchObject({
      title: "Adding numbers",
      description: "Combine two numbers.",
      problemCount: 2,
    });
  });

  it("orders a problem's students by attention, then unsolved", async () => {
    const { service } = createService({
      progressFor: vi.fn(async () => [
        {
          userId: alice.userId,
          materialId: required,
          status: "SOLVED",
          bestScore: 100,
          lastAttemptAt: new Date(),
          revisionMatches: true,
        },
      ]),
    });
    const result = await service.listProblemStudents(identity, {
      academyId,
      classId,
      materialId: required,
    });
    expect(result.rows.map((row) => row.displayName)).toEqual(["Bob", "Alice"]);
    expect(result.rows[1]?.status).toBe("solved");
  });
});

describe("getSubmissionReview", () => {
  const submission = {
    id: "a0000000-0000-4000-8000-000000000001",
    materialId: required,
    sourceMaterialId: required,
    status: "FAILED",
    score: 50,
    passedCount: 1,
    totalCount: 2,
    runtimeMs: 12,
    solveElapsedSec: 300,
    createdAt: new Date("2026-08-12T09:00:00Z"),
    code: "print(1)\n",
    language: "PYTHON",
    problemTitle: "Sum two numbers",
    courseTitle: "Basics",
    moduleTitle: "Arithmetic",
    lectureTitle: "Adding numbers",
    modulePosition: 2,
    lecturePosition: 1,
    problemPosition: 1,
    cases: [
      {
        position: 1,
        isSample: true,
        outcome: "PASSED",
        runtimeMs: 5,
        actualOutput: "3",
      },
      {
        position: 2,
        isSample: false,
        outcome: "WRONG_OUTPUT",
        runtimeMs: 6,
        actualOutput: "SECRET",
      },
    ],
    gradingCases: [{ position: 1, input: "1\n2\n", expectedOutput: "3" }],
  };

  it("returns sample case data and only an outcome for a hidden case", async () => {
    const { service } = createService({
      findSubmissionForReview: vi.fn(async () => submission),
      findStatement: vi.fn(async () => "<p>Add two numbers</p>"),
    });
    const review = await service.getSubmissionReview(identity, {
      academyId,
      classId,
      membershipId: alice.membershipId,
      submissionId: submission.id,
    });

    expect(review.cases[0]).toMatchObject({
      isSample: true,
      input: "1\n2\n",
      expectedOutput: "3",
      actualOutput: "3",
    });
    // The hidden case keeps its position and verdict and loses everything a
    // student could reconstruct an expectation from — including the actual
    // output the row happens to store.
    expect(review.cases[1]).toMatchObject({
      isSample: false,
      outcome: "WRONG_OUTPUT",
      input: null,
      expectedOutput: null,
      actualOutput: null,
    });
    expect(review).toMatchObject({ hiddenPassed: 0, hiddenTotal: 1 });
    expect(teacherSubmissionReviewSchema.safeParse(review).success).toBe(true);
  });

  it("refuses an attempt whose frozen exercise no longer matches its relation", async () => {
    const { service } = createService({
      findSubmissionForReview: vi.fn(async () => ({
        ...submission,
        sourceMaterialId: optional,
      })),
    });
    await expect(
      service.getSubmissionReview(identity, {
        academyId,
        classId,
        membershipId: alice.membershipId,
        submissionId: submission.id,
      }),
    ).rejects.toMatchObject({ code: "TEACHER_PROGRESS_NOT_FOUND" });
  });

  it("stays reviewable when the current statement is gone", async () => {
    const { service } = createService({
      findSubmissionForReview: vi.fn(async () => submission),
    });
    const review = await service.getSubmissionReview(identity, {
      academyId,
      classId,
      membershipId: alice.membershipId,
      submissionId: submission.id,
    });
    expect(review.statement).toBeNull();
    expect(review.code).toBe("print(1)\n");
  });

  it("asks only for exercises this class is taught", async () => {
    const { service, repository } = createService({
      findSubmissionForReview: vi.fn(async () => submission),
    });
    await service.getSubmissionReview(identity, {
      academyId,
      classId,
      membershipId: alice.membershipId,
      submissionId: submission.id,
    });
    expect(repository.findSubmissionForReview).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: alice.userId,
        materialIds: [required, optional],
      }),
    );
  });
});

describe("listAttempts", () => {
  it("is the one history contract both views read", async () => {
    const { service } = createService({
      countAttempts: vi.fn(async () => 1),
      listAttempts: vi.fn(async () => [
        {
          id: "a0000000-0000-4000-8000-000000000002",
          status: "PASSED",
          score: 100,
          passedCount: 2,
          totalCount: 2,
          runtimeMs: 8,
          solveElapsedSec: 120,
          createdAt: new Date("2026-08-12T09:00:00Z"),
        },
      ]),
    });
    const result = await service.listAttempts(identity, {
      academyId,
      classId,
      membershipId: alice.membershipId,
      materialId: required,
    });

    expect(result.studentName).toBe("Alice");
    expect(result.problemTitle).toBe("Sum two numbers");
    expect(result.attempts[0]).toMatchObject({ accepted: true, score: 100 });
    expect(result.pagination).toMatchObject({ page: 1, totalCount: 1 });
    // A row has nowhere to put code: opening it is a separate operation.
    expect(result.attempts[0]).not.toHaveProperty("code");
  });
});
