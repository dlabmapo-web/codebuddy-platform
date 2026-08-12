import type { AcademyRole } from "@cove/shared";
import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { AcademyAccessService } from "../authorization/academy-access.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import { AnswerRecordsService, orderByFor } from "./answer-records.service.js";

const identity: SupabaseIdentity = {
  authUserId: "10000000-0000-4000-8000-000000000001",
  email: "student@example.com",
  emailVerified: true,
  username: null,
  displayName: "Student",
  avatarUrl: null,
  provider: null,
  requestedAcademyId: null,
};
const academyId = "20000000-0000-4000-8000-000000000001";
const userId = "30000000-0000-4000-8000-000000000001";
const courseId = "40000000-0000-4000-8000-000000000001";
const moduleId = "50000000-0000-4000-8000-000000000001";
const lectureId = "60000000-0000-4000-8000-000000000001";
const materialId = "70000000-0000-4000-8000-000000000001";
const otherMaterialId = "70000000-0000-4000-8000-000000000002";
const classId = "80000000-0000-4000-8000-000000000001";

function submissionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "a0000000-0000-4000-8000-000000000001",
    sourceMaterialId: materialId,
    problemTitle: "Sum two numbers",
    courseTitle: "Python Foundations",
    moduleTitle: "Basics",
    lectureTitle: "Addition",
    modulePosition: 1,
    lecturePosition: 2,
    problemPosition: 3,
    status: "PASSED",
    score: 100,
    passedCount: 2,
    totalCount: 2,
    solveElapsedSec: 95,
    createdAt: new Date("2026-08-12T09:00:00Z"),
    ...overrides,
  };
}

function attemptedMaterial() {
  return {
    lecture: {
      id: lectureId,
      title: "Addition",
      courseModule: {
        id: moduleId,
        title: "Basics",
        course: { id: courseId, title: "Python Foundations" },
      },
    },
  };
}

function createService(options?: {
  rows?: ReturnType<typeof submissionRow>[];
  totalCount?: number;
  statusGroups?: { status: string; _count: { _all: number } }[];
  solvedGroups?: { sourceMaterialId: string }[];
  attempted?: ReturnType<typeof attemptedMaterial>[];
  classes?: { id: string; name: string }[];
  reachable?: { id: string }[];
  role?: AcademyRole;
}) {
  const rows = options?.rows ?? [submissionRow()];
  const groupBy = vi.fn(async (args: { by: string[] }) =>
    args.by.includes("status")
      ? (options?.statusGroups ?? [
          { status: "PASSED", _count: { _all: 1 } },
          { status: "FAILED", _count: { _all: 1 } },
        ])
      : (options?.solvedGroups ?? [{ sourceMaterialId: materialId }]),
  );
  const prisma = {
    submission: {
      findMany: vi.fn().mockResolvedValue(rows),
      count: vi.fn().mockResolvedValue(options?.totalCount ?? rows.length),
      groupBy,
    },
    material: {
      findMany: vi.fn(async (args: { select?: Record<string, unknown> }) =>
        args.select && "id" in args.select
          ? (options?.reachable ?? [{ id: materialId }])
          : (options?.attempted ?? [attemptedMaterial()]),
      ),
    },
    class: {
      findMany: vi
        .fn()
        .mockResolvedValue(options?.classes ?? [{ id: classId, name: "Cohort A" }]),
    },
  } as unknown as PrismaService;
  const access = {
    requirePermission: vi.fn().mockResolvedValue({
      userId,
      academyId,
      role: options?.role ?? "STUDENT",
    }),
  } as unknown as AcademyAccessService;
  return { prisma, access, service: new AnswerRecordsService(prisma, access) };
}

/** The one `where` the paged read ran with. */
function rowsWhere(prisma: PrismaService) {
  return vi.mocked(prisma.submission.findMany).mock.calls[0]?.[0]?.where as
    | Record<string, unknown>
    | undefined;
}

describe("AnswerRecordsService authorization", () => {
  it("gates the read on curriculum.read and never on a supplied user id", async () => {
    const { service, access, prisma } = createService();

    await service.listAnswerRecords(identity, { academyId });

    expect(access.requirePermission).toHaveBeenCalledWith(
      identity.authUserId,
      academyId,
      "curriculum.read",
    );
    expect(rowsWhere(prisma)).toMatchObject({
      userId,
      course: { academyId },
    });
  });

  /**
   * Every read — rows, counts, summary, facets — is pinned to the actor. A
   * missing filter in one of them would make somebody else's history reachable
   * through a metric rather than through a row.
   */
  it("pins the count and both summary aggregates to the same actor", async () => {
    const { service, prisma } = createService();

    await service.listAnswerRecords(identity, { academyId });

    const owned = { userId, course: { academyId } };
    expect(prisma.submission.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining(owned) }),
    );
    for (const call of vi.mocked(prisma.submission.groupBy).mock.calls) {
      expect(call[0]?.where).toMatchObject(owned);
    }
  });
});

