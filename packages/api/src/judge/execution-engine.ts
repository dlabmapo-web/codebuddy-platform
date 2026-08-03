import type { CaseOutcome } from "@cove/shared";

export type ExecutionRequest = {
  code: string;
  stdin: string;
  timeLimitMs: number;
  memoryLimitMb: number;
};

export type ExecutionResult = {
  stdout: string;
  stderr: string;
  outcome: CaseOutcome;
  runtimeMs: number;
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
