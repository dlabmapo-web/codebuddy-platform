import { describe, expect, it } from 'vitest';

import { MonacoModelDouble } from './monaco-model-double';

/**
 * The double is only worth testing against because it behaves like the editor.
 *
 * Each case here pins one rule the binding depends on. If a Monaco upgrade
 * changes any of them, these fail first and the binding tests stop being
 * evidence about anything — which is the outcome to prefer over a green suite
 * that has quietly started mirroring its own assumptions.
 */
describe('MonacoModelDouble', () => {
  it('derives CRLF from majority-CRLF text', () => {
    expect(new MonacoModelDouble('a\r\nb\r\nc').getEOL()).toBe('\r\n');
  });

  it('derives LF from LF text and from text with no line break', () => {
    expect(new MonacoModelDouble('a\nb').getEOL()).toBe('\n');
    expect(new MonacoModelDouble('single line').getEOL()).toBe('\n');
    expect(new MonacoModelDouble('').getEOL()).toBe('\n');
  });

  it('counts offsets in the model line ending', () => {
    // Line 2 column 1 is offset 2 with LF and offset 3 with CRLF.
    expect(new MonacoModelDouble('a\nb').getOffsetAt({ lineNumber: 2, column: 1 })).toBe(2);
    expect(new MonacoModelDouble('a\r\nb').getOffsetAt({ lineNumber: 2, column: 1 })).toBe(3);
  });

  it('round-trips offset and position', () => {
    const model = new MonacoModelDouble('one\r\ntwo\r\nthree');
    for (let offset = 0; offset <= model.getValue().length; offset += 1) {
      expect(model.getOffsetAt(model.getPositionAt(offset))).toBe(offset);
    }
  });

  it('rewrites inserted line endings to the model EOL, silently', () => {
    const model = new MonacoModelDouble('a\r\nb');
    model.applyEdits([
      {
        range: {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 1,
        },
        text: 'x\ny',
      },
    ]);
    expect(model.getValue()).toBe('x\r\nya\r\nb');
  });

  it('reports an EOL change as a content change carrying no changes', () => {
    const model = new MonacoModelDouble('a\r\nb');
    const seen: { isEolChange: boolean; count: number }[] = [];
    model.onDidChangeContent((event) =>
      seen.push({ isEolChange: event.isEolChange, count: event.changes.length }),
    );
    model.setEOL(0);
    expect(seen).toEqual([{ isEolChange: true, count: 0 }]);
    expect(model.getValue()).toBe('a\nb');
  });

  it('re-derives the EOL on setValue rather than keeping the pinned one', () => {
    const model = new MonacoModelDouble('');
    expect(model.getEOL()).toBe('\n');
    model.setValue('a\r\nb\r\nc');
    expect(model.getEOL()).toBe('\r\n');
  });

  it('returns LF text on request whatever the model holds', () => {
    const model = new MonacoModelDouble('a\r\nb');
    expect(model.getValue()).toBe('a\r\nb');
    expect(model.getValue(1)).toBe('a\nb');
  });

  it('reports a keystroke offset in the model line ending', () => {
    const model = new MonacoModelDouble('a\r\nb\r\nc');
    const offsets: number[] = [];
    model.onDidChangeContent((event) => {
      for (const change of event.changes) offsets.push(change.rangeOffset);
    });
    model.typeAt({ lineNumber: 3, column: 1 }, 'z');
    // Two CRLF line breaks above: offset 6 here, and 4 in an LF model.
    expect(offsets).toEqual([6]);
  });
});
