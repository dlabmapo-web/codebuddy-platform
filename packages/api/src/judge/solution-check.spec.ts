import { looksSpreadsheetCut } from "@cove/shared";
import { describe, expect, it } from "vitest";

import { solutionsDigest, summarizePythonError } from "./solution-check.js";

describe("summarizePythonError", () => {
  it("names the exception and the learner's line from a native traceback", () => {
    expect(summarizePythonError([
      "Traceback (most recent call last):",
      '  File "main.py", line 11, in <module>',
      "    x = heights[i]",
      "        ~~~~~~~^^^",
      "IndexError: list index out of range",
    ].join("\n"))).toEqual({ type: "IndexError", message: "list index out of range", line: 11 });
  });

  it("points at the learner's frame, not the standard library's", () => {
    expect(summarizePythonError([
      "Traceback (most recent call last):",
      '  File "/lib/python312.zip/_pyodide/_base.py", line 597, in eval_code_async',
      '  File "main.py", line 3, in <module>',
      '  File "/usr/lib/python3.12/json/__init__.py", line 346, in loads',
      "json.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)",
    ].join("\n"))).toEqual({ type: "JSONDecodeError", message: "Expecting value: line 1 column 1 (char 0)", line: 3 });
  });

  it("accepts a script path and a syntax error without a traceback header", () => {
    expect(summarizePythonError([
      '  File "/tmp/run/main.py", line 1',
      "    print(1",
      "         ^",
      "SyntaxError: '(' was never closed",
    ].join("\n"))).toEqual({ type: "SyntaxError", message: "'(' was never closed", line: 1 });
  });

  it("returns null when nothing looks like an exception", () => {
    expect(summarizePythonError("")).toBeNull();
    expect(summarizePythonError("warning: something odd\n")).toBeNull();
  });

  it("bounds what it keeps", () => {
    const error = summarizePythonError(`ValueError: ${"x".repeat(500)}`);
    expect(error?.message).toHaveLength(200);
    expect(error?.line).toBeNull();
  });
});

describe("solutionsDigest", () => {
  it("changes with any solution and with their order", () => {
    const base = solutionsDigest(["print(1)", "print(2)"]);
    expect(solutionsDigest(["print(1)", "print(2)"])).toBe(base);
    expect(solutionsDigest(["print(2)", "print(1)"])).not.toBe(base);
    expect(solutionsDigest(["print(1)print(2)"])).not.toBe(base);
    expect(solutionsDigest([])).not.toBe(base);
  });
});

describe("looksSpreadsheetCut", () => {
  it("flags data exactly at a spreadsheet cell limit", () => {
    expect(looksSpreadsheetCut("1".repeat(50_000))).toBe(true);
    expect(looksSpreadsheetCut("1".repeat(32_767))).toBe(true);
    expect(looksSpreadsheetCut("1".repeat(49_999))).toBe(false);
    expect(looksSpreadsheetCut("")).toBe(false);
  });
});
