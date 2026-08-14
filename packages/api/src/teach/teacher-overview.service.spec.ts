import { academyTeacherOverviewSchema } from "@cove/shared";
import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type {
  OverviewExercise,
  TeacherOverviewAccessService,
  TeacherOverviewScope,
} from "./teacher-overview-access.service.js";
import type { TeacherOverviewRepository } from "./teacher-overview.repository.js";
import { TeacherOverviewService } from "./teacher-overview.service.js";
import type { TeacherProgressRepository } from "./teacher-progress.repository.js";

/**
 * What the overview must never get wrong.
 *
 * The cases here are the ones §14.1 names as arithmetic a teacher would act on
 * and could not check: a student in two classes counted twice, a missing score
 * printed as zero, a readiness figure two children produced, and a section that
 * went down being read as a class that did nothing.
 */

const identity = { authUserId: "auth" } as SupabaseIdentity;
const academyId = "20000000-0000-4000-8000-000000000001";
const classA = "30000000-0000-4000-8000-000000000001";
const classB = "30000000-0000-4000-8000-000000000002";
const courseId = "40000000-0000-4000-8000-000000000001";
const moduleId = "45000000-0000-4000-8000-000000000001";
const lectureId = "50000000-0000-4000-8000-000000000001";
const problemOne = "70000000-0000-4000-8000-000000000001";
const problemTwo = "70000000-0000-4000-8000-000000000002";

const ada = {
  membershipId: "80000000-0000-4000-8000-000000000001",
  userId: "90000000-0000-4000-8000-000000000001",
  displayName: "Ada",
  classIds: [classA],
};
const bo = {
  membershipId: "80000000-0000-4000-8000-000000000002",
  userId: "90000000-0000-4000-8000-000000000002",
  displayName: "Bo",
  classIds: [classA, classB],
};
const cy = {
  membershipId: "80000000-0000-4000-8000-000000000003",
  userId: "90000000-0000-4000-8000-000000000003",
  displayName: "Cy",
  classIds: [classB],
};

function exercise(overrides: Partial<OverviewExercise> = {}): OverviewExercise {
  return {
    materialId: problemOne,
    title: "Count to ten",
    position: 1,
    lectureId,
    lectureTitle: "While loops",
    lecturePosition: 3,
    moduleId,
    moduleTitle: "Repetition",
    modulePosition: 6,
    courseId,
    courseTitle: "Python 1",
    ...overrides,
  };
}

const exercises = [
  exercise(),
  exercise({ materialId: problemTwo, title: "Stop at zero", position: 2 }),
];

/** Two classes, one shared student, one course, two exercises. */
function createScope(
  overrides: Partial<TeacherOverviewScope> = {},
): TeacherOverviewScope {
  const students = [ada, bo, cy];
  return {
    actor: { userId: "teacher", academyId, membershipId: "teacher-membership" },
    timeZone: "Asia/Seoul",
    selectedClassId: null,
    selectedCourseId: null,
    selectedModuleId: null,
    selectedLectureId: null,
    selectedProblemId: null,
    curriculumLabel: null,
    classes: [
      {
        classId: classA,
        className: "Python A",
        students: [ada, bo],
        userIds: [ada.userId, bo.userId],
        membershipIds: [ada.membershipId, bo.membershipId],
        courseIds: [courseId],
        exercises,
        materialIds: [problemOne, problemTwo],
      },
      {
        classId: classB,
        className: "Python B",
        students: [bo, cy],
        userIds: [bo.userId, cy.userId],
        membershipIds: [bo.membershipId, cy.membershipId],
        courseIds: [courseId],
        exercises,
        materialIds: [problemOne, problemTwo],
      },
    ],
    classOptions: [
      { value: classA, label: "Python A" },
      { value: classB, label: "Python B" },
    ],
    courseOptions: [
      { value: courseId, label: "Python 1", classIds: [classA, classB] },
    ],
    moduleOptions: [{ value: moduleId, label: "Repetition", parentId: courseId }],
    lectureOptions: [
      { value: lectureId, label: "While loops", parentId: moduleId },
    ],
    problemOptions: [
      { value: problemOne, label: "Count to ten", parentId: lectureId },
      { value: problemTwo, label: "Stop at zero", parentId: lectureId },
    ],
    students,
    userIds: students.map((student) => student.userId),
    membershipIds: students.map((student) => student.membershipId),
    exercises,
    materialIds: [problemOne, problemTwo],
    courseIds: [courseId],
    ...overrides,
  };
}

