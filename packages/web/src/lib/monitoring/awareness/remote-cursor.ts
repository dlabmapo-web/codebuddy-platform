'use client';

import type { CollaborationCursor } from '@cove/shared';

import type { MonacoCodeEditor } from '../yjs-monaco';

export type RemoteCursorRole = 'student' | 'teacher';

/**
 * The other person's caret, drawn inside the editor.
 *
 * A content widget rather than a floating overlay: Monaco keeps it pinned to
 * the character it names through scrolling, wrapping, and font-size changes,
 * which an absolutely positioned element would have to re-derive on every
 * frame and would still get wrong the moment a line above it grew.
 *
 * The caret and its label stay for as long as the peer is in the document. A
 * teacher must be able to distinguish the student's caret from their own even
 * after pausing to read the code, and the student's generic `Teacher` label
 * discloses no identity by remaining visible.
 */
export function attachRemoteCursor(
  editor: MonacoCodeEditor,
  label: string,
  role: RemoteCursorRole,
): {
  update: (cursor: CollaborationCursor | null) => void;
  dispose: () => void;
} {
  const node = document.createElement('div');
  node.className = `cove-peer-cursor cove-peer-cursor--${role}`;
  const caret = document.createElement('span');
  caret.className = 'cove-peer-caret';
  const tag = document.createElement('span');
  tag.className = 'cove-peer-label';
  tag.textContent = label;
  node.append(caret, tag);

  let position = { lineNumber: 1, column: 1 };
  let attached = false;
  let decorations: string[] = [];

  const widget = {
    getId: () => 'cove.peer.cursor',
    getDomNode: () => node,
    // 0 is `ContentWidgetPositionPreference.EXACT`, spelled as a literal so
    // this file needs no second copy of Monaco's type surface.
    getPosition: () => ({ position, preference: [0] }),
  };

  const update = (cursor: CollaborationCursor | null) => {
    if (!cursor) {
      if (attached) {
        editor.removeContentWidget(widget);
        attached = false;
      }
      decorations = editor.deltaDecorations(decorations, []);
      return;
    }

    position = { lineNumber: cursor.line, column: cursor.column };
    node.dataset.peerLine = String(cursor.line);
    node.dataset.peerColumn = String(cursor.column);
    if (attached) {
      editor.layoutContentWidget(widget);
    } else {
      editor.addContentWidget(widget);
      attached = true;
    }

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
              options: {
                className: `cove-peer-selection cove-peer-selection--${role}`,
                stickiness: 1,
              },
            },
          ]
        : [],
    );
  };

  return {
    update,
    dispose: () => {
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
