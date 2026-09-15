import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import type { PrismaService } from "../database/prisma.service.js";
import { DraftCoordinator } from "../drafts/draft-coordinator.service.js";
import { CollaborationDocumentService } from "./collaboration-document.service.js";

const draftId = "a0000000-0000-4000-8000-000000000001";

type StoredDocument = {
  yjsState: Buffer;
  snapshotVersion: bigint;
  codeHash: string;
};

/**
 * Postgres reduced to the two rows this service writes, so the Yjs behaviour
 * under test is real and only the storage is a stand-in.
 */
function createService(options?: {
  draftCode?: string;
  stored?: StoredDocument | null;
  /** Simulates another instance committing between our read and our write. */
  concurrentWrite?: () => StoredDocument;
  failWrite?: boolean;
  /**
   * Called once the document has been serialized and is being written, so a
   * test can land an edit this flush genuinely does not carry.
   */
  holdWrite?: () => Promise<void>;
}) {
  const state = {
    document: options?.stored ?? null,
    draftCode: options?.draftCode ?? "",
    updatedAt: new Date("2026-09-14T00:00:00.000Z"),
  };

  const prisma = {
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
    exerciseCollaborationDocument: {
      findUnique: vi.fn(async () => state.document),
      upsert: vi.fn(
        async ({ create }: { create: StoredDocument & { draftId: string } }) => {
          if (options?.holdWrite) await options.holdWrite();
          if (options?.failWrite) throw new Error("write failed");
          state.document = {
            yjsState: create.yjsState,
            snapshotVersion: create.snapshotVersion,
            codeHash: create.codeHash,
          };
          return state.document;
        },
      ),
    },
    exerciseDraft: {
      updateManyAndReturn: vi.fn(async ({ data }: { data: { code: string; updatedAt: Date } }) => {
        state.draftCode = data.code;
        state.updatedAt = data.updatedAt;
        return [{ updatedAt: data.updatedAt }];
      }),
      findUnique: vi.fn(async () => ({
        id: draftId,
        code: state.draftCode,
        updatedAt: state.updatedAt,
      })),
      update: vi.fn(async ({ data }: { data: { code: string } }) => {
        if (options?.failWrite) throw new Error("write failed");
        state.draftCode = data.code;
        state.updatedAt = new Date();
        return { code: data.code, updatedAt: state.updatedAt };
      }),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      if (options?.concurrentWrite) {
        state.document = options.concurrentWrite();
        options.concurrentWrite = undefined;
      }
      return callback(prisma);
    }),
  } as unknown as PrismaService;

  // The real coordinator, against the same stand-in Postgres: the service
  // registers itself with it as the live authority, and the registration is
  // part of what these tests exercise.
  const drafts = new DraftCoordinator(prisma);
  const service = new CollaborationDocumentService(prisma, drafts);
  // Nest calls this on boot, and the registration it performs is part of what
  // these tests are about: without it the coordinator has no live authority.
  service.onModuleInit();

  return {
    service,
    drafts,
    state,
    prisma: prisma as unknown as {
      exerciseDraft: { update: ReturnType<typeof vi.fn> };
      exerciseCollaborationDocument: { upsert: ReturnType<typeof vi.fn> };
    },
  };
}

/** Lets a test stand exactly in the middle of an asynchronous write. */
function gate() {
  let open = () => undefined as void;
  let entered = () => undefined as void;
  const enteredPromise = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    entered: enteredPromise,
    open: () => open(),
    hold: async () => {
      entered();
      await held;
    },
  };
}

/**
 * A stored document and the plain draft it was written beside.
 *
 * `flush` writes the CRDT state, the readable text, and that text's hash in one
 * transaction, so a fixture that wants to stand for a real stored document has
 * to keep all three in step — the service now checks exactly that.
 */
function storedFor(text: string, snapshotVersion = 3n) {
  const doc = new Y.Doc();
  doc.getText("code").insert(0, text);
  return {
    draftCode: text,
    stored: {
      yjsState: Buffer.from(Y.encodeStateAsUpdate(doc)),
      snapshotVersion,
      codeHash: createHash("sha256").update(text).digest("hex"),
    },
  };
}

/** One client's local document, of the kind the browser holds. */
function clientDoc(text = ""): Y.Doc {
  const doc = new Y.Doc();
  if (text) doc.getText("code").insert(0, text);
  return doc;
}

