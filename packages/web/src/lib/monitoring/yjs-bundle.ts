'use client';

import { toSharedDocumentText } from '@cove/shared';
import type * as Y from 'yjs';

import type { YjsMonacoBinding } from './yjs-monaco';

/**
 * The bridge between one Yjs text and a multi-file editor.
 *
 * A multi-file C/C++ exercise keeps the same single shared document a
 * single-file one does, holding the file bundle (`encodeFileBundle`), so the
 * server, drafts and history need nothing new. The editor, though, shows one
 * Monaco model per file. `bindYTextToMonaco` maps one model's offsets onto the
 * document; this maps a whole set of models, through a host that can render
 * itself as a bundle and be told to become one.
 *
 * Every local change is published as the smallest edit that turns the
 * document into the editor's bundle: typing in one file is an insert or a
 * delete inside that file's range, so a peer's concurrent typing in another
 * file (or elsewhere in this one) merges as it does for a single file. Every
 * remote change is handed back to the host as the whole new bundle, which the
 * host applies to each model as a minimal edit of its own.
 */
export type BundleHost = {
  /** The editor's files as a bundle, LF only. */
  read: () => string;
  /** Make the editor's files equal this bundle, without reporting it as local. */
  apply: (bundle: string) => void;
  /** Called after every local edit, structural ones (new file, rename) included. */
  onLocalChange: (listener: () => void) => { dispose: () => void };
};

/** The single replace that turns `from` into `to`: common prefix and suffix kept. */
export function minimalEdit(from: string, to: string): { at: number; remove: number; insert: string } | null {
  if (from === to) return null;
  let start = 0;
  const limit = Math.min(from.length, to.length);
  while (start < limit && from.charCodeAt(start) === to.charCodeAt(start)) start += 1;
  let end = 0;
  while (
    end < limit - start &&
    from.charCodeAt(from.length - 1 - end) === to.charCodeAt(to.length - 1 - end)
  ) end += 1;
  return { at: start, remove: from.length - start - end, insert: to.slice(start, to.length - end) };
}

export function bindYTextToBundle(
  ytext: Y.Text,
  host: BundleHost,
  options: { seed?: 'text' | 'model'; onLocalChange?: () => void } = {},
): YjsMonacoBinding {
  const localOrigin = Symbol('cove-local-bundle-edit');

  const write = (next: string) => {
    const edit = minimalEdit(ytext.toString(), next);
    if (!edit) return;
    ytext.doc?.transact(() => {
      if (edit.remove > 0) ytext.delete(edit.at, edit.remove);
      if (edit.insert) ytext.insert(edit.at, edit.insert);
    }, localOrigin);
  };

  if (options.seed === 'model') write(toSharedDocumentText(host.read()));
  else host.apply(toSharedDocumentText(ytext.toString()));

  const observer = (_event: Y.YTextEvent, transaction: Y.Transaction) => {
    if (transaction.origin === localOrigin) return;
    // A carriage return from an older peer is the server's to repair; the
    // editor shows the canonical text meanwhile, as the single-file binding does.
    host.apply(toSharedDocumentText(ytext.toString()));
  };
  ytext.observe(observer);

  const subscription = host.onLocalChange(() => {
    write(toSharedDocumentText(host.read()));
    options.onLocalChange?.();
  });

  return {
    destroy: () => {
      subscription.dispose();
      ytext.unobserve(observer);
    },
    replace: (text: string) => {
      const next = toSharedDocumentText(text);
      write(next);
      host.apply(next);
      options.onLocalChange?.();
    },
  };
}
