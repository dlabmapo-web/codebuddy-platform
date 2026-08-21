import { describe, expect, it } from "vitest";

import {
  MIN_STUDENTS_FOR_CALIBRATION,
  blockerKindOrder,
  buildBlockerGroups,
  calibrationDistance,
  calibrationVerdictFor,
  classNeedsDecision,
  compareBlockerRows,
  compareClassRoster,
  compareCourseReach,
  courseCompletion,
  curriculumAuditActions,
  findDropOff,
  hiddenAncestor,
  isCurriculumAuditAction,
  isEffectivelyVisible,
  isGrind,
  submissionsPerSolver,
  type BlockerRow,
  type ClassRosterRow,
  type CourseReachRow,
} from "./team-lead-overview.js";

const chain = (
  course: boolean,
  module: boolean,
  lecture: boolean,
  material: boolean,
) => ({ course, module, lecture, material });

describe("isEffectivelyVisible", () => {
  it("requires every ancestor and the material itself", () => {
    expect(isEffectivelyVisible(chain(true, true, true, true))).toBe(true);
  });

  it("is false when any single link in the chain is hidden", () => {
    expect(isEffectivelyVisible(chain(false, true, true, true))).toBe(false);
    expect(isEffectivelyVisible(chain(true, false, true, true))).toBe(false);
    expect(isEffectivelyVisible(chain(true, true, false, true))).toBe(false);
    expect(isEffectivelyVisible(chain(true, true, true, false))).toBe(false);
  });

  it("agrees with hiddenAncestor across all sixteen combinations", () => {
    for (let bits = 0; bits < 16; bits += 1) {
      const value = chain(
        Boolean(bits & 1),
        Boolean(bits & 2),
        Boolean(bits & 4),
        Boolean(bits & 8),
      );
      // Buried is exactly "set visible, and still unreachable".
      const buried = value.material && !isEffectivelyVisible(value);
      expect(hiddenAncestor(value) !== null).toBe(buried);
    }
  });
});

describe("hiddenAncestor", () => {
  it("names the nearest ancestor, because that is the edit that helps", () => {
    expect(hiddenAncestor(chain(false, false, false, true))).toBe("lecture");
    expect(hiddenAncestor(chain(false, false, true, true))).toBe("module");
    expect(hiddenAncestor(chain(false, true, true, true))).toBe("course");
  });

  it("stays silent about an exercise its author chose to hide", () => {
    expect(hiddenAncestor(chain(false, false, false, false))).toBeNull();
  });
});

describe("buildBlockerGroups", () => {
  const row = (id: string, students: number, label = id): BlockerRow => ({
    id,
    label,
    context: null,
    studentsAffected: students,
    target: { courseId: null, lectureId: null, materialId: null, classId: null },
  });

  it("renders groups in declared order, not by size", () => {
    const groups = buildBlockerGroups([
      { kind: "class_without_course", total: 9, studentsAffected: 9, rows: [row("a", 1)] },
      { kind: "hidden_course_assigned", total: 1, studentsAffected: 4, rows: [row("b", 4)] },
    ]);
    expect(groups.map((group) => group.kind)).toEqual([
      "hidden_course_assigned",
      "class_without_course",
    ]);
  });

  it("drops empty groups so a healthy curriculum reads as one answer", () => {
    const groups = buildBlockerGroups([
      { kind: "ungradeable_exercise", total: 0, studentsAffected: 0, rows: [] },
    ]);
    expect(groups).toEqual([]);
  });

  it("keeps the caller's distinct student count rather than summing rows", () => {
    const groups = buildBlockerGroups([
      {
        kind: "ungradeable_exercise",
        total: 3,
        // One class behind three defective exercises is one affected class.
        studentsAffected: 12,
        rows: [row("a", 12), row("b", 12), row("c", 12)],
      },
    ]);
    expect(groups[0].studentsAffected).toBe(12);
  });

  it("bounds the preview at five while keeping the true total", () => {
    const groups = buildBlockerGroups([
      {
        kind: "unfinished_exercise",
        total: 40,
        studentsAffected: 7,
        rows: Array.from({ length: 40 }, (_, index) => row(`r${index}`, index)),
      },
    ]);
    expect(groups[0].preview).toHaveLength(5);
    expect(groups[0].total).toBe(40);
  });

  it("orders rows by students affected, then label, then id", () => {
    const rows = [row("z", 1, "Beta"), row("a", 1, "Alpha"), row("m", 9, "Zulu")];
    expect([...rows].sort(compareBlockerRows).map((entry) => entry.label)).toEqual([
      "Zulu",
      "Alpha",
      "Beta",
    ]);
  });

  it("covers every declared kind", () => {
    expect(new Set(blockerKindOrder).size).toBe(blockerKindOrder.length);
    expect(blockerKindOrder[0]).toBe("hidden_course_assigned");
  });
});

