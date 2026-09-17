/**
 * Local-first draft storage.
 *
 * Typing writes here and nowhere else, so no keystroke costs a request. The
 * server copy is a backup written on idle, blur, and navigation — see
 * `use-draft-autosave`.
 *
 * ## Whose buffer this is
 *
 * IndexedDB is per browser profile, not per account. Keyed by material alone,
 * two students sharing a school machine — or one student and the teacher who
 * signed in after them — select each other's buffer for the same problem, and
 * the workspace opens on code its reader never wrote. Every record is
 * therefore addressed by the learner it belongs to as well as the problem it
 * is for.
 */

export type StoredDraft = { code: string; updatedAt: string };

/**
 * Whose draft, for which problem.
 *
 * The academy is part of the address even though the server's identity is
 * user and material: a material belongs to exactly one academy's curriculum,
 * so this cannot split one server draft into two local buffers, and it keeps a
 * record from being readable outside the academy it was written in. Class is
 * deliberately absent — it is session context, and keying by it would give one
 * student two drafts for one problem.
 */
export type DraftOwner = {
  userId: string;
  academyId: string;
  materialId: string;
};

/**
 * The address of one record.
 *
 * Exported so the shape is testable on its own, and so nothing can quietly
 * grow a second way of spelling it. Records written before ownership was part
 * of the key used the bare material id and are not addressable here at all —
 * which is the point: who wrote them cannot be established, so they are never
 * adopted by whoever opens the problem next.
 */
export function localDraftKey(owner: DraftOwner): string {
  return `${owner.userId}:${owner.academyId}:${owner.materialId}`;
}

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

export function readLocalDraft(owner: DraftOwner): Promise<StoredDraft | null> {
  const key = localDraftKey(owner);
  return transact<StoredDraft | undefined>('readonly', (store) =>
    store.get(key),
  ).then((value) => value ?? null);
}

export function writeLocalDraft(
  owner: DraftOwner,
  draft: StoredDraft,
): Promise<unknown> {
  const key = localDraftKey(owner);
  return transact('readwrite', (store) => store.put(draft, key));
}

export function clearLocalDraft(owner: DraftOwner): Promise<unknown> {
  const key = localDraftKey(owner);
  return transact('readwrite', (store) => store.delete(key));
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

export type DraftSaveState =
  | 'idle'
  | 'local'
  | 'saving'
  | 'saved'
  | 'error'
  | 'conflict';

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
  /** The server refused this buffer as written against a revision it has passed. */
  conflict: boolean;
  everSynced: boolean;
}): DraftSaveState {
  if (input.syncing) return 'saving';
  // Ahead of `error`: a refusal is a specific, recoverable answer, and calling
  // it a failure would tell the student to retry something that will be
  // refused again for the same reason.
  if (input.conflict) return 'conflict';
  if (input.failed) return 'error';
  if (input.dirty) return 'local';
  return input.everSynced ? 'saved' : 'idle';
}

/**
 * Which code the editor opens with when the route selected an old attempt.
 *
 * The submission wins over the saved draft, but only as a view: `reviewing`
 * says the buffer is not work in progress yet. Nothing about the workspace is
 * disabled by it — it decides autosave, not editing.
 */
export function resolveReviewBuffer(input: {
  historicalCode: string | null;
  draftCode: string | null;
  starterCode: string;
}): { code: string; reviewing: boolean } {
  if (input.historicalCode !== null) {
    return { code: input.historicalCode, reviewing: true };
  }
  return { code: input.draftCode ?? input.starterCode, reviewing: false };
}

/**
 * Whether a hidden tab should push its buffer to the server.
 *
 * An untouched reviewed submission must not: the student's own draft is still
 * what belongs there, and closing a tab is not a decision to replace it.
 *
 * Nor should a buffer this page has already beaconed. `visibilitychange` and
 * `pagehide` both announce one departure, and the second copy would only be
 * refused as stale.
 */
export function shouldPersistOnHide(input: {
  reviewing: boolean;
  code: string;
  lastSyncedCode: string | null;
  /** The code last handed to a beacon for this same draft, if any. */
  beaconedCode?: string | null;
}): boolean {
  if (input.reviewing) return false;
  if (input.beaconedCode === input.code) return false;
  return shouldSyncDraft(input);
}

/**
 * Whether a page event means the student may be leaving.
 *
 * Safari, and iOS Safari above all, does not reliably fire `visibilitychange`
 * when a tab closes; `pagehide` is the event it does fire. Either counts, but
 * a `visibilitychange` back to visible does not.
 */
export function isPageLeaving(
  eventType: string,
  visibilityState: DocumentVisibilityState,
): boolean {
  if (eventType === 'pagehide') return true;
  return eventType === 'visibilitychange' && visibilityState === 'hidden';
}

/**
 * Something that can happen to the buffer on screen.
 *
 * `collaborate` is a teacher joining. It is in this list precisely so that it
 * is visibly not a promotion: a student's saved draft must not be replaced by
 * an old submission they were only reading because somebody opened them.
 */
export type DraftAction =
  | 'edit'
  | 'submit'
  | 'reset'
  | 'open'
  | 'navigate'
  | 'collaborate';

/**
 * What a reviewed buffer becomes after the student acts on it.
 *
 * Editing it and submitting it are the same promotion: from here on it is an
 * ordinary draft with ordinary autosave. Reset is also an edit — it replaces
 * the submission with the starter code, which is the student's own work.
 * Opening, navigating away, and being watched are none of those.
 */
export function promotesReviewBuffer(action: DraftAction): boolean {
  return action === 'edit' || action === 'submit' || action === 'reset';
}

/**
 * Whether the buffer on screen may be handed to a shared document.
 *
 * The first bind of a draft seeds the CRDT from the editor, and whatever it
 * seeds becomes the student's saved work the next time collaboration flushes.
 * Two states make that the wrong buffer, and both are quiet:
 *
 * - Local recovery has not answered yet. On a cached revisit the editor holds
 *   the code the workspace query was cached with, which can be older than what
 *   is in IndexedDB.
 * - An old submission is open for review. It is not the student's draft at
 *   all, and a teacher opening them is not a decision to make it one —
 *   `promotesReviewBuffer` says which actions are.
 *
 * Declining to seed is not declining to collaborate: the teacher still joins
 * the room and still sees the draft the server holds. It is the student's
 * editor that stays out of it until the buffer in it is theirs.
 */
export function canSeedCollaboration(input: {
  hydrated: boolean;
  reviewing: boolean;
}): boolean {
  return input.hydrated && !input.reviewing;
}
