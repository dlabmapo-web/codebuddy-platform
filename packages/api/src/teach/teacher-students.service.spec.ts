import { teacherStudentListSchema } from "@cove/shared";
import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type {
  OverviewExercise,
  TeacherOverviewAccessService,
  TeacherOverviewScope,
} from "./teacher-overview-access.service.js";
import type { TeacherOverviewRepository } from "./teacher-overview.repository.js";
import type { TeacherProgressRepository } from "./teacher-progress.repository.js";
import { TeacherStudentsService } from "./teacher-students.service.js";

/**
 * What the table must never get wrong.
 *
 * §7.3's whole claim is that `Order` describes the complete filtered result. A
 * page-local order, a repeated row across a boundary, or a search that quietly
 * changed the totals would all render as a perfectly ordinary table.
 */

const identity = { authUserId: "auth" } as SupabaseIdentity;
const academyId = "20000000-0000-4000-8000-000000000001";
const classA = "30000000-0000-4000-8000-000000000001";
const courseId = "40000000-0000-4000-8000-000000000001";
const moduleId = "45000000-0000-4000-8000-000000000001";
const lectureId = "50000000-0000-4000-8000-000000000001";
const problemOne = "70000000-0000-4000-8000-000000000001";

/**
 * Sixty students, so the smallest page size the contract offers still crosses
 * two boundaries. A roster smaller than one page could never catch the bug the
 * pagination test exists for.
 */
const ROSTER_SIZE = 60;
const hex = (index: number) => index.toString(16).padStart(12, "0");
const roster = Array.from({ length: ROSTER_SIZE }, (_, index) => ({
  membershipId: `80000000-0000-4000-8000-${hex(index + 1)}`,
  userId: `90000000-0000-4000-8000-${hex(index + 1)}`,
  // Padded so lexical name order and index order agree, which keeps the
  // name-sorted expectations readable.
  displayName: `Student ${String(index + 1).padStart(2, "0")}`,
  classIds: [classA],
}));

const exercise: OverviewExercise = {
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
};

function createScope(
  overrides: Partial<TeacherOverviewScope> = {},
): TeacherOverviewScope {
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
        students: roster,
        userIds: roster.map((student) => student.userId),
        membershipIds: roster.map((student) => student.membershipId),
        courseIds: [courseId],
        exercises: [exercise],
        materialIds: [problemOne],
      },
    ],
    classOptions: [{ value: classA, label: "Python A" }],
    courseOptions: [{ value: courseId, label: "Python 1", classIds: [classA] }],
    moduleOptions: [{ value: moduleId, label: "Repetition", parentId: courseId }],
    lectureOptions: [{ value: lectureId, label: "While loops", parentId: moduleId }],
    problemOptions: [{ value: problemOne, label: "Count to ten", parentId: lectureId }],
    students: roster,
    userIds: roster.map((student) => student.userId),
    membershipIds: roster.map((student) => student.membershipId),
    exercises: [exercise],
    materialIds: [problemOne],
    courseIds: [courseId],
    ...overrides,
  };
}

/** Strictly descending scores, so the expected order is unambiguous. */
const work = roster.map((student, index) => ({
  userId: student.userId,
  submissions: ROSTER_SIZE - index,
  attemptedProblems: 1,
  solvedProblems: index < 3 ? 1 : 0,
  scoreSum: Math.max(0, 100 - index),
  lastSubmissionAt: new Date("2026-08-13T01:00:00Z"),
}));

function createService(
  overrides: Partial<Record<keyof TeacherOverviewRepository, unknown>> = {},
  scope = createScope(),
) {
  const access = {
    requireScope: vi.fn().mockResolvedValue(scope),
  } as unknown as TeacherOverviewAccessService;

  const repository = {
    activityByStudentCourse: vi.fn().mockResolvedValue([]),
    activityDaysByStudent: vi.fn().mockResolvedValue([]),
    activityTrackedSince: vi.fn().mockResolvedValue("2026-08-01"),
    workByStudent: vi.fn().mockResolvedValue(work),
    ...overrides,
  } as unknown as TeacherOverviewRepository;

  const progress = {
    attentionCandidates: vi.fn().mockResolvedValue([]),
  } as unknown as TeacherProgressRepository;

  return { service: new TeacherStudentsService(access, repository, progress), access };
}

