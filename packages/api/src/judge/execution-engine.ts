import type { CaseOutcome } from "@cove/shared";
import { gradingDataLimits } from "@cove/shared/grading-limits";

/**
 * Maximum captured stdout, recorded in every enhanced submission's policy
 * snapshot. Diagnostic stderr has a separate, smaller bound.
 */
export const MAX_OUTPUT_BYTES = gradingDataLimits.stdoutBytes;

export type ExecutionRequest = {
  code: string;
  stdin: string;
  /** Student execution budget once the runner is ready; excludes acquisition. */
  timeLimitMs: number;
  memoryLimitMb: number;
  /** Frozen enhanced-policy cap; older submissions retain their smaller cap. */
  outputLimitBytes?: number;
};

export type ExecutionResult = {
  stdout: string;
  stderr: string;
  outcome: CaseOutcome;
  runtimeMs: number;
  /** Captured stdout is incomplete and cannot be accepted as a correct answer. */
  outputTruncated?: boolean;
};

/**
 * Runs untrusted student code.
 *
 * An interface rather than a direct Pyodide call so a container sandbox
 * (nsjail, Firecracker) can replace it when a second language arrives. Only the
 * judge process ever holds one — nothing reachable from a request handler.
 */
export interface ExecutionEngine {
  /** Recorded on every submission so a runtime upgrade stays auditable. */
  readonly version: string;
  run(request: ExecutionRequest): Promise<ExecutionResult>;
  dispose(): Promise<void>;
}