describe("loading", () => {
  it("seeds a first collaboration from the draft's saved code", async () => {
    const { service } = createService({ draftCode: "print(1)\n" });
    await expect(service.readCode(draftId)).resolves.toBe("print(1)\n");
  });

  it("restores the stored document while it still describes the draft", async () => {
    const { service } = createService(storedFor("from yjs\n", 4n));
    await expect(service.readCode(draftId)).resolves.toBe("from yjs\n");
  });

  it("rebuilds from the plain draft when a save has superseded the history", async () => {
    // The reported loss: the student edited this problem unwatched, and the
    // next live session opened on the text from their previous one. `flush`
    // writes the state and the hash of the text together, so a hash that no
    // longer matches means something wrote the draft since — and that text is
    // the newer of the two.
    const { service } = createService({
      ...storedFor("from the last live session\n"),
      draftCode: "typed while nobody was watching\n",
    });
    await expect(service.readCode(draftId)).resolves.toBe(
      "typed while nobody was watching\n",
    );
  });

  it("keeps the history when a save stored exactly what it already held", async () => {
    const { service } = createService(storedFor("unchanged\n"));
    await expect(service.readCode(draftId)).resolves.toBe("unchanged\n");
  });
});

describe("convergence", () => {
  it("applies a student-only edit", async () => {
    const { service } = createService();
    const student = clientDoc();
    student.getText("code").insert(0, "a = 1\n");
    await service.applyUpdate(draftId, Y.encodeStateAsUpdate(student));
    await expect(service.readCode(draftId)).resolves.toBe("a = 1\n");
  });

  it("converges simultaneous student and teacher edits", async () => {
    const { service } = createService({ draftCode: "start\n" });
    const base = await service.sync(draftId, Y.encodeStateVector(new Y.Doc()));

    const student = new Y.Doc();
    Y.applyUpdate(student, base.update);
    const teacher = new Y.Doc();
    Y.applyUpdate(teacher, base.update);

    student.getText("code").insert(0, "student ");
    teacher.getText("code").insert(teacher.getText("code").length, "teacher ");

    await service.applyUpdate(
      draftId,
      Y.encodeStateAsUpdate(student, base.stateVector),
    );
    await service.applyUpdate(
      draftId,
      Y.encodeStateAsUpdate(teacher, base.stateVector),
    );

    const merged = await service.readCode(draftId);
    expect(merged).toContain("student ");
    expect(merged).toContain("teacher ");
    // Neither edit replaced the other, which whole-document broadcast would.
    expect(merged).toContain("start");
  });

  it("is unchanged by a duplicated update", async () => {
    const { service } = createService();
    const client = clientDoc("x = 1\n");
    const update = Y.encodeStateAsUpdate(client);
    await service.applyUpdate(draftId, update);
    const once = await service.readCode(draftId);
    await service.applyUpdate(draftId, update);
    await expect(service.readCode(draftId)).resolves.toBe(once);
  });

  it("converges when updates arrive out of order", async () => {
    const { service: inOrder } = createService();
    const { service: reversed } = createService();
    const client = clientDoc();
    const first = (() => {
      client.getText("code").insert(0, "one\n");
      return Y.encodeStateAsUpdate(client);
    })();
    const vector = Y.encodeStateVector(client);
    const second = (() => {
      client.getText("code").insert(client.getText("code").length, "two\n");
      return Y.encodeStateAsUpdate(client, vector);
    })();

    await inOrder.applyUpdate(draftId, first);
    await inOrder.applyUpdate(draftId, second);
    await reversed.applyUpdate(draftId, second);
    await reversed.applyUpdate(draftId, first);

    await expect(reversed.readCode(draftId)).resolves.toBe(
      await inOrder.readCode(draftId),
    );
  });
});

describe("synchronization", () => {
  it("returns only what the asking peer is missing", async () => {
    const { service } = createService();
    const client = clientDoc("shared\n");
    await service.applyUpdate(draftId, Y.encodeStateAsUpdate(client));

    const current = await service.sync(draftId, Y.encodeStateVector(client));
    const empty = await service.sync(
      draftId,
      Y.encodeStateVector(new Y.Doc()),
    );
    expect(current.update.byteLength).toBeLessThan(empty.update.byteLength);
  });

  it("repairs a client that missed an update", async () => {
    const { service } = createService();
    const client = clientDoc("first\n");
    await service.applyUpdate(draftId, Y.encodeStateAsUpdate(client));
    const missedFrom = clientDoc("second\n");
    await service.applyUpdate(draftId, Y.encodeStateAsUpdate(missedFrom));

    const sync = await service.sync(draftId, Y.encodeStateVector(client));
    Y.applyUpdate(client, sync.update);
    expect(client.getText("code").toString()).toBe(
      await service.readCode(draftId),
    );
  });

  it("offers its own state vector so the client can send back what is missing", async () => {
    const { service } = createService({ draftCode: "server\n" });
    const sync = await service.sync(draftId, Y.encodeStateVector(new Y.Doc()));
    expect(sync.stateVector.byteLength).toBeGreaterThan(0);
  });
});

