import { normalizeGradedOutput, outputRuleFor } from "@cove/shared";

/**
 * How a wrong output differs from the expected one, as a single word.
 *
 * Worked out where both outputs are known: in the grader, for every test. A
 * hidden test keeps this word and never what it printed, so a student cannot
 * read hidden data back; the AI teacher's analysis reads the word as a count.
 */
export type DifferenceKind =
  | "nothing" | "extra_lines" | "missing_lines" | "line_breaks" | "spaces" | "letter_case"
  | "number_format" | "punctuation" | "extra_text" | "too_small" | "too_big" | "different";

export const differenceKinds: readonly DifferenceKind[] = [
  "nothing", "extra_lines", "missing_lines", "line_breaks", "spaces", "letter_case",
  "number_format", "punctuation", "extra_text", "too_small", "too_big", "different",
];

const decimal = /^-?\d+(?:\.\d+)?$/;

export function differenceOf(expected: string, printed: string, comparator: string | null): DifferenceKind {
  if (comparator && comparator !== "STDOUT") return "different";
  const want = normalizeGradedOutput(expected);
  const got = normalizeGradedOutput(printed);
  if (got === "") return "nothing";
  switch (outputRuleFor(expected, printed)) {
    case "no_output": return "nothing";
    case "letter_case": return "letter_case";
    case "spacing": return "spaces";
    case "line_breaks": return "line_breaks";
    case "number_format": return "number_format";
    case "punctuation": return "punctuation";
    case "missing_lines": return "missing_lines";
    case "extra_lines": return "extra_lines";
    case "extra_text": return "extra_text";
    default: break;
  }
  if (decimal.test(want) && decimal.test(got)) return Number(got) < Number(want) ? "too_small" : "too_big";
  return "different";
}
