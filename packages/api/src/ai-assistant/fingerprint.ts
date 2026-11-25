import { isOutputCorrect, type CaseOutcome } from "@cove/shared";

/**
 * A program's result on every test of one grading revision, in order:
 * P passed, F failed, S skipped. It names no input or output, so a hidden
 * test's data stays where it is; it is read on the server only.
 */
export function fingerprintOf(cases: readonly { position: number; outcome: CaseOutcome }[]): string {
  return [...cases]
    .sort((a, b) => a.position - b.position)
    .map((item) => item.outcome === "SKIPPED" ? "S" : isOutputCorrect(item.outcome) ? "P" : "F")
    .join("");
}

export type FingerprintMatch = "exact" | "likely" | null;

/** Below this share of failed tests in common, two programs are not the same mistake. */
const LIKELY = 0.75;

/**
 * Whether a known wrong program fails the same tests as a student's.
 *
 * `exact` when every test agrees; `likely` when most failed tests are shared.
 * Fingerprints of different lengths come from different tests and never match.
 */
export function matchFingerprint(student: string, known: string | null): FingerprintMatch {
  if (!known || known.length !== student.length || !student.includes("F")) return null;
  if (known === student) return "exact";
  let both = 0;
  let either = 0;
  for (let i = 0; i < student.length; i++) {
    const a = student[i] === "F";
    const b = known[i] === "F";
    if (a && b) both++;
    if (a || b) either++;
  }
  return either > 0 && both / either >= LIKELY ? "likely" : null;
}