describe("persistence", () => {
  it("writes the readable snapshot and the CRDT state together", async () => {
    const { service, state } = createService();
    const client = clientDoc("saved\n");
    await service.applyUpdate(draftId, Y.encodeStateAsUpdate(client));

    const outcome = await service.flush(draftId);
    expect(outcome.persisted).toBe(true);
    expect(state.draftCode).toBe("saved\n");
    expect(state.document?.snapshotVersion).toBe(1n);
  });

  it("merges the other instance's state before retrying a lost claim", async () => {
    const other = clientDoc("other instance\n");
    const { service, state } = createService({
      concurrentWrite: () => ({
        yjsState: Buffer.from(Y.encodeStateAsUpdate(other)),
        snapshotVersion: 7n,
        codeHash: "",
      }),
    });

    const mine = clientDoc("my edit\n");
    await service.applyUpdate(draftId, Y.encodeStateAsUpdate(mine));
    const outcome = await service.flush(draftId);

    expect(outcome.persisted).toBe(true);
    // Neither instance's work was thrown away by the other's write.
    expect(state.draftCode).toContain("my edit");
    expect(state.draftCode).toContain("other instance");
  });

  it("keeps the document dirty when the write fails", async () => {
    const { service } = createService({ failWrite: true });
    const client = clientDoc("unsaved\n");
    await service.applyUpdate(draftId, Y.encodeStateAsUpdate(client));

    const outcome = await service.flush(draftId);
    expect(outcome.persisted).toBe(false);
    expect(service.hasUnsavedWork(draftId)).toBe(true);
    // The work is still in memory and still correct, which is what lets a
    // reconnecting client resupply it.
    await expect(service.readCode(draftId)).resolves.toBe("unsaved\n");
  });

  it("reports unsaved work only until a flush confirms", async () => {
    const { service } = createService();
    await service.applyUpdate(
      draftId,
      Y.encodeStateAsUpdate(clientDoc("typing\n")),
    );
    expect(service.hasUnsavedWork(draftId)).toBe(true);
    await service.flush(draftId);
    expect(service.hasUnsavedWork(draftId)).toBe(false);
  });

  it("flushes pending work when a room is released", async () => {
    const { service, state } = createService();
    await service.applyUpdate(
      draftId,
      Y.encodeStateAsUpdate(clientDoc("closing\n")),
    );
    await service.release(draftId);
    expect(state.draftCode).toBe("closing\n");
  });
});

describe("restart recovery", () => {
  let restarted: CollaborationDocumentService;

  beforeEach(() => {
    restarted = createService().service;
  });

  it("accepts the surviving client's state after the server lost its cache", async () => {
    const client = clientDoc("work in progress\n");
    // A restart leaves an empty server document; the client resupplies.
    await restarted.applyUpdate(draftId, Y.encodeStateAsUpdate(client));
    await expect(restarted.readCode(draftId)).resolves.toBe(
      "work in progress\n",
    );
  });
});

