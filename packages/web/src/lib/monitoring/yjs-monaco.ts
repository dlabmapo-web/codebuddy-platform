'use client';

import { carriageReturnRepairs, toSharedDocumentText } from '@cove/shared';
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
 *
 * ## Line endings
 *
 * Monaco reports and accepts offsets in its model's line ending; Yjs indices
 * count the string's. If the two disagree, every offset this file exchanges is
 * wrong by one character per line above the edit — and `applyEdits` normalizes
 * inserted text to the model's EOL, so the difference is absorbed instead of
 * raised and the two never converge again. Every bound model is therefore
 * pinned to LF, and only canonical text enters the document.
 */

export type MonacoCodeEditor = Parameters<OnMount>[0];
type TextModel = NonNullable<ReturnType<MonacoCodeEditor['getModel']>>;

/**
 * `monaco.editor.EndOfLineSequence.LF` and `EndOfLinePreference.LF`.
 *
 * Spelled as their values rather than imported: pulling in the Monaco
 * namespace for two constants is exactly the second copy of its type surface
 * this file exists without.
 */
const lfSequence = 0 as Parameters<TextModel['setEOL']>[0];
const lfPreference = 1 as NonNullable<Parameters<TextModel['getValue']>[0]>;

export type YjsMonacoBinding = {
  destroy: () => void;
  /**
   * A deliberate whole-document replacement — Reset, and nothing else.
   *
   * Offered so that the one operation which legitimately discards the buffer
   * goes through the document rather than around it. A write straight to the
   * model would reach the peer as an ordinary edit anyway; routing it here
   * keeps the origin, the normalization, and the echo guard in one place.
   */
  replace: (text: string) => void;
};

