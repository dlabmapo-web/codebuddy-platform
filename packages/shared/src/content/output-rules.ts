import { isOutputCorrect, type SubmissionResult } from "./submission.js";

/**
 * Mistakes that a failed public case's output shows by itself, without AI.
 *
 * Each describes only what the two outputs show. When none clearly applies the
 * answer is null: silence is better than a guess. Copy for each key lives in
 * the `learning-help` namespace.
 *
 * See §2 of the Cove AI learning assistant data document.
 */
export const outputRuleKeys = [
  "no_output",
  "letter_case",
  "spacing",
  "line_breaks",
  "number_format",
  "punctuation",
  "missing_lines",
  "extra_lines",
  "extra_text",
] as const;
export type OutputRuleKey = (typeof outputRuleKeys)[number];

/** Stored output is cut at this length, so a longer one may be incomplete. */
export const STORED_OUTPUT_LIMIT = 10_000;

/** Must stay identical to the grader's `normalizeOutput`. */
export function normalizeGradedOutput(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/\s+$/u, "");
}

const decimal = /^-?\d+(?:\.\d+)?$/;

export function outputRuleFor(expected: string, actual: string): OutputRuleKey | null {
  const wanted = normalizeGradedOutput(expected);
  const got = normalizeGradedOutput(actual);
  if (wanted === got) return null;
  if (got === "") return "no_output";
  if (wanted.toLowerCase() === got.toLowerCase()) return "letter_case";

  const wantedLines = wanted.split("\n");
  const gotLines = got.split("\n");
  const squeeze = (line: string) => line.replace(/[ \t]+/g, "");
  if (
    wantedLines.length === gotLines.length &&
    wantedLines.every((line, index) => squeeze(line) === squeeze(gotLines[index]!))
  ) return "spacing";
  if (words(wanted) === words(got)) return "line_breaks";
  if (decimal.test(wanted) && decimal.test(got) && Number(wanted) === Number(got)) return "number_format";
  if (!/\d/.test(wanted) && !/\d/.test(got)) {
    const plain = (text: string) => text.replace(/[.,!?;:]/g, "");
    if (plain(wanted) === plain(got)) return "punctuation";
  }
  if (gotLines.length < wantedLines.length && startsWithLines(wantedLines, gotLines)) return "missing_lines";
  if (gotLines.length > wantedLines.length && startsWithLines(gotLines, wantedLines)) return "extra_lines";
  return containsWhole(got, wanted) ? "extra_text" : null;
}

/**
 * The rule that explains a failed submission, from its first wrong public case.
 *
 * Only exact-equality cases are read: a pattern's expectation is not an output
 * to compare with. Output at the stored limit may be cut, so it says nothing.
 */
export function explainOutput(
  result: Pick<SubmissionResult, "status" | "cases">,
): { rule: OutputRuleKey; position: number } | null {
  if (result.status !== "FAILED") return null;
  const failed = result.cases.find(
    (item) => item.isSample && !isOutputCorrect(item.outcome) && item.outcome !== "SKIPPED",
  );
  if (!failed || failed.outcome !== "WRONG_OUTPUT") return null;
  if ((failed.comparator ?? null) !== "STDOUT") return null;
  if (failed.expectedOutput === null || failed.actualOutput === null) return null;
  if (failed.actualOutput.length >= STORED_OUTPUT_LIMIT) return null;
  const rule = outputRuleFor(failed.expectedOutput, failed.actualOutput);
  return rule ? { rule, position: failed.position } : null;
}

function words(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(" ");
}

function startsWithLines(lines: string[], prefix: string[]): boolean {
  return prefix.every((line, index) => line === lines[index]);
}

/** `Sum: 7` holds a whole `7`; `17`, `-7` and `3.7` do not. */
function containsWhole(text: string, part: string): boolean {
  for (let at = text.indexOf(part); at !== -1; at = text.indexOf(part, at + 1)) {
    const before = text.charAt(at - 1);
    const after = text.charAt(at + part.length);
    if ((before === "" || /[\s:]/.test(before)) && (after === "" || /\s/.test(after))) return true;
  }
  return false;
}
