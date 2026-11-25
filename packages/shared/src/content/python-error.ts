/**
 * What a Python exception means to somebody who has not met one before.
 *
 * The workspace runs student code in a Pyodide worker, which reports the
 * exception class, message, and line rather than a crash. That class name is
 * the only signal available here — `NameError` is knowable, "you typed `pritn`"
 * is not — so everything in this module is keyed by the class and nothing
 * inspects the message.
 *
 * The copy itself lives in `@cove/i18n`'s `python-errors` namespace, in both
 * locales. This module owns which classes are explainable and how they group,
 * so that adding one without copy fails the typecheck rather than showing a
 * child a raw key.
 *
 * See docs/superpowers/specs/2026-08-21-python-error-explanation-design.md.
 */

/**
 * The exception classes with an explanation, plus the fallback.
 *
 * `unknown` is a member rather than a special case in the component: it needs a
 * sentence like every other kind, and being in the union is what makes the
 * exhaustiveness check in `@cove/i18n` cover the fallback too.
 */
export const pythonErrorKinds = [
  "SyntaxError",
  "IndentationError",
  "TabError",
  "NameError",
  "TypeError",
  "ValueError",
  "IndexError",
  "KeyError",
  "ZeroDivisionError",
  "AttributeError",
  "ModuleNotFoundError",
  "ImportError",
  "EOFError",
  "RecursionError",
  "unknown",
] as const;

export type PythonErrorKind = (typeof pythonErrorKinds)[number];

const explainable = new Set<string>(pythonErrorKinds);

/**
 * Total by construction: an exception with no entry — `OverflowError`, an
 * `AssertionError`, a class the student wrote themselves — is `unknown`, which
 * has its own sentence.
 */
export function classifyPythonError(type: string): PythonErrorKind {
  return explainable.has(type) && type !== "unknown"
    ? (type as PythonErrorKind)
    : "unknown";
}

/**
 * The four kinds of wrong, which is what a beginner actually needs to learn.
 *
 * A student who meets `KeyError` after `IndexError` has met the same problem
 * twice — they reached for something that is not there — and the panel says so
 * by giving both the same family, colour, and icon. The family is the teaching
 * content; the class name is the searchable detail.
 */
export const pythonErrorFamilies = [
  /** The code is not shaped like Python: brackets, colons, indentation. */
  "shape",
  /** A name was used that Python cannot find. */
  "missing",
  /** The name resolved, but the value cannot do what was asked of it. */
  "value",
  /** The program ran past something it had a limited supply of. */
  "limit",
  "unknown",
] as const;

export type PythonErrorFamily = (typeof pythonErrorFamilies)[number];

const familyByKind: Record<PythonErrorKind, PythonErrorFamily> = {
  SyntaxError: "shape",
  IndentationError: "shape",
  TabError: "shape",
  NameError: "missing",
  AttributeError: "missing",
  ModuleNotFoundError: "missing",
  ImportError: "missing",
  TypeError: "value",
  ValueError: "value",
  IndexError: "value",
  KeyError: "value",
  ZeroDivisionError: "value",
  EOFError: "limit",
  RecursionError: "limit",
  unknown: "unknown",
};

export function pythonErrorFamily(kind: PythonErrorKind): PythonErrorFamily {
  return familyByKind[kind];
}

/** Beyond this a line is a minified blob rather than something to read. */
const sourceLineMaxLength = 240;

/**
 * The student's own line, for the panel to point at.
 *
 * Trailing whitespace goes and leading whitespace stays: indentation is the
 * subject of half the `shape` family, and stripping it would hide the very
 * thing an `IndentationError` is about.
 */
export function pythonErrorSourceLine(
  code: string,
  line: number | null,
): string | null {
  if (line === null || !Number.isInteger(line) || line < 1) return null;
  const lines = code.split(/\r\n?|\n/);
  const source = lines[line - 1];
  if (source === undefined) return null;
  const trimmed = source.replace(/\s+$/u, "");
  if (trimmed === "") return null;
  return trimmed.length > sourceLineMaxLength
    ? `${trimmed.slice(0, sourceLineMaxLength)}…`
    : trimmed;
}

/* ------------------------------------------------------------ syntax coach */

/**
 * The syntax mistakes a beginner actually makes, keyed by what Python says.
 *
 * Syntax errors are the one family where the exception class tells you almost
 * nothing — every one of them is `SyntaxError` — but the *message* is specific
 * and stable. `expected ':'` is a missing colon and nothing else. So these are
 * matched on the message, which lets the workspace teach the actual mistake
 * rather than the category it belongs to.
 *
 * Ported from the syntax-error coach on `feat/AI-assistant`; the copy for each
 * category lives in `@cove/i18n`'s `python-errors` namespace.
 */
export const syntaxLessonCategories = [
  "missing-colon",
  "expected-indented-block",
  "unexpected-indent",
  "tabs-and-spaces",
  "unclosed-delimiter",
  "unterminated-string",
  "assignment-in-condition",
  "missing-separator",
  /** Nothing matched: the syntax lesson that applies to any of them. */
  "generic-syntax",
] as const;

