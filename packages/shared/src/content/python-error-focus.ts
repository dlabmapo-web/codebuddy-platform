/**
 * The excerpt of the student's code that the coach points at.
 *
 * An indentation mistake cannot be judged from one line — it is only visible
 * next to the lines around it — so this returns a short window rather than the
 * single failing line.
 *
 * Python reports `line` and `offset` against the raw source, so a tab counts as
 * one character there while the screen shows it as several columns. Tabs are
 * expanded here and the caret is recomputed in that expanded coordinate space,
 * which is what keeps `^` under the character it is accusing.
 *
 * Ported from `errorFocus.ts` on `feat/AI-assistant`.
 *
 * See docs/superpowers/specs/2026-08-21-python-error-explanation-design.md.
 */

const tabWidth = 4;

export type ErrorFocusLine = {
  no: number;
  /** Tabs expanded to spaces, ready to render. */
  text: string;
  isError: boolean;
};

export type ErrorFocus = {
  lineNo: number;
  /** The failing line, plus its non-blank neighbours. */
  lines: ErrorFocusLine[];
  /** 0-based caret position within the failing line's expanded text. */
  caretColumn: number | null;
};

/** Expands tabs to the next 4-column stop, keeping a raw → expanded index map. */
function expandTabs(raw: string): { text: string; expandedAt: number[] } {
  let text = "";
  const expandedAt: number[] = [];
  for (const character of raw) {
    expandedAt.push(text.length);
    if (character === "\t") {
      text += " ".repeat(tabWidth - (text.length % tabWidth));
    } else {
      text += character;
    }
  }
  expandedAt.push(text.length);
  return { text, expandedAt };
}

export function buildErrorFocus(
  code: string,
  line: number | null | undefined,
  offset: number | null | undefined,
): ErrorFocus | null {
  if (!code || typeof line !== "number" || !Number.isFinite(line) || line < 1) {
    return null;
  }

  const sourceLines = code.replace(/\r\n?/g, "\n").split("\n");
  const raw = sourceLines[line - 1];
  if (raw === undefined) return null;

  const errorLine = expandTabs(raw);

  let caretColumn: number | null = null;
  if (typeof offset === "number" && Number.isFinite(offset) && offset >= 1) {
    // Python's offset is 1-based and may point one past the end of the line,
    // which is exactly what a missing colon looks like.
    caretColumn =
      errorLine.expandedAt[Math.min(offset - 1, raw.length)] ??
      errorLine.text.length;
  }

  const lines: ErrorFocusLine[] = [];
  const before = sourceLines[line - 2];
  if (before !== undefined && before.trim() !== "") {
    lines.push({ no: line - 1, text: expandTabs(before).text, isError: false });
  }
  lines.push({ no: line, text: errorLine.text, isError: true });
  const after = sourceLines[line];
  if (after !== undefined && after.trim() !== "") {
    lines.push({ no: line + 1, text: expandTabs(after).text, isError: false });
  }

  return { lineNo: line, lines, caretColumn };
}
