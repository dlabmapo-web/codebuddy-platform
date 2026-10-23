import { describe, expect, it, vi } from "vitest";
import { StudentOverviewService } from "./student-overview.service.js";
import type { StudentOverviewScopeInternal } from "./student-overview-access.service.js";
import type { ProgressByMaterial } from "./curriculum-outline.service.js";

function fixture(practiceOnly: boolean) {
  return {
    courses: [{
      id: "course", title: "PDF course", description: "",
      modules: [{ lectures: [{ materials: [
        { id: "practice", type: 'PROGRAMMING_EXERCISE', programmingExercise: { submissionPolicy: "PRACTICE_ONLY" } },
        ...(!practiceOnly ? [{ id: "graded", type: 'PROGRAMMING_EXERCISE', programmingExercise: { submissionPolicy: "AUTOMATIC" } }] : []),
      ] }] }],
    }],
    exercises: [
      { materialId: "practice", courseId: "course", lectureTitle: "PDF lesson", title: "Practice" },
      ...(!practiceOnly ? [{ materialId: "graded", courseId: "course", lectureTitle: "PDF lesson", title: "Graded" }] : []),
    ],
  } as unknown as StudentOverviewScopeInternal;
}

describe("student overview course progress", () => {
  const service = new StudentOverviewService({} as never, {} as never, {} as never, {} as never);

  it("loads written activity completion for course cards while keeping code attempt totals separate", async () => {
    const scope = fixture(false);
    scope.courses[0]!.modules[0]!.lectures[0]!.materials.push({
      id: "written", manualMaterial: { includeInScore: true, maximumHundredths: 10000 },
    } as never);
    Object.assign(scope, {
      userId: "student", academyId: "academy", academyName: "Demo", membershipId: "membership",
      displayName: "Student", timeZone: "Asia/Seoul", classes: [], courseIds: ["course"],
      materialIds: ["practice", "graded"], exerciseById: new Map(), standingEnabled: false, standingClass: null,
    });
    const statusByMaterial = vi.fn(async (_userId: string, ids: string[]) => new Map(
      ids.filter(id => id !== "practice").map(id => [id, { status: "SOLVED" as const, bestScore: 100 }]),
    ));
    const repository = {
      work: vi.fn(async () => ({ submissions: 2, passed: 1, attemptedProblems: 1, solvedProblems: 1, scoreSum: 100 })),
      activityByDay: vi.fn(async () => []), submissionsByDay: vi.fn(async () => []),
      activityTrackedSince: vi.fn(async () => null), recentRecords: vi.fn(async () => []),
    };
    const overview = new StudentOverviewService(
      { requireScope: async () => scope } as never, repository as never,
      { exerciseDraft: { findMany: async () => [] } } as never, { statusByMaterial } as never,
    );
    const result = await overview.get({ authUserId: "auth" } as never, { academyId: "academy" });
    expect(statusByMaterial).toHaveBeenCalledWith("student", ["practice", "graded", "written"]);
    expect(result.courses[0]).toMatchObject({ total: 2, solved: 2, percent: 100 });
    expect(repository.work).toHaveBeenCalledWith(expect.objectContaining({ materialIds: ["practice", "graded"] }));
    expect(result.ledger.accepted).toMatchObject({ attempts: 2, passed: 1 });
    expect(result.unavailable).toEqual([]);
  });

  it("uses catalog grading totals while retaining navigable practice", () => {
    const statuses: ProgressByMaterial = new Map([
      ["practice", { status: "IN_PROGRESS", bestScore: 0 }],
      ["graded", { status: "SOLVED", bestScore: 100 }],
    ]);
    expect(service["buildCourses"](fixture(false), statuses)[0]).toMatchObject({
      total: 1, solved: 1, started: 0, percent: 100, nextMaterialId: "practice",
    });
  });

  it("keeps an all-practice course without claiming a failed graded problem", () => {
    expect(service["buildCourses"](fixture(true), new Map([
      ["practice", { status: "IN_PROGRESS", bestScore: 0 }],
    ]))[0]).toMatchObject({ total: 0, solved: 0, started: 0, percent: 0, nextMaterialId: "practice" });
  });
});
