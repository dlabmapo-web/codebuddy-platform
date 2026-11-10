import { describe, expect, it } from "vitest";

import { parseGccDiagnostics } from "./gcc-diagnostics.js";

describe("parseGccDiagnostics", () => {
  it("returns located errors, warnings and notes in order", () => {
    const text = [
      "main.c: In function ‘main’:",
      "main.c:3:12: error: ‘x’ undeclared (first use in this function)",
      "    3 |     return x;",
      "      |            ^",
      "main.c:3:12: note: each undeclared identifier is reported only once",
      "main.cpp:7:5: warning: unused variable ‘y’ [-Wunused-variable]",
      "main.c:1:10: fatal error: missing.h: No such file or directory",
    ].join("\n");
    expect(parseGccDiagnostics(text)).toEqual([
      { line: 3, column: 12, severity: "error", message: "‘x’ undeclared (first use in this function)" },
      { line: 3, column: 12, severity: "note", message: "each undeclared identifier is reported only once" },
      { line: 7, column: 5, severity: "warning", message: "unused variable ‘y’ [-Wunused-variable]" },
      { line: 1, column: 10, severity: "error", message: "missing.h: No such file or directory" },
    ]);
  });

  it("ignores linker and unlocated messages", () => {
    const text = [
      "/usr/bin/ld: /usr/lib/gcc/aarch64-linux-gnu/12/../../../aarch64-linux-gnu/Scrt1.o: in function `_start':",
      "(.text+0x1c): undefined reference to `main'",
      "collect2: error: ld returned 1 exit status",
    ].join("\n");
    expect(parseGccDiagnostics(text)).toEqual([]);
  });
});
