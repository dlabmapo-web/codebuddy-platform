import { describe, expect, it } from "vitest";
import { StudentOverviewService } from "./student-overview.service.js";
import type { StudentOverviewScopeInternal } from "./student-overview-access.service.js";
import type { ProgressByMaterial } from "./curriculum-outline.service.js";

function fixture(practiceOnly: boolean) {
  return {
    courses: [{
      id: "course", title: "PDF course", description: "",
      modules: [{ lectures: [{ materials: [
        { id: "practice", programmingExercise: { submissionPolicy: "PRACTICE_ONLY" } },
        ...(!practiceOnly ? [{ id: "graded", programmingExercise: { submissionPolicy: "AUTOMATIC" } }] : []),
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
