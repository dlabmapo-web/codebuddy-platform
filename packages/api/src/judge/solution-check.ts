import { createHash } from "node:crypto";

import type { SolutionCheckError } from "@cove/shared";

/** Columns a check reads to rebuild the grading a student would get. */
export const solutionCheckExerciseSelect = {
  quiz: true, timeLimitMs: true, memoryLimitMb: true, gradingRevision: true,
  inputPromptPolicy: true, gradingMode: true, gradingSemanticVersion: true,
  totalTimeLimitMs: true, comparatorTimeLimitMs: true, continuationPolicy: true,
  exitStatusPolicy: true, materialMaximumHundredths: true, materialScorePolicy: true,
  testCases: {
    orderBy: { position: "asc" as const },
    select: {
      input: true, expectedOutput: true, visibility: true, label: true, comparator: true,
      weight: true, timeLimitMsOverride: true, softTimeLimitMs: true, softPenalty: true,
    },
  },
  solutions: { orderBy: { position: "asc" as const }, select: { title: true, code: true } },
};

/**
 * Identifies the saved official solutions. Saving replaces them without moving
 * the grading revision, so this is what notices a new or edited solution.
 */
export function solutionsDigest(codes: readonly string[]): string {
  const hash = createHash("sha256");
  for (const code of codes) hash.update(`${Buffer.byteLength(code)}:`).update(code);
  return hash.digest("hex");
}

const exceptionLine = /^([A-Za-z_][\w.]*(?:Error|Exception|Exit|Interrupt|Warning)|StopIteration)(?::\s?(.*))?$/;
const studentFrame = /^\s*File "(?:[^"]*\/)?main\.py", line (\d+)/;

/**
 * The exception that ended a program, from the traceback it printed.
 *
 * Both graders compile learner code as `main.py`, so the last frame in that
 * file is the line to point at; frames inside the standard library are not.
 */
export function summarizePythonError(stderr: string): SolutionCheckError | null {
  const lines = stderr.split(/\r\n?|\n/).map(line => line.trimEnd()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index--) {
    const match = exceptionLine.exec(lines[index]!);
    if (!match) continue;
    let line: number | null = null;
    for (let back = index - 1; back >= 0; back--) {
      const frame = studentFrame.exec(lines[back]!);
      if (frame) { line = Number(frame[1]); break; }
    }
    return {
      type: match[1]!.split(".").at(-1)!.slice(0, 80),
      message: (match[2] ?? "").slice(0, 200),
      line: line && line > 0 ? line : null,
    };
  }
  return null;
}
