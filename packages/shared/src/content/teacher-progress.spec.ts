import { describe, expect, it } from "vitest";

import {
  attentionReasonsFor,
  completionPercent,
  resolveTeacherPage,
  teacherOutlineNumber,
  teacherStudentsResultSchema,
  teacherSubmissionReviewSchema,
  wholeDaysBetween,
  LONG_SOLVE_SECONDS,
} from "./teacher-progress.js";

const NOW = "2026-08-12T09:00:00.000Z";

function daysBefore(days: number): string {
  return new Date(Date.parse(NOW) - days * 86_400_000).toISOString();
}

describe("completionPercent", () => {
  it("is zero when nothing is eligible", () => {
    // A class with no graded curriculum has not finished it.
    expect(completionPercent({ solved: 0, eligible: 0 })).toBe(0);
    expect(completionPercent({ solved: 4, eligible: 0 })).toBe(0);
  });

  it("rounds to a whole percent", () => {
    expect(completionPercent({ solved: 1, eligible: 3 })).toBe(33);
    expect(completionPercent({ solved: 2, eligible: 3 })).toBe(67);
    expect(completionPercent({ solved: 7, eligible: 7 })).toBe(100);
  });

  it("cannot exceed 100 when a caller over-counts", () => {
    expect(completionPercent({ solved: 9, eligible: 4 })).toBe(100);
  });
});

describe("resolveTeacherPage", () => {
  it("keeps a requested page that has rows", () => {
    expect(
      resolveTeacherPage({ requestedPage: 2, totalCount: 60, pageSize: 25 }),
    ).toEqual({ page: 2, pageCount: 3, skip: 25 });
  });

  it("clamps a page beyond the end to the last one with rows", () => {
    expect(
      resolveTeacherPage({ requestedPage: 9, totalCount: 30, pageSize: 25 }),
    ).toEqual({ page: 2, pageCount: 2, skip: 25 });
  });

  it("lands on page one when there is nothing to page", () => {
    expect(
      resolveTeacherPage({ requestedPage: 4, totalCount: 0, pageSize: 25 }),
    ).toEqual({ page: 1, pageCount: 0, skip: 0 });
  });
});

describe("wholeDaysBetween", () => {
  it("floors partial days", () => {
    expect(wholeDaysBetween(daysBefore(7), NOW)).toBe(7);
    // Six days and twenty-three hours is six, not seven.
    expect(
      wholeDaysBetween(new Date(Date.parse(NOW) - 7 * 86_400_000 + 3_600_000), NOW),
    ).toBe(6);
  });

  it("is zero for a future or equal timestamp", () => {
    expect(wholeDaysBetween(NOW, NOW)).toBe(0);
    expect(wholeDaysBetween(daysBefore(-3), NOW)).toBe(0);
  });
});

describe("attentionReasonsFor", () => {
  const base = {
    status: "in_progress" as const,
    latestAccepted: [] as boolean[],
    lastAttemptAt: null as string | null,
    latestFailedSolveSec: null as number | null,
    now: NOW,
  };

  it("reports nothing for a solved exercise, whatever the history", () => {
    // The work is done. Continuing to flag the road taken to a correct
    // answer is exactly what §7.4 refuses.
    expect(
      attentionReasonsFor({
        ...base,
        status: "solved",
        latestAccepted: [false, false, false, false],
        lastAttemptAt: daysBefore(30),
        latestFailedSolveSec: 9_000,
      }),
    ).toEqual([]);
  });

  it("reports nothing for a student who has not started", () => {
    expect(attentionReasonsFor({ ...base, status: "not_started" })).toEqual([]);
  });

  it("flags three consecutive failures and states the streak", () => {
    expect(
      attentionReasonsFor({ ...base, latestAccepted: [false, false, false] }),
    ).toEqual([{ kind: "repeated_failures", value: 3 }]);
    expect(
      attentionReasonsFor({
        ...base,
        latestAccepted: [false, false, false, false, false],
      }),
    ).toEqual([{ kind: "repeated_failures", value: 5 }]);
  });

  it("does not flag two failures, or a streak broken by a pass", () => {
    expect(
      attentionReasonsFor({ ...base, latestAccepted: [false, false] }),
    ).toEqual([]);
    expect(
      attentionReasonsFor({ ...base, latestAccepted: [true, false, false, false] }),
    ).toEqual([]);
  });

  it("flags a stalled attempt only at seven full days", () => {
    expect(
      attentionReasonsFor({ ...base, lastAttemptAt: daysBefore(7) }),
    ).toEqual([{ kind: "stalled", value: 7 }]);
    expect(
      attentionReasonsFor({ ...base, lastAttemptAt: daysBefore(6) }),
    ).toEqual([]);
  });

  it("does not call an untouched exercise stalled", () => {
    // Not started is an absence of work, not a stall. Without deadlines the
    // system cannot honestly say the student is late.
    expect(
      attentionReasonsFor({
        ...base,
        status: "not_started",
        lastAttemptAt: daysBefore(40),
      }),
    ).toEqual([]);
  });

  it("flags a long solve only when the latest attempt failed", () => {
    expect(
      attentionReasonsFor({
        ...base,
        latestAccepted: [false],
        latestFailedSolveSec: LONG_SOLVE_SECONDS,
      }),
    ).toEqual([{ kind: "long_solve", value: LONG_SOLVE_SECONDS }]);
    // A pass on top of a long sitting is a student who got there.
    expect(
      attentionReasonsFor({
        ...base,
        latestAccepted: [true, false],
        latestFailedSolveSec: 9_000,
      }),
    ).toEqual([]);
    expect(
      attentionReasonsFor({
        ...base,
        latestAccepted: [false],
        latestFailedSolveSec: LONG_SOLVE_SECONDS - 1,
      }),
    ).toEqual([]);
  });

  it("never invents a long solve from an unmeasured attempt", () => {
    expect(
      attentionReasonsFor({
        ...base,
        latestAccepted: [false],
        latestFailedSolveSec: null,
      }),
    ).toEqual([]);
  });

  it("reports every reason that currently holds", () => {
    expect(
      attentionReasonsFor({
        ...base,
        latestAccepted: [false, false, false, false],
        lastAttemptAt: daysBefore(9),
        latestFailedSolveSec: 3_600,
      }),
    ).toEqual([
      { kind: "repeated_failures", value: 4 },
      { kind: "stalled", value: 9 },
      { kind: "long_solve", value: 3_600 },
    ]);
  });
});

