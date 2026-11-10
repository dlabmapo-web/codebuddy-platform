import { nativeRuntimeVersion } from "@cove/grading-runtime";
import type { NativeGccDescriptor } from "@cove/shared";
import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../database/prisma.service.js";
import type { PointAwardService } from "../points/point-award.service.js";
import type { OutputComparator } from "./comparator-pool.js";
import type { CompileRequest, CompileResult, ExecutionEngine, ExecutionResult } from "./execution-engine.js";
import { GradingService } from "./grading.service.js";

const submissionId = "50000000-0000-4000-8000-000000000002";
const digest = `sha256:${"1".repeat(64)}`;
const artifact = `sha256:${"a".repeat(64)}`;
const lease = "60000000-0000-4000-8000-000000000001";

const gcc: NativeGccDescriptor = {
  schemaVersion: 1,
  engine: "native-gcc",
  gccVersion: "12.2.0",
  architecture: "arm64",
  toolchainRootfsDigest: digest,
  runRootfsDigest: digest,
  packageManifestDigest: digest,
  compile: { C: { argv: ["/usr/bin/gcc-12"] }, CPP: { argv: ["/usr/bin/g++-12"], pchDigest: digest } },
  nsjailRevision: "d8415bc8eea43cdd413daba25af63127019a1189",
  nsjailBinaryDigest: digest,
  sandboxPolicyVersion: "nsjail-gcc-v1",
  compilePolicyDigest: digest,
  runPolicyDigest: digest,
  execGateDigest: digest,
  comparator: { engine: "pyodide", version: "0.27.5", packageDigest: digest, semanticsVersion: "cove-python-comparator-v1" },
};

const profile = {
  language: "C",
  inputPromptPolicy: "INCLUDE",
  gradingMode: "ELICE_STDIO",
  gradingSemanticVersion: "elice-v1",
  totalTimeLimitMs: 60_000,
  comparatorTimeLimitMs: 100,
  continuationPolicy: "CONTINUE_WITHIN_BUDGET",
  exitStatusPolicy: "FAIL_ON_RUNTIME_ERROR",
  materialMaximumHundredths: 10_000,
  materialScorePolicy: "PROPORTIONAL",
  regradeRunId: null,
  classId: null,
  executionRuntimeSnapshot: gcc,
  gradingPolicySnapshot: {
    version: 5,
    language: "C",
    inputPromptPolicy: "INCLUDE",
    semanticVersion: "elice-v1",
    runtime: gcc,
    comparator: { runtime: "pyodide-cpython", engineVersion: "0.27.5", budgetMs: 100 },
    ceilings: { totalTimeLimitMs: 60_000, caseTimeLimitMs: 1_000, memoryLimitMb: 256, outputBytes: 262_144 },
  },
};

const cases = [30, 30, 40].map((weight, index) => ({
  position: index + 1,
  isSample: index === 0,
  input: `case-${index + 1}`,
  expectedOutput: `answer-${index + 1}`,
  comparator: "STDOUT",
  weight,
  timeLimitMsOverride: null,
  softTimeLimitMs: null,
  softPenalty: null,
  label: null,
  effectiveTimeLimitMs: 1_000,
}));

function createService(options: {
  compile?: (request: CompileRequest) => Promise<CompileResult>;
  run?: (stdin: string) => Promise<ExecutionResult>;
  profile?: Record<string, unknown>;
  engineVersion?: string;
  compiles?: boolean;
} = {}) {
  const submission = {
    id: submissionId,
    userId: "10000000-0000-4000-8000-000000000001",
    materialId: "20000000-0000-4000-8000-000000000001",
    courseId: "30000000-0000-4000-8000-000000000001",
    gradingRevision: 1,
    timeLimitMs: 1_000,
    memoryLimitMb: 256,
    code: '#include <stdio.h>\nint main(void) { return 0; }\n',
    ...profile,
    ...(options.profile ?? {}),
    gradingCases: cases,
    material: { programmingExercise: { gradingRevision: 1 } },
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ grading_revision: 1 }]),
    submission: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    submissionCase: { createMany: vi.fn().mockResolvedValue({ count: 3 }) },
    studentExerciseProgress: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    submission: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue(submission),
    },
    $transaction: vi.fn(async (input: unknown) => (typeof input === "function" ? input(tx) : [])),
  } as unknown as PrismaService;
  const compile = vi.fn(options.compile ?? (async (_request: CompileRequest): Promise<CompileResult> =>
    ({ status: "COMPILED", artifact, lease, diagnostics: "", compileMs: 40, cached: false })));
  const run = vi.fn(async (request: { stdin: string }) =>
    options.run ? options.run(request.stdin) : { stdout: `answer-${request.stdin.split("-")[1]}\n`, stderr: "", outcome: "PASSED" as const, runtimeMs: 2 });
  const release = vi.fn().mockResolvedValue(undefined);
  const engine = {
    version: options.engineVersion ?? nativeRuntimeVersion(gcc),
    run,
    ...(options.compiles === false ? {} : { compile, release }),
    dispose: vi.fn(),
  } as unknown as ExecutionEngine;
  const comparator = {
    version: "pyodide-0.27.5",
    compare: vi.fn(async (request: { actual: string; expected: string }) =>
      request.actual.trimEnd() === request.expected ? { kind: "match" as const } : { kind: "no-match" as const }),
  } satisfies OutputComparator;
  const points = { awardSolve: vi.fn() } as unknown as PointAwardService;
  return { prisma, tx, compile, run, release, service: new GradingService(prisma, engine, points, comparator) };
}

