import { z } from "zod";

import { caseComparatorSchema } from "./course.js";
import { programExitSignalSchema } from "./submission.js";

/**
 * Public sample checks: a student's Test button, judged by the server.
 *
 * A check runs exactly one public (SAMPLE) case of an enhanced-grading
 * problem through the same runner and CPython comparator Submit uses, and
 * reports that one case back. It is practice: it is never a submission, never
 * an attempt, and never a score. Nothing here can name a hidden case — the
 * input addresses a public case by the position the workspace already shows,
 * and the result describes only that case.
 */

/**
 * Where a check is.
 *
 * `COMPLETED` means the case was judged and `result` holds its outcome — a
 * wrong answer is a completed check. Everything after it in this list is a
 * check that did *not* judge the program, and none of them is the student's
 * failure: `UNAVAILABLE` is ours (sandbox, comparator, runtime or authoring),
 * `TIMED_OUT` is the practice run's own queue or deadline running out, which
 * is different from the program exceeding a case limit.
 */
export const sampleCheckStatuses = [
  "QUEUED",
  "RUNNING",
  "STOPPING",
  "COMPLETED",
  "UNAVAILABLE",
  "TIMED_OUT",
  "CANCELLED",
  "EXPIRED",
] as const;
export const sampleCheckStatusSchema = z.enum(sampleCheckStatuses);
export type SampleCheckStatus = z.infer<typeof sampleCheckStatusSchema>;

/** Still moving: the browser keeps polling. */
export function isSampleCheckActive(status: SampleCheckStatus): boolean {
  return status === "QUEUED" || status === "RUNNING" || status === "STOPPING";
}

/** What a judged sample concluded. Skipped and aggregate states do not apply. */
export const sampleCheckOutcomes = [
  "PASSED",
  "PASSED_WITH_WARNING",
  "WRONG_OUTPUT",
  "RUNTIME_ERROR",
  "TIME_LIMIT",
  "MEMORY_LIMIT",
  /** C/C++: the program did not compile, so it never ran. */
  "COMPILE_ERROR",
] as const;
export const sampleCheckOutcomeSchema = z.enum(sampleCheckOutcomes);
export type SampleCheckOutcome = z.infer<typeof sampleCheckOutcomeSchema>;

/** The largest output a result displays; comparison always used the whole. */
export const sampleCheckDisplayLimit = 16_000;

export const startSampleCheckSchema = z
  .object({
    academyId: z.uuid(),
    classId: z.uuid(),
    materialId: z.uuid(),
    /** The public case's position, exactly as the workspace lists it. */
    position: z.number().int().positive(),
    code: z.string().min(1).max(100_000),
    /**
     * The grading revision the workspace was loaded at. A mismatch is a
     * refresh-required conflict, so a reordered case list can never make a
     * position select a different case than the one the student sees.
     */
    workspaceRevision: z.number().int().positive(),
    /** Chosen per click, so a double click or a retry starts one check. */
    clientRequestId: z.uuid(),
  })
  .strict();
export type StartSampleCheckInput = z.infer<typeof startSampleCheckSchema>;

/** The largest stdin a C/C++ Run sends: typed or pasted text, not a test file. */
export const runCheckStdinLimit = 65_536;

/**
 * A C/C++ Run: the student's code on the input they typed, on the server.
 *
 * Practice like a sample check, and judged by nothing: no expected output, no
 * comparison, no submission. It shares the sample-check store, limits and
 * polling, and its view reports `kind: "run"` with no position.
 */
export const startRunCheckSchema = z
  .object({
    academyId: z.uuid(),
    classId: z.uuid(),
    materialId: z.uuid(),
    code: z.string().min(1).max(100_000),
    stdin: z.string().max(runCheckStdinLimit),
    workspaceRevision: z.number().int().positive(),
    clientRequestId: z.uuid(),
    /**
     * The terminal's End input (Ctrl+D): `stdin` is all there is, so reading
     * past it is end of file. Otherwise the program's input stays open and a
     * program waiting for more comes back `awaitingInput`.
     */
    endOfInput: z.boolean().optional(),
  })
  .strict();
export type StartRunCheckInput = z.infer<typeof startRunCheckSchema>;

/**
 * A staff member's own C/C++ practice: the same Run and public-case checks,
 * with no class. Authorized as staff practice is, including an unpublished
 * preview at the revision the author is editing.
 */
const practiceCheck = { preview: z.boolean().optional() };
export const startPracticeSampleCheckSchema = startSampleCheckSchema.omit({ classId: true }).extend(practiceCheck).strict();
export type StartPracticeSampleCheckInput = z.infer<typeof startPracticeSampleCheckSchema>;
export const startPracticeRunCheckSchema = startRunCheckSchema.omit({ classId: true }).extend(practiceCheck).strict();
export type StartPracticeRunCheckInput = z.infer<typeof startPracticeRunCheckSchema>;

export const sampleCheckInputSchema = z
  .object({ academyId: z.uuid(), checkId: z.uuid() })
  .strict();

export const sampleCheckResultSchema = z.object({
  outcome: sampleCheckOutcomeSchema,
  /**
   * Whether the output satisfied the rule. Null when the program never got as
   * far as producing output worth comparing (crash, limit).
   */
  outputMatched: z.boolean().nullable(),
  /** Matched, but slower than the case's soft threshold: it would lose points. */
  softLimitExceeded: z.boolean(),
  /** The program's own output, shown as printed — never trimmed. */
  stdout: z.string(),
  stdoutTruncated: z.boolean(),
  stderr: z.string(),
  stderrTruncated: z.boolean(),
  /**
   * The public rule and its expected text or pattern, for explaining a
   * mismatch. Null when the case is no longer public, or changed, since the
   * check was accepted: what was already shown cannot be recalled, but
   * nothing new is disclosed.
   */
  rule: z
    .object({ comparator: caseComparatorSchema, expected: z.string() })
    .nullable(),
  /** C/C++: how the program ended when it was a runtime error. */
  exitCode: z.number().int().min(0).max(255).nullable().optional(),
  exitSignal: programExitSignalSchema.nullable().optional(),
  /** C/C++: GCC's messages, warnings included, or null for Python. */
  compileDiagnostics: z.string().nullable().optional(),
  /** A C/C++ Run ended while its program waited for more input: the terminal asks for it. */
  awaitingInput: z.boolean().optional(),
});
export type SampleCheckResult = z.infer<typeof sampleCheckResultSchema>;

export const sampleCheckViewSchema = z.object({
  checkId: z.uuid(),
  /** A public sample's check, or a C/C++ Run on the student's own input. */
  kind: z.enum(["sample", "run"]).optional(),
  status: sampleCheckStatusSchema,
  position: z.number().int().positive().nullable(),
  /** SHA-256 of the code as submitted, so a result binds to its source. */
  codeHash: z.string().nullable(),
  exerciseRevision: z.number().int().positive().nullable(),
  /** Present only when `status` is `COMPLETED`. */
  result: sampleCheckResultSchema.nullable(),
  /** True when the problem changed after this check: refresh before reusing it. */
  refreshRequired: z.boolean(),
  timings: z.object({
    queueMs: z.number().int().nonnegative().nullable(),
    executionMs: z.number().int().nonnegative().nullable(),
    comparisonMs: z.number().int().nonnegative().nullable(),
  }),
});
export type SampleCheckView = z.infer<typeof sampleCheckViewSchema>;
