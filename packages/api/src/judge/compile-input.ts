import { composeProject, redactHiddenDiagnostics, type ComposeFailure } from "@cove/shared";

import type { CompileRequest, CompileResult } from "./execution-engine.js";
import { isGccPolicy, type GradingPolicySnapshot } from "./grading-profile.js";

/**
 * Appended to a Run's sources: stdin and stdout line-buffered, as a terminal
 * makes them. See `terminalStreams` in `sample-check.runner.ts`, which owns the
 * text; it is passed in so this module stays free of the runner.
 */
type RunPrelude = string | undefined;

export type CompileInput =
  | { ok: true; request: Omit<CompileRequest, "leaseMs" | "signal">; hiddenPaths: string[] }
  | { ok: false; diagnostics: string };

const failureText: Record<ComposeFailure, string> = {
  bundle_invalid: "The files could not be read. Reload the problem and try again.",
  path_invalid: "is not a valid file name. Use letters, digits, '_', '-' and '.', and do not start with '-' or '.'.",
  path_extension: "has an extension this problem cannot use.",
  path_reserved: "uses a name this problem reserves. Rename the file.",
  path_duplicate: "appears twice (names are compared without case).",
  reserved_line: "contains a line starting with //@cove-file, which Cove reserves.",
  too_many_files: "The program has more than 32 files.",
  too_large: "The files exceed 100,000 characters together.",
};

/**
 * What GCC is given for one attempt, from the learner's code and the frozen
 * policy.
 *
 * A single-file exercise (policy version 5) compiles `code` as `main.c` or
 * `main.cpp`, exactly as before. A multi-file one (version 6) composes the
 * project with the learner's bundle (`composeProject`); a bundle that cannot
 * be composed is the learner's compile error, explained, never a judge fault.
 */
export function compileInputFor(
  language: "C" | "CPP",
  code: string,
  policy: GradingPolicySnapshot | null | undefined,
  runPrelude?: RunPrelude,
): CompileInput {
  if (!isGccPolicy(policy) || policy.version === 5)
    return { ok: true, request: { language, code: runPrelude ? `${code}${runPrelude}` : code }, hiddenPaths: [] };
  const composed = composeProject(policy.project, code, language);
  if (!composed.ok) {
    const message = failureText[composed.reason];
    return {
      ok: false,
      diagnostics: `cove: error: ${composed.path ? `'${composed.path}' ${message}` : message}\n`,
    };
  }
  const sources = new Set(composed.sources);
  return {
    ok: true,
    request: {
      language,
      files: composed.files.map((file) => ({
        path: file.path,
        // After the learner's last line, so GCC's line numbers stay theirs.
        content: runPrelude && sources.has(file.path) ? `${file.content}${runPrelude}` : file.content,
      })),
      sources: composed.sources,
    },
    hiddenPaths: composed.hiddenPaths,
  };
}

/** GCC's messages with every hidden file's quoted source removed. */
export function redactCompileResult(result: CompileResult, hiddenPaths: readonly string[]): CompileResult {
  return hiddenPaths.length === 0
    ? result
    : { ...result, diagnostics: redactHiddenDiagnostics(result.diagnostics, hiddenPaths) };
}
