import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gradingDataLimits } from "@cove/shared/grading-limits";

import { evaluateEnhancedCase } from "./case-evaluator.js";
import { ComparatorPool } from "./comparator-pool.js";
import { gradingSnapshotFor } from "./grading-profile.js";
import { SandboxExecutionEngine } from "./sandbox-engine.js";
import { sandboxRequestSchema } from "./sandbox-protocol.js";
import { startSandbox } from "./sandbox-server.js";

describe("large test cases through the real sandbox transport", () => {
  const directory = mkdtempSync(join(tmpdir(), "cove-large-tests-"));
  const socketPath = join(directory, "judge.sock");
  const engine = new SandboxExecutionEngine(socketPath, "0.27.5", false);
  const comparator = new ComparatorPool(1);
  let sandbox: Awaited<ReturnType<typeof startSandbox>>;
  beforeAll(async () => {
    sandbox = await startSandbox({socketPath, clientGid: null, concurrency: 1,
      spare: 0, pyodideVersion: "0.27.5", runnerUidBase: null, requireIsolation: false});
    await engine.warmUp();
    await comparator.warmUp();
  }, 120_000);
  afterAll(async () => {
    await engine.dispose();
    await comparator.dispose();
    await sandbox?.close();
    rmSync(directory, {recursive: true, force: true});
  });

  it("grades all 500,000 towers without clipping input or output", async () => {
    const n = 500_000;
    const heights = Array.from({length: n}, (_, i) => 100_000_000 - i);
    const input = `${n}\n${heights.join(" ")}\n`;
    const expectedOutput = Array.from({length: n}, (_, i) => i).join(" ");
    expect(Buffer.byteLength(input)).toBeGreaterThan(4 * 1024 * 1024);
    expect(Buffer.byteLength(expectedOutput)).toBeGreaterThan(256 * 1024);
    expect(sandboxRequestSchema.safeParse({type: "run", protocol: 2,
      id: "20000000-0000-4000-8000-000000000001",
      request: {code: "print(1)", stdin: input, timeLimitMs: 60_000, memoryLimitMb: 256},
    }).success).toBe(true);
    const result = await evaluateEnhancedCase({engine, comparator}, {
      code: `import sys
n = int(sys.stdin.readline())
heights = list(map(int, sys.stdin.readline().split()))
assert len(heights) == n
stack = []
receivers = []
for i, height in enumerate(heights):
    while stack and stack[-1][0] < height:
        stack.pop()
    receivers.append(str(stack[-1][1]) if stack else '0')
    stack.append((height, i + 1))
sys.stdout.write(' '.join(receivers))`,
      memoryLimitMb: 256, comparatorTimeLimitMs: gradingDataLimits.comparatorBudgetMs,
      deadlineAt: Date.now() + 65_000, executionBudgetMs: 60_000,
      outputLimitBytes: gradingDataLimits.stdoutBytes,
      testCase: {input, expectedOutput, comparator: "STDOUT", softTimeLimitMs: null, caseLimitMs: 60_000},
    });
    expect(result).toMatchObject({kind: "verdict", outcome: "PASSED"});
    if (result.kind !== "verdict") throw new Error(`unexpected ${result.kind}`);
    expect(result.run.stdout).toBe(expectedOutput);
  }, 90_000);

  it("enforces an older submission's output ceiling over the socket", async () => {
    const run = await engine.run({code: "print('x' * 400_000)", stdin: "",
      timeLimitMs: 3_000, memoryLimitMb: 256, outputLimitBytes: 256 * 1024});
    expect(Buffer.byteLength(run.stdout)).toBe(256 * 1024);
    expect(run.outputTruncated).toBe(true);
  }, 60_000);

  it("rejects over-limit inputs without truncating them", () => {
    expect(sandboxRequestSchema.safeParse({type: "run", protocol: 2,
      id: "20000000-0000-4000-8000-000000000001",
      request: {code: "print(1)", stdin: "x".repeat(gradingDataLimits.testTextChars + 1),
        timeLimitMs: 3_000, memoryLimitMb: 256},
    }).success).toBe(false);
  });

  it("records the enlarged output cap on new enhanced submissions", () => {
    const snapshot = gradingSnapshotFor({gradingMode: "ELICE_STDIO", gradingSemanticVersion: "elice-v1",
      totalTimeLimitMs: 60_000, comparatorTimeLimitMs: 100, timeLimitMs: 3_000, memoryLimitMb: 256,
      continuationPolicy: "CONTINUE_WITHIN_BUDGET", exitStatusPolicy: "FAIL_ON_RUNTIME_ERROR",
      materialMaximumHundredths: 10_000, materialScorePolicy: "PROPORTIONAL", testCases: [],
    }, {engineVersion: "0.27.5"});
    expect(snapshot.submission.gradingPolicySnapshot?.ceilings.outputBytes).toBe(gradingDataLimits.stdoutBytes);
    expect(snapshot.submission.gradingPolicySnapshot?.version).toBe(2);
  });
});
