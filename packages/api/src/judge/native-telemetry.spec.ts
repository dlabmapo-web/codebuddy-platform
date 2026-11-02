import { expect, it } from "vitest";
import { measuredNativeClient } from "./native-telemetry.js";
import { ExecutionTelemetry, withExecutionKind } from "./execution-telemetry.js";
import type { NativeExecutionClient } from "@cove/grading-runtime";
it("records only trusted stage durations with the active execution kind", async () => {
  const telemetry = new ExecutionTelemetry();
  const client = { version: "native", run: async () => ({ outcome: "PASSED", stdout: "forged timing", timings: { startupMs: 2, executionMs: 3, cleanupMs: 4, acquisitionMs: 1 } }) } as unknown as NativeExecutionClient;
  await withExecutionKind("sample", () => measuredNativeClient(client, telemetry).run({ code: "print(1)", stdin: "", memoryLimitMb: 128, timeLimitMs: 1000 }));
  expect(telemetry.snapshot().map(({ stage, kind, sum }) => [stage, kind, sum])).toEqual([["prepare", "sample", .002], ["execute", "sample", .003], ["cleanup", "sample", .004], ["acquire", "sample", .001]]);
});
