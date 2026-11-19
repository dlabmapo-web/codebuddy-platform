/**
 * GCC's diagnostics for a C/C++ exercise, as editor markers.
 *
 * The compile jail runs GCC in the source's own directory, so every located
 * message reads `FILE:LINE:COLUMN: severity: text`: `main.c` or `main.cpp`
 * for a single-file exercise, any project path (`sum.c`, `lib/list.h`) for a
 * multi-file one. Lines without a location — "In function 'main':", linker
 * messages — stay in the terminal transcript and produce no marker.
 */
export type GccDiagnostic = {
  /** The project path the message is about, as GCC printed it. */
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning" | "note";
  message: string;
};

const located =
  /^(?:\.\/)?((?:[A-Za-z0-9_][A-Za-z0-9_.-]*\/){0,3}[A-Za-z0-9_][A-Za-z0-9_.-]*\.(?:c|cc|cpp|h|hpp)):(\d+):(\d+): (fatal error|error|warning|note): (.*)$/;

export function parseGccDiagnostics(text: string): GccDiagnostic[] {
  const diagnostics: GccDiagnostic[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = located.exec(line);
    if (!match) continue;
    diagnostics.push({
      file: match[1]!,
      line: Number(match[2]),
      column: Number(match[3]),
      severity: match[4] === "fatal error" ? "error" : (match[4] as GccDiagnostic["severity"]),
      message: match[5]!,
    });
  }
  return diagnostics;
}