type RepositoryStub = Partial<Record<keyof TeacherOverviewRepository, unknown>>;

function createService(input: {
  scope?: TeacherOverviewScope;
  repository?: RepositoryStub;
  candidates?: unknown[];
}) {
  const scope = input.scope ?? createScope();
  const access = {
    requireScope: vi.fn().mockResolvedValue(scope),
  } as unknown as TeacherOverviewAccessService;

  const repository = {
    activityByStudentCourse: vi.fn().mockResolvedValue([]),
    activityDaysByStudent: vi.fn().mockResolvedValue([]),
    activeCalendarDays: vi.fn().mockResolvedValue(0),
    activityTrackedSince: vi.fn().mockResolvedValue("2026-08-01"),
    workByStudent: vi.fn().mockResolvedValue([]),
    lectureProgressByStudent: vi.fn().mockResolvedValue([]),
    problemDifficulty: vi.fn().mockResolvedValue([]),
    ...input.repository,
  } as unknown as TeacherOverviewRepository;

  const progress = {
    attentionCandidates: vi.fn().mockResolvedValue(input.candidates ?? []),
  } as unknown as TeacherProgressRepository;

  return {
    service: new TeacherOverviewService(access, repository, progress),
    access,
    repository,
  };
}

describe("TeacherOverviewService", () => {
  it("returns a response the contract accepts", async () => {
    const { service } = createService({});
    const result = await service.get(identity, { academyId, range: "7d" });
    expect(() => academyTeacherOverviewSchema.parse(result)).not.toThrow();
  });

  it("counts a student in two classes once in the ledger", async () => {
    const { service } = createService({
      repository: {
        activityByStudentCourse: vi.fn().mockResolvedValue([
          {
            membershipId: bo.membershipId,
            courseId,
            activeSeconds: 7_200,
            activeDays: 4,
            lastActiveAt: new Date("2026-08-13T01:00:00Z"),
          },
        ]),
      },
    });

    const result = await service.get(identity, { academyId, range: "7d" });

    // Bo sits in both classes and holds one row of activity. Summing per class
    // would bill the same two hours twice.
    expect(result.ledger.students.total).toBe(3);
    expect(result.ledger.activeLearning.totalSeconds).toBe(7_200);
    expect(result.ledger.activeLearning.averageSecondsPerStudent).toBe(2_400);
  });

  it("reports students without a score separately rather than as zero", async () => {
    const { service } = createService({
      repository: {
        workByStudent: vi.fn().mockResolvedValue([
          {
            userId: ada.userId,
            submissions: 4,
            attemptedProblems: 2,
            solvedProblems: 1,
            scoreSum: 160,
            lastSubmissionAt: new Date("2026-08-13T01:00:00Z"),
          },
        ]),
      },
    });

    const result = await service.get(identity, { academyId, range: "7d" });

    // 160 over 2 attempted problems is 80, and the two students who attempted
    // nothing are absent from the mean rather than dragging it to 27.
    expect(result.ledger.averageScore.value).toBe(80);
    expect(result.ledger.averageScore.scoredStudents).toBe(1);
    expect(result.ledger.averageScore.withoutScore).toBe(2);
  });

  it("puts students with no score after scored ones in the score preview", async () => {
    const { service } = createService({
      repository: {
        workByStudent: vi.fn().mockResolvedValue([
          {
            userId: cy.userId,
            submissions: 1,
            attemptedProblems: 1,
            solvedProblems: 0,
            scoreSum: 20,
            lastSubmissionAt: new Date("2026-08-13T01:00:00Z"),
          },
        ]),
      },
    });

    const result = await service.get(identity, { academyId, range: "7d" });

    // Cy scored 20, which is worse than everyone — but Ada and Bo have no score
    // at all, and "no score" is not "the lowest score".
    expect(result.scorePreview[0]?.displayName).toBe("Cy");
    expect(result.scorePreview[0]?.averageScore).toBe(20);
    expect(result.scorePreview.slice(1).map((row) => row.averageScore)).toEqual([
      null,
      null,
    ]);
  });

  it("reads least active as the other end of the most-active order", async () => {
    const { service } = createService({
      repository: {
        activityByStudentCourse: vi.fn().mockResolvedValue([
          {
            membershipId: ada.membershipId,
            courseId,
            activeSeconds: 600,
            activeDays: 1,
            lastActiveAt: new Date("2026-08-13T01:00:00Z"),
          },
          {
            membershipId: bo.membershipId,
            courseId,
            activeSeconds: 9_000,
            activeDays: 5,
            lastActiveAt: new Date("2026-08-13T02:00:00Z"),
          },
        ]),
      },
    });

    const result = await service.get(identity, { academyId, range: "7d" });

    expect(result.mostActive[0]?.displayName).toBe("Bo");
    expect(result.leastActive[0]?.activeSeconds).toBe(0);
    expect(result.leastActive.at(-1)?.displayName).toBe("Bo");
  });

  it("flags a student with no signal at all as inactive", async () => {
    const { service } = createService({});
    const result = await service.get(identity, { academyId, range: "7d" });

    // Nobody submitted and nobody was active, so every student is on the queue
    // — the queue is capped at five, and the count above it is not.
    expect(result.queueTotal).toBe(3);
    expect(result.queue).toHaveLength(3);
    expect(result.queue.every((row) => row.reasons[0].kind === "inactive")).toBe(
      true,
    );
  });

  it("omits a lecture too few students have attempted", async () => {
    const { service } = createService({
      repository: {
        lectureProgressByStudent: vi.fn().mockResolvedValue([
          { lectureId, userId: ada.userId, solved: 1, attempted: 2 },
          { lectureId, userId: bo.userId, solved: 0, attempted: 1 },
        ]),
      },
    });

    const result = await service.get(identity, { academyId, range: "7d" });

    // Two attempters is below the comparison floor. §6.8 asks for an
    // explanatory state, not a readiness figure two children produced.
    expect(result.readiness).toEqual([]);
  });

  it("does not let one student's retries make a problem look hard", async () => {
    const { service } = createService({
      repository: {
        problemDifficulty: vi.fn().mockResolvedValue([
          {
            materialId: problemOne,
            attemptingStudents: 3,
            solvedStudents: 0,
            submissions: 3,
          },
          {
            materialId: problemTwo,
            attemptingStudents: 3,
            solvedStudents: 0,
            submissions: 40,
          },
        ]),
      },
    });

    const result = await service.get(identity, { academyId, range: "7d" });

    // Equal solve rates and equal attempters: volume breaks the tie, but it
    // never moved the rate that decided the section in the first place.
    expect(result.problems.map((row) => row.solveRate)).toEqual([0, 0]);
    expect(result.problems[0]?.materialId).toBe(problemTwo);
  });

  it("names a failed aggregate rather than reporting it as an empty class", async () => {
    const { service } = createService({
      repository: {
        problemDifficulty: vi.fn().mockRejectedValue(new Error("timeout")),
        workByStudent: vi.fn().mockResolvedValue([
          {
            userId: ada.userId,
            submissions: 4,
            attemptedProblems: 2,
            solvedProblems: 2,
            scoreSum: 200,
            lastSubmissionAt: new Date("2026-08-13T01:00:00Z"),
          },
        ]),
      },
    });

    const result = await service.get(identity, { academyId, range: "7d" });

    expect(result.unavailable).toEqual(["problems"]);
    // The rest of the page is still true, which is the whole point of settling
    // each aggregate on its own.
    expect(result.ledger.averageScore.value).toBe(100);
  });

  it("renders an empty roster as a scope with no students, not as zeros", async () => {
    const { service } = createService({
      scope: createScope({
        students: [],
        userIds: [],
        membershipIds: [],
        classes: [],
      }),
    });

    const result = await service.get(identity, { academyId, range: "7d" });

    expect(result.ledger.students.total).toBe(0);
    expect(result.ledger.averageScore.value).toBeNull();
    expect(result.queue).toEqual([]);
    expect(() => academyTeacherOverviewSchema.parse(result)).not.toThrow();
  });
});
