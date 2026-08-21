import { describe, expect, it } from "vitest";

import {
  classifyPythonError,
  classifySyntaxError,
  syntaxLessonCategories,
  pythonErrorFamilies,
  pythonErrorFamily,
  pythonErrorKinds,
  pythonErrorSourceLine,
} from "./python-error.js";

const explainable = pythonErrorKinds.filter((kind) => kind !== "unknown");

describe("classifyPythonError", () => {
  it.each(explainable)("classifies %s as itself", (kind) => {
    expect(classifyPythonError(kind)).toBe(kind);
  });

  it.each([
    "OverflowError",
    "AssertionError",
    "StopIteration",
    "MyOwnError",
    "",
    "unknown",
  ])("classifies %s as unknown", (type) => {
    expect(classifyPythonError(type)).toBe("unknown");
  });
});

describe("pythonErrorFamily", () => {
  it("gives every kind a family", () => {
    for (const kind of pythonErrorKinds) {
      expect(pythonErrorFamilies).toContain(pythonErrorFamily(kind));
    }
  });

  it("groups the classes a beginner meets as one problem", () => {
    // Reaching for something that is not there, twice.
    expect(pythonErrorFamily("IndexError")).toBe(
      pythonErrorFamily("KeyError"),
    );
    // The code is not shaped like Python, three ways.
    expect(pythonErrorFamily("IndentationError")).toBe(
      pythonErrorFamily("TabError"),
    );
    expect(pythonErrorFamily("SyntaxError")).toBe("shape");
    expect(pythonErrorFamily("NameError")).toBe("missing");
    expect(pythonErrorFamily("RecursionError")).toBe("limit");
  });

  it("keeps unknown in its own family", () => {
    expect(pythonErrorFamily("unknown")).toBe("unknown");
  });
});

describe("pythonErrorSourceLine", () => {
  const code = 'name = input()\nprint("Hello, " + name)\n  indented()   \n\n';

  it("returns the numbered line, one-based", () => {
    expect(pythonErrorSourceLine(code, 1)).toBe("name = input()");
    expect(pythonErrorSourceLine(code, 2)).toBe('print("Hello, " + name)');
  });

  it("keeps leading indentation and drops trailing whitespace", () => {
    expect(pythonErrorSourceLine(code, 3)).toBe("  indented()");
  });

  it("returns null when there is no line to point at", () => {
    expect(pythonErrorSourceLine(code, null)).toBeNull();
    expect(pythonErrorSourceLine(code, 0)).toBeNull();
    expect(pythonErrorSourceLine(code, -1)).toBeNull();
    expect(pythonErrorSourceLine(code, 1.5)).toBeNull();
    expect(pythonErrorSourceLine(code, 99)).toBeNull();
    // Line 4 is blank: there is nothing to show.
    expect(pythonErrorSourceLine(code, 4)).toBeNull();
  });

  it("handles Windows and classic Mac line endings", () => {
    expect(pythonErrorSourceLine("a = 1\r\nb = 2", 2)).toBe("b = 2");
    expect(pythonErrorSourceLine("a = 1\rb = 2", 2)).toBe("b = 2");
  });

  it("truncates a line too long to read", () => {
    const long = `x = "${"a".repeat(500)}"`;
    const result = pythonErrorSourceLine(long, 1);
    expect(result).toHaveLength(241);
    expect(result?.endsWith("…")).toBe(true);
  });
});

describe("classifySyntaxError", () => {
  it("reads Python's own message, not the class", () => {
    expect(classifySyntaxError("SyntaxError", "expected ':'")).toBe(
      "missing-colon",
    );
    expect(
      classifySyntaxError("IndentationError", "expected an indented block"),
    ).toBe("expected-indented-block");
    expect(classifySyntaxError("IndentationError", "unexpected indent")).toBe(
      "unexpected-indent",
    );
    expect(
      classifySyntaxError("TabError", "inconsistent use of tabs and spaces"),
    ).toBe("tabs-and-spaces");
    expect(
      classifySyntaxError("SyntaxError", "'(' was never closed"),
    ).toBe("unclosed-delimiter");
    expect(
      classifySyntaxError("SyntaxError", "unterminated string literal"),
    ).toBe("unterminated-string");
    expect(
      classifySyntaxError("SyntaxError", "maybe you meant '==' instead of '='?"),
    ).toBe("assignment-in-condition");
    expect(
      classifySyntaxError("SyntaxError", "perhaps you forgot a comma?"),
    ).toBe("missing-separator");
  });

  it("still teaches syntax when no rule matches", () => {
    expect(classifySyntaxError("SyntaxError", "invalid syntax")).toBe(
      "generic-syntax",
    );
  });

  it("is null for anything that is not a syntax error", () => {
    expect(classifySyntaxError("IndexError", "list index out of range")).toBeNull();
    expect(classifySyntaxError("NameError", "expected ':'")).toBeNull();
  });

  it("matches the messages Python actually produces", () => {
    // `str(SyntaxError)` appends the file and line.
    expect(
      classifySyntaxError("SyntaxError", "expected ':' (solution.py, line 1)"),
    ).toBe("missing-colon");
  });

  it("gives every category copy to look up", () => {
    for (const category of syntaxLessonCategories) {
      expect(typeof category).toBe("string");
    }
    expect(syntaxLessonCategories).toContain("generic-syntax");
  });
});