describe("teacherOutlineNumber", () => {
  it("prints a lecture and a problem coordinate", () => {
    expect(
      teacherOutlineNumber({ modulePosition: 2, lecturePosition: 1 }),
    ).toBe("2-1");
    expect(
      teacherOutlineNumber({
        modulePosition: 2,
        lecturePosition: 1,
        problemPosition: 3,
      }),
    ).toBe("2-1-3");
  });

  it("prints nothing when a position is missing", () => {
    expect(
      teacherOutlineNumber({
        modulePosition: 0,
        lecturePosition: 1,
        problemPosition: 3,
      }),
    ).toBeNull();
    expect(
      teacherOutlineNumber({
        modulePosition: 1,
        lecturePosition: 1,
        problemPosition: 0,
      }),
    ).toBeNull();
  });
});

describe("output schemas", () => {
  const summary = {
    classId: "11111111-1111-4111-8111-111111111111",
    className: "Level 1",
    activeStudents: 2,
    solvedPairs: 1,
    eligiblePairs: 4,
    completionPercent: 25,
    studentsNeedingAttention: 1,
  };

  it("rejects a surplus field on a student result", () => {
    const result = teacherStudentsResultSchema.safeParse({
      summary: { ...summary, email: "leak@example.com" },
      rows: [],
      facets: { courses: [], statuses: [], attention: [] },
      pagination: { page: 1, pageSize: 25, totalCount: 0, pageCount: 0 },
    });
    expect(result.success).toBe(false);
  });

  it("has nowhere to put code outside the review contract", () => {
    // The structural guarantee: a roster row that grew a `code` field would
    // fail at the boundary rather than ship one.
    const keys = Object.keys(teacherSubmissionReviewSchema.shape);
    expect(keys).toContain("code");
    const rowKeys = Object.keys(
      teacherStudentsResultSchema.shape.rows.element.shape,
    );
    expect(rowKeys).not.toContain("code");
  });

  it("keeps hidden case data out of a review case", () => {
    const parsed = teacherSubmissionReviewSchema.safeParse({
      submissionId: "22222222-2222-4222-8222-222222222222",
      membershipId: "33333333-3333-4333-8333-333333333333",
      studentName: "Student One",
      problemTitle: "Sum two numbers",
      courseTitle: "Course",
      moduleTitle: "Module",
      lectureTitle: "Lecture",
      outlineNumber: "1-1-1",
      accepted: false,
      score: 50,
      passedCount: 1,
      totalCount: 2,
      runtimeMs: 12,
      solveElapsedSec: 300,
      createdAt: NOW,
      code: "print(1)\n",
      language: "PYTHON",
      statement: "<p>Add</p>",
      cases: [
        {
          position: 2,
          isSample: false,
          outcome: "WRONG_OUTPUT",
          runtimeMs: 8,
          input: null,
          expectedOutput: null,
          actualOutput: null,
        },
      ],
      hiddenPassed: 0,
      hiddenTotal: 1,
    });
    expect(parsed.success).toBe(true);
  });
});
