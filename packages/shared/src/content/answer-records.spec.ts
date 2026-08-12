import { describe, expect, it } from "vitest";

import {
  ANSWER_RECORDS_PAGE_SIZE,
  SOLVE_SESSION_MAX_SECONDS,
  acceptedRate,
  answerRecordOutlineNumber,
  answerRecordResultFor,
  answerRecordRowSchema,
  answerRecordsResultSchema,
  isSolveSessionExpired,
  listAnswerRecordsInputSchema,
  resolveRecordsPage,
  solveDurationParts,
  solveElapsedSeconds,
  submissionStatusesFor,
} from "./answer-records.js";
import { learnSelectedSubmissionSchema } from "./learn.js";
import { submissionStatuses } from "./submission.js";

function row(overrides: Record<string, unknown> = {}) {
  return {
    submissionId: "a0000000-0000-4000-8000-000000000001",
    materialId: "b0000000-0000-4000-8000-000000000001",
    problemTitle: "Sum two numbers",
    courseTitle: "Python Foundations",
    moduleTitle: "Basics",
    lectureTitle: "Addition",
    modulePosition: 1,
    lecturePosition: 2,
    problemPosition: 3,
    result: "ACCEPTED",
    score: 100,
    passedCount: 2,
    totalCount: 2,
    solveElapsedSec: 95,
    createdAt: "2026-08-12T09:00:00.000Z",
    canOpenExercise: true,
    ...overrides,
  };
}

describe("student-safe record shapes", () => {
  it("accepts a complete row", () => {
    expect(answerRecordRowSchema.parse(row())).toMatchObject({ score: 100 });
  });

  /**
   * The structural half of the disclosure rule: a service that selected a
   * grading input has to fail at the boundary rather than ship it.
   */
  it("refuses a row carrying grading inputs or source code", () => {
    for (const extra of [
      { expectedOutput: "3" },
      { input: "1 2" },
      { actualOutput: "3" },
      { code: "print(3)" },
    ]) {
      expect(() => answerRecordRowSchema.parse(row(extra))).toThrow();
    }
  });

  it("refuses a selected submission carrying hidden case data", () => {
    const selected = {
      submissionId: "a0000000-0000-4000-8000-000000000001",
      code: "print(3)",
      createdAt: "2026-08-12T09:00:00.000Z",
      result: {
        submissionId: "a0000000-0000-4000-8000-000000000001",
        materialId: "b0000000-0000-4000-8000-000000000001",
        status: "PASSED",
        passedCount: 2,
        totalCount: 2,
        score: 100,
        runtimeMs: 12,
        failureReason: null,
        elapsedSec: 3,
        attemptCount: 1,
        createdAt: "2026-08-12T09:00:00.000Z",
        gradedAt: "2026-08-12T09:00:03.000Z",
        cases: [],
      },
    };

    expect(learnSelectedSubmissionSchema.parse(selected).code).toBe("print(3)");
    expect(() =>
      learnSelectedSubmissionSchema.parse({
        ...selected,
        hiddenTestCases: [{ input: "x", expectedOutput: "y" }],
      }),
    ).toThrow();
  });

  it("pins the page size so a caller cannot ask for the whole history", () => {
    const parsed = answerRecordsResultSchema.parse({
      summary: { totalSubmissions: 0, solvedProblems: 0, acceptedRate: 0 },
      rows: [],
      facets: { results: [], classes: [], courses: [], modules: [], lectures: [] },
      pagination: {
        page: 1,
        pageSize: ANSWER_RECORDS_PAGE_SIZE,
        totalCount: 0,
        pageCount: 0,
      },
    });
    expect(parsed.pagination.pageSize).toBe(20);
  });

  it("discards unsupported sorts, directions, and pages at the boundary", () => {
    expect(
      listAnswerRecordsInputSchema.safeParse({
        academyId: "c0000000-0000-4000-8000-000000000001",
        sort: "runtime",
      }).success,
    ).toBe(false);
    expect(
      listAnswerRecordsInputSchema.safeParse({
        academyId: "c0000000-0000-4000-8000-000000000001",
        direction: "sideways",
      }).success,
    ).toBe(false);
    expect(
      listAnswerRecordsInputSchema.safeParse({
        academyId: "c0000000-0000-4000-8000-000000000001",
        page: 0,
      }).success,
    ).toBe(false);
  });
});