export type SyntaxLessonCategory = (typeof syntaxLessonCategories)[number];

const syntaxErrorTypes = new Set<string>([
  "SyntaxError",
  "IndentationError",
  "TabError",
]);

export function isSyntaxErrorType(type: string): boolean {
  return syntaxErrorTypes.has(type);
}

/**
 * Ordered: the first match wins, so a more specific pattern must come before a
 * broader one. Every rule reads Python's own message and never re-parses or
 * re-runs the student's code.
 */
const syntaxRules: {
  category: SyntaxLessonCategory;
  types: readonly string[];
  message: RegExp;
}[] = [
  {
    category: "missing-colon",
    types: ["SyntaxError"],
    message: /expected ':'/i,
  },
  {
    category: "expected-indented-block",
    types: ["IndentationError"],
    message: /expected an indented block/i,
  },
  {
    category: "unexpected-indent",
    types: ["IndentationError"],
    message: /unexpected indent|unindent does not match/i,
  },
  {
    category: "tabs-and-spaces",
    types: ["TabError"],
    message: /tabs and spaces|inconsistent use/i,
  },
  {
    category: "unclosed-delimiter",
    types: ["SyntaxError"],
    message: /(?:was never closed|unmatched ['")\]}])/i,
  },
  {
    category: "unterminated-string",
    types: ["SyntaxError"],
    message: /unterminated string literal|EOL while scanning string literal/i,
  },
  {
    category: "assignment-in-condition",
    types: ["SyntaxError"],
    message: /maybe you meant ['"]==['"]|cannot assign to/i,
  },
  {
    category: "missing-separator",
    types: ["SyntaxError"],
    message: /perhaps you forgot a comma|invalid decimal literal/i,
  },
];

/**
 * The lesson for a syntax error, or `null` when the error is not one.
 *
 * A syntax error with no matching rule is still a syntax error, and gets the
 * generic syntax lesson rather than falling through to the runtime path — a
 * student staring at `invalid syntax` needs "check your colons, brackets and
 * quotes", not "something went wrong while your code was running".
 */
export function classifySyntaxError(
  type: string,
  message: string,
): SyntaxLessonCategory | null {
  if (!isSyntaxErrorType(type)) return null;

  const rule = syntaxRules.find(
    (candidate) =>
      candidate.types.includes(type) && candidate.message.test(message),
  );
  return rule ? rule.category : "generic-syntax";
}

/* ------------------------------------------------- errors from a graded run */

/** What a submitted public case keeps of the exception that ended it. */
export type PythonErrorDetail = {
  type: string;
  message: string;
  /** The line in the student's own file. Null when the runner did not say. */
  line: number | null;
};

const PYTHON_ERROR_TYPE_MAX = 100;
const PYTHON_ERROR_MESSAGE_MAX = 500;
/** Both graders compile the student's code under this name. */
const learnerFrame = /^ {2}File "main\.py", line (\d+)/;
const anyFrame = /^ {2}File "/;

/**
 * The exception a graded program ended with, read from its stderr.
 *
 * Native CPython prints a whole traceback. The Pyodide runner prints one
 * `Type: message` line, with no line number. A program can print anything it
 * likes to stderr, so the answer is capped, and is text to show and never to
 * follow.
 */
export function parsePythonError(stderr: string): PythonErrorDetail | null {
  const marker = "Traceback (most recent call last):";
  const start = stderr.lastIndexOf(marker);
  const lines = (start === -1 ? stderr : stderr.slice(start + marker.length))
    .split(/\r\n?|\n/);

  let line: number | null = null;
  let lastFrame = -1;
  lines.forEach((text, index) => {
    if (!anyFrame.test(text)) return;
    lastFrame = index;
    const own = learnerFrame.exec(text);
    if (own) line = Number(own[1]);
  });

  // After the last frame come its quoted source and caret, all indented; the
  // first line that is not is the exception itself.
  // With no traceback the runner's own line is the last thing printed.
  const last = start === -1
    ? lines.filter((text) => text.trim() !== "").pop()
    : lines.slice(lastFrame + 1).find((text) => text.trim() !== "" && !text.startsWith(" "));
  if (last === undefined) return null;

  const separator = last.indexOf(": ");
  const qualified = (separator === -1 ? last : last.slice(0, separator)).trim().replace(/:$/, "");
  const type = qualified.slice(qualified.lastIndexOf(".") + 1);
  if (!/^[A-Za-z_]\w*$/.test(type)) return null;
  // Without a traceback only an exception's own name is believable: a program
  // that prints a word to stderr has not raised it.
  if (start === -1 && !/(?:Error|Exception|Interrupt|Exit|Iteration|Warning)$/.test(type)) return null;

  return {
    type: type.slice(0, PYTHON_ERROR_TYPE_MAX),
    message: (separator === -1 ? "" : last.slice(separator + 2)).trim().slice(0, PYTHON_ERROR_MESSAGE_MAX),
    line,
  };
}
