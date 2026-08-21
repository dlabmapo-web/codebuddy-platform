'use client';

import type { MonacoCodeEditor } from '@/lib/monitoring/yjs-monaco';

/**
 * The failing line, marked in the editor itself.
 *
 * The coach explains the mistake in the pane below; this is what connects that
 * explanation to the code above it. Without it a student reads "check line 2"
 * and then has to count rows.
 *
 * A whole-line decoration plus a glyph-margin dot, in Monaco's own coordinate
 * space, so the mark follows the line as they type above it rather than being
 * an overlay that has to be re-derived on every keystroke.
 *
 * Returns its own removal: the caller mounts it in an effect and the mark
 * cannot outlive the error that caused it.
 *
 * See docs/superpowers/specs/2026-08-21-python-error-explanation-design.md.
 */
export function markErrorLine(
  editor: MonacoCodeEditor,
  line: number | null,
  hover?: string,
): () => void {
  let decorations: string[] = [];

  const clear = () => {
    decorations = editor.deltaDecorations(decorations, []);
  };

  if (line === null || line < 1) return clear;

  // Python reports against the source that ran. The student may already have
  // deleted lines off the end of it, and a decoration past the last line
  // silently paints nothing.
  const lineCount = editor.getModel()?.getLineCount() ?? line;
  const target = Math.min(line, lineCount);

  decorations = editor.deltaDecorations(decorations, [
    {
      range: {
        startLineNumber: target,
        startColumn: 1,
        endLineNumber: target,
        endColumn: 1,
      },
      options: {
        isWholeLine: true,
        className: 'cove-error-line',
        glyphMarginClassName: 'cove-error-glyph',
        ...(hover ? { glyphMarginHoverMessage: { value: hover } } : {}),
      },
    },
  ]);

  return clear;
}
