/**
 * GCC's diagnostics for a C/C++ exercise, as editor markers.
 *
 * The compile jail runs GCC in the source's own directory, so every located
 * message reads `main.c:LINE:COLUMN: severity: text` (or `main.cpp`). Lines
 * without a location — "In function 'main':", linker messages — stay in the
 * terminal transcript and produce no marker.
 */
export type GccDiagnostic = {
  line: number;
  column: number;
  severity: "error" | "warning" | "note";
  message: string;
};

const located = /^main\.(?:c|cpp):(\d+):(\d+): (fatal error|error|warning|note): (.*)$/;

export function parseGccDiagnostics(text: string): GccDiagnostic[] {
  const diagnostics: GccDiagnostic[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = located.exec(line);
    if (!match) continue;
    diagnostics.push({
      line: Number(match[1]),
      column: Number(match[2]),
      severity: match[3] === "fatal error" ? "error" : (match[3] as GccDiagnostic["severity"]),
      message: match[4],
    });
  }
  return diagnostics;
}