describe("calibrationVerdictFor", () => {
  const attempting = MIN_STUDENTS_FOR_CALIBRATION;

  it("flags an EASY problem students cannot solve", () => {
    expect(
      calibrationVerdictFor({
        difficulty: "EASY",
        solveRate: 30,
        attemptingStudents: attempting,
      }),
    ).toBe("harder_than_labelled");
  });

  it("flags a HARD problem nearly everybody solves", () => {
    expect(
      calibrationVerdictFor({
        difficulty: "HARD",
        solveRate: 95,
        attemptingStudents: attempting,
      }),
    ).toBe("easier_than_labelled");
  });

  it("stays silent exactly at each band edge", () => {
    expect(
      calibrationVerdictFor({ difficulty: "EASY", solveRate: 70, attemptingStudents: attempting }),
    ).toBeNull();
    expect(
      calibrationVerdictFor({ difficulty: "HARD", solveRate: 60, attemptingStudents: attempting }),
    ).toBeNull();
    expect(
      calibrationVerdictFor({ difficulty: "MEDIUM", solveRate: 40, attemptingStudents: attempting }),
    ).toBeNull();
    expect(
      calibrationVerdictFor({ difficulty: "MEDIUM", solveRate: 85, attemptingStudents: attempting }),
    ).toBeNull();
  });

  it("says nothing at all below the evidence floor", () => {
    expect(
      calibrationVerdictFor({
        difficulty: "EASY",
        solveRate: 0,
        attemptingStudents: MIN_STUDENTS_FOR_CALIBRATION - 1,
      }),
    ).toBeNull();
  });

  it("measures distance from the band the label allows, in both directions", () => {
    expect(calibrationDistance({ difficulty: "EASY", solveRate: 50 })).toBe(20);
    expect(calibrationDistance({ difficulty: "HARD", solveRate: 90 })).toBe(30);
    expect(calibrationDistance({ difficulty: "MEDIUM", solveRate: 60 })).toBe(0);
  });
});

describe("submissionsPerSolver", () => {
  it("reports attempts per solver to one decimal", () => {
    expect(submissionsPerSolver({ submissions: 31, solvedStudents: 10 })).toBe(3.1);
  });

  it("refuses to divide by too few solvers", () => {
    expect(submissionsPerSolver({ submissions: 40, solvedStudents: 1 })).toBeNull();
  });
});

describe("isGrind", () => {
  it("needs both a high ratio and a high solve rate", () => {
    expect(isGrind({ ratio: 8, solveRate: 80 })).toBe(true);
  });

  it("ignores a hard problem, which the difficult-problems panel already reports", () => {
    expect(isGrind({ ratio: 12, solveRate: 20 })).toBe(false);
  });

  it("ignores an easy problem solved on the first try", () => {
    expect(isGrind({ ratio: 1.2, solveRate: 95 })).toBe(false);
  });

  it("is never true without a measurable ratio", () => {
    expect(isGrind({ ratio: null, solveRate: 100 })).toBe(false);
  });
});

describe("findDropOff", () => {
  const lecture = (id: string, readiness: number | null) => ({
    lectureId: id,
    lectureTitle: id,
    outlineNumber: null,
    readiness,
  });

  it("finds the first fall through the floor, in teaching order", () => {
    const found = findDropOff([
      lecture("1", 90),
      lecture("2", 80),
      lecture("3", 20),
      lecture("4", 10),
    ]);
    expect(found?.lectureId).toBe("3");
    expect(found?.previousReadiness).toBe(80);
  });

  it("returns null for a course that never falls", () => {
    expect(findDropOff([lecture("1", 90), lecture("2", 70)])).toBeNull();
  });

  it("never invents a cliff out of an unmeasured lecture", () => {
    expect(findDropOff([lecture("1", 90), lecture("2", null), lecture("3", 10)])).toBeNull();
  });

  it("has no drop-off to report for a course nobody has reached", () => {
    expect(findDropOff([lecture("1", null), lecture("2", null)])).toBeNull();
  });
});