describe("line endings", () => {
  /** A document stored before LF was the rule, and its plain draft. */
  const storedWith = (text: string) => storedFor(text);

  it("repairs a stored document before any peer can read it", async () => {
    const { service } = createService(storedWith("a\r\nb\r\nc"));
    await expect(service.readCode(draftId)).resolves.toBe("a\nb\nc");
  });

  it("turns a lone carriage return into a line break rather than deleting it", async () => {
    const { service } = createService(storedWith("a\rb"));
    await expect(service.readCode(draftId)).resolves.toBe("a\nb");
  });

  it("seeds a first collaboration from plain code canonically", async () => {
    const { service } = createService({ draftCode: "print(1)\r\nprint(2)\r\n" });
    await expect(service.readCode(draftId)).resolves.toBe("print(1)\nprint(2)\n");
  });

  it("keeps the repair when the document is reloaded", async () => {
    const first = createService(storedWith("a\r\nb"));
    await first.service.readCode(draftId);
    await first.service.flush(draftId);
    await first.service.release(draftId);
    // What the next process finds: the stored bytes, already canonical, beside
    // the plain draft the same flush wrote.
    const second = createService({
      stored: first.state.document,
      draftCode: first.state.draftCode,
    });
    await expect(second.service.readCode(draftId)).resolves.toBe("a\nb");
  });

  it("is idempotent across a second load of an already canonical document", async () => {
    const { service } = createService(storedWith("a\r\nb"));
    await service.readCode(draftId);
    const version = (await service.flush(draftId)).snapshotVersion;
    await service.release(draftId);
    const again = await service.readCode(draftId);
    expect(again).toBe("a\nb");
    // Nothing to repair the second time, so nothing is written again.
    expect(service.hasUnsavedWork(draftId)).toBe(false);
    expect(version).toBe(4n);
  });

  it("writes the canonical text back to the plain draft", async () => {
    const { service, state } = createService(storedWith("x\r\ny"));
    await service.readCode(draftId);
    await service.flush(draftId);
    expect(state.draftCode).toBe("x\ny");
  });

  it("repairs a carriage return arriving in an accepted update", async () => {
    // An old client that has not been refreshed is exactly this case.
    const { service } = createService({ draftCode: "ok\n" });
    const client = clientDoc();
    client.getText("code").insert(0, "from\r\nold client\n");
    await service.applyUpdate(draftId, Y.encodeStateAsUpdate(client));
    await expect(service.readCode(draftId)).resolves.not.toContain("\r");
  });

  it("announces a repair so peers can apply it too", async () => {
    const fixture = storedWith("a\r\nb");
    // A browser that synchronized before the repair holds exactly these bytes.
    const peer = new Y.Doc();
    Y.applyUpdate(peer, new Uint8Array(fixture.stored.yjsState));
    expect(peer.getText("code").toString()).toBe("a\r\nb");

    const { service } = createService(fixture);
    const seen: Uint8Array[] = [];
    service.onServerUpdate((event) => seen.push(event.update));
    // Attached before the first load, which is what performs the repair.
    await service.readCode(draftId);
    expect(seen).toHaveLength(1);

    Y.applyUpdate(peer, seen[0]!);
    expect(peer.getText("code").toString()).toBe("a\nb");
  });
});

