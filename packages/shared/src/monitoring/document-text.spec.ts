import { describe, expect, it } from "vitest";

import {
  carriageReturnRepairs,
  hasForeignLineEndings,
  toSharedDocumentText,
} from "./document-text.js";

describe("toSharedDocumentText", () => {
  it("collapses CRLF to LF", () => {
    expect(toSharedDocumentText("a\r\nb\r\nc")).toBe("a\nb\nc");
  });

  it("turns a lone CR into LF rather than deleting it", () => {
    // Monaco renders a bare CR as a line break, so dropping it would remove a
    // line the student can see.
    expect(toSharedDocumentText("a\rb")).toBe("a\nb");
  });

  it("handles mixed endings in one string", () => {
    expect(toSharedDocumentText("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
  });

  it("leaves canonical text untouched", () => {
    expect(toSharedDocumentText("a\nb\n")).toBe("a\nb\n");
    expect(toSharedDocumentText("")).toBe("");
    expect(toSharedDocumentText("no breaks at all")).toBe("no breaks at all");
  });

  it("preserves trailing blank lines", () => {
    expect(toSharedDocumentText("a\r\n\r\n\r\n")).toBe("a\n\n\n");
  });

  it("preserves non-ASCII text around the endings", () => {
    expect(toSharedDocumentText("덩덕\r\n쿵덕")).toBe("덩덕\n쿵덕");
    expect(toSharedDocumentText("🙂\r\n🙃")).toBe("🙂\n🙃");
  });
});

describe("hasForeignLineEndings", () => {
  it("is true only when a carriage return is present", () => {
    expect(hasForeignLineEndings("a\r\nb")).toBe(true);
    expect(hasForeignLineEndings("a\rb")).toBe(true);
    expect(hasForeignLineEndings("a\nb")).toBe(false);
    expect(hasForeignLineEndings("")).toBe(false);
  });
});

describe("carriageReturnRepairs", () => {
  it("reports nothing for canonical text", () => {
    expect(carriageReturnRepairs("a\nb")).toEqual([]);
  });

  it("drops the CR of a CRLF pair", () => {
    expect(carriageReturnRepairs("a\r\nb")).toEqual([{ at: 1, kind: "drop" }]);
  });

  it("replaces a lone CR", () => {
    expect(carriageReturnRepairs("a\rb")).toEqual([{ at: 1, kind: "replace" }]);
  });

  it("orders repairs from the end of the string backwards", () => {
    expect(carriageReturnRepairs("a\r\nb\rc\r\n")).toEqual([
      { at: 6, kind: "drop" },
      { at: 4, kind: "replace" },
      { at: 1, kind: "drop" },
    ]);
  });

  it("treats a trailing lone CR as a line break", () => {
    expect(carriageReturnRepairs("a\r")).toEqual([{ at: 1, kind: "replace" }]);
  });

  it("describes exactly the edits that produce the canonical form", () => {
    const source = "a\r\nb\rc\r\n\r\rd";
    let applied = source;
    for (const repair of carriageReturnRepairs(source)) {
      applied =
        applied.slice(0, repair.at) +
        (repair.kind === "drop" ? "" : "\n") +
        applied.slice(repair.at + 1);
    }
    expect(applied).toBe(toSharedDocumentText(source));
  });
});
