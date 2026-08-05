'use client';

import { monitoringTiming, type CollaborationCursor } from '@cove/shared';

import type { MonacoCodeEditor } from '../yjs-monaco';

/**
 * The other person's caret, drawn inside the editor.
 *
 * A content widget rather than a floating overlay: Monaco keeps it pinned to
 * the character it names through scrolling, wrapping, and font-size changes,
 * which an absolutely positioned element would have to re-derive on every
 * frame and would still get wrong the moment a line above it grew.
 *
 * The caret stays for as long as the peer is in the document — it marks where
 * they are working, and that remains true while they read. Only the name tag
 * fades, because after the first few seconds the reader knows whose caret it
 * is and the label is just something in front of the code.
 */
export function attachRemoteCursor(
  editor: MonacoCodeEditor,
  label: string,
): {
  update: (cursor: CollaborationCursor | null) => void;
  dispose: () => void;
} {
  const node = document.createElement('div');
  node.className = 'cove-peer-cursor';
  const caret = document.createElement('span');
  caret.className = 'cove-peer-caret';
  const tag = document.createElement('span');
  tag.className = 'cove-peer-label';
  tag.textContent = label;
  node.append(caret, tag);

  let position = { lineNumber: 1, column: 1 };
  let attached = false;
  let decorations: string[] = [];
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;

  const widget = {
    getId: () => 'cove.peer.cursor',
    getDomNode: () => node,
    // 0 is `ContentWidgetPositionPreference.EXACT`, spelled as a literal so
    // this file needs no second copy of Monaco's type surface.
    getPosition: () => ({ position, preference: [0] }),
  };

  const clearFade = () => {
    if (fadeTimer) clearTimeout(fadeTimer);
    fadeTimer = null;
  };

  const update = (cursor: CollaborationCursor | null) => {
    if (!cursor) {
      clearFade();
      if (attached) {
        editor.removeContentWidget(widget);
        attached = false;
      }
      decorations = editor.deltaDecorations(decorations, []);
      return;
    }

    position = { lineNumber: cursor.line, column: cursor.column };
    if (attached) {
      editor.layoutContentWidget(widget);
    } else {
      editor.addContentWidget(widget);
      attached = true;
    }

    node.classList.remove('is-idle');
    clearFade();
    fadeTimer = setTimeout(() => {
      node.classList.add('is-idle');
    }, monitoringTiming.pointerExpiryMs);

    // Only a real selection is painted. A collapsed range would tint one
    // character and read as a highlight the peer did not make.
    const hasSelection =
      cursor.selectionEndLine !== null && cursor.selectionEndColumn !== null;
    decorations = editor.deltaDecorations(
      decorations,
      hasSelection
        ? [
            {
              range: {
                startLineNumber: cursor.line,
                startColumn: cursor.column,
                endLineNumber: cursor.selectionEndLine ?? cursor.line,
                endColumn: cursor.selectionEndColumn ?? cursor.column,
              },
              options: { className: 'cove-peer-selection', stickiness: 1 },
            },
          ]
        : [],
    );
  };

  return {
    update,
    dispose: () => {
      clearFade();
      if (attached) editor.removeContentWidget(widget);
      attached = false;
      decorations = editor.deltaDecorations(decorations, []);
    },
  };
}

/**
 * The local caret, reported to the peer.
 *
 * Returns the selection in the coordinates both editors agree on — line and
 * column — never a pixel or a character offset, so the two Monacos can be
 * different widths with different wrapping and still point at the same token.
 */
export function readCursor(
  selection: {
    positionLineNumber: number;
    positionColumn: number;
    endLineNumber: number;
    endColumn: number;
    isEmpty: () => boolean;
  } | null,
): CollaborationCursor | null {
  if (!selection) return null;
  const empty = selection.isEmpty();
  return {
    line: selection.positionLineNumber,
    column: selection.positionColumn,
    selectionEndLine: empty ? null : selection.endLineNumber,
    selectionEndColumn: empty ? null : selection.endColumn,
  };
}