describe("TeacherStudentsService", () => {
  it("returns a response the contract accepts", async () => {
    const { service } = createService();
    const result = await service.list(identity, { academyId });
    expect(() => teacherStudentListSchema.parse(result)).not.toThrow();
  });

  it("numbers Order from the offset, not from the top of the page", async () => {
    const { service } = createService();

    const first = await service.list(identity, { academyId, pageSize: 25, page: 1 });
    expect(first.rows[0]?.order).toBe(1);
    expect(first.rows.at(-1)?.order).toBe(25);

    const second = await service.list(identity, { academyId, pageSize: 25, page: 2 });
    expect(second.rows[0]?.order).toBe(26);
  });

  it("lands on the last real page rather than on an empty one", async () => {
    const { service } = createService();
    const beyond = await service.list(identity, {
      academyId,
      pageSize: 25,
      page: 40,
    });
    // Sixty students in pages of twenty-five is three pages. A request for page
    // forty must not read as "no students match".
    expect(beyond.page).toBe(3);
    expect(beyond.pageCount).toBe(3);
    expect(beyond.rows).toHaveLength(10);
  });

  it("continues Order and never repeats a student across a boundary", async () => {
    const { service } = createService();
    // Twenty-five at a time over sixty students: three pages, and two
    // boundaries where a page-local sort would restart the numbering or place
    // the same student on two pages.
    const pages = await Promise.all(
      [1, 2, 3].map((page) =>
        service.list(identity, { academyId, pageSize: 25, page, sort: "score" }),
      ),
    );

    expect(pages.flatMap((page) => page.rows.map((row) => row.order))).toEqual(
      Array.from({ length: ROSTER_SIZE }, (_, index) => index + 1),
    );

    const seen = pages.flatMap((page) =>
      page.rows.map((row) => row.membershipId),
    );
    expect(new Set(seen).size).toBe(ROSTER_SIZE);
    expect(pages.every((page) => page.pageCount === 3)).toBe(true);
    expect(pages.every((page) => page.totalRows === ROSTER_SIZE)).toBe(true);
  });

  it("counts every matching student, not the ones on this page", async () => {
    const { service } = createService();
    const result = await service.list(identity, { academyId, pageSize: 25 });
    // The count is every matching student; the page is twenty-five of them.
    expect(result.totalRows).toBe(ROSTER_SIZE);
    expect(result.rows).toHaveLength(25);
  });

  it("sorts by score descending by default, best first", async () => {
    const { service } = createService();
    const result = await service.list(identity, { academyId });
    expect(result.sort).toBe("score");
    expect(result.direction).toBe("desc");
    expect(result.rows[0]?.displayName).toBe("Student 01");
    expect(result.rows[0]?.averageScore).toBe(100);
  });

  it("reverses the whole order when the direction flips", async () => {
    const { service } = createService();
    const result = await service.list(identity, {
      academyId,
      sort: "score",
      direction: "asc",
    });
    expect(result.rows[0]?.displayName).toBe(`Student ${ROSTER_SIZE}`);
  });

  it("narrows by name without changing what the rest of the row means", async () => {
    const { service } = createService();
    const result = await service.list(identity, { academyId, search: "student 02" });
    expect(result.totalRows).toBe(1);
    expect(result.rows[0]?.displayName).toBe("Student 02");
    // The measurement is the student's own, not recomputed over the filtered
    // set — searching must not change anybody's score.
    expect(result.rows[0]?.averageScore).toBe(99);
    // And the position is a position in the search result.
    expect(result.rows[0]?.order).toBe(1);
  });

  it("matches a name case-insensitively, anywhere in it", async () => {
    const { service } = createService();
    // A teacher who knows a child by their given name must find them in a
    // roster that stores the family name first.
    expect(
      (await service.list(identity, { academyId, search: "STUDENT 03" })).totalRows,
    ).toBe(1);
  });

  it("reports no score as null rather than as zero", async () => {
    const { service } = createService({ workByStudent: vi.fn().mockResolvedValue([]) });
    const result = await service.list(identity, { academyId });
    expect(result.rows.every((row) => row.averageScore === null)).toBe(true);
    expect(result.rows.every((row) => row.attemptedProblems === 0)).toBe(true);
  });

  it("keeps only students holding one of the requested reasons", async () => {
    const { service } = createService({ workByStudent: vi.fn().mockResolvedValue([]) });
    // Nobody submitted and nobody was active, so every student is inactive and
    // none is flagged for repeated failures.
    const inactive = await service.list(identity, {
      academyId,
      attention: ["inactive"],
    });
    expect(inactive.totalRows).toBe(ROSTER_SIZE);

    const failures = await service.list(identity, {
      academyId,
      attention: ["repeated_failures"],
    });
    expect(failures.totalRows).toBe(0);

    // Any of the selected reasons matches, so adding one nobody holds cannot
    // narrow the result — an OR that behaved like an AND would quietly hide
    // every student the teacher asked to see.
    const either = await service.list(identity, {
      academyId,
      attention: ["repeated_failures", "inactive"],
    });
    expect(either.totalRows).toBe(ROSTER_SIZE);
  });

  it("treats no selected reason as every student", async () => {
    const { service } = createService();
    const all = await service.list(identity, { academyId, attention: [] });
    expect(all.totalRows).toBe(ROSTER_SIZE);
  });

  it("echoes the scope it actually used back to the page", async () => {
    const { service, access } = createService(
      {},
      createScope({
        selectedClassId: classA,
        selectedCourseId: courseId,
        selectedLectureId: lectureId,
        selectedModuleId: moduleId,
        curriculumLabel: "While loops",
      }),
    );
    const result = await service.list(identity, {
      academyId,
      classId: classA,
      courseId,
      moduleId,
      lectureId,
    });

    // §5.4 — the response says which levels survived authorization, so the page
    // can canonicalize its own address rather than guessing.
    expect(result.scope.lectureId).toBe(lectureId);
    expect(result.scope.curriculumLabel).toBe("While loops");
    expect(result.scope.scopedProblems).toBe(1);
    expect(access.requireScope).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({ lectureId }),
    );
  });

  it("renders an empty roster as an empty page, not as an error", async () => {
    const { service } = createService(
      {},
      createScope({
        students: [],
        userIds: [],
        membershipIds: [],
        classes: [],
      }),
    );
    const result = await service.list(identity, { academyId });
    expect(result.rows).toEqual([]);
    expect(result.totalRows).toBe(0);
    expect(result.pageCount).toBe(1);
    expect(() => teacherStudentListSchema.parse(result)).not.toThrow();
  });
});