export function bindYTextToMonaco(
  ytext: Y.Text,
  editor: MonacoCodeEditor,
  options: {
    onLocalChange?: () => void;
    /**
     * Which side wins at the moment of binding.
     *
     * `text` for a teacher joining, and for any rebinding of a document this
     * client has already established: the shared document is the truth.
     * `model` only for the first handoff of a student's own draft, where the
     * editor holds work the server has never seen and starting a
     * collaboration must not overwrite it with the last thing that reached the
     * database. Passing `model` on a later bind would republish the whole
     * buffer and undo whatever the peer had done in the meantime.
     */
    seed?: 'text' | 'model';
  } = {},
): YjsMonacoBinding {
  const model = editor.getModel();
  if (!model) return { destroy: () => undefined, replace: () => undefined };

  /**
   * This binding's own marker, not a module-wide one.
   *
   * Two bindings over a single document — a test harness standing in for two
   * browsers, and any future split view — must each ignore only their own
   * transactions. Sharing one symbol makes them ignore each other's, so the
   * two models silently stop tracking.
   */
  const localOrigin = Symbol('cove-local-edit');

  // Before anything reads an offset out of this model or writes one into it.
  model.setEOL(lfSequence);

  let applyingRemote = true;
  if (options.seed === 'model') {
    const current = toSharedDocumentText(model.getValue(lfPreference));
    if (ytext.toString() !== current) {
      ytext.doc?.transact(() => {
        ytext.delete(0, ytext.length);
        ytext.insert(0, current);
      }, localOrigin);
    }
  } else {
    // A document written before LF was the rule is repaired rather than
    // rendered around it: normalizing only what the editor shows would leave
    // the model and the document describing different strings, which is the
    // fault this whole file is guarding against.
    repairSharedText(ytext, localOrigin);
    model.setValue(ytext.toString());
    // `setValue` rebuilds the buffer and re-derives the EOL from the text it
    // was handed, so the pin belongs after it as well as before.
    model.setEOL(lfSequence);
  }
  applyingRemote = false;

  /**
   * Whether the document still holds something the model cannot.
   *
   * While it does, the two are not describing the same string, so an offset
   * from one does not mean anything in the other and a delta must not be
   * applied incrementally. The model is rewritten wholesale until the
   * document is canonical again — including for the update that makes it
   * canonical, whose delta would otherwise be applied to a model that had
   * already been shown the repaired text.
   */
  let awaitingCanonicalText = false;

  const observer = (event: Y.YTextEvent, transaction: Y.Transaction) => {
    if (transaction.origin === localOrigin) return;
    applyingRemote = true;
    try {
      const text = ytext.toString();
      const foreign = text.includes('\r');
      if (foreign || awaitingCanonicalText) {
        /**
         * A peer running an older build sent a carriage return.
         *
         * The model is pinned to LF and cannot store one, so it would hold
         * fewer characters than the delta describes and every position after
         * it would land one place out. It is rewritten from the document's
         * canonical rendering instead.
         *
         * The repair itself is the server's: it normalizes on every update it
         * accepts and broadcasts the result, and being the only writer is what
         * keeps two clients from each repairing the same carriage return and
         * converging on two line breaks.
         */
        const canonical = toSharedDocumentText(text);
        if (model.getValue(lfPreference) !== canonical) {
          model.setValue(canonical);
          model.setEOL(lfSequence);
        }
        awaitingCanonicalText = foreign;
        return;
      }
      applyDelta(model, event.delta);
    } finally {
      applyingRemote = false;
    }
  };
  ytext.observe(observer);

  /** The student's or teacher's whole buffer, as the document's own text. */
  const publishWholeModel = () => {
    const current = toSharedDocumentText(model.getValue(lfPreference));
    if (ytext.toString() === current) return;
    ytext.doc?.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, current);
    }, localOrigin);
  };

  const subscription = model.onDidChangeContent((event) => {
    // An EOL-only change carries no `changes` and is nobody's edit. Reported
    // explicitly rather than falling through an empty loop, so it can never be
    // mistaken for the student having typed.
    if (applyingRemote || event.isEolChange) return;

    /**
     * A whole-model write — `setValue` rather than an edit.
     *
     * It rebuilds the buffer and re-derives the line ending from the text it
     * was handed, so the model may have just left the offset space the document
     * is in, and the offsets in this event describe a buffer that no longer
     * exists. Re-pin and republish the buffer rather than trying to map them.
     * Nothing in the workspace should reach the model this way while a binding
     * is attached; this is what keeps the invariant if something does.
     */
    if (event.isFlush) {
      applyingRemote = true;
      try {
        model.setEOL(lfSequence);
      } finally {
        applyingRemote = false;
      }
      publishWholeModel();
      options.onLocalChange?.();
      return;
    }

    ytext.doc?.transact(() => {
      // Monaco reports changes from the end of the document backwards, so
      // applying them in the order given keeps every offset valid.
      for (const change of event.changes) {
        // Until the server repairs CRLF, Monaco's LF offsets and Y.Text's
        // raw offsets differ. Map both endpoints against the pre-edit text;
        // the student's keystroke must survive this interval too.
        const raw = ytext.toString();
        const start = sharedOffset(raw, change.rangeOffset);
        const end = sharedOffset(raw, change.rangeOffset + change.rangeLength);
        if (end > start) {
          ytext.delete(start, end - start);
        }
        if (change.text.length > 0) {
          // A no-op while the model is pinned, which is the point: the model
          // has already normalized whatever was typed or pasted, so the text
          // going into the document is the same length the model counted.
          ytext.insert(start, toSharedDocumentText(change.text));
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
    replace: (text: string) => {
      const next = toSharedDocumentText(text);
      if (ytext.toString() === next) return;
      ytext.doc?.transact(() => {
        ytext.delete(0, ytext.length);
        ytext.insert(0, next);
      }, localOrigin);
      // The observer skipped its own transaction, so the model is written here
      // rather than left showing the text the document no longer holds.
      applyingRemote = true;
      try {
        model.setValue(next);
        model.setEOL(lfSequence);
      } finally {
        applyingRemote = false;
      }
      options.onLocalChange?.();
    },
  };
}

/**
 * Edits the carriage returns out of a document that predates the LF rule.
 *
 * Character-by-character rather than delete-and-reinsert: the surrounding
 * characters keep their CRDT identities, so a peer still holding the older
 * state merges this cleanly instead of ending up with the document twice.
 */
export function repairSharedText(ytext: Y.Text, origin: unknown): boolean {
  const repairs = carriageReturnRepairs(ytext.toString());
  if (repairs.length === 0) return false;
  ytext.doc?.transact(() => {
    // Already ordered from the end backwards, so no index is invalidated
    // before it has been used.
    for (const repair of repairs) {
      ytext.delete(repair.at, 1);
      if (repair.kind === 'replace') ytext.insert(repair.at, '\n');
    }
  }, origin);
  return true;
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
          // Inserted exactly as the document holds it. Normalizing here
          // would make Monaco store fewer characters than `index` goes on to
          // count, so every later position in this delta — and the repair
          // that follows a foreign line ending — would land one place out.
          // The observer guarantees there is nothing to normalize: a document
          // carrying a carriage return is resynchronized wholesale instead.
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

/** Map an LF model offset into text whose CRLF pairs have not been repaired. */
function sharedOffset(text: string, offset: number): number {
  if (!text.includes('\r')) return offset;
  let raw = 0;
  let canonical = 0;
  while (raw < text.length && canonical < offset) {
    raw += text[raw] === '\r' && text[raw + 1] === '\n' ? 2 : 1;
    canonical += 1;
  }
  return raw;
}
