import type { NativeExecutionClient } from "@cove/grading-runtime";
import { ExecutionTelemetry } from "./execution-telemetry.js";
/** Trusted monotonic durations only; no learner output and no cross-machine clock subtraction. */
export function measuredNativeClient(client: NativeExecutionClient, telemetry: ExecutionTelemetry) {
  return {
    version: client.version,
    async run(request: Parameters<NativeExecutionClient["run"]>[0]) {
      const result = await client.run(request);
      if (result.timings) {
        telemetry.observe("prepare", result.timings.startupMs);
        telemetry.observe("execute", result.timings.executionMs);
        telemetry.observe("cleanup", result.timings.cleanupMs);
        if (result.timings.acquisitionMs !== undefined) telemetry.observe("acquire", result.timings.acquisitionMs);
      }
      // The launcher measures sub-millisecond time. Every engine result is whole
      // milliseconds: stored and published case results, and the cumulative
      // budget that sets the next case's limit, are integers.
      return { ...result, runtimeMs: Math.round(result.runtimeMs) };
    },
    // A GCC client compiles once per attempt and runs the leased artifact.
    ...(client.descriptor?.engine === "native-gcc"
      ? {
          async compile(request: Parameters<NativeExecutionClient["compile"]>[0]) {
            const result = await client.compile(request);
            if (!result.cached) telemetry.observe("compile", result.compileMs);
            return { ...result, compileMs: Math.round(result.compileMs) };
          },
          release: (lease: string) => client.release(lease),
        }
      : {}),
    dispose: () => client.dispose(),
  };
}
