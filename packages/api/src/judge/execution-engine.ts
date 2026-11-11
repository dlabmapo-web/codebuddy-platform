import type { CaseOutcome, InputPromptPolicy, ProgramExitSignal } from "@cove/shared";
import { gradingDataLimits } from "@cove/shared/grading-limits";

/**
 * Maximum captured stdout, recorded in every enhanced submission's policy
 * snapshot. Diagnostic stderr has a separate, smaller bound.
 */
export const MAX_OUTPUT_BYTES = gradingDataLimits.stdoutBytes;

export type ExecutionRequest = {
  /** Trusted infrastructure cancellation; never accepted from the wire as data. */
  signal?: AbortSignal;
  inputPromptPolicy?: InputPromptPolicy;
  code: string;
  stdin: string;
  /** Student execution budget once the runner is ready; excludes acquisition. */
  timeLimitMs: number;
  memoryLimitMb: number;
  /** Frozen enhanced-policy cap; older submissions retain their smaller cap. */
  outputLimitBytes?: number;
  /** A compiled language: the leased artifact this case runs instead of `code`. */
  artifact?: string;
  lease?: string;
  /** A C/C++ Run: input stays open, and a program waiting for more ends as `awaitingInput`. */
  holdStdin?: boolean;
};

export type ExecutionResult = {
  stdout: string;
  stderr: string;
  outcome: CaseOutcome;
  runtimeMs: number;
  /** Captured stdout is incomplete and cannot be accepted as a correct answer. */
  outputTruncated?: boolean;
  /** A compiled program's runtime error: its exit code or signal. */
  termination?: { exit: number } | { signal: ProgramExitSignal };
  /** A held Run stopped while its program waited for more input. */
  awaitingInput?: boolean;
};

export type CompileRequest = {
  language: "C" | "CPP";
  code: string;
  /** How long the attempt holds its program: at most its whole job budget. */
  leaseMs: number;
  signal?: AbortSignal;
};

export type CompileResult =
  | { status: "COMPILED"; artifact: string; lease: string; diagnostics: string; compileMs: number; cached: boolean }
  | { status: "COMPILE_ERROR"; reason: "ERRORS" | "LIMITS"; diagnostics: string; compileMs: number; cached: boolean };

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
  /**
   * How much slower than native CPython this engine runs student code; 1 when
   * absent. Limits are authored in native time, so a scaled engine takes
   * `limit × timeScale` and reports runtimes ÷ timeScale (`time-scaled-engine.ts`),
   * and callers convert wall-clock deadlines with the same factor.
   */
  readonly timeScale?: number;
  run(request: ExecutionRequest): Promise<ExecutionResult>;
  /**
   * Compiled languages only: builds the program once per attempt and leases
   * it. Every case then runs the artifact; `release` ends the lease after the
   * last case. Absent on an engine that runs source.
   */
  compile?(request: CompileRequest): Promise<CompileResult>;
  release?(lease: string): Promise<void>;
  dispose(): Promise<void>;
}
