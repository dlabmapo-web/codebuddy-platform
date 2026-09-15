/**
 * A stand-in for one Monaco text model, faithful about line endings.
 *
 * Unit tests here run without a DOM, and the fault this module guards against
 * lives entirely in the arithmetic between an offset and a position. What the
 * double has to reproduce is therefore narrow and exactly specified, and each
 * rule below names the Monaco source it mirrors so a reader can check it rather
 * than trust it:
 *
 * - `setValue` derives the model's EOL from the text it is handed, defaulting
 *   to LF for text with no line break at all
 *   (`pieceTreeTextBufferBuilder.js::_getEOL`, `textModel.js` MODEL_DEFAULTS).
 * - `applyEdits` rewrites inserted line endings to the model's own and says
 *   nothing about having done it (`pieceTreeTextBuffer.js::_doApplyEdits`).
 * - Offsets and positions count the model's EOL, so the same position is a
 *   different offset in a CRLF model than in an LF one
 *   (`pieceTreeTextBuffer.js::getValueLengthInRange`).
 * - `setEOL` reports a content change carrying no changes at all.
 *
 * `monaco-model-double.spec.ts` holds these to the real editor's behaviour.
 * The browser is still where the binding is proven end to end; this is what
 * makes a fast suite able to catch the regression at all.
 */

export type DoubleChange = {
  rangeOffset: number;
  rangeLength: number;
  text: string;
};

export type DoubleChangeEvent = {
  changes: DoubleChange[];
  isEolChange: boolean;
  isFlush: boolean;
};

type Listener = (event: DoubleChangeEvent) => void;

export class MonacoModelDouble {
  private text: string;
  private eol: '\n' | '\r\n';
  private readonly listeners = new Set<Listener>();

  constructor(initial = '') {
    this.eol = derivedEol(initial);
    this.text = withEol(initial, this.eol);
  }

  /* ------------------------------------------------- what the binding uses */

  getEOL(): string {
    return this.eol;
  }

  /** `preference === 1` is `EndOfLinePreference.LF`; anything else is the model's own. */
  getValue(preference?: number): string {
    return preference === 1 ? withEol(this.text, '\n') : this.text;
  }

  setValue(next: string): void {
    this.eol = derivedEol(next);
    this.text = withEol(next, this.eol);
    this.emit({
      changes: [],
      isEolChange: false,
      isFlush: true,
    });
  }

  /** `sequence === 0` is `EndOfLineSequence.LF`. */
  setEOL(sequence: number): void {
    const next = sequence === 0 ? '\n' : '\r\n';
    if (next === this.eol) return;
    this.eol = next;
    this.text = withEol(this.text, next);
    // Monaco reports this as a content change with no changes in it.
    this.emit({ changes: [], isEolChange: true, isFlush: false });
  }

  getPositionAt(offset: number): { lineNumber: number; column: number } {
    const clamped = Math.max(0, Math.min(offset, this.text.length));
    const before = this.text.slice(0, clamped);
    const lines = before.split(this.eol);
    return {
      lineNumber: lines.length,
      column: (lines[lines.length - 1]?.length ?? 0) + 1,
    };
  }

  getOffsetAt(position: { lineNumber: number; column: number }): number {
    const lines = this.text.split(this.eol);
    let offset = 0;
    for (let line = 0; line < position.lineNumber - 1; line += 1) {
      offset += (lines[line]?.length ?? 0) + this.eol.length;
    }
    return offset + position.column - 1;
  }

  applyEdits(
    edits: ReadonlyArray<{
      range: {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
      };
      text: string;
    }>,
  ): void {
    for (const edit of edits) {
      const start = this.getOffsetAt({
        lineNumber: edit.range.startLineNumber,
        column: edit.range.startColumn,
      });
      const end = this.getOffsetAt({
        lineNumber: edit.range.endLineNumber,
        column: edit.range.endColumn,
      });
      this.spliceAndReport(start, end - start, edit.text);
    }
  }

  onDidChangeContent(listener: Listener): { dispose: () => void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  /* ---------------------------------------------------- what a person does */

  /** A keystroke or a paste, reported exactly as Monaco reports one. */
  typeAt(
    position: { lineNumber: number; column: number },
    text: string,
  ): void {
    this.spliceAndReport(this.getOffsetAt(position), 0, text);
  }

  /** A selection deleted, from one position up to another. */
  deleteBetween(
    start: { lineNumber: number; column: number },
    end: { lineNumber: number; column: number },
  ): void {
    const from = this.getOffsetAt(start);
    this.spliceAndReport(from, this.getOffsetAt(end) - from, '');
  }

  private spliceAndReport(offset: number, length: number, text: string): void {
    // The normalization that makes a foreign line ending disappear silently.
    const inserted = withEol(text, this.eol);
    this.text =
      this.text.slice(0, offset) + inserted + this.text.slice(offset + length);
    this.emit({
      changes: [{ rangeOffset: offset, rangeLength: length, text: inserted }],
      isEolChange: false,
      isFlush: false,
    });
  }

  private emit(event: DoubleChangeEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}

/** One editor around one model, which is all the binding asks for. */
export function editorDouble(model: MonacoModelDouble) {
  return { getModel: () => model };
}

function withEol(value: string, eol: '\n' | '\r\n'): string {
  return value.replace(/\r\n|\r|\n/g, eol);
}

/** `_getEOL`: the majority wins, and an empty document takes the LF default. */
function derivedEol(value: string): '\n' | '\r\n' {
  const crlf = (value.match(/\r\n/g) ?? []).length;
  const cr = (value.match(/\r(?!\n)/g) ?? []).length;
  const lf = (value.match(/(?<!\r)\n/g) ?? []).length;
  const total = crlf + cr + lf;
  if (total === 0) return '\n';
  return crlf + cr > total / 2 ? '\r\n' : '\n';
}