describe("result vocabulary", () => {
  it("keeps a judge fault distinct from a wrong answer", () => {
    expect(answerRecordResultFor("ERRORED")).toBe("JUDGE_ERROR");
    expect(answerRecordResultFor("FAILED")).toBe("NOT_ACCEPTED");
    expect(answerRecordResultFor("PASSED")).toBe("ACCEPTED");
    expect(answerRecordResultFor("CANCELLED")).toBe("CANCELLED");
  });

  it("folds both moving statuses into one in-progress result", () => {
    expect(answerRecordResultFor("QUEUED")).toBe("IN_PROGRESS");
    expect(answerRecordResultFor("RUNNING")).toBe("IN_PROGRESS");
    expect(submissionStatusesFor("IN_PROGRESS")).toEqual(["QUEUED", "RUNNING"]);
  });

  /** Every status has to land somewhere, or a row would filter to nothing. */
  it("round-trips every submission status", () => {
    for (const status of submissionStatuses) {
      expect(submissionStatusesFor(answerRecordResultFor(status))).toContain(
        status,
      );
    }
  });
});

describe("summary metrics", () => {
  it("rounds the accepted rate to a whole percent", () => {
    expect(acceptedRate({ accepted: 1, notAccepted: 1 })).toBe(50);
    expect(acceptedRate({ accepted: 1, notAccepted: 2 })).toBe(33);
    expect(acceptedRate({ accepted: 2, notAccepted: 1 })).toBe(67);
  });

  it("reports zero rather than dividing by nothing", () => {
    expect(acceptedRate({ accepted: 0, notAccepted: 0 })).toBe(0);
  });
});

describe("page canonicalization", () => {
  it("defaults to the first page", () => {
    expect(resolveRecordsPage({ requestedPage: 1, totalCount: 45 })).toEqual({
      page: 1,
      pageCount: 3,
      skip: 0,
    });
  });

  it("clamps a page beyond the last one that has results", () => {
    expect(resolveRecordsPage({ requestedPage: 9, totalCount: 45 })).toMatchObject(
      { page: 3, skip: 40 },
    );
  });

  it("falls back to page 1 when the filtered query is empty", () => {
    expect(resolveRecordsPage({ requestedPage: 9, totalCount: 0 })).toEqual({
      page: 1,
      pageCount: 0,
      skip: 0,
    });
  });
});

describe("solve time", () => {
  const started = "2026-08-12T09:00:00.000Z";

  it("counts whole seconds from the server-issued origin", () => {
    expect(solveElapsedSeconds(started, "2026-08-12T09:01:35.900Z")).toBe(95);
  });

  it("never goes negative when clocks disagree", () => {
    expect(solveElapsedSeconds(started, "2026-08-12T08:59:00.000Z")).toBe(0);
  });

  it("caps an abandoned tab at 24 hours instead of storing it", () => {
    expect(solveElapsedSeconds(started, "2026-08-14T09:00:00.000Z")).toBe(
      SOLVE_SESSION_MAX_SECONDS,
    );
    expect(isSolveSessionExpired(started, "2026-08-13T09:00:00.000Z")).toBe(true);
    expect(isSolveSessionExpired(started, "2026-08-12T23:59:59.000Z")).toBe(false);
  });

  it("splits a duration for display and reports an unrecorded one as null", () => {
    expect(solveDurationParts(0)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
    expect(solveDurationParts(95)).toEqual({ hours: 0, minutes: 1, seconds: 35 });
    expect(solveDurationParts(3_725)).toEqual({
      hours: 1,
      minutes: 2,
      seconds: 5,
    });
    expect(solveDurationParts(SOLVE_SESSION_MAX_SECONDS + 500)).toEqual({
      hours: 24,
      minutes: 0,
      seconds: 0,
    });
    expect(solveDurationParts(null)).toBeNull();
  });
});

describe("outline number", () => {
  it("prints the same coordinate the course outline does", () => {
    expect(answerRecordOutlineNumber(row())).toBe("1-2-3");
  });

  it("prints nothing for a row backfilled without a position", () => {
    expect(
      answerRecordOutlineNumber({
        modulePosition: 0,
        lecturePosition: 0,
        problemPosition: 0,
      }),
    ).toBeNull();
  });
});
