import { describe, expect, it } from "vitest";

import {
  clampPage,
  defaultSortDirection,
  orderNumbers,
  sortStudents,
  studentSortKeys,
  type StudentOrdering,
} from "./teacher-students.js";

/**
 * The ordering guarantees §7.3 makes, tested where they break.
 *
 * All three failures here are invisible in a browser and obvious in a
 * classroom: a page that repeats a student, a student with no score sorted as
 * the worst scorer, and an `Order` column that restarts at 1 on page 2.
 */

function student(overrides: Partial<StudentOrdering> = {}): StudentOrdering {
  return {
    membershipId: "m-5",
    displayName: "Student",
    averageScore: 50,
    attemptedProblems: 4,
    solvedProblems: 2,
    submissions: 10,
    activeSeconds: 600,
    activeDays: 2,
    lastActivityAt: "2026-08-13T01:00:00.000Z",
    ...overrides,
  };
}

describe("sortStudents", () => {
  it("puts students without a score after every scored one, descending", () => {
    const rows = [
      student({ membershipId: "m-1", averageScore: null }),
      student({ membershipId: "m-2", averageScore: 10 }),
      student({ membershipId: "m-3", averageScore: 90 }),
    ];
    expect(
      sortStudents(rows, "score", "desc").map((row) => row.membershipId),
    ).toEqual(["m-3", "m-2", "m-1"]);
  });

  it("keeps them last ascending too — no score is not the lowest score", () => {
    const rows = [
      student({ membershipId: "m-1", averageScore: null }),
      student({ membershipId: "m-2", averageScore: 10 }),
      student({ membershipId: "m-3", averageScore: 90 }),
    ];
    expect(
      sortStudents(rows, "score", "asc").map((row) => row.membershipId),
    ).toEqual(["m-2", "m-3", "m-1"]);
  });

  it("breaks a score tie by coverage, then solved, then recency", () => {
    const rows = [
      student({ membershipId: "m-1", averageScore: 80, attemptedProblems: 1 }),
      student({ membershipId: "m-2", averageScore: 80, attemptedProblems: 20 }),
    ];
    // 80% over twenty problems is a stronger result than 80% over one, and the
    // order says so rather than leaving two identical-looking rows in input
    // order.
    expect(
      sortStudents(rows, "score", "desc").map((row) => row.membershipId),
    ).toEqual(["m-2", "m-1"]);
  });

  it("is total, so no page can repeat or skip a row", () => {
    // Every measurement identical: without the membership-id tiebreak these two
    // could swap between requests, and page 1 and page 2 would disagree.
    const rows = [
      student({ membershipId: "m-b" }),
      student({ membershipId: "m-a" }),
    ];
    expect(
      sortStudents(rows, "score", "desc").map((row) => row.membershipId),
    ).toEqual(["m-a", "m-b"]);
    expect(
      sortStudents([...rows].reverse(), "score", "desc").map(
        (row) => row.membershipId,
      ),
    ).toEqual(["m-a", "m-b"]);
  });

  it("orders time by seconds, then days, then recency", () => {
    const rows = [
      student({ membershipId: "m-1", activeSeconds: 600, activeDays: 1 }),
      student({ membershipId: "m-2", activeSeconds: 600, activeDays: 5 }),
      student({ membershipId: "m-3", activeSeconds: 6_000, activeDays: 1 }),
    ];
    expect(
      sortStudents(rows, "activeTime", "desc").map((row) => row.membershipId),
    ).toEqual(["m-3", "m-2", "m-1"]);
  });

  it("treats never-active as the oldest activity rather than as unknown", () => {
    const rows = [
      student({ membershipId: "m-1", lastActivityAt: null, activeSeconds: 0 }),
      student({ membershipId: "m-2", activeSeconds: 0 }),
    ];
    expect(
      sortStudents(rows, "lastActive", "desc").map((row) => row.membershipId),
    ).toEqual(["m-2", "m-1"]);
  });

  it("does not mutate its input", () => {
    const rows = [
      student({ membershipId: "m-2", averageScore: 10 }),
      student({ membershipId: "m-1", averageScore: 90 }),
    ];
    sortStudents(rows, "score", "desc");
    expect(rows.map((row) => row.membershipId)).toEqual(["m-2", "m-1"]);
  });

  it("has a comparator and a first direction for every sortable column", () => {
    const rows = [student({ membershipId: "m-1" }), student({ membershipId: "m-2" })];
    for (const key of studentSortKeys) {
      expect(defaultSortDirection[key]).toBeTruthy();
      expect(sortStudents(rows, key, defaultSortDirection[key])).toHaveLength(2);
    }
  });
});

describe("orderNumbers", () => {
  it("continues across page boundaries", () => {
    // §7.3 — `Order` describes the whole filtered result. Page 2 of 25 starts
    // at 26; a per-page number would restart at 1 and mean nothing.
    expect(orderNumbers({ page: 1, pageSize: 25, rows: 3 })).toEqual([1, 2, 3]);
    expect(orderNumbers({ page: 2, pageSize: 25, rows: 2 })).toEqual([26, 27]);
  });
});

describe("clampPage", () => {
  it("lands on the last page rather than on an empty one", () => {
    // Narrowing a filter while deep in a roster must not read as "no students
    // match" when the truth is "you are past the end".
    expect(clampPage({ page: 9, pageSize: 25, totalRows: 30 })).toEqual({
      page: 2,
      pageCount: 2,
      offset: 25,
    });
  });

  it("keeps one page when nothing matches", () => {
    // Page 1 of 1, so the paginator reads as an empty result rather than as
    // something broken.
    expect(clampPage({ page: 1, pageSize: 25, totalRows: 0 })).toEqual({
      page: 1,
      pageCount: 1,
      offset: 0,
    });
  });

  it("refuses a page below the first", () => {
    expect(clampPage({ page: -3, pageSize: 25, totalRows: 100 }).page).toBe(1);
  });
});
