import { describe, expect, it } from "vitest";

import { buildErrorFocus } from "./python-error-focus.js";

const code = 'if True\n    print("hello")\nprint("bye")\n';

describe("buildErrorFocus", () => {
  it("returns the failing line with its neighbours", () => {
    const focus = buildErrorFocus(code, 2, null);

    expect(focus?.lines.map((line) => line.no)).toEqual([1, 2, 3]);
    expect(focus?.lines.filter((line) => line.isError)).toHaveLength(1);
    expect(focus?.lines.find((line) => line.isError)?.no).toBe(2);
  });

  it("skips blank neighbours rather than showing empty rows", () => {
    const focus = buildErrorFocus("a = 1\n\nb = 2\n\nc = 3", 3, null);

    expect(focus?.lines.map((line) => line.no)).toEqual([3]);
  });

  it("puts the caret under the accused character", () => {
    // Python reports `expected ':'` one past the end of `if True`.
    const focus = buildErrorFocus(code, 1, 8);

    expect(focus?.caretColumn).toBe(7);
    expect(focus?.lines[0]?.text).toBe("if True");
  });

  /**
   * The reason this is not just `offset - 1`: a tab is one character to Python
   * and four columns on screen.
   */
  it("recomputes the caret after expanding tabs", () => {
    const tabbed = "\tprint(1)";
    const focus = buildErrorFocus(tabbed, 1, 2);

    expect(focus?.lines[0]?.text).toBe("    print(1)");
    // Offset 2 is `p` in the raw source, which is column 4 once expanded.
    expect(focus?.caretColumn).toBe(4);
  });

  it("expands tabs to the next stop, not by a fixed four", () => {
    const focus = buildErrorFocus("ab\tc", 1, null);

    expect(focus?.lines[0]?.text).toBe("ab  c");
  });

  it("clamps a caret that points past the end of the line", () => {
    const focus = buildErrorFocus("x = 1", 1, 99);

    expect(focus?.caretColumn).toBe("x = 1".length);
  });

  it("has no caret when Python reported no column", () => {
    expect(buildErrorFocus(code, 2, null)?.caretColumn).toBeNull();
    expect(buildErrorFocus(code, 2, 0)?.caretColumn).toBeNull();
  });

  it("returns null when there is nothing to point at", () => {
    expect(buildErrorFocus("", 1, 1)).toBeNull();
    expect(buildErrorFocus(code, null, 1)).toBeNull();
    expect(buildErrorFocus(code, 0, 1)).toBeNull();
    expect(buildErrorFocus(code, 99, 1)).toBeNull();
  });

  it("handles Windows line endings", () => {
    const focus = buildErrorFocus("a = 1\r\nb = 2", 2, null);

    expect(focus?.lines.find((line) => line.isError)?.text).toBe("b = 2");
  });
});