describe("AnswerRecordsService rows", () => {
  it("projects the frozen labels and the student-safe result", async () => {
    const { service } = createService();

    const { rows } = await service.listAnswerRecords(identity, { academyId });

    expect(rows[0]).toEqual({
      submissionId: "a0000000-0000-4000-8000-000000000001",
      materialId,
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
    });
  });

  it("carries no source code into the table", async () => {
    const { service, prisma } = createService();

    await service.listAnswerRecords(identity, { academyId });

    const select = vi.mocked(prisma.submission.findMany).mock.calls[0]?.[0]
      ?.select as Record<string, unknown>;
    expect(select).not.toHaveProperty("code");
  });

  it("names a judge fault as a system error, not a wrong answer", async () => {
    const { service } = createService({
      rows: [submissionRow({ status: "ERRORED", score: 0 })],
    });

    const { rows } = await service.listAnswerRecords(identity, { academyId });

    expect(rows[0]?.result).toBe("JUDGE_ERROR");
  });

  it("keeps a record readable but unopenable when its problem is gone", async () => {
    const { service } = createService({
      rows: [submissionRow({ sourceMaterialId: otherMaterialId })],
      reachable: [],
    });

    const { rows } = await service.listAnswerRecords(identity, { academyId });

    expect(rows[0]?.problemTitle).toBe("Sum two numbers");
    expect(rows[0]?.canOpenExercise).toBe(false);
  });

  it("reports an unrecorded solve time as absent rather than zero", async () => {
    const { service } = createService({
      rows: [submissionRow({ solveElapsedSec: null })],
    });

    const { rows } = await service.listAnswerRecords(identity, { academyId });

    expect(rows[0]?.solveElapsedSec).toBeNull();
  });
});

describe("AnswerRecordsService summary", () => {
  it("counts attempts, distinct solved problems, and the accepted rate", async () => {
    const { service } = createService({
      statusGroups: [
        { status: "PASSED", _count: { _all: 1 } },
        { status: "FAILED", _count: { _all: 1 } },
      ],
      solvedGroups: [{ sourceMaterialId: materialId }],
    });

    const { summary } = await service.listAnswerRecords(identity, { academyId });

    expect(summary).toEqual({
      totalSubmissions: 2,
      solvedProblems: 1,
      acceptedRate: 50,
    });
  });

  it("excludes judge faults and cancelled work from student metrics", async () => {
    const { service } = createService({
      statusGroups: [
        { status: "PASSED", _count: { _all: 2 } },
        { status: "ERRORED", _count: { _all: 5 } },
        { status: "CANCELLED", _count: { _all: 3 } },
      ],
    });

    const { summary } = await service.listAnswerRecords(identity, { academyId });

    expect(summary.totalSubmissions).toBe(2);
    expect(summary.acceptedRate).toBe(100);
  });

  /**
   * The point of the summary: narrowing the table must not make a student's
   * overall progress appear to change.
   */
  it("measures the whole history even when the table is filtered", async () => {
    const { service, prisma } = createService();

    await service.listAnswerRecords(identity, {
      academyId,
      results: ["ACCEPTED"],
      q: "sum",
    });

    for (const call of vi.mocked(prisma.submission.groupBy).mock.calls) {
      expect(call[0]?.where).not.toHaveProperty("AND");
    }
  });
});

describe("AnswerRecordsService filtering", () => {
  it("searches the labels a student can actually see", async () => {
    const { service, prisma } = createService();

    await service.listAnswerRecords(identity, { academyId, q: "  addition " });

    expect(rowsWhere(prisma)).toMatchObject({
      AND: [
        {
          OR: [
            { problemTitle: { contains: "addition", mode: "insensitive" } },
            { courseTitle: { contains: "addition", mode: "insensitive" } },
            { moduleTitle: { contains: "addition", mode: "insensitive" } },
            { lectureTitle: { contains: "addition", mode: "insensitive" } },
          ],
        },
      ],
    });
  });

  it("expands a multi-select result facet into its statuses", async () => {
    const { service, prisma } = createService();

    await service.listAnswerRecords(identity, {
      academyId,
      results: ["ACCEPTED", "IN_PROGRESS"],
    });

    expect(rowsWhere(prisma)).toMatchObject({
      AND: [{ status: { in: ["PASSED", "QUEUED", "RUNNING"] } }],
    });
  });

  it("composes course, module, and lecture facets against the live curriculum", async () => {
    const { service, prisma } = createService();

    await service.listAnswerRecords(identity, {
      academyId,
      courseIds: [courseId],
      moduleIds: [moduleId],
      lectureIds: [lectureId],
    });

    expect(rowsWhere(prisma)).toMatchObject({
      AND: [
        { courseId: { in: [courseId] } },
        { material: { is: { lecture: { courseModuleId: { in: [moduleId] } } } } },
        { material: { is: { lectureId: { in: [lectureId] } } } },
      ],
    });
  });

  /**
   * Class is an access path, not provenance. `some` collapses two classes that
   * both provide one course into one matching row rather than two.
   */
  it("filters by current class access through a collapsing relation", async () => {
    const { service, prisma } = createService();

    await service.listAnswerRecords(identity, { academyId, classIds: [classId] });

    expect(rowsWhere(prisma)).toMatchObject({
      AND: [
        {
          course: {
            classAssignments: {
              some: expect.objectContaining({
                classId: { in: [classId] },
                class: expect.objectContaining({
                  academyId,
                  status: "ACTIVE",
                }),
              }),
            },
          },
        },
      ],
    });
  });
});

