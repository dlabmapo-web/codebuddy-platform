/**
 * Local-first draft storage.
 *
 * Typing writes here and nowhere else, so no keystroke costs a request. The
 * server copy is a backup written on idle, blur, and navigation — see
 * `use-draft-autosave`.
 */

export type StoredDraft = { code: string; updatedAt: string };

const DB_NAME = 'cove-learn';
const STORE = 'drafts';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    // Private browsing and storage-pressure eviction both surface here. The
    // workspace stays usable without local persistence; only crash recovery is
    // lost, so every caller treats null as "no local draft".
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
}

function transact<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDatabase().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        try {
          const request = run(db.transaction(STORE, mode).objectStore(STORE));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

export function readLocalDraft(materialId: string): Promise<StoredDraft | null> {
  return transact<StoredDraft | undefined>('readonly', (store) =>
    store.get(materialId),
  ).then((value) => value ?? null);
}

export function writeLocalDraft(
  materialId: string,
  draft: StoredDraft,
): Promise<unknown> {
  return transact('readwrite', (store) => store.put(draft, materialId));
}

export function clearLocalDraft(materialId: string): Promise<unknown> {
  return transact('readwrite', (store) => store.delete(materialId));
}

/* ------------------------------------------------------------ pure logic */

/**
 * Whether the server copy is worth writing.
 *
 * Syncing code identical to what the server already holds wastes a request per
 * idle period across every student on the platform, so equality short-circuits
 * before anything reaches the network.
 */
export function shouldSyncDraft(input: {
  code: string;
  lastSyncedCode: string | null;
}): boolean {
  return input.code !== input.lastSyncedCode;
}

export type DraftSaveState = 'idle' | 'local' | 'saving' | 'saved' | 'error';

/**
 * What the workspace tells the student about their work.
 *
 * "Saved locally" is deliberately distinct from "saved": the student's machine
 * has the code either way, but only the second survives switching devices, and
 * conflating them would overstate what a failed sync accomplished.
 */
export function resolveSaveState(input: {
  dirty: boolean;
  syncing: boolean;
  failed: boolean;
  everSynced: boolean;
}): DraftSaveState {
  if (input.syncing) return 'saving';
  if (input.failed) return 'error';
  if (input.dirty) return 'local';
  return input.everSynced ? 'saved' : 'idle';
}
