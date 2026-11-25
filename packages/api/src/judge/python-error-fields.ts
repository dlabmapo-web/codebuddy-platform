import { parsePythonError, pythonErrorDetailSchema, type PythonErrorDetail } from "@cove/shared";

import type { ExecutionResult } from "./execution-engine.js";

export type PythonErrorFields = {
  pythonErrorType: string | null;
  pythonErrorMessage: string | null;
  pythonErrorLine: number | null;
};

export const noPythonError: PythonErrorFields = {
  pythonErrorType: null, pythonErrorMessage: null, pythonErrorLine: null,
};

/**
 * Built-in exceptions a hidden case may name. A program could raise a class of
 * its own called anything, so a hidden case keeps only one of these.
 */
const builtinErrors = new Set([
  "ArithmeticError", "AssertionError", "AttributeError", "EOFError", "IndentationError", "IndexError", "KeyError",
  "LookupError", "MemoryError", "ModuleNotFoundError", "NameError", "OverflowError", "RecursionError", "RuntimeError",
  "StopIteration", "SyntaxError", "TabError", "TypeError", "UnboundLocalError", "UnicodeError", "ValueError", "ZeroDivisionError",
]);

/**
 * The exception a case ended with, as it is stored.
 *
 * A public case keeps the whole error, for the error coach. A hidden case
 * keeps at most a built-in type and the line in the student's own code, and
 * never the message: a program chooses its message, so it could write hidden
 * input into one. Only the AI analysis reads a hidden case's error, as a
 * count by type; every result a reader sees drops it (`readPythonError` is
 * called for public cases only).
 */
export function casePythonError(input: {
  isSample: boolean;
  language: "PYTHON" | "C" | "CPP";
  outcome: ExecutionResult["outcome"];
  stderr: string;
}): PythonErrorFields {
  if (input.language !== "PYTHON" || input.outcome !== "RUNTIME_ERROR") return noPythonError;
  const error = parsePythonError(input.stderr);
  if (!error) return noPythonError;
  if (!input.isSample) {
    return builtinErrors.has(error.type) ? { pythonErrorType: error.type, pythonErrorMessage: null, pythonErrorLine: error.line } : noPythonError;
  }
  // PostgreSQL text cannot hold a NUL, which a program may print.
  const clean = (value: string) => value.replaceAll("\u0000", "");
  return { pythonErrorType: clean(error.type), pythonErrorMessage: clean(error.message), pythonErrorLine: error.line };
}

/** A stored public case's exception as the shared contract names it. */
export function readPythonError(item: PythonErrorFields): PythonErrorDetail | null {
  const parsed = pythonErrorDetailSchema.safeParse({
    type: item.pythonErrorType ?? "", message: item.pythonErrorMessage ?? "", line: item.pythonErrorLine,
  });
  return parsed.success ? parsed.data : null;
}