describe("courseCompletion", () => {
  it("keeps unattempted assigned work in the denominator", () => {
    expect(
      courseCompletion({ solvedPairs: 5, studentsReached: 2, liveExercises: 5 }),
    ).toEqual({ percent: 50, solved: 5, possible: 10 });
  });

  it("has no percentage for a course that was never asked", () => {
    expect(
      courseCompletion({ solvedPairs: 0, studentsReached: 0, liveExercises: 8 }),
    ).toEqual({ percent: null, solved: 0, possible: 0 });
  });
});

describe("compareCourseReach", () => {
  const course = (
    title: string,
    classes: number,
    percent: number | null,
  ): CourseReachRow => ({
    courseId: title,
    title,
    isVisible: true,
    shelved: classes === 0,
    liveExercises: 4,
    hiddenExercises: 0,
    classes,
    studentsReached: 10,
    activeStudents: 5,
    completion: { percent, solved: 0, possible: 40 },
    medianActiveSeconds: null,
    dropOff: null,
    lastChangeAt: null,
  });

  it("puts taught courses above the shelf, then the least complete first", () => {
    const sorted = [
      course("shelved", 0, null),
      course("healthy", 2, 80),
      course("struggling", 2, 12),
    ].sort(compareCourseReach);
    expect(sorted.map((row) => row.title)).toEqual([
      "struggling",
      "healthy",
      "shelved",
    ]);
  });
});

describe("curriculumAuditActions", () => {
  it("names every content action without duplicates", () => {
    expect(new Set(curriculumAuditActions).size).toBe(
      curriculumAuditActions.length,
    );
  });

  it("recognises what the content service writes and nothing else", () => {
    expect(isCurriculumAuditAction("content.course.visibility_changed")).toBe(true);
    expect(isCurriculumAuditAction("academy.membership.suspended")).toBe(false);
  });
});

describe("class roster ordering", () => {
  const klass = (
    name: string,
    overrides: Partial<ClassRosterRow> = {},
  ): ClassRosterRow => ({
    classId: `00000000-0000-4000-8000-0000000000${name.length}0`,
    name,
    status: "ACTIVE",
    teacher: { membershipId: "m", name: "Teacher", unavailable: false },
    students: 10,
    courses: 1,
    courseTitles: ["Course"],
    liveExercises: 5,
    ...overrides,
  });

  it("treats a class that cannot teach as needing a decision", () => {
    expect(classNeedsDecision(klass("staffed"))).toBe(false);
    expect(
      classNeedsDecision(
        klass("unassigned", {
          teacher: { membershipId: null, name: null, unavailable: false },
        }),
      ),
    ).toBe(true);
    expect(
      classNeedsDecision(
        klass("stale", {
          teacher: { membershipId: "m", name: "Gone", unavailable: true },
        }),
      ),
    ).toBe(true);
    expect(classNeedsDecision(klass("empty", { courses: 0 }))).toBe(true);
  });

  it("never calls an archived class broken, however it was left", () => {
    const archived = klass("closed", {
      status: "ARCHIVED",
      courses: 0,
      teacher: { membershipId: null, name: null, unavailable: false },
    });
    expect(classNeedsDecision(archived)).toBe(false);
  });

  it("lifts classes needing a decision above bigger healthy ones", () => {
    const sorted = [
      klass("big", { students: 30 }),
      klass("tiny-unstaffed", {
        students: 1,
        teacher: { membershipId: null, name: null, unavailable: false },
      }),
      klass("small", { students: 4 }),
    ].sort(compareClassRoster);
    expect(sorted.map((row) => row.name)).toEqual([
      "tiny-unstaffed",
      "big",
      "small",
    ]);
  });

  it("sorts archived classes last even when they need nothing", () => {
    const sorted = [
      klass("archived", { status: "ARCHIVED", students: 99 }),
      klass("active", { students: 2 }),
    ].sort(compareClassRoster);
    expect(sorted.map((row) => row.name)).toEqual(["active", "archived"]);
  });
});
