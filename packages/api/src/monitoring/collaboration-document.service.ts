import { createHash, randomUUID } from "node:crypto";

import { Inject, Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { monitoringTiming } from "@cove/shared";
import * as Y from "yjs";

import { PrismaService } from "../database/prisma.service.js";
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
 */

/** The single shared type inside every draft document. */
const codeField = "code";

type CachedDocument = {
  doc: Y.Doc;
  snapshotVersion: bigint;
  /** Set by an applied update, cleared by a confirmed flush. */
  dirty: boolean;
  flushTimer: NodeJS.Timeout | null;
  lastTouchedAt: number;
};

export type DocumentSync = {
  /** Only what the asking peer is missing. */
  update: Uint8Array;
  stateVector: Uint8Array;
};

export type FlushOutcome = {
  persisted: boolean;
  snapshotVersion: bigint;
};

/** Bounds the resident document cache; idle documents are flushed and dropped. */
const maxCachedDocuments = 200;

export type FlushListener = (event: {
  draftId: string;
  persisted: boolean;
  snapshotVersion: bigint;
}) => void;

@Injectable()
export class CollaborationDocumentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CollaborationDocumentService.name);
  private readonly documents = new Map<string, CachedDocument>();
  private readonly flushListeners = new Set<FlushListener>();
  private readonly instanceId = randomUUID();
  private subscriber: Exclude<MonitoringRedis, null> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(MONITORING_REDIS) private readonly redis: MonitoringRedis = null,
  ) {}

  onModuleInit(): void {
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

  private announce(
    draftId: string,
    persisted: boolean,
    snapshotVersion: bigint,
  ): void {
    for (const listener of this.flushListeners) {
      listener({ draftId, persisted, snapshotVersion });
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
    const cached = this.documents.get(draftId);
    if (cached) {
      cached.lastTouchedAt = Date.now();
      return cached.doc;
    }

    const [document, draft] = await Promise.all([
      this.prisma.exerciseCollaborationDocument.findUnique({
        where: { draftId },
        select: { yjsState: true, snapshotVersion: true },
      }),
      this.prisma.exerciseDraft.findUnique({
        where: { id: draftId },
        select: { code: true },
      }),
    ]);

    const doc = new Y.Doc();
    if (document) {
      Y.applyUpdate(doc, new Uint8Array(document.yjsState));
    } else if (draft && draft.code.length > 0) {
      doc.getText(codeField).insert(0, draft.code);
    }

    await this.evictIdle();
    this.documents.set(draftId, {
      doc,
      snapshotVersion: document?.snapshotVersion ?? 0n,
      dirty: false,
      flushTimer: null,
      lastTouchedAt: Date.now(),
    });
    return doc;
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
    const doc = await this.load(draftId);
    return {
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
    await this.load(draftId);
    this.applyCachedUpdate(draftId, update);
    if (this.redis) {
      await this.redis.publish(
        `${monitoringKeyPrefix}document-updates`,
        JSON.stringify({
          instanceId: this.instanceId,
          draftId,
          update: Buffer.from(update).toString("base64"),
        }),
      );
    }
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
  async flush(draftId: string): Promise<FlushOutcome> {
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

        if (existing) {
          Y.applyUpdate(cached.doc, new Uint8Array(existing.yjsState), "remote");
        }

        const state = Y.encodeStateAsUpdate(cached.doc);
        const code = cached.doc.getText(codeField).toString();
        const nextVersion = (existing?.snapshotVersion ?? 0n) + 1n;
        const codeHash = createHash("sha256").update(code).digest("hex");

        await tx.exerciseDraft.update({
          where: { id: draftId },
          data: { code },
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
        return { snapshotVersion: nextVersion };
      });
      cached.snapshotVersion = persisted.snapshotVersion;
      cached.dirty = false;
      this.announce(draftId, true, persisted.snapshotVersion);
      return { persisted: true, snapshotVersion: persisted.snapshotVersion };
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
      return { persisted: false, snapshotVersion: cached.snapshotVersion };
    }
  }

  /** Flush now and forget the document, for a room that emptied cleanly. */
  async release(draftId: string): Promise<void> {
    const cached = this.documents.get(draftId);
    if (!cached) return;
    if (cached.dirty) await this.flush(draftId);
    this.cancelFlush(cached);
    cached.doc.destroy();
    this.documents.delete(draftId);
  }

  hasUnsavedWork(draftId: string): boolean {
    return this.documents.get(draftId)?.dirty ?? false;
  }

  async onModuleDestroy(): Promise<void> {
    // A rolling deploy must not drop a second of typing on the floor.
    await Promise.all(
      [...this.documents.keys()].map((draftId) => this.release(draftId)),
    );
    if (this.subscriber) {
      this.subscriber.disconnect();
    }
  }

  private scheduleFlush(draftId: string, cached: CachedDocument): void {
    if (cached.flushTimer) return;
    cached.flushTimer = setTimeout(() => {
      cached.flushTimer = null;
      void this.flush(draftId);
    }, monitoringTiming.documentFlushDebounceMs);
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
    cached.dirty = true;
    cached.lastTouchedAt = Date.now();
    this.scheduleFlush(draftId, cached);
  }

  /** Keeps the cache bounded by dropping the least recently touched clean doc. */
  private async evictIdle(): Promise<void> {
    if (this.documents.size < maxCachedDocuments) return;
    let candidates = [...this.documents.entries()]
      .filter(([, cached]) => !cached.dirty)
      .sort((left, right) => left[1].lastTouchedAt - right[1].lastTouchedAt);
    if (candidates.length === 0) {
      const dirty = [...this.documents.entries()].sort(
        (left, right) => left[1].lastTouchedAt - right[1].lastTouchedAt,
      )[0];
      if (dirty) await this.flush(dirty[0]);
      candidates = [...this.documents.entries()]
        .filter(([, cached]) => !cached.dirty)
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