describe("load and flush lifecycle", () => {
  it("builds one document however many callers ask at once", async () => {
    const { service } = createService({ draftCode: "shared\n" });
    const [first, second, third] = await Promise.all([
      service.load(draftId),
      service.load(draftId),
      service.load(draftId),
    ]);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("does not mark an edit saved by a flush that began before it", async () => {
    const write = gate();
    const { service } = createService({
      draftCode: "start\n",
      holdWrite: write.hold,
    });

    const first = clientDoc();
    first.getText("code").insert(0, "first\n");
    await service.applyUpdate(draftId, Y.encodeStateAsUpdate(first));

    const flushing = service.flush(draftId);
    // The bytes are serialized and on their way to Postgres.
    await write.entered;
    // This edit is not in them.
    const second = clientDoc();
    second.getText("code").insert(0, "second ");
    await service.applyUpdate(draftId, Y.encodeStateAsUpdate(second));
    write.open();
    await flushing;

    // The flush reported success for the revision it wrote, and said nothing
    // about the one that arrived after it.
    expect(service.hasUnsavedWork(draftId)).toBe(true);
  });

  it("keeps an unsaved document rather than destroying it on a failed release", async () => {
    const { service } = createService({ draftCode: "", failWrite: true });
    const client = clientDoc();
    client.getText("code").insert(0, "only copy\n");
    await service.applyUpdate(draftId, Y.encodeStateAsUpdate(client));

    await service.release(draftId);

    expect(service.hasUnsavedWork(draftId)).toBe(true);
    await expect(service.readCode(draftId)).resolves.toBe("only copy\n");
  });
});

describe("the live draft authority", () => {
  it("refuses a plain snapshot that disagrees with the live document", async () => {
    const { service, drafts } = createService({ draftCode: "line one\nline two\n" });
    await service.readCode(draftId);

    const result = await drafts.save({
      userId: "u",
      materialId: "m",
      sourceMaterialId: "m",
      courseId: "c",
      code: "line one\nline TWO\n",
      baseUpdatedAt: null,
    });

    expect(result.outcome).toBe("CONFLICT");
    // The document is untouched: a snapshot carries no information about what
    // the other person did since it was taken.
    await expect(service.readCode(draftId)).resolves.toBe("line one\nline two\n");
  });

  it("flushes a matching snapshot rather than reporting a save it has not made", async () => {
    const { service, drafts, state } = createService({ draftCode: "agreed\n" });
    await service.readCode(draftId);

    const result = await drafts.save({
      userId: "u",
      materialId: "m",
      sourceMaterialId: "m",
      courseId: "c",
      code: "agreed\n",
      baseUpdatedAt: null,
    });

    expect(result.outcome).toBe("SAVED");
    expect(state.draftCode).toBe("agreed\n");
    expect(service.hasUnsavedWork(draftId)).toBe(false);
  });
});

describe("releasing a document that is still being edited", () => {
  it("does not discard an edit that arrives during its flush", async () => {
    // The reported loss: the peer held "base-first-LATE" while storage and the
    // next reload held only "base-first".
    const write = gate();
    const { service, state } = createService({
      draftCode: "base",
      holdWrite: write.hold,
    });
    const first = clientDoc();
    first.getText("code").insert(0, "-first");
    await service.applyUpdate(draftId, Y.encodeStateAsUpdate(first));

    const releasing = service.release(draftId);
    await write.entered;
    // Typed while the first flush is in Postgres, so it is not in those bytes.
    const late = clientDoc();
    Y.applyUpdate(late, Y.encodeStateAsUpdate(await service.load(draftId)));
    late.getText("code").insert(late.getText("code").length, "-LATE");
    await service.applyUpdate(draftId, Y.encodeStateAsUpdate(late));
    write.open();
    await releasing;

    expect(state.draftCode).toContain("-LATE");
    expect(service.hasUnsavedWork(draftId)).toBe(false);
  });

  it("keeps a document it could not finish writing", async () => {
    const { service } = createService({ draftCode: "", failWrite: true });
    const client = clientDoc();
    client.getText("code").insert(0, "only copy\n");
    await service.applyUpdate(draftId, Y.encodeStateAsUpdate(client));

    await service.release(draftId);

    expect(service.hasUnsavedWork(draftId)).toBe(true);
    await expect(service.readCode(draftId)).resolves.toBe("only copy\n");
  });
});


describe("watch authority handoff", () => {
  it("allows ordinary autosave after the final teacher leaves", async () => {
    const { service, drafts, state } = createService({ draftCode: "watched" });
    service.beginWatch(draftId, "visit");
    await service.load(draftId);
    const snapshot = await service.endWatch(draftId, "visit");
    expect(snapshot?.code).toBe("watched");
    expect(await drafts.save({ userId: "u", materialId: "m", sourceMaterialId: "m", courseId: "c", code: "unwatched edit", baseUpdatedAt: new Date(snapshot!.updatedAt) })).toMatchObject({ outcome: "SAVED" });
    expect(state.draftCode).toBe("unwatched edit");
  });

  it("does not retire another teacher's document", async () => {
    const { service, drafts } = createService({ draftCode: "watched" });
    service.beginWatch(draftId, "one");
    service.beginWatch(draftId, "two");
    await service.load(draftId);
    expect(await service.endWatch(draftId, "one")).toBeNull();
    expect(await drafts.save({ userId: "u", materialId: "m", sourceMaterialId: "m", courseId: "c", code: "stale", baseUpdatedAt: null })).toMatchObject({ outcome: "CONFLICT" });
  });
});

describe("flush outage and concurrency recovery", () => {
  it("retries without another edit, backs off, and stops once durable", async () => {
    vi.useFakeTimers();
    const options = { failWrite: true };
    const { service, state, prisma } = createService(options);
    try {
      await service.applyUpdate(draftId, Y.encodeStateAsUpdate(clientDoc("keep me")));
      await service.flush(draftId);
      expect(prisma.exerciseDraft.update).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(prisma.exerciseDraft.update).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(prisma.exerciseDraft.update).toHaveBeenCalledTimes(2);
      options.failWrite = false;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(prisma.exerciseDraft.update).toHaveBeenCalledTimes(3);
      expect(state.draftCode).toBe("keep me");
      expect(service.hasUnsavedWork(draftId)).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      await service.onModuleDestroy();
      vi.useRealTimers();
    }
  });

  it("keeps retry pressure bounded during a long outage and cancels timers on shutdown", async () => {
    vi.useFakeTimers();
    const { service, prisma } = createService({ failWrite: true });
    try {
      await service.applyUpdate(draftId, Y.encodeStateAsUpdate(clientDoc("resident")));
      await vi.advanceTimersByTimeAsync(120_000);
      expect(prisma.exerciseDraft.update.mock.calls.length).toBeGreaterThan(6);
      expect(prisma.exerciseDraft.update.mock.calls.length).toBeLessThan(15);
      expect(service.hasUnsavedWork(draftId)).toBe(true);
      await service.onModuleDestroy();
      expect(vi.getTimerCount()).toBe(0);
      expect(await service.readCode(draftId)).toBe("resident");
    } finally { vi.useRealTimers(); }
  });

  it("persists normalization of a legacy plain draft without requiring a keystroke", async () => {
    vi.useFakeTimers();
    const { service, state } = createService({ draftCode: "a\r\nb" });
    try {
      await service.load(draftId);
      expect(service.hasUnsavedWork(draftId)).toBe(true);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(state.draftCode).toBe("a\nb");
      const sync = await service.sync(draftId, Y.encodeStateVector(new Y.Doc()));
      expect(sync.persistedCodeHash).toBe(createHash("sha256").update("a\nb").digest("hex"));
      expect(service.hasUnsavedWork(draftId)).toBe(false);
    } finally {
      await service.onModuleDestroy();
      vi.useRealTimers();
    }
  });

  it("coalesces concurrent callers and subsequently saves edits made during the write", async () => {
    const held = gate();
    const { service, prisma, state } = createService({ holdWrite: held.hold });
    await service.applyUpdate(draftId, Y.encodeStateAsUpdate(clientDoc("first")));
    const first = service.flush(draftId);
    await held.entered;
    const second = service.flush(draftId);
    const third = service.flush(draftId);
    expect(second).toBe(first);
    expect(third).toBe(first);
    const client = new Y.Doc();
    Y.applyUpdate(client, Y.encodeStateAsUpdate(await service.load(draftId)));
    client.getText("code").insert(5, "-late");
    await service.applyUpdate(draftId, Y.encodeStateAsUpdate(client));
    expect(prisma.exerciseCollaborationDocument.upsert).toHaveBeenCalledTimes(1);
    held.open();
    await Promise.all([first, second, third]);
    expect(service.hasUnsavedWork(draftId)).toBe(true);
    await service.flush(draftId);
    expect(state.draftCode).toBe("first-late");
    expect(prisma.exerciseCollaborationDocument.upsert).toHaveBeenCalledTimes(2);
    client.destroy();
    await service.onModuleDestroy();
  });

  it("does not return an older coalesced snapshot as an HTTP conflict", async () => {
    const held = gate();
    const { service, drafts, state } = createService({ holdWrite: held.hold });
    await service.applyUpdate(draftId, Y.encodeStateAsUpdate(clientDoc("old")));
    const flushing = service.flush(draftId);
    await held.entered;
    const client = new Y.Doc();
    Y.applyUpdate(client, Y.encodeStateAsUpdate(await service.load(draftId)));
    client.getText("code").insert(3, "-new");
    await service.applyUpdate(draftId, Y.encodeStateAsUpdate(client));
    const save = drafts.save({
      userId: "u", materialId: "m", sourceMaterialId: "m", courseId: "c",
      code: "old-new", baseUpdatedAt: null,
    });
    const result = expect(save).rejects.toThrow("could not be persisted");
    held.open();
    await flushing;
    await result;
    await service.flush(draftId);
    expect(state.draftCode).toBe("old-new");
    client.destroy();
    await service.onModuleDestroy();
  });

  it("announces the committed text's hash, not the later in-memory text", async () => {
    const held = gate();
    const { service } = createService({ holdWrite: held.hold });
    await service.applyUpdate(draftId, Y.encodeStateAsUpdate(clientDoc("abc")));
    const events = vi.fn();
    service.onFlush(events);
    const pending = service.flush(draftId);
    await held.entered;
    const client = new Y.Doc();
    Y.applyUpdate(client, Y.encodeStateAsUpdate(await service.load(draftId)));
    client.getText("code").delete(2, 1);
    await service.applyUpdate(draftId, Y.encodeStateAsUpdate(client));
    held.open();
    await pending;
    expect(events).toHaveBeenLastCalledWith(expect.objectContaining({
      persisted: true, codeHash: createHash("sha256").update("abc").digest("hex"),
    }));
    expect(service.hasUnsavedWork(draftId)).toBe(true);
    await service.flush(draftId);
    expect(events).toHaveBeenLastCalledWith(expect.objectContaining({
      persisted: true, codeHash: createHash("sha256").update("ab").digest("hex"),
    }));
    client.destroy();
    await service.onModuleDestroy();
  });
});
