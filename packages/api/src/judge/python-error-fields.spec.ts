import { describe, expect, it } from "vitest";

import { casePythonError, noPythonError, readPythonError } from "./python-error-fields.js";

const stderr = 'Traceback (most recent call last):\n  File "main.py", line 3, in <module>\nNameError: name \'Hello\' is not defined\n';
const base = { isSample: true, language: "PYTHON" as const, outcome: "RUNTIME_ERROR" as const, stderr };

describe("casePythonError", () => {
  it("keeps a public case's exception", () => {
    expect(casePythonError(base)).toEqual({
      pythonErrorType: "NameError", pythonErrorMessage: "name 'Hello' is not defined", pythonErrorLine: 3,
    });
  });
  it("keeps only a built-in type and the line for a hidden case, never its message", () => {
    expect(casePythonError({ ...base, isSample: false })).toEqual({ pythonErrorType: "NameError", pythonErrorMessage: null, pythonErrorLine: 3 });
  });
  it("keeps nothing for a hidden case that raised a class of its own, whose name it chose", () => {
    expect(casePythonError({ ...base, isSample: false, stderr: 'File "main.py", line 2\nSecret42Error: x\n' })).toEqual(noPythonError);
  });
  it.each(["PASSED", "WRONG_OUTPUT", "TIME_LIMIT", "MEMORY_LIMIT"] as const)("keeps nothing for %s", (outcome) => {
    expect(casePythonError({ ...base, outcome })).toEqual(noPythonError);
  });
  it.each(["C", "CPP"] as const)("keeps nothing for %s", (language) => {
    expect(casePythonError({ ...base, language })).toEqual(noPythonError);
  });
  it("drops a NUL, which PostgreSQL text cannot hold", () => {
    expect(casePythonError({ ...base, stderr: "ValueError: a\u0000b" }).pythonErrorMessage).toBe("ab");
  });
});

describe("readPythonError", () => {
  it("returns null for rows written before the columns existed", () => {
    expect(readPythonError(noPythonError)).toBeNull();
  });
  it("returns the stored exception", () => {
    expect(readPythonError({ pythonErrorType: "EOFError", pythonErrorMessage: "", pythonErrorLine: null }))
      .toEqual({ type: "EOFError", message: "", line: null });
  });
});
