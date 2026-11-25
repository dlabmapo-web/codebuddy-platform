import { describe, expect, it } from "vitest";

import { differenceKinds, differenceOf } from "./output-difference.js";

describe("differenceOf", () => {
  it.each([
    ["3", "", "nothing"], ["Hello", "hello", "letter_case"], ["1 2", "1  2", "spaces"], ["15", "10", "too_small"], ["15", "16", "too_big"],
    ["5", "5.0", "number_format"], ["a\nb", "a", "missing_lines"], ["a", "a\nb", "extra_lines"], ["Hi!", "Hi", "punctuation"], ["cat", "dog", "different"],
  ])("tells %j from %j as %s", (expected, printed, kind) => {
    expect(differenceOf(expected, printed, "STDOUT")).toBe(kind);
  });
  it("says only different for an output checked by a rule", () => {
    expect(differenceOf("^\\d+$", "x", "REGEX")).toBe("different");
  });
  it("names no value: every answer is one of a few fixed words", () => {
    for (const [expected, printed] of [["333444", "111222"], ["secret", "SECRET"], ["x\ny", ""]]) {
      expect(differenceKinds).toContain(differenceOf(expected!, printed!, null));
    }
  });
});
