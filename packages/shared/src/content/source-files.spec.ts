import { describe, expect, it } from "vitest";

import {
  composeProject,
  decodeFileBundle,
  encodeFileBundle,
  exerciseProjectIssues,
  exerciseProjectSchema,
  learnerProjectFor,
  redactHiddenDiagnostics,
  sourcePathError,
  starterBundleFor,
  type ExerciseProject,
} from "./source-files.js";

const project = (overrides: Partial<ExerciseProject> = {}): ExerciseProject => ({
  version: 1,
  files: [
    { path: "main.c", content: '#include "sum.h"\nint main(void) { return sum(1, 2); }\n', readOnly: false, hidden: false, openByDefault: true },
    { path: "sum.c", content: "int sum(int a, int b) { return 0; }\n", readOnly: false, hidden: false, openByDefault: true },
    { path: "sum.h", content: "int sum(int a, int b);\n", readOnly: true, hidden: false, openByDefault: true },
    { path: "check.c", content: "int secret(void) { return 42; }\n", readOnly: false, hidden: true, openByDefault: false },
  ],
  sources: ["main.c", "sum.c", "check.c"],
  includeLearnerSources: false,
  fileTree: "CLOSED",
  ...overrides,
});

describe("file bundles", () => {
  it.each([
    [[{ path: "a.c", content: "x\n" }, { path: "b.h", content: "" }]],
    [[{ path: "a.c", content: "" }, { path: "b.c", content: "\n\n" }, { path: "c.c", content: "end" }]],
    [[{ path: "lib/one.c", content: "int x;\r\nint y;" }]],
  ])("round-trips exactly", (files) => {
    expect(decodeFileBundle(encodeFileBundle(files))).toEqual(files);
  });

  it("refuses a string that is not a bundle", () => {
    expect(decodeFileBundle("int main(void) {}")).toBeNull();
  });

  it("tolerates a carriage return on a marker line", () => {
    expect(decodeFileBundle("//@cove-file a.c\r\nint x;")).toEqual([{ path: "a.c", content: "int x;" }]);
  });
});

describe("paths", () => {
  it.each([
    ["main.c", "C", null],
    ["lib/list.h", "C", null],
    ["main.cpp", "C", "path_extension"],
    ["main.cpp", "CPP", null],
    ["sum.c", "CPP", null],
    ["-o.c", "C", "path_invalid"],
    ["../x.c", "C", "path_invalid"],
    ["./x.c", "C", "path_invalid"],
    [".hidden.c", "C", "path_invalid"],
    ["a/b/c/d/e.c", "C", "path_invalid"],
    ["has space.c", "C", "path_invalid"],
  ] as const)("%s in %s", (path, language, error) => {
    expect(sourcePathError(path, language)).toBe(error);
  });
});

describe("projects", () => {
  it("validates structure and language", () => {
    expect(exerciseProjectSchema.safeParse(project()).success).toBe(true);
    expect(exerciseProjectIssues(project(), "C")).toEqual([]);
    expect(exerciseProjectIssues(project({ sources: ["sum.h"] }), "C")).toContain("sum.h cannot be compiled");
    expect(exerciseProjectSchema.safeParse(project({ sources: ["nope.c"] })).success).toBe(false);
    const duplicate = project();
    duplicate.files.push({ ...duplicate.files[0]!, path: "MAIN.c" });
    expect(exerciseProjectSchema.safeParse(duplicate).success).toBe(false);
    const closed = project();
    for (const file of closed.files) file.openByDefault = false;
    expect(exerciseProjectSchema.safeParse(closed).success).toBe(false);
  });

  it("never shows a learner a hidden file", () => {
    const view = learnerProjectFor(project());
    expect(view.files.map((file) => file.path)).toEqual(["main.c", "sum.c", "sum.h"]);
    expect(view.files.find((file) => file.path === "sum.h")).toMatchObject({ readOnly: true, compiled: false });
    expect(starterBundleFor(project())).not.toContain("secret");
  });
});

