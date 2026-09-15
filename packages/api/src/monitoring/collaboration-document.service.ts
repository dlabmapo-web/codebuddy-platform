import { createHash, randomUUID } from "node:crypto";

import { Inject, Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { carriageReturnRepairs, monitoringTiming, toSharedDocumentText } from "@cove/shared";
import * as Y from "yjs";

import { PrismaService } from "../database/prisma.service.js";
import { DraftCoordinator } from "../drafts/draft-coordinator.service.js";
import { MONITORING_REDIS, monitoringKeyPrefix, type MonitoringRedis } from "./monitoring.tokens.js";

/**
 * The server's copy of a shared draft.
 *
 * Yjs updates are commutative, associative, and idempotent, so applying the
 * same update twice or out of order converges — which is what lets the socket
 * layer retry a lost update instead of asking peers to resend a whole
 * document, as v1 did.
 *
 * Two guarantees are kept apart on purpose. Convergence is Yjs's: an accepted
 * update is in the document immediately. Durability is Postgres's: the
 * document is flushed on a short debounce, and the UI shows unsaved work until
 * the flush is confirmed rather than implying a save that has not happened.
 *
 * A third guarantee lives here too: the document holds LF and never a carriage
 * return. Monaco counts offsets in its model's line ending and Yjs counts
 * indices in the string's, so a document carrying CRLF puts two editors one
 * character apart per line and they never converge again. This is the only
 * place that can promise it, because it is the only place every reader passes
 * through — which is why the invariant is re-established on every accepted
 * path below rather than once at load.
 */

/** The single shared type inside every draft document. */
const codeField = "code";

/**
 * Marks a transaction this service produced to restore the line-ending
 * invariant, so a repair is never mistaken for a peer's edit and cannot echo
 * back around the bus.
 */
const repairOrigin = "repair";

type CachedDocument = {
  doc: Y.Doc;
  snapshotVersion: bigint;
  /**
   * Which revision of this document exists, and which one reached Postgres.
   *
   * Counters rather than one boolean: a flush that began before the student's
   * last keystroke must not be able to mark that keystroke saved when it
   * finally returns. The document is dirty precisely while the two differ.
   */
  revision: number;
  persistedRevision: number;
  /**
   * Whether this document was rebuilt because the stored history no longer
   * described the draft.
   *
   * The flush below merges whatever is stored before it writes, so that two
   * instances cannot overwrite each other. That merge has to be skipped
   * exactly once here, or it would bring back the history the load deliberately
   * discarded — and the student would get their old session's text appended to
   * the work that superseded it. Cleared by the first write, after which the
   * stored state is this document's own and merging is right again.
   */
  supersededHistory: boolean;
  flushTimer: NodeJS.Timeout | null;
  flushFailures: number;
  persistedCodeHash: string;
  lastTouchedAt: number;
};

function isDirty(cached: CachedDocument): boolean {
  return cached.revision !== cached.persistedRevision;
}

export type DocumentSync = {
  persistedCodeHash: string;
  /** Only what the asking peer is missing. */
  update: Uint8Array;
  stateVector: Uint8Array;
};

export type FlushOutcome = {
  persisted: boolean;
  snapshotVersion: bigint;
  snapshot?: { code: string; updatedAt: Date };
};

/**
 * How many times a release will chase a document that keeps being edited
 * before it gives up and leaves it resident. Bounded so a client typing
 * continuously cannot hold a shutdown open.
 */
const releaseFlushAttempts = 3;

/** Bounds the resident document cache; idle documents are flushed and dropped. */
const maxCachedDocuments = 200;

export type FlushListener = (event: {
  draftId: string;
  persisted: boolean;
  snapshotVersion: bigint;
  codeHash?: string;
}) => void;

/**
 * A change this server made to a document peers may already be editing — a
 * line-ending repair, or a plain snapshot folded in from the HTTP save path.
 *
 * Announced rather than applied silently: a client mid-session holds its own
 * copy, and leaving it holding text the server no longer has puts it back
 * exactly one character per line out of step — the fault this all exists to
 * remove.
 */
export type ServerUpdateListener = (event: {
  draftId: string;
  update: Uint8Array;
}) => void;

@Injectable()
export class CollaborationDocumentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CollaborationDocumentService.name);
  private readonly documents = new Map<string, CachedDocument>();
  private readonly watches = new Map<string, Set<string>>();
  /** One database transaction per draft, shared by every caller. */
  private readonly flushing = new Map<string, Promise<FlushOutcome>>();
  private stopping = false;
  /** Cold loads in flight, so two callers cannot build two documents for one draft. */
  private readonly loading = new Map<string, Promise<CachedDocument>>();
  private readonly flushListeners = new Set<FlushListener>();
  private readonly serverUpdateListeners = new Set<ServerUpdateListener>();
  private readonly instanceId = randomUUID();
  private subscriber: Exclude<MonitoringRedis, null> | null = null;
  private unregisterAuthority: (() => void) | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly drafts: DraftCoordinator,
    @Optional() @Inject(MONITORING_REDIS) private readonly redis: MonitoringRedis = null,
  ) {}

  onModuleInit(): void {
    /**
     * While a document is resident it, and not the HTTP autosave, owns the
     * draft's text. Declared here rather than assumed by the save path, so
     * there is one answer to "who owns this draft right now" instead of two
     * writers racing for the same row.
     */
    this.unregisterAuthority = this.drafts.register({
      owns: (draftId) => this.documents.has(draftId),
      readCode: (draftId) => this.readCode(draftId),
      persist: async (draftId) => {
        const result = await this.flush(draftId);
        return result.persisted && !this.hasUnsavedWork(draftId) ? result.snapshot ?? null : null;
      },
      forget: (draftId) => this.forget(draftId),
    });
    if (!this.redis) return;
    this.subscriber = this.redis.duplicate({ enableOfflineQueue: true });
    this.subscriber.on("message", (_channel, message) => {
      try {
        const event = JSON.parse(message) as {
          instanceId: string;
          draftId: string;
          update: string;
        };
        if (event.instanceId === this.instanceId || !this.documents.has(event.draftId)) return;
        this.applyCachedUpdate(event.draftId, Buffer.from(event.update, "base64"));
      } catch {
        this.logger.warn("ignored malformed collaboration bus update");
      }
    });
    void this.subscriber
      .subscribe(`${monitoringKeyPrefix}document-updates`)
      .catch((error: unknown) => {
        this.logger.error(
          `collaboration bus subscription failed: ${
            error instanceof Error ? error.name : "unknown error"
          }`,
        );
      });
  }

  /**
   * Reports every persistence attempt, so the gateway can tell both clients
   * whether their work is durable yet.
   *
   * A listener rather than a socket reference: this service persists on a
   * timer and knows nothing about rooms, and giving it one would make the
   * durability guarantee depend on a connection being open.
   */
  onFlush(listener: FlushListener): () => void {
    this.flushListeners.add(listener);
    return () => this.flushListeners.delete(listener);
  }

  /** The same arrangement, for a change peers have to be told about. */
  onServerUpdate(listener: ServerUpdateListener): () => void {
    this.serverUpdateListeners.add(listener);
    return () => this.serverUpdateListeners.delete(listener);
  }

  /**
   * Hands a server-made change to the room and to the other API instances.
   *
   * Both halves matter: a peer that never receives it keeps editing the string
   * the server has replaced, and a replica that never receives it reintroduces
   * that string the next time it flushes.
   */
  private announceServerUpdate(draftId: string, update: Uint8Array): void {
    for (const listener of this.serverUpdateListeners) {
      listener({ draftId, update });
    }
    // Idempotent, and carries this instance's id, so it cannot loop back.
    void this.publish(draftId, update);
  }

  private announce(
    draftId: string,
    persisted: boolean,
    snapshotVersion: bigint,
    codeHash?: string,
  ): void {
    for (const listener of this.flushListeners) {
      listener({ draftId, persisted, snapshotVersion, codeHash });
    }
  }

  /**
   * Loads a document, creating it from the draft's plain code the first time.
   *
   * A draft written before monitoring existed has no CRDT state, so the first
   * collaborator seeds one from `ExerciseDraft.code`. That is why no bulk
   * backfill is needed: the conversion happens exactly where it is used.
   */
  async load(draftId: string): Promise<Y.Doc> {
    return (await this.loadCached(draftId)).doc;
  }

  /**
   * One document per draft, however many callers ask at once.
   *
   * Without the in-flight map two concurrent cold loads each build a document
   * from the same stored bytes, and whichever finishes second replaces the
   * first — taking with it any update the first had already accepted.
   */
  private async loadCached(draftId: string): Promise<CachedDocument> {
    const cached = this.documents.get(draftId);
    if (cached) {
      cached.lastTouchedAt = Date.now();
      return cached;
    }
    const inFlight = this.loading.get(draftId);
    if (inFlight) return inFlight;

    const started = this.loadUncached(draftId).finally(() => {
      this.loading.delete(draftId);
    });
    this.loading.set(draftId, started);
    return started;
  }

  private async loadUncached(draftId: string): Promise<CachedDocument> {
    const [document, draft] = await Promise.all([
      this.prisma.exerciseCollaborationDocument.findUnique({
        where: { draftId },
        select: { yjsState: true, snapshotVersion: true, codeHash: true },
      }),
      this.prisma.exerciseDraft.findUnique({
        where: { id: draftId },
        select: { code: true },
      }),
    ]);

    // A caller that started after this one may have finished while it waited.
    const raced = this.documents.get(draftId);
    if (raced) return raced;

    const doc = new Y.Doc();
    /**
     * The stored history, but only while it still describes the draft.
     *
     * `flush` writes the CRDT state, the readable text, and the hash of that
     * text in one transaction, so the two agree by construction. If they have
     * since stopped agreeing, something wrote the plain draft while nothing
     * was collaborating — an ordinary autosave — and that text is newer than
     * anything the history knows about. Preferring the history there is how a
     * student's unwatched work came back as the code from their last live
     * session.
     */
    // Compared against the draft exactly as stored, because that is what the
    // flush hashed. Normalization happens after the decision, not before it,
    // or every document written before the LF rule would look superseded and
    // its history would be thrown away.
    const stored = draft?.code ?? "";
    const superseded =
      document !== null && document.codeHash !== hashOf(stored);
    if (document && !superseded) {
      Y.applyUpdate(doc, new Uint8Array(document.yjsState));
    } else {
      if (superseded) {
        this.logger.warn(
          `collaboration history for ${draftId} was superseded by a plain save; rebuilding from the draft`,
        );
      }
      const plain = toSharedDocumentText(stored);
      if (plain.length > 0) doc.getText(codeField).insert(0, plain);
    }

    await this.evictIdle();
    const cached: CachedDocument = {
      doc,
      snapshotVersion: document?.snapshotVersion ?? 0n,
      revision: 0,
      persistedRevision: 0,
      supersededHistory: superseded,
      flushTimer: null,
      flushFailures: 0,
      persistedCodeHash: hashOf(stored),
      lastTouchedAt: Date.now(),
    };
    this.documents.set(draftId, cached);
    // Before the document is answered to any peer: nobody is ever handed a
    // carriage return to compute an offset against.
    this.normalizeCached(draftId, cached);
    // A plain legacy draft was normalized before constructing the Y.Doc.
    // It still needs a durable LF write even though there was no CRDT repair.
    if (!isDirty(cached) && hashOf(doc.getText(codeField).toString()) !== cached.persistedCodeHash) {
      cached.revision += 1;
      this.scheduleFlush(draftId, cached);
    }
    return cached;
  }

  /**
   * Restores the line-ending invariant, and tells everyone who needs to know.
   *
   * The carriage returns are edited out one at a time from the end of the text
   * backwards, so every surrounding character keeps its CRDT identity and a
   * peer holding the older state merges this cleanly. Replacing the whole text
   * would give every character a new identity and leave that peer with the
   * document twice.
   */
  private normalizeCached(draftId: string, cached: CachedDocument): boolean {
    const text = cached.doc.getText(codeField);
    const repairs = carriageReturnRepairs(text.toString());
    if (repairs.length === 0) return false;

    const before = Y.encodeStateVector(cached.doc);
    cached.doc.transact(() => {
      for (const repair of repairs) {
        text.delete(repair.at, 1);
        if (repair.kind === "replace") text.insert(repair.at, "\n");
      }
    }, repairOrigin);

    cached.revision += 1;
    cached.lastTouchedAt = Date.now();
    this.scheduleFlush(draftId, cached);
    this.announceServerUpdate(draftId, Y.encodeStateAsUpdate(cached.doc, before));
    this.logger.warn(
      `normalized ${repairs.length} carriage return(s) in collaboration document ${draftId}`,
    );
    return true;
  }

  /**
   * Answers a peer's state vector with the difference, and offers the server's
   * own vector so the peer can send back anything the server is missing.
   *
   * No request is broadcast to other clients: a teacher joining an empty room
   * receives server-owned state rather than waiting for a peer that may never
   * arrive.
   */
  async sync(draftId: string, stateVector: Uint8Array): Promise<DocumentSync> {
    const cached = await this.loadCached(draftId);
    const doc = cached.doc;
    return {
      persistedCodeHash: cached.persistedCodeHash,
      update: Y.encodeStateAsUpdate(doc, stateVector),
      stateVector: Y.encodeStateVector(doc),
    };
  }

  /**
   * Applies an authorized update and schedules persistence.
   *
   * The acknowledgement the caller sends afterwards means "applied and
   * accepted", not "saved" — the two are reported separately so an unsaved
   * warning can be honest.
   */
  async applyUpdate(draftId: string, update: Uint8Array): Promise<void> {
    await this.loadCached(draftId);
    this.applyCachedUpdate(draftId, update);
    await this.publish(draftId, update);
  }

  /** The plain text every ordinary learning and submission flow reads. */
  async readCode(draftId: string): Promise<string> {
    const doc = await this.load(draftId);
    return doc.getText(codeField).toString();
  }

  /**
   * Writes the CRDT state and the readable snapshot in one transaction.
   *
   * The version is claimed by the same conditional update that writes, so two
   * API instances flushing the same document cannot have one silently
   * overwrite the other: the loser merges the newer stored state into its own
   * document and retries, which is safe precisely because Yjs updates merge.
   */
  flush(draftId: string): Promise<FlushOutcome> {
    const pending = this.flushing.get(draftId);
    if (pending) return pending;
    const promise = this.flushOnce(draftId).finally(() => {
      if (this.flushing.get(draftId) === promise) this.flushing.delete(draftId);
    });
    this.flushing.set(draftId, promise);
    return promise;
  }

  private async flushOnce(draftId: string): Promise<FlushOutcome> {
    const cached = this.documents.get(draftId);
    if (!cached) return { persisted: false, snapshotVersion: 0n };
    this.cancelFlush(cached);

    try {
      const persisted = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe(
          "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))::text AS locked",
          draftId,
        );
        const existing = await tx.exerciseCollaborationDocument.findUnique({
          where: { draftId },
          select: { snapshotVersion: true, yjsState: true },
        });

        if (existing && !cached.supersededHistory) {
          Y.applyUpdate(cached.doc, new Uint8Array(existing.yjsState), "remote");
          // The state merged in was written by another instance, which may be
          // running an older build. The invariant is re-established before the
          // merged document is what gets written back.
          this.normalizeCached(draftId, cached);
        }

        // Captured with the bytes rather than before the transaction, so the
        // revision this flush acknowledges is exactly the one it writes. An
        // edit that lands while Postgres is busy stays unsaved, and is
        // rescheduled below.
        const writtenRevision = cached.revision;
        const state = Y.encodeStateAsUpdate(cached.doc);
        const code = cached.doc.getText(codeField).toString();
        const nextVersion = (existing?.snapshotVersion ?? 0n) + 1n;
        const codeHash = hashOf(code);

        const savedDraft = await tx.exerciseDraft.update({
          where: { id: draftId },
          data: { code },
          select: { code: true, updatedAt: true },
        });
        await tx.exerciseCollaborationDocument.upsert({
          where: { draftId },
          create: {
            draftId,
            yjsState: Buffer.from(state),
            snapshotVersion: nextVersion,
            codeHash,
          },
          update: {
            yjsState: Buffer.from(state),
            snapshotVersion: nextVersion,
            codeHash,
          },
        });
        return { snapshotVersion: nextVersion, writtenRevision, codeHash, snapshot: savedDraft };
      });
      cached.snapshotVersion = persisted.snapshotVersion;
      // What is stored is now this document's own.
      cached.supersededHistory = false;
      if (persisted.writtenRevision > cached.persistedRevision) {
        cached.persistedRevision = persisted.writtenRevision;
      }
      cached.flushFailures = 0;
      cached.persistedCodeHash = persisted.codeHash;
      // The hash identifies exactly the text made durable, including deletions.
      // Clients compare it with their current text before showing Saved.
      this.announce(draftId, true, persisted.snapshotVersion, persisted.codeHash);
      // Anything that arrived while the write was in flight is still unsaved,
      // and anything that did not means the timer a repair scheduled during
      // the transaction has nothing left to do.
      if (isDirty(cached)) this.scheduleFlush(draftId, cached);
      else this.cancelFlush(cached);
      return { persisted: true, snapshotVersion: persisted.snapshotVersion, snapshot: persisted.snapshot };
    } catch (error) {
      // The document stays in memory and dirty: a still-connected client can
      // resupply it, and the next flush retries. Losing the draft is the one
      // outcome that is never acceptable here.
      this.logger.error(
        `collaboration flush failed: ${
          error instanceof Error ? error.name : "unknown error"
        }`,
      );
      // Said out loud, so the editor keeps showing unsaved work rather than
      // implying a save that did not happen.
      this.announce(draftId, false, cached.snapshotVersion);
      cached.flushFailures = Math.min(cached.flushFailures + 1, 6);
      this.cancelFlush(cached);
      this.scheduleFlush(draftId, cached);
      return { persisted: false, snapshotVersion: cached.snapshotVersion };
    }
  }

  /**
   * Flush now and forget the document, for a room that emptied cleanly.
   *
   * A document whose flush failed is kept rather than destroyed. Its only copy
   * is the one in memory, a still-connected peer can resupply it, and the
   * retry below costs a cache slot — while destroying it costs a student their
   * code, which is never the trade to make.
   */
  async release(draftId: string): Promise<void> {
    const cached = this.documents.get(draftId);
    if (!cached) return;
    // A loop, not one attempt: an edit can land while a flush is in Postgres,
    // and that flush only ever claims the revision it actually wrote. Checking
    // once and then destroying would throw away everything typed during it.
    for (let attempt = 0; attempt < releaseFlushAttempts; attempt += 1) {
      if (!isDirty(cached)) break;
      if (!(await this.flush(draftId)).persisted) break;
    }
    if (isDirty(cached)) {
      this.logger.error(
        `kept unsaved collaboration document ${draftId} after a failed release`,
      );
      this.scheduleFlush(draftId, cached);
      return;
    }
    if (this.watches.get(draftId)?.size) return;
    this.cancelFlush(cached);
    cached.doc.destroy();
    this.documents.delete(draftId);
  }

  /**
   * Whether *this process* is still serving a watch on the draft.
   *
   * Bookkeeping, not authority. It answers "may I drop my cache", and it
   * cannot answer "is anybody anywhere watching this student" — another API
   * instance holds its own set and this one has never seen it. Releasing a
   * document on this answer alone is how a student would be handed back to
   * local drafting while a teacher on the other instance was still typing, so
   * the global count comes from the watch-session registry and is passed in to
   * {@link endWatch} by the caller that has it.
   */
  hasWatch(draftId: string): boolean {
    return Boolean(this.watches.get(draftId)?.size);
  }

  beginWatch(draftId: string, visitId: string): void {
    const visits = this.watches.get(draftId) ?? new Set<string>();
    visits.add(visitId);
    this.watches.set(draftId, visits);
  }

  /**
   * Closes one watch's hold on a document.
   *
   * `remoteWatchers` is how many watches other API instances still have open
   * on this draft — zero is the only value that permits the handoff. A
   * returned snapshot is a promise to the student that the authoritative text
   * is durable and they may resume ordinary autosave, so it is offered only
   * after a successful flush *and* only when nothing else is still writing.
   * A failed flush keeps the document in memory and returns null, which the
   * caller reports as pending recovery rather than as a completed handoff.
   */
  async endWatch(
    draftId: string,
    visitId: string,
    options: { remoteWatchers?: number } = {},
  ): Promise<{
    code: string;
    updatedAt: string;
  } | null> {
    const visits = this.watches.get(draftId);
    visits?.delete(visitId);
    if (visits?.size) return null;
    this.watches.delete(draftId);
    // Another instance is still the document's reader or writer. Dropping the
    // local cache is safe and correct; declaring the watch over is not.
    if ((options.remoteWatchers ?? 0) > 0) return null;
    await this.release(draftId);
    // A failed flush retains authority: never tell the student to resume
    // snapshot writes against a document whose only current copy is in memory.
    if (this.documents.has(draftId)) return null;
    const draft = await this.prisma.exerciseDraft.findUnique({
      where: { id: draftId },
      select: { code: true, updatedAt: true },
    });
    return draft ? { code: draft.code, updatedAt: draft.updatedAt.toISOString() } : null;
  }

  hasUnsavedWork(draftId: string): boolean {
    const cached = this.documents.get(draftId);
    return cached ? isDirty(cached) : false;
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    for (const cached of this.documents.values()) this.cancelFlush(cached);
    this.watches.clear();
    this.unregisterAuthority?.();
    this.unregisterAuthority = null;
    // A rolling deploy must not drop a second of typing on the floor.
    await Promise.all(
      [...this.documents.keys()].map((draftId) => this.release(draftId)),
    );
    // Whatever could not be written is named rather than swallowed: an
    // operator needs to know a draft is only in a process that is ending.
    const stranded = [...this.documents.entries()].filter(([, cached]) =>
      isDirty(cached),
    );
    if (stranded.length > 0) {
      this.logger.error(
        `shutdown with ${stranded.length} unsaved collaboration document(s): ${stranded
          .map(([draftId]) => draftId)
          .join(", ")}`,
      );
    }
    if (this.subscriber) {
      this.subscriber.disconnect();
    }
  }

  /**
   * The draft is gone, so the document must go with it — unflushed.
   *
   * Flushing here would recreate the row the student just discarded, and
   * keeping the document resident would have its next flush fail against a
   * missing draft and report that as unsaved work.
   */
  private forget(draftId: string): void {
    const cached = this.documents.get(draftId);
    if (!cached) return;
    this.cancelFlush(cached);
    cached.doc.destroy();
    this.documents.delete(draftId);
  }

  private async publish(draftId: string, update: Uint8Array): Promise<void> {
    if (!this.redis) return;
    await this.redis.publish(
      `${monitoringKeyPrefix}document-updates`,
      JSON.stringify({
        instanceId: this.instanceId,
        draftId,
        update: Buffer.from(update).toString("base64"),
      }),
    );
  }

  private scheduleFlush(draftId: string, cached: CachedDocument): void {
    if (this.stopping || this.documents.get(draftId) !== cached || cached.flushTimer) return;
    // Keep trying at a bounded rate while the only durable copy is pending.
    // New keystrokes do not reset an outage's backoff.
    const delay = cached.flushFailures === 0
      ? monitoringTiming.documentFlushDebounceMs
      : Math.min(30_000, 1_000 * 2 ** (cached.flushFailures - 1)) * (0.8 + Math.random() * 0.2);
    cached.flushTimer = setTimeout(() => {
      cached.flushTimer = null;
      void this.flush(draftId);
    }, delay);
    // A pending flush must never keep the process alive on shutdown.
    cached.flushTimer.unref?.();
  }

  private cancelFlush(cached: CachedDocument): void {
    if (!cached.flushTimer) return;
    clearTimeout(cached.flushTimer);
    cached.flushTimer = null;
  }

  private applyCachedUpdate(draftId: string, update: Uint8Array): void {
    const cached = this.documents.get(draftId);
    if (!cached) return;
    Y.applyUpdate(cached.doc, update, "remote");
    cached.revision += 1;
    cached.lastTouchedAt = Date.now();
    this.scheduleFlush(draftId, cached);
    // An accepted update can reintroduce a carriage return — an old client
    // that has not been refreshed, or a replica running an older build. Every
    // path that changes the document re-establishes the invariant, which is
    // why load-time normalization alone is not enough.
    this.normalizeCached(draftId, cached);
  }

  /** Keeps the cache bounded by dropping the least recently touched clean doc. */
  private async evictIdle(): Promise<void> {
    if (this.documents.size < maxCachedDocuments) return;
    let candidates = [...this.documents.entries()]
      .filter(([id, cached]) => !isDirty(cached) && !this.watches.get(id)?.size)
      .sort((left, right) => left[1].lastTouchedAt - right[1].lastTouchedAt);
    if (candidates.length === 0) {
      const dirty = [...this.documents.entries()].sort(
        (left, right) => left[1].lastTouchedAt - right[1].lastTouchedAt,
      )[0];
      if (dirty) await this.flush(dirty[0]);
      candidates = [...this.documents.entries()]
        .filter(([id, cached]) => !isDirty(cached) && !this.watches.get(id)?.size)
        .sort((left, right) => left[1].lastTouchedAt - right[1].lastTouchedAt);
    }
    const oldest = candidates[0];
    if (!oldest) {
      throw new Error("collaboration cache full with unsaved documents");
    }
    this.cancelFlush(oldest[1]);
    oldest[1].doc.destroy();
    this.documents.delete(oldest[0]);
  }
}

/** The same digest `flush` stores beside the state it wrote. */
function hashOf(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
