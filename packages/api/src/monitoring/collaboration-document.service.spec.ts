import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import type { PrismaService } from "../database/prisma.service.js";
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
}) {
  const state = {
    document: options?.stored ?? null,
    draftCode: options?.draftCode ?? "",
  };

  const prisma = {
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
    exerciseCollaborationDocument: {
      findUnique: vi.fn(async () => state.document),
      upsert: vi.fn(
        async ({ create }: { create: StoredDocument & { draftId: string } }) => {
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
      findUnique: vi.fn(async () => ({ code: state.draftCode })),
      update: vi.fn(async ({ data }: { data: { code: string } }) => {
        if (options?.failWrite) throw new Error("write failed");
        state.draftCode = data.code;
        return { code: data.code };
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

  return {
    service: new CollaborationDocumentService(prisma),
    state,
    prisma: prisma as unknown as {
      exerciseDraft: { update: ReturnType<typeof vi.fn> };
      exerciseCollaborationDocument: { upsert: ReturnType<typeof vi.fn> };
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

  it("restores a stored document rather than the plain snapshot", async () => {
    const doc = clientDoc("from yjs\n");
    const { service } = createService({
      draftCode: "stale plain code\n",
      stored: {
        yjsState: Buffer.from(Y.encodeStateAsUpdate(doc)),
        snapshotVersion: 4n,
        codeHash: "",
      },
    });
    await expect(service.readCode(draftId)).resolves.toBe("from yjs\n");
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
