import { describe, expect, it } from "vitest";

import {
  flattenNavigatorExercises,
  mergeNavigatorProgress,
  navigatorPathFor,
  toNavigatorContext,
  workspaceNavigatorContextSchema,
  type LearnCourseOutline,
} from "./learn.js";

/** Stable uuids from readable names, so a failure names the row it is about. */
const ids = new Map<string, string>();
function id(seed: string): string {
  const existing = ids.get(seed);
  if (existing) return existing;
  const value = `00000000-0000-4000-8000-${String(ids.size + 1).padStart(12, "0")}`;
  ids.set(seed, value);
  return value;
}

function exercise(
  seed: string,
  position: number,
  overrides: Partial<{ status: "NOT_STARTED" | "IN_PROGRESS" | "SOLVED"; bestScore: number }> = {},
) {
  return {
    materialId: id(seed),
    title: `Exercise ${seed}`,
    position,
    difficulty: "EASY" as const,
    status: overrides.status ?? ("NOT_STARTED" as const),
    bestScore: overrides.bestScore ?? 0,
  };
}

const outline: LearnCourseOutline = {
  course: { id: id("c1"), title: "Course", description: "" },
  progress: { total: 4, started: 2, solved: 1 },
  modules: [
    // Deliberately out of order: canonical order is a property of the helper,
    // not of however the caller happened to hold the rows.
    {
      id: id("m2"),
      title: "Module two",
      description: "",
      position: 2,
      lectures: [
        {
          id: id("l3"),
          title: "Lecture three",
          description: "",
          position: 1,
          exercises: [exercise("e4", 1)],
        },
      ],
    },
    {
      id: id("m1"),
      title: "Module one",
      description: "",
      position: 1,
      lectures: [
        {
          id: id("l2"),
          title: "Lecture two",
          description: "",
          position: 2,
          exercises: [exercise("e3", 1, { status: "SOLVED", bestScore: 100 })],
        },
        {
          id: id("l1"),
          title: "Lecture one",
          description: "",
          position: 1,
          exercises: [
            exercise("e2", 2, { status: "IN_PROGRESS", bestScore: 60 }),
            exercise("e1", 1),
          ],
        },
      ],
    },
  ],
};

describe("toNavigatorContext", () => {
  it("produces a payload the contract accepts", () => {
    const context = toNavigatorContext(outline, id("e1"));
    expect(workspaceNavigatorContextSchema.safeParse(context).success).toBe(true);
  });

  it("positions the path at the requested exercise", () => {
    const context = toNavigatorContext(outline, id("e3"));
    expect(context?.path).toEqual({
      course: { id: id("c1"), title: "Course" },
      module: { id: id("m1"), title: "Module one" },
      lecture: { id: id("l2"), title: "Lecture two" },
      exercise: { materialId: id("e3"), title: "Exercise e3" },
    });
  });

  it("refuses a material that is not a visible exercise of this course", () => {
    expect(toNavigatorContext(outline, id("ff"))).toBeNull();
    expect(navigatorPathFor(outline, id("ff"))).toBeNull();
  });

  it("carries the course progress the outline reported", () => {
    expect(toNavigatorContext(outline, id("e1"))?.course.progress).toEqual({
      total: 4,
      started: 2,
      solved: 1,
    });
  });

  it("reports no best score for an exercise nobody has opened", () => {
    const rows = flattenNavigatorExercises(toNavigatorContext(outline, id("e1"))!);
    expect(rows.map((row) => row.bestScore)).toEqual([null, 60, 100, null]);
  });
});

describe("flattenNavigatorExercises", () => {
  const context = toNavigatorContext(outline, id("e1"))!;

  it("walks modules, then lectures, then exercises by position", () => {
    expect(flattenNavigatorExercises(context).map((row) => row.materialId))
      .toEqual([id("e1"), id("e2"), id("e3"), id("e4")]);
  });

  it("numbers rows across the whole course rather than per lecture", () => {
    expect(flattenNavigatorExercises(context).map((row) => row.number))
      .toEqual([1, 2, 3, 4]);
  });

  it("names the branch each row belongs to", () => {
    const [first, , third] = flattenNavigatorExercises(context);
    expect([first.moduleId, first.lectureId]).toEqual([id("m1"), id("l1")]);
    expect([third.moduleId, third.lectureId]).toEqual([id("m1"), id("l2")]);
  });

  it("maps the three progress states the rows render", () => {
    expect(flattenNavigatorExercises(context).map((row) => row.status)).toEqual([
      "NOT_STARTED",
      "IN_PROGRESS",
      "SOLVED",
      "NOT_STARTED",
    ]);
  });
});

describe("mergeNavigatorProgress", () => {
  const current = toNavigatorContext(outline, id("e1"))!;

  it("takes the incoming statuses", () => {
    const solved = structuredClone(outline);
    // The second entry of the first lecture, which is exercise `e1`.
    solved.modules[1]!.lectures[1]!.exercises[1]!.status = "SOLVED";
    solved.modules[1]!.lectures[1]!.exercises[1]!.bestScore = 100;
    const merged = mergeNavigatorProgress(
      current,
      toNavigatorContext(solved, id("e1"))!,
    );

    const row = flattenNavigatorExercises(merged).find(
      (candidate) => candidate.materialId === id("e1"),
    );
    expect(row).toMatchObject({ status: "SOLVED", bestScore: 100 });
  });

  it("replaces outright when the course itself changed", () => {
    const other = structuredClone(outline);
    other.course.id = id("c2");
    const incoming = toNavigatorContext(other, id("e1"))!;
    expect(mergeNavigatorProgress(current, incoming)).toBe(incoming);
  });
});
