import { describe, expect, it } from "vitest";

import { explainOutput, outputRuleFor, type OutputRuleKey } from "./output-rules.js";
import type { SubmissionCaseResult } from "./submission.js";

const matches: [string, string, OutputRuleKey | null][] = [
  ["Hello", "hello", "letter_case"],
  ["7", "Sum: 7", "extra_text"],
  ["1\n2\n3", "1 2 3 ", "line_breaks"],
  ["Hello, Mina!", "Hello Mina", "punctuation"],
  ["Hello", "", "no_output"],
  ["Hello", "\n", "no_output"],
  ["1 2", "12", "spacing"],
  ["a b\nc", "ab\nc", "spacing"],
  ["4", "4.0", "number_format"],
  ["a\nb\nc", "a\nb", "missing_lines"],
  ["Hello", "Hello\nHello", "extra_lines"],
  ["7", "7 apples", "extra_text"],
  ["7", "17", null],
  ["7", "-7", null],
  ["7", "3.7", null],
  ["7", "7.5", null],
  ["35", "3.5", null],
  ["3.5", "35", null],
  ["10", "15", null],
  ["5", "2", null],
  ["odd", "even", null],
  ["0\n1\n2", "1\n2\n3", null],
  ["Hello", "Hello", null],
  ["Hello\r\n", "Hello", null],
];

const item = (over: Partial<SubmissionCaseResult>): SubmissionCaseResult => ({
  position: 1, isSample: true, outcome: "WRONG_OUTPUT", runtimeMs: 1, input: "", expectedOutput: "Hello",
  actualOutput: "hello", weight: null, awardedWeight: null, comparator: "STDOUT", ...over,
});
const failed = (...cases: SubmissionCaseResult[]) => ({ status: "FAILED" as const, cases });

describe("outputRuleFor", () => {
  it.each(matches)("expected %j, printed %j → %s", (expected, actual, rule) => {
    expect(outputRuleFor(expected, actual)).toBe(rule);
  });
});

describe("explainOutput", () => {
  it("explains the first wrong public case", () => {
    expect(explainOutput(failed(item({ position: 1, outcome: "PASSED" }), item({ position: 2 }))))
      .toEqual({ rule: "letter_case", position: 2 });
  });
  it("stays silent on a passing, running or unreadable result", () => {
    expect(explainOutput({ status: "PASSED", cases: [item({})] })).toBeNull();
    expect(explainOutput({ status: "ERRORED", cases: [item({})] })).toBeNull();
    expect(explainOutput(failed(item({ isSample: false, expectedOutput: null, actualOutput: null, comparator: null })))).toBeNull();
    expect(explainOutput(failed(item({ comparator: "STDOUT_REGEX" })))).toBeNull();
    expect(explainOutput(failed(item({ comparator: null })))).toBeNull();
    expect(explainOutput(failed(item({ actualOutput: "x".repeat(10_000) })))).toBeNull();
  });
  it("leaves an exception to the error coach", () => {
    expect(explainOutput(failed(item({ outcome: "RUNTIME_ERROR" }), item({ position: 2 })))).toBeNull();
  });
});