describe("AnswerRecordsService facets", () => {
  it("offers only the curriculum this student has records in", async () => {
    const { service } = createService();

    const { facets } = await service.listAnswerRecords(identity, { academyId });

    expect(facets.courses).toEqual([
      { value: courseId, label: "Python Foundations" },
    ]);
    expect(facets.modules).toEqual([{ value: moduleId, label: "Basics" }]);
    expect(facets.lectures).toEqual([{ value: lectureId, label: "Addition" }]);
    expect(facets.classes).toEqual([{ value: classId, label: "Cohort A" }]);
  });

  it("narrows child options to the selected parent", async () => {
    const { service } = createService({
      attempted: [
        attemptedMaterial(),
        {
          lecture: {
            id: "60000000-0000-4000-8000-000000000002",
            title: "Loops",
            courseModule: {
              id: "50000000-0000-4000-8000-000000000002",
              title: "Control flow",
              course: {
                id: "40000000-0000-4000-8000-000000000002",
                title: "Other course",
              },
            },
          },
        },
      ],
    });

    const { facets } = await service.listAnswerRecords(identity, {
      academyId,
      courseIds: [courseId],
    });

    expect(facets.courses).toHaveLength(2);
    expect(facets.modules).toEqual([{ value: moduleId, label: "Basics" }]);
  });

  it("reports only the results that occur in this history", async () => {
    const { service } = createService({
      statusGroups: [
        { status: "PASSED", _count: { _all: 1 } },
        { status: "ERRORED", _count: { _all: 1 } },
      ],
    });

    const { facets } = await service.listAnswerRecords(identity, { academyId });

    expect(facets.results).toEqual(["ACCEPTED", "JUDGE_ERROR"]);
  });

  it("never publishes a count that would describe only the current page", async () => {
    const { service } = createService();

    const { facets } = await service.listAnswerRecords(identity, { academyId });

    expect(JSON.stringify(facets)).not.toContain('"count"');
  });
});

describe("AnswerRecordsService paging", () => {
  it("pages twenty at a time from the filtered query", async () => {
    const { service, prisma } = createService({ totalCount: 45 });

    const { pagination } = await service.listAnswerRecords(identity, {
      academyId,
      page: 2,
    });

    expect(pagination).toEqual({
      page: 2,
      pageSize: 20,
      totalCount: 45,
      pageCount: 3,
    });
    expect(prisma.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 20 }),
    );
  });

  it("canonicalizes a page past the end onto the last page with results", async () => {
    const { service, prisma } = createService({ totalCount: 45 });

    const { pagination } = await service.listAnswerRecords(identity, {
      academyId,
      page: 9,
    });

    expect(pagination.page).toBe(3);
    expect(prisma.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 40 }),
    );
  });

  it("canonicalizes to page 1 when the filtered query is empty", async () => {
    const { service } = createService({ rows: [], totalCount: 0 });

    const { pagination, rows } = await service.listAnswerRecords(identity, {
      academyId,
      page: 9,
    });

    expect(pagination).toMatchObject({ page: 1, pageCount: 0, totalCount: 0 });
    expect(rows).toEqual([]);
  });
});

describe("answer record ordering", () => {
  it("defaults to newest first with an id tiebreak", () => {
    expect(orderByFor(undefined, undefined)).toEqual([
      { createdAt: "desc" },
      { id: "desc" },
    ]);
  });

  it("gives every supported sort a deterministic tiebreak", () => {
    expect(orderByFor("problem", "asc")).toEqual([
      { problemTitle: "asc" },
      { id: "asc" },
    ]);
    expect(orderByFor("result", "desc")).toEqual([
      { status: "desc" },
      { id: "desc" },
    ]);
    expect(orderByFor("score", "desc")).toEqual([
      { score: "desc" },
      { id: "desc" },
    ]);
    expect(orderByFor("submitted", "asc")).toEqual([
      { createdAt: "asc" },
      { id: "asc" },
    ]);
  });

  /** "Not recorded" is an absence, not the shortest duration. */
  it("sorts unrecorded solve times last in both directions", () => {
    expect(orderByFor("solveTime", "asc")[0]).toEqual({
      solveElapsedSec: { sort: "asc", nulls: "last" },
    });
    expect(orderByFor("solveTime", "desc")[0]).toEqual({
      solveElapsedSec: { sort: "desc", nulls: "last" },
    });
  });
});
