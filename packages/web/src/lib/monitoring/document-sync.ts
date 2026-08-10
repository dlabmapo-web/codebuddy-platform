import { documentSyncResultSchema } from '@cove/shared';
import * as Y from 'yjs';

/**
 * Applies one server-authoritative snapshot to the exact document it names.
 *
 * A sync can arrive through the command acknowledgement and the compatibility
 * event. Yjs updates are idempotent, so both paths converge without replacing
 * the text or turning bootstrap into a local teacher edit.
 */
export function applyDocumentSyncResult({
  currentDraftId,
  doc,
  result,
}: {
  currentDraftId: string | null;
  doc: Y.Doc;
  result: unknown;
}): boolean {
  const parsed = documentSyncResultSchema.safeParse(result);
  if (!parsed.success || parsed.data.draftId !== currentDraftId) return false;
  Y.applyUpdate(doc, toBytes(parsed.data.update), 'server');
  return true;
}

/** Socket.IO uses both binary representations across browser transports. */
export function toBytes(value: Uint8Array | ArrayBuffer): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}
