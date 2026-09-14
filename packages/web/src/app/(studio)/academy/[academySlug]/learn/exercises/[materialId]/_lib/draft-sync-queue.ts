/**
 * One save at a time, per draft.
 *
 * Two things go wrong when this is shared across the workspace rather than
 * kept per draft, and both lose work:
 *
 * - Two overlapping requests for one draft can be acknowledged out of order,
 *   and the loser leaves the saved marker describing text the server has
 *   already replaced.
 * - The queue outlives the problem on screen. Previous/Next does not remount
 *   the workspace, so a final save for the exercise being left is still in
 *   flight when the next one opens — and with one shared slot, the first save
 *   of the destination silently replaces it.
 *
 * Kept free of React so the ordering can be tested directly rather than
 * inferred from a component.
 */

/** What is known about one draft's relationship with the server. */
export type DraftRevision = {
  /**
   * The revision its buffer was edited from.
   *
   * Sent with every save so the server can refuse a replacement written
   * against something it has since passed.
   */
  base: string | null;
  /** The last text the server confirmed, so an unchanged buffer is not re-sent. */
  lastSynced: string | null;
};

export type DraftSendResult =
  | { outcome: 'saved'; updatedAt: string }
  /** Refused as stale. Neither the buffer nor its base has been reconciled. */
  | { outcome: 'conflict'; updatedAt: string }
  /** The request never landed. Nothing is known to have changed. */
  | { outcome: 'failed' };

export type DraftSender<Session> = (input: {
  session: Session;
  code: string;
  base: string | null;
}) => Promise<DraftSendResult>;

export type DraftSyncQueue<Session> = {
  /**
   * Replaces the function saves go through.
   *
   * Set rather than captured at construction so the queue can outlive the
   * closure that sends for it: it holds every draft's revision and whatever is
   * in flight, and rebuilding it each time the sender changed would drop both.
   */
  setSender: (send: DraftSender<Session>) => void;
  /** What is known about a draft right now. */
  revisionOf: (key: string) => DraftRevision;
  /**
   * Establishes what the server said about a draft when the workspace loaded.
   *
   * Never moves a draft backwards: what the queue already holds came from an
   * acknowledged save, and a workspace payload may have been cached before it.
   */
  seed: (key: string, revision: DraftRevision) => void;
  /** Whether a draft's buffer is worth sending at all. */
  shouldSend: (key: string, code: string) => boolean;
  enqueue: (key: string, session: Session, code: string) => Promise<void>;
  /** For tests and diagnostics: the value waiting behind an in-flight save. */
  pendingOf: (key: string) => string | null;
};

export function createDraftSyncQueue<Session>(
  initialSender?: DraftSender<Session>,
): DraftSyncQueue<Session> {
  // Reported as a failure rather than thrown: nothing has been sent, so
  // nothing about any draft is known to have changed, and the buffer is
  // already in local storage.
  let send: DraftSender<Session> =
    initialSender ?? (async () => ({ outcome: 'failed' }));
  const revisions = new Map<string, DraftRevision>();
  const inFlight = new Map<string, Promise<void>>();
  const pending = new Map<string, { session: Session; code: string }>();

  const revisionOf = (key: string): DraftRevision => {
    const existing = revisions.get(key);
    if (existing) return existing;
    const created: DraftRevision = { base: null, lastSynced: null };
    revisions.set(key, created);
    return created;
  };

  const shouldSend = (key: string, code: string) =>
    code !== revisionOf(key).lastSynced;

  return {
    setSender: (next) => {
      send = next;
    },

    revisionOf,

    seed: (key, revision) => {
      const current = revisionOf(key);
      const ahead =
        current.base !== null &&
        (revision.base === null ||
          Date.parse(revision.base) <= Date.parse(current.base));
      if (ahead) return;
      current.base = revision.base;
      current.lastSynced = revision.lastSynced;
    },

    shouldSend,

    pendingOf: (key) => pending.get(key)?.code ?? null,

    enqueue: (key, session, code) => {
      const running = inFlight.get(key);
      if (running) {
        // Only the newest value for this draft is worth sending; the ones it
        // replaces were never on the server and nothing has read them. Held
        // under this draft's own key, so another problem's save cannot take
        // its place in the queue.
        pending.set(key, { session, code });
        return running;
      }

      if (!shouldSend(key, code)) return Promise.resolve();

      const run = async (): Promise<void> => {
        let next: { session: Session; code: string } | undefined = {
          session,
          code,
        };
        while (next) {
          const revision = revisionOf(key);
          const result = await send({
            session: next.session,
            code: next.code,
            base: revision.base,
          });
          // Written against this draft's key, whatever is on screen by now.
          if (result.outcome === 'saved') {
            revision.base = result.updatedAt;
            revision.lastSynced = next.code;
          } else if (result.outcome === 'conflict') {
            // A rejection is not a merge. Retrying a queued local snapshot
            // against this revision would overwrite work the user never saw.
            // Local recovery owns the latest buffer; leave its original base
            // intact and stop this batch until the conflict is resolved.
            pending.delete(key);
            break;
          }
          next = pending.get(key);
          pending.delete(key);
        }
      };

      const started = run().finally(() => {
        inFlight.delete(key);
      });
      inFlight.set(key, started);
      return started;
    },
  };
}
