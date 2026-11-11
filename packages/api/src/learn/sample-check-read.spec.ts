import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { AcademyAccessService } from "../authorization/academy-access.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { JudgeQueue } from "../judge/judge.queue.js";
import { SampleCheckStore, type SampleCheckRecord } from "../judge/sample-check.store.js";
import type { LearningClassContextService } from "./learning-class-context.service.js";
import { SampleCheckService } from "./sample-check.service.js";

const record: SampleCheckRecord = {
  checkId: "check", userId: "student", academyId: "academy", classId: "class", materialId: "material",
  position: 2, exerciseRevision: 3, codeHash: "hash", requestHash: "request", clientRequestId: "client",
  status: "COMPLETED", acceptedAt: 1, dispatchedAt: 2, finishedAt: 3, lostAfter: 999,
  snapshot: { gradingMode: "LEGACY_STDIO", engineVersion: "pyodide-0.27.5", code: "print(1)", memoryLimitMb: 256,
    totalTimeLimitMs: 60_000, comparatorTimeLimitMs: 1,
    testCase: { input: "", expectedOutput: "1", comparator: "STDOUT", softTimeLimitMs: null, caseLimitMs: 1000 } },
  result: { outcome: "PASSED", outputMatched: true, softLimitExceeded: false, stdout: "1", stdoutTruncated: false, stderr: "", stderrTruncated: false },
  failure: null, timings: { queueMs: 1, executionMs: 1, comparisonMs: 1 },
};

function fixture() {
  const findFirst = vi.fn().mockResolvedValue({ programmingExercise: {
    gradingRevision: 3, testCases: [{ position: 2, visibility: "SAMPLE" }],
  } });
  const requirePermission = vi.fn().mockResolvedValue({ userId: "student", academyId: "academy", role: "STUDENT", roles: ["STUDENT"], via: "membership" });
  vi.spyOn(SampleCheckStore.prototype, "get").mockResolvedValue(structuredClone(record));
  const service = new SampleCheckService({ material: { findFirst } } as unknown as PrismaService,
    { requirePermission } as unknown as AcademyAccessService, new ConfigService(),
    {} as LearningClassContextService, { redis: vi.fn() } as unknown as JudgeQueue);
  const read = () => service.get({ authUserId: "auth-student" } as SupabaseIdentity, { academyId: "academy", checkId: "check" });
  const hold = (waitWhile: SampleCheckRecord["status"], signal?: AbortSignal) =>
    service.get({ authUserId: "auth-student" } as SupabaseIdentity, { academyId: "academy", checkId: "check", waitWhile }, signal);
  return { findFirst, requirePermission, read, hold };
}

afterEach(() => vi.restoreAllMocks());

describe("sample-check status read", () => {
  it("reads only current revision and selected public-case visibility, after current authorization", async () => {
    const { read, findFirst, requirePermission } = fixture();
    const result = await read();
    expect(requirePermission).toHaveBeenCalledWith("auth-student", "academy", "curriculum.read");
    expect(findFirst.mock.calls[0]![0]).toMatchObject({ where: { id: "material", AND: expect.arrayContaining([
      expect.objectContaining({ isVisible: true, lecture: { isVisible: true,
        courseModule: { isVisible: true, course: { academyId: "academy", isVisible: true } },
      } }),
      expect.objectContaining({ lecture: { courseModule: { course: expect.objectContaining({ academyId: "academy" }) } } }),
    ]) }, select: {
      programmingExercise: { select: { gradingRevision: true, testCases: {
        where: { position: 2, visibility: "SAMPLE" }, select: { position: true, visibility: true },
      } } },
    } });
    expect(result.result?.rule).toEqual({ comparator: "STDOUT", expected: "1" });
    expect(result.refreshRequired).toBe(false);
    expect(result).not.toHaveProperty("snapshot");
  });

  it.each([
    { gradingRevision: 4, testCases: [{ position: 2, visibility: "SAMPLE" }] },
    { gradingRevision: 3, testCases: [] },
    { gradingRevision: 3, testCases: [{ position: 2, visibility: "HIDDEN" }] },
    { gradingRevision: 3, testCases: [{ position: 1, visibility: "SAMPLE" }] },
  ])("withholds the rule after an edit, hide or reorder", async exercise => {
    const { read, findFirst } = fixture();
    findFirst.mockResolvedValue({ programmingExercise: exercise });
    const result = await read();
    expect(result.result?.rule).toBeNull();
    expect(result.refreshRequired).toBe(true);
  });

  it("does not read material data for somebody else's record", async () => {
    const { read, findFirst } = fixture();
    vi.mocked(SampleCheckStore.prototype.get).mockResolvedValue({ ...record, userId: "another-student" });
    expect((await read()).status).toBe("EXPIRED");
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("refuses after permission or material reachability is lost", async () => {
    const { read, findFirst, requirePermission } = fixture();
    requirePermission.mockRejectedValueOnce(new Error("revoked"));
    await expect(read()).rejects.toThrow("revoked");
    expect(findFirst).not.toHaveBeenCalled();
    findFirst.mockResolvedValue(null);
    await expect(read()).rejects.toThrow();
  });
});

describe("sample-check held read", () => {
  const active = (status: SampleCheckRecord["status"]): SampleCheckRecord =>
    ({ ...structuredClone(record), status, result: null, finishedAt: null, lostAfter: Date.now() + 60_000, acceptedAt: Date.now() });

  it("answers the moment the check finishes, authorizing once and reading only Redis while it waits", async () => {
    const { hold, findFirst, requirePermission } = fixture();
    const get = vi.mocked(SampleCheckStore.prototype.get);
    get.mockResolvedValueOnce(active("RUNNING")).mockResolvedValueOnce(active("RUNNING")).mockResolvedValue(structuredClone(record));
    const started = Date.now();
    const result = await hold("RUNNING");
    expect(result.status).toBe("COMPLETED");
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(requirePermission).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(get.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("answers a finished check at once", async () => {
    const { hold } = fixture();
    const get = vi.mocked(SampleCheckStore.prototype.get);
    const result = await hold("QUEUED");
    expect(result.status).toBe("COMPLETED");
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("gives a check that has just started running a moment to finish, then reports it running", async () => {
    const { hold } = fixture();
    vi.mocked(SampleCheckStore.prototype.get).mockResolvedValueOnce(active("QUEUED")).mockResolvedValue(active("RUNNING"));
    const started = Date.now();
    expect((await hold("QUEUED")).status).toBe("RUNNING");
    expect(Date.now() - started).toBeGreaterThanOrEqual(350);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("stops waiting when the browser goes away", async () => {
    const { hold } = fixture();
    vi.mocked(SampleCheckStore.prototype.get).mockResolvedValue(active("RUNNING"));
    const abort = new AbortController();
    setTimeout(() => abort.abort(), 120);
    const started = Date.now();
    expect((await hold("RUNNING", abort.signal)).status).toBe("RUNNING");
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