describe("composeProject", () => {
  const learner = (files: { path: string; content: string }[]) => encodeFileBundle(files);

  it("takes editable files from the learner and fixed ones from the author", () => {
    const result = composeProject(
      project(),
      learner([
        { path: "main.c", content: "MAIN" },
        { path: "sum.c", content: "int sum(int a, int b) { return a + b; }" },
        { path: "sum.h", content: "tampered" },
      ]),
      "C",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const content = Object.fromEntries(result.files.map((file) => [file.path, file.content]));
    expect(content["main.c"]).toBe("MAIN");
    expect(content["sum.h"]).toBe("int sum(int a, int b);\n");
    expect(content["check.c"]).toBe("int secret(void) { return 42; }\n");
    expect(result.sources).toEqual(["main.c", "sum.c", "check.c"]);
    expect(result.hiddenPaths).toEqual(["check.c"]);
  });

  it("keeps the author's text for an editable file the bundle lacks", () => {
    const result = composeProject(project(), learner([{ path: "main.c", content: "MAIN" }]), "C");
    expect(result.ok && result.files.find((file) => file.path === "sum.c")?.content).toBe(
      "int sum(int a, int b) { return 0; }\n",
    );
  });

  it("compiles a learner's own source only when the author allows it", () => {
    const files = learner([{ path: "main.c", content: "" }, { path: "extra.c", content: "int e;" }]);
    const off = composeProject(project(), files, "C");
    const on = composeProject(project({ includeLearnerSources: true }), files, "C");
    expect(off.ok && off.sources).toEqual(["main.c", "sum.c", "check.c"]);
    expect(on.ok && on.sources).toEqual(["main.c", "sum.c", "check.c", "extra.c"]);
    expect(off.ok && off.files.map((file) => file.path)).toContain("extra.c");
  });

  it.each([
    ["int main(void) {}", "bundle_invalid"],
    [encodeFileBundle([{ path: "check.c", content: "" }]), "path_reserved"],
    [encodeFileBundle([{ path: "-o.c", content: "" }]), "path_invalid"],
    [encodeFileBundle([{ path: "x.cpp", content: "" }]), "path_extension"],
    [encodeFileBundle([{ path: "SUM.c", content: "" }]), "path_duplicate"],
    [encodeFileBundle([{ path: "a.c", content: "" }, { path: "A.c", content: "" }]), "path_duplicate"],
    [encodeFileBundle([{ path: "a.c", content: "x".repeat(100_001) }]), "too_large"],
  ] as const)("refuses %#", (code, reason) => {
    expect(composeProject(project(), code, "C")).toMatchObject({ ok: false, reason });
  });

  it("refuses too many files", () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ path: `f${index}.c`, content: "" }));
    expect(composeProject(project(), encodeFileBundle(many), "C")).toMatchObject({ ok: false, reason: "too_many_files" });
  });
});

describe("redactHiddenDiagnostics", () => {
  it("removes source excerpts from hidden files only", () => {
    const text = [
      "check.c: In function ‘secret’:",
      "check.c:1:30: error: ‘y’ undeclared",
      "    1 | int secret(void) { return y; }",
      "      |                              ^",
      "sum.c:1:5: error: conflicting types for ‘sum’",
      "    1 | int sum(int a, int b) { return 0; }",
      "      |     ^~~",
      "In file included from main.c:1:",
      "check.c:2:1: note: previous declaration",
      "    2 | long sum(void);",
    ].join("\n");
    const redacted = redactHiddenDiagnostics(text, ["check.c"]);
    expect(redacted).not.toContain("return y");
    expect(redacted).not.toContain("long sum");
    expect(redacted).toContain("check.c:1:30: error: ‘y’ undeclared");
    expect(redacted).toContain("    1 | int sum(int a, int b) { return 0; }");
    expect(redacted.match(/\(hidden file\)/g)).toHaveLength(2);
  });

  it("leaves text alone without hidden files", () => {
    expect(redactHiddenDiagnostics("a\n  1 | b", [])).toBe("a\n  1 | b");
  });
});
