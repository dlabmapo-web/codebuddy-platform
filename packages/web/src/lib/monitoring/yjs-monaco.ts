'use client';

import type { OnMount } from '@monaco-editor/react';
import * as Y from 'yjs';

/**
 * The bridge between one Yjs text and one Monaco model.
 *
 * Kept out of every page component on purpose: this is the only place that
 * knows how a CRDT delta becomes an editor edit, and the only place that has
 * to guard against the echo — a remote edit applied to the model would
 * otherwise be reported as a local change and sent straight back.
 *
 * Types are derived from `OnMount` rather than imported from `monaco-editor`,
 * so the binding needs no second copy of Monaco's type surface.
 */

export type MonacoCodeEditor = Parameters<OnMount>[0];
type TextModel = NonNullable<ReturnType<MonacoCodeEditor['getModel']>>;

/** Marks a transaction this client produced, so the observer can ignore it. */
export const localOrigin = Symbol('cove-local-edit');

export type YjsMonacoBinding = {
  destroy: () => void;
};

export function bindYTextToMonaco(
  ytext: Y.Text,
  editor: MonacoCodeEditor,
  options: {
    onLocalChange?: () => void;
    /**
     * Which side wins at the moment of binding.
     *
     * `text` for a teacher joining: the shared document is the truth, and an
     * editor that opened on stale draft code must yield to it. `model` for the
     * student who owns the draft: their editor holds work they may not have
     * saved yet, and starting a collaboration must never overwrite it with the
     * last thing that reached the database.
     */
    seed?: 'text' | 'model';
  } = {},
): YjsMonacoBinding {
  const model = editor.getModel();
  if (!model) return { destroy: () => undefined };

  let applyingRemote = true;
  if (options.seed === 'model') {
    const current = model.getValue();
    if (ytext.toString() !== current) {
      ytext.doc?.transact(() => {
        ytext.delete(0, ytext.length);
        ytext.insert(0, current);
      }, localOrigin);
    }
  } else {
    model.setValue(ytext.toString());
  }
  applyingRemote = false;

  const observer = (event: Y.YTextEvent, transaction: Y.Transaction) => {
    if (transaction.origin === localOrigin) return;
    applyingRemote = true;
    try {
      applyDelta(model, event.delta);
    } finally {
      applyingRemote = false;
    }
  };
  ytext.observe(observer);

  const subscription = model.onDidChangeContent((event) => {
    if (applyingRemote) return;
    ytext.doc?.transact(() => {
      // Monaco reports changes from the end of the document backwards, so
      // applying them in the order given keeps every offset valid.
      for (const change of event.changes) {
        if (change.rangeLength > 0) {
          ytext.delete(change.rangeOffset, change.rangeLength);
        }
        if (change.text.length > 0) {
          ytext.insert(change.rangeOffset, change.text);
        }
      }
    }, localOrigin);
    options.onLocalChange?.();
  });

  return {
    destroy: () => {
      subscription.dispose();
      ytext.unobserve(observer);
    },
  };
}

/**
 * Applies a CRDT delta as editor edits.
 *
 * `applyEdits` rather than `setValue`: replacing the whole document would
 * scroll the reader to the top, drop their selection, and wipe the undo stack
 * every time the other person typed a character.
 */
function applyDelta(model: TextModel, delta: Y.YTextEvent['delta']): void {
  let index = 0;
  for (const operation of delta) {
    if (typeof operation.retain === 'number') {
      index += operation.retain;
      continue;
    }
    if (typeof operation.insert === 'string') {
      const position = model.getPositionAt(index);
      model.applyEdits([
        {
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
          text: operation.insert,
        },
      ]);
      index += operation.insert.length;
      continue;
    }
    if (typeof operation.delete === 'number') {
      const start = model.getPositionAt(index);
      const end = model.getPositionAt(index + operation.delete);
      model.applyEdits([
        {
          range: {
            startLineNumber: start.lineNumber,
            startColumn: start.column,
            endLineNumber: end.lineNumber,
            endColumn: end.column,
          },
          text: '',
        },
      ]);
    }
  }
}