describe("GradingService with a compiled language", () => {
  it("compiles once, runs every case on the leased program and releases it after the last", async () => {
    const { service, tx, compile, run, release } = createService();
    await service.grade(submissionId, async () => undefined);

    expect(compile).toHaveBeenCalledTimes(1);
    expect(compile.mock.calls[0]![0]).toMatchObject({ language: "C", code: expect.stringContaining("main") });
    expect(run).toHaveBeenCalledTimes(3);
    for (const [request] of run.mock.calls) expect(request).toMatchObject({ artifact, lease });
    expect(release).toHaveBeenCalledExactlyOnceWith(lease);
    expect(release.mock.invocationCallOrder[0]).toBeGreaterThan(run.mock.invocationCallOrder[2]!);
    expect(tx.submission.updateMany.mock.calls[0]![0].data).toMatchObject({ status: "PASSED", score: 100 });
    expect(tx.submission.updateMany.mock.calls[0]![0].data).not.toHaveProperty("compileFailed");
  });

  it("records a compile error as a failed attempt worth 0, with GCC's messages and no case run", async () => {
    const diagnostics = "main.c:1:30: error: 'x' undeclared (first use in this function)\n";
    const { service, tx, run, release } = createService({
      compile: async () => ({ status: "COMPILE_ERROR", reason: "ERRORS", diagnostics, compileMs: 30, cached: false }),
    });
    await service.grade(submissionId, async () => undefined);

    expect(run).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    const data = tx.submission.updateMany.mock.calls[0]![0].data;
    expect(data).toMatchObject({ status: "FAILED", score: 0, passedCount: 0, earnedWeight: 0, compileFailed: true, compileDiagnostics: diagnostics });
    const rows = tx.submissionCase.createMany.mock.calls[0]![0].data;
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row).toMatchObject({ outcome: "SKIPPED", executionState: "NOT_RUN", exitCode: null, exitSignal: null });
    // A learner's mistake counts as an attempt: progress is written like any verdict.
    expect(tx.studentExerciseProgress.upsert.mock.calls[0]![0].create).toMatchObject({ attemptCount: 1 });
  });

  it("keeps a crashed program's ending, and only for runtime errors", async () => {
    const { service, tx } = createService({
      run: async (stdin) => stdin === "case-1"
        ? { stdout: "", stderr: "", outcome: "RUNTIME_ERROR", runtimeMs: 1, termination: { signal: "SIGSEGV" } }
        : stdin === "case-2"
          ? { stdout: "", stderr: "", outcome: "RUNTIME_ERROR", runtimeMs: 1, termination: { exit: 3 } }
          : { stdout: "answer-3\n", stderr: "", outcome: "PASSED", runtimeMs: 1 },
    });
    await service.grade(submissionId, async () => undefined);
    const rows = tx.submissionCase.createMany.mock.calls[0]![0].data;
    expect(rows.map((row: { exitCode: number | null; exitSignal: string | null }) => [row.exitCode, row.exitSignal]))
      .toEqual([[null, "SIGSEGV"], [3, null], [null, null]]);
    expect(tx.submission.updateMany.mock.calls[0]![0].data).toMatchObject({ status: "FAILED", earnedWeight: 40 });
  });

  it("treats a compiler infrastructure failure as a judge error that is not an attempt", async () => {
    const { service, tx, run, release } = createService({ compile: async () => { throw new Error("socket closed"); } });
    await service.grade(submissionId, async () => undefined);
    expect(run).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    expect(tx.submission.updateMany.mock.calls[0]![0].data).toMatchObject({ status: "ERRORED", gradingAborted: true });
    expect(tx.studentExerciseProgress.upsert).not.toHaveBeenCalled();
  });

  it("never grades C on an engine that runs source", async () => {
    const pyodide = createService({ engineVersion: "pyodide-0.27.5", compiles: false, profile: { executionRuntimeSnapshot: null } });
    await pyodide.service.grade(submissionId, async () => undefined);
    expect(pyodide.run).not.toHaveBeenCalled();
    expect(pyodide.prisma.submission.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "ERRORED", failureReason: "RUNTIME_VERSION_MISMATCH" }),
    }));
    // A Python submission recorded against the GCC family is refused the same way.
    const python = createService({ profile: { language: "PYTHON" } });
    await python.service.grade(submissionId, async () => undefined);
    expect(python.compile).not.toHaveBeenCalled();
    expect(python.run).not.toHaveBeenCalled();
  });
});
