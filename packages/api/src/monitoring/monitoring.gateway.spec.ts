import {
  monitoringLimits,
  monitoringRooms,
  monitoringServerEvents,
  monitoringTiming,
  type PresenceEntry,
  type PresenceSnapshot,
} from "@cove/shared";
import type { Server } from "socket.io";
import { describe, expect, it, vi } from "vitest";

import { MonitoringGateway } from "./monitoring.gateway.js";
import type { MonitoringMaterialClaim } from "./monitoring-access.service.js";

/**
 * What the gateway says on behalf of a peer that can no longer say it, and what
 * it refuses to say on behalf of a peer that asked it to.
 *
 * A client clears its own pointer when it leaves a surface or a tab. A dropped
 * transport and a torn-down watch have no such client, and the teacher's copy
 * of a student's arrow is deliberately not on a timer — so if the server does
 * not announce the absence, nothing does.
 */

const academyId = "20000000-0000-4000-8000-000000000001";
const classId = "50000000-0000-4000-8000-000000000001";
const teacherMembershipId = "40000000-0000-4000-8000-000000000001";
const studentMembershipId = "60000000-0000-4000-8000-000000000001";
const materialId = "80000000-0000-4000-8000-000000000001";
const draftId = "a0000000-0000-4000-8000-000000000001";
const visitId = "b0000000-0000-4000-8000-000000000001";

const claim: MonitoringMaterialClaim = {
  userId: "30000000-0000-4000-8000-000000000001",
  academyId,
  membershipId: teacherMembershipId,
  classId,
  grantedAt: Date.now(),
  studentMembershipId,
  studentUserId: "70000000-0000-4000-8000-000000000001",
  materialId,
  courseId: "90000000-0000-4000-8000-000000000001",
};

const sessionId = "c0000000-0000-4000-8000-000000000001";

/**
 * One open watch as the gateway holds it.
 *
 * The three identity fields are what a test is usually exercising even when it
 * does not say so: a message is accepted because it names this session, this
 * visit and this generation, and rejected when it names a superseded one.
 */
function watchState(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    claim,
    sessionId,
    visitId,
    generation: 1,
    draftId,
    mode: "MONITORING" as const,
    peerId: `teacher:${visitId}`,
    peerLabel: null,
    renewTimer: null,
    ...overrides,
  };
}

/** The identity a well-behaved client stamps on a privileged message. */
const identity = { sessionId, visitId, generation: 1 };

type Emission = { room: string; event: string; payload: unknown };
type GatewaySocket = Parameters<MonitoringGateway["handleDisconnect"]>[0];

function createGateway(overrides?: {
  markInterrupted?: () => Promise<PresenceEntry | null>;
  snapshot?: () => Promise<PresenceSnapshot | null>;
  flush?: () => Promise<void>;
  sync?: (
    draftId: string,
    stateVector: Uint8Array,
  ) => Promise<{ update: Uint8Array; stateVector: Uint8Array }>;
  prisma?: unknown;
  isCurrent?: () => Promise<unknown>;
  watcherCount?: () => Promise<number>;
  summarize?: () => Promise<unknown>;
}) {
  const emissions: Emission[] = [];
  const server = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        emissions.push({ room, event, payload });
        return true;
      },
    }),
  } as unknown as Server;

  const presence = {
    markInterrupted: vi
      .fn()
      .mockImplementation(overrides?.markInterrupted ?? (async () => null)),
    // Enough of the registry for the publish path. A movement event is decided
    // before any of this matters, so the roster half is deliberately inert.
    isAvailable: true,
    publish: vi.fn().mockResolvedValue(null),
    nextVersion: vi.fn().mockResolvedValue(null),
    snapshot: vi
      .fn()
      .mockImplementation(overrides?.snapshot ?? (async () => null)),
  };
  const documents = {
    applyUpdate: vi.fn().mockResolvedValue(undefined),
    endWatch: vi.fn().mockResolvedValue(null),
    hasWatch: vi.fn().mockReturnValue(false),
    beginWatch: vi.fn(),
    flush: vi.fn().mockImplementation(overrides?.flush ?? (async () => undefined)),
    sync: vi.fn().mockImplementation(
      overrides?.sync ??
        (async () => ({
          update: new Uint8Array(),
          stateVector: new Uint8Array(),
        })),
    ),
  };
  const visits = { end: vi.fn().mockResolvedValue(undefined) };
  const watchSessions = {
    isAvailable: true,
    nextGeneration: vi.fn().mockResolvedValue(1),
    register: vi
      .fn()
      .mockResolvedValue({ ok: true, replacedVisitId: null }),
    renew: vi.fn().mockResolvedValue(true),
    read: vi.fn().mockResolvedValue(null),
    // A watch is current unless a test says otherwise. The lease it returns is
    // what the read-only gate reads the mode back from, so the default is the
    // default mode: monitoring, not helping.
    isCurrent: vi
      .fn()
      .mockImplementation(
        overrides?.isCurrent ?? (async () => ({ mode: "MONITORING" })),
      ),
    end: vi.fn().mockResolvedValue(true),
    endByVisitId: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    watcherCount: vi
      .fn()
      .mockImplementation(overrides?.watcherCount ?? (async () => 0)),
    summarize: vi.fn().mockImplementation(
      overrides?.summarize ??
        (async () => ({
          classId: null,
          studentMembershipId: "student",
          draftId: null,
          revision: 1,
          watcherCount: 0,
          helpingCount: 0,
          indicator: "NONE" as const,
        })),
    ),
  };
  const metrics = { increment: vi.fn(), incrementWithReason: vi.fn() };
  const activity = {
    record: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const studentSessions = { requireActive: vi.fn().mockResolvedValue(undefined) };

  // Only the collaborators these two paths reach are stubbed; the rest are
  // absent on purpose, so a call that starts touching them fails loudly here.
  const absent = undefined as never;
  const gateway = new MonitoringGateway(
    (overrides?.prisma ?? absent) as never,
    absent,
    studentSessions as never,
    absent,
    presence as never,
    documents as never,
    watchSessions as never,
    visits as never,
    absent,
    absent,
    absent,
    metrics as never,
    activity as never,
  );
  gateway.server = server;
  return {
    gateway,
    emissions,
    presence,
    documents,
    visits,
    watchSessions,
    metrics,
    activity,
  };
}

type TestSocket = GatewaySocket & {
  leftAt: number[];
  emitted: Emission[];
  /** What this socket sent to the rest of a room, excluding itself. */
  broadcast: Emission[];
  disconnected: boolean;
};

function createSocket(data: Record<string, unknown>): TestSocket {
  const leftAt: number[] = [];
  const emitted: Emission[] = [];
  const broadcast: Emission[] = [];
  const socket = {
    data: {
      identity: { authUserId: "auth-user" },
      generation: "generation-1",
      limiter: { take: () => true },
      invalidPayloads: 0,
      awarenessSequence: -1,
      teacher: null,
      student: null,
      ...data,
    },
    emit: (event: string, payload: unknown) => {
      emitted.push({ room: "self", event, payload });
      return true;
    },
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        broadcast.push({ room, event, payload });
        return true;
      },
    }),
    join: vi.fn(async () => undefined),
    leave: vi.fn(async () => undefined),
    disconnect: vi.fn(() => {
      socket.disconnected = true;
    }),
    disconnected: false,
    leftAt,
    emitted,
    broadcast,
  };
  return socket as unknown as TestSocket;
}

const awarenessClears = (emissions: Emission[]) =>
  emissions.filter(
    (entry) => entry.event === monitoringServerEvents.awarenessChanged,
  );

describe("documentSync", () => {
  it("returns the authorized authoritative sync in the acknowledgement", async () => {
    const update = new Uint8Array([1, 2, 3]);
    const stateVector = new Uint8Array([4, 5]);
    const { gateway, documents } = createGateway({
      sync: async () => ({ update, stateVector }),
    });
    const socket = createSocket({
      teacher: {
        claims: new Map(),
        watch: watchState({ claim: { ...claim, grantedAt: Date.now() } }),
      },
    });

    const ack = await gateway.documentSync(socket, {
      eventId: visitId,
      identity,
      draftId,
      stateVector: new Uint8Array(),
    });

    expect(ack).toEqual({
      ok: true,
      eventId: visitId,
      data: { draftId, update, stateVector },
    });
    expect(documents.sync).toHaveBeenCalledWith(draftId, new Uint8Array());
    expect(socket.emitted).toContainEqual({
      room: "self",
      event: monitoringServerEvents.documentSynced,
      payload: { draftId, update, stateVector },
    });
  });

  it("returns no sync payload for a draft outside the active watch", async () => {
    const { gateway, documents } = createGateway();
    const socket = createSocket({
      teacher: {
        claims: new Map(),
        watch: watchState({ claim: { ...claim, grantedAt: Date.now() } }),
      },
    });

    const ack = await gateway.documentSync(socket, {
      eventId: visitId,
      identity,
      draftId: "a0000000-0000-4000-8000-0000000000ff",
      stateVector: new Uint8Array(),
    });

    expect(ack).toEqual({
      ok: false,
      eventId: visitId,
      code: "MONITORING_ACCESS_DENIED",
    });
    expect(documents.sync).not.toHaveBeenCalled();
  });
});

/**
 * The authorization gate the previous design did not have.
 *
 * A teacher write used to be accepted on the strength of holding a watch, and
 * "helping" was then inferred from the write having happened — so a client
 * that unlocked its own Monaco could change a student's code, and the
 * student's indicator was a report of past keystrokes rather than a statement
 * about permission. Permission is now a server-recorded mode, and these are
 * the tests that say a modified client gains nothing by bypassing the UI.
 */
describe("documentUpdate authorization", () => {
  const update = new Uint8Array([7, 8, 9]);

  function teacherOnDraft(overrides: Record<string, unknown> = {}) {
    return createSocket({
      teacher: {
        claims: new Map(),
        watch: watchState({
          claim: { ...claim, grantedAt: Date.now() },
          ...overrides,
        }),
      },
    });
  }

  it("refuses a teacher write while the watch is read-only", async () => {
    const { gateway } = createGateway();
    const ack = await gateway.documentUpdate(teacherOnDraft(), {
      eventId: visitId,
      identity,
      draftId,
      update,
    });

    expect(ack).toMatchObject({
      ok: false,
      code: "MONITORING_EDIT_NOT_ENABLED",
    });
  });

  it("does not merge the refused update", async () => {
    const { gateway, documents } = createGateway();
    await gateway.documentUpdate(teacherOnDraft(), {
      eventId: visitId,
      identity,
      draftId,
      update,
    });

    expect(documents.applyUpdate).not.toHaveBeenCalled();
  });

  /**
   * The refusal is not a silent drop. The client has already applied this
   * locally, so it must be brought back to the canonical text — by
   * resynchronizing, never by letting it push a whole buffer it was not
   * allowed to write.
   */
  it("resynchronizes the refused client onto the canonical document", async () => {
    const { gateway } = createGateway();
    const socket = teacherOnDraft();

    await gateway.documentUpdate(socket, {
      eventId: visitId,
      identity,
      draftId,
      update,
    });

    expect(
      socket.emitted.map((emission) => emission.event),
    ).toContain(monitoringServerEvents.documentSynced);
  });

  it("accepts the write once help mode is confirmed on the lease", async () => {
    const { gateway, documents } = createGateway({
      isCurrent: async () => ({ mode: "HELPING" }),
    });

    const ack = await gateway.documentUpdate(teacherOnDraft(), {
      eventId: visitId,
      identity,
      draftId,
      update,
    });

    expect(ack).toMatchObject({ ok: true });
    expect(documents.applyUpdate).toHaveBeenCalledWith(draftId, update);
  });

  /**
   * The lease, not the socket's optimistic copy. Withdrawing permission has to
   * bind across instances, and a write already on the wire when the teacher
   * stepped back must be refused on arrival.
   */
  it("refuses a write whose socket believes it is helping but the lease does not", async () => {
    const { gateway, documents } = createGateway({
      isCurrent: async () => ({ mode: "MONITORING" }),
    });

    const ack = await gateway.documentUpdate(
      teacherOnDraft({ mode: "HELPING" }),
      { eventId: visitId,
      identity, draftId, update },
    );

    expect(ack).toMatchObject({
      ok: false,
      code: "MONITORING_EDIT_NOT_ENABLED",
    });
    expect(documents.applyUpdate).not.toHaveBeenCalled();
  });

  it("refuses a write stamped with a superseded generation", async () => {
    const { gateway, documents } = createGateway({
      isCurrent: async () => ({ mode: "HELPING" }),
    });

    const ack = await gateway.documentUpdate(teacherOnDraft(), {
      eventId: visitId,
      draftId,
      update,
      identity: { ...identity, generation: 0 },
    });

    expect(ack).toMatchObject({ ok: false, code: "MONITORING_ACCESS_DENIED" });
    expect(documents.applyUpdate).not.toHaveBeenCalled();
  });

  it("refuses a write whose lease has been revoked or expired", async () => {
    const { gateway, documents } = createGateway({
      isCurrent: async () => null,
    });

    const ack = await gateway.documentUpdate(teacherOnDraft(), {
      eventId: visitId,
      identity,
      draftId,
      update,
    });

    expect(ack).toMatchObject({ ok: false });
    expect(documents.applyUpdate).not.toHaveBeenCalled();
  });
});

describe("handleDisconnect", () => {
  it("clears a departed student's pointer and caret in the draft room", async () => {
    const { gateway, emissions } = createGateway();
    const socket = createSocket({
      student: {
        academyId,
        membershipId: studentMembershipId,
        classes: [{ classId, membershipId: studentMembershipId }],
        materialId,
        draftId,
        lastSeenPersistedAt: null,
      },
    });

    await gateway.handleDisconnect(socket);

    // The teacher's screen would otherwise hold the last position forever:
    // nothing on that side expires, and the student is gone.
    expect(awarenessClears(emissions)).toEqual([
      {
        room: monitoringRooms.draft(academyId, draftId),
        event: monitoringServerEvents.awarenessChanged,
        payload: {
          draftId,
          cursor: null,
          pointer: null,
          origin: "STUDENT",
          // One peer per student, so a reconnect reasserts the same marker
          // rather than leaving a second arrow beside the first.
          peerId: `student:${studentMembershipId}`,
        },
      },
    ]);
  });

  it("announces the absence before waiting on the document flush", async () => {
    // The flush is a database round trip. The arrow is already wrong.
    let clearedBeforeFlush = false;
    const { gateway, emissions } = createGateway({
      flush: async () => {
        clearedBeforeFlush = awarenessClears(emissions).length === 1;
      },
    });
    const socket = createSocket({
      student: {
        academyId,
        membershipId: studentMembershipId,
        classes: [],
        materialId,
        draftId,
        lastSeenPersistedAt: null,
      },
    });

    await gateway.handleDisconnect(socket);
    expect(clearedBeforeFlush).toBe(true);
  });

  it("says nothing for a student who never opened a shared document", async () => {
    const { gateway, emissions, documents } = createGateway();
    const socket = createSocket({
      student: {
        academyId,
        membershipId: studentMembershipId,
        classes: [],
        materialId: null,
        draftId: null,
        lastSeenPersistedAt: null,
      },
    });

    await gateway.handleDisconnect(socket);
    expect(awarenessClears(emissions)).toHaveLength(0);
    expect(documents.flush).not.toHaveBeenCalled();
  });

  it("withdraws the live context when recovery grace expires", async () => {
    vi.useFakeTimers();
    try {
      const interrupted: PresenceEntry = {
        studentMembershipId,
        state: "RECONNECTING",
        materialId,
        courseId: claim.courseId,
        lastActivityAt: new Date().toISOString(),
        stateExpiresAt: new Date(
          Date.now() + monitoringTiming.recoveryGraceMs,
        ).toISOString(),
        run: null,
        latestSubmissionId: null,
      };
      const snapshot: PresenceSnapshot = {
        classId,
        version: 2,
        entries: [],
        onlineCount: 0,
        solvingCount: 0,
        takenAt: new Date().toISOString(),
      };
      const { gateway, emissions } = createGateway({
        markInterrupted: async () => interrupted,
        snapshot: async () => snapshot,
      });
      const socket = createSocket({
        student: {
          academyId,
          membershipId: studentMembershipId,
          classes: [{ classId, membershipId: studentMembershipId }],
          materialId,
          draftId: null,
          lastSeenPersistedAt: null,
          terminal: null,
          publishedContext: new Map([
            [
              classId,
              { materialId, courseId: claim.courseId, available: true },
            ],
          ]),
        },
      });

      await gateway.handleDisconnect(socket);
      await vi.advanceTimersByTimeAsync(monitoringTiming.recoveryGraceMs + 1);

      expect(emissions).toContainEqual({
        room: monitoringRooms.watchContext(
          academyId,
          classId,
          studentMembershipId,
        ),
        event: monitoringServerEvents.studentContextChanged,
        payload: expect.objectContaining({
          studentMembershipId,
          materialId: null,
          courseId: null,
          path: null,
          available: false,
        }),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not let an old disconnect timer clear a recovered student", async () => {
    vi.useFakeTimers();
    try {
      const entry: PresenceEntry = {
        studentMembershipId,
        state: "RECONNECTING",
        materialId,
        courseId: claim.courseId,
        lastActivityAt: new Date().toISOString(),
        stateExpiresAt: new Date(
          Date.now() + monitoringTiming.recoveryGraceMs,
        ).toISOString(),
        run: null,
        latestSubmissionId: null,
      };
      const { gateway, emissions } = createGateway({
        markInterrupted: async () => entry,
        snapshot: async () => ({
          classId,
          version: 3,
          entries: [{ ...entry, state: "SOLVING", stateExpiresAt: null }],
          onlineCount: 1,
          solvingCount: 1,
          takenAt: new Date().toISOString(),
        }),
      });
      const socket = createSocket({
        student: {
          academyId,
          membershipId: studentMembershipId,
          classes: [{ classId, membershipId: studentMembershipId }],
          materialId,
          draftId: null,
          lastSeenPersistedAt: null,
          terminal: null,
          publishedContext: new Map([
            [
              classId,
              { materialId, courseId: claim.courseId, available: true },
            ],
          ]),
        },
      });

      await gateway.handleDisconnect(socket);
      await vi.advanceTimersByTimeAsync(monitoringTiming.recoveryGraceMs + 1);

      expect(
        emissions.filter(
          (entry) =>
            entry.event === monitoringServerEvents.studentContextChanged,
        ),
      ).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("awarenessUpdate", () => {
  it("relays code anchors separately and refuses another draft's anchor", async () => {
    const { gateway } = createGateway();
    const socket = createSocket({ teacher: { claims: new Map(), watch: watchState() } });
    const editorPointer = {
      surface: "editor", space: "surface", material: claim.materialId, x: 0, y: 0,
      code: { kind: "yjs", draftId, line: 1, column: 1, relative: [0, 1] },
    };
    await gateway.awarenessUpdate(socket, { draftId, identity,
      sequence: 1, cursor: null, pointer: null, editorPointer });
    expect(socket.broadcast).toHaveLength(1);
    expect(socket.broadcast[0]?.payload).toMatchObject({ pointer: null, editorPointer });
    await gateway.awarenessUpdate(socket, { draftId, sequence: 2, cursor: null, pointer: null,
      editorPointer: { ...editorPointer, code: { ...editorPointer.code, draftId: "ffffffff-ffff-4fff-8fff-ffffffffffff" } } });
    expect(socket.broadcast).toHaveLength(1);
  });

  it("does not let an older authorized packet overwrite a newer position", async () => {
    const { gateway } = createGateway();
    const socket = createSocket({
      teacher: {
        claims: new Map(),
        watch: watchState(),
      },
    });

    await gateway.awarenessUpdate(socket, {
      draftId,
      identity,
      sequence: 2,
      cursor: null,
      pointer: { surface: "editor", x: 0.5, y: 0.5 },
    });
    await gateway.awarenessUpdate(socket, {
      draftId,
      identity,
      sequence: 1,
      cursor: null,
      pointer: { surface: "statement", x: 0.25, y: 0.25 },
    });

    expect(socket.broadcast).toEqual([
      {
        room: monitoringRooms.draft(academyId, draftId),
        event: monitoringServerEvents.awarenessChanged,
        payload: {
          draftId,
          sequence: 2,
          cursor: null,
          pointer: {
            surface: "editor",
            x: 0.5,
            y: 0.5,
            space: "surface",
            material: null,
          },
          origin: "TEACHER",
          // Stamped by the server from the authenticated watch, never read
          // off the payload: a client that could name its own peer could
          // overwrite or erase another teacher's cursor.
          peerId: `teacher:${visitId}`,
          peerLabel: null,
          generation: 1,
        },
      },
    ]);
  });
});

/**
 * The mirrored student terminal.
 *
 * Everything here is about what the gateway will *not* pass on: a run nobody
 * started, a sequence that walks backwards, output beyond the budget the
 * student's own terminal already stopped at, and a mirror message from the one
 * participant whose terminal is private. The transcript itself is never held
 * here — three numbers per socket are enough to prove all four.
 */

const clientRunId = "c0000000-0000-4000-8000-000000000001";
const otherRunId = "c0000000-0000-4000-8000-000000000002";
const at = "2026-08-06T10:00:00.000Z";

function studentSocket(overrides?: {
  draftId?: string | null;
  terminal?: {
    clientRunId: string;
    sequence: number;
    bytes: number;
    truncated: boolean;
  } | null;
}): TestSocket {
  return createSocket({
    student: {
      academyId,
      membershipId: studentMembershipId,
      classes: [{ classId, membershipId: studentMembershipId }],
      materialId,
      draftId: overrides?.draftId === undefined ? draftId : overrides.draftId,
      lastSeenPersistedAt: null,
      terminal: overrides?.terminal ?? null,
    },
  });
}

const startBody = {
  kind: "start",
  draftId,
  clientRunId,
  sequence: 0,
  at,
  lifecycle: "STARTED",
  lines: [{ kind: "meta", text: "$ python solution.py\n" }],
  sampleCount: 0,
  awaitingInput: false,
};

const appendBody = (sequence: number, text = "42\n") => ({
  kind: "append",
  draftId,
  clientRunId,
  sequence,
  at,
  lines: [{ kind: "out", text }],
});

const mirrored = (socket: TestSocket) =>
  socket.broadcast.filter(
    (entry) => entry.event === monitoringServerEvents.terminalChanged,
  );

const terminalStateOf = (socket: TestSocket) =>
  (
    socket.data as unknown as {
      student: {
        terminal: { sequence: number; bytes: number; truncated: boolean } | null;
      };
    }
  ).student.terminal;

describe("terminal mirroring", () => {
  it("forwards a student's run to the watched draft room, stamped as theirs", async () => {
    const { gateway } = createGateway();
    const socket = studentSocket();

    await gateway.terminalStart(socket, startBody);
    await gateway.terminalAppend(socket, appendBody(1));
    await gateway.terminalState(socket, {
      kind: "state",
      draftId,
      clientRunId,
      sequence: 2,
      at,
      awaitingInput: true,
    });
    await gateway.terminalFinish(socket, {
      kind: "finish",
      draftId,
      clientRunId,
      sequence: 3,
      at,
      lifecycle: "COMPLETED",
      passedCount: 1,
      sampleCount: 1,
      awaitingInput: false,
    });

    expect(mirrored(socket).map((entry) => entry.room)).toEqual(
      Array.from({ length: 4 }, () => monitoringRooms.draft(academyId, draftId)),
    );
    // The origin is the server's word, not the payload's: the client never
    // sent one, and every forwarded message carries it.
    expect(
      mirrored(socket).map((entry) => (entry.payload as { origin: string }).origin),
    ).toEqual(["STUDENT", "STUDENT", "STUDENT", "STUDENT"]);
    expect(
      mirrored(socket).map((entry) => (entry.payload as { kind: string }).kind),
    ).toEqual(["start", "append", "state", "finish"]);
  });

  it("drops a mirror message from a watching teacher", async () => {
    const { gateway } = createGateway();
    // A socket that is both a student and, impossibly, a watcher. The watch is
    // what decides: a teacher's terminal is theirs alone.
    const socket = createSocket({
      teacher: {
        claims: new Map(),
        watch: watchState(),
      },
      student: {
        academyId,
        membershipId: studentMembershipId,
        classes: [],
        materialId,
        draftId,
        lastSeenPersistedAt: null,
        terminal: null,
      },
    });

    await gateway.terminalStart(socket, startBody);
    await gateway.terminalAppend(socket, appendBody(1));

    expect(mirrored(socket)).toHaveLength(0);
  });

  it("drops a message for a draft the student does not have open", async () => {
    const { gateway } = createGateway();
    const socket = studentSocket({ draftId: "a0000000-0000-4000-8000-0000000000ff" });

    await gateway.terminalStart(socket, startBody);
    expect(mirrored(socket)).toHaveLength(0);
  });

  it("refuses a delta for a run that never started", async () => {
    const { gateway, metrics } = createGateway();
    const socket = studentSocket();

    await gateway.terminalAppend(socket, appendBody(1));

    expect(mirrored(socket)).toHaveLength(0);
    expect(metrics.increment).toHaveBeenCalledWith("terminal.delta.rejected");
  });

  it("refuses a sequence that does not move forward", async () => {
    const { gateway } = createGateway();
    const socket = studentSocket();

    await gateway.terminalStart(socket, startBody);
    await gateway.terminalAppend(socket, appendBody(1));
    // A duplicate and a replay of an earlier number.
    await gateway.terminalAppend(socket, appendBody(1));
    await gateway.terminalAppend(socket, appendBody(0));

    expect(mirrored(socket)).toHaveLength(2);
    expect(terminalStateOf(socket)?.sequence).toBe(1);
  });

  it("refuses a delta belonging to a replaced run", async () => {
    const { gateway } = createGateway();
    const socket = studentSocket();

    await gateway.terminalStart(socket, startBody);
    await gateway.terminalStart(socket, {
      ...startBody,
      clientRunId: otherRunId,
    });
    // A straggler from the first run cannot extend the second.
    await gateway.terminalAppend(socket, appendBody(1));

    expect(mirrored(socket)).toHaveLength(2);
  });

  it("enforces the per-run byte budget without disconnecting the student", async () => {
    const { gateway, metrics } = createGateway();
    const socket = studentSocket();
    await gateway.terminalStart(socket, startBody);

    // Each delta is legal; the run as a whole eventually is not.
    const chunk = "y".repeat(8_000);
    let sequence = 0;
    for (let sent = 0; sent < monitoringLimits.terminalTranscriptMaxBytes + 16_000; sent += 8_000) {
      sequence += 1;
      await gateway.terminalAppend(socket, appendBody(sequence, chunk));
    }

    expect(metrics.increment).toHaveBeenCalledWith("terminal.budget.exceeded");
    expect(terminalStateOf(socket)!.bytes).toBeLessThanOrEqual(
      monitoringLimits.terminalTranscriptMaxBytes,
    );
    expect(terminalStateOf(socket)!.truncated).toBe(true);
    expect(socket.disconnected).toBe(false);
    // Lifecycle still gets through: the run has to be able to end.
    await gateway.terminalFinish(socket, {
      kind: "finish",
      draftId,
      clientRunId,
      sequence: sequence + 1,
      at,
      lifecycle: "CANCELLED",
      passedCount: 0,
      sampleCount: 0,
      awaitingInput: false,
    });
    expect(
      mirrored(socket).at(-1),
    ).toMatchObject({ payload: { kind: "finish" } });
  });

  it("re-bases the budget and the numbering on a new run", async () => {
    const { gateway } = createGateway();
    const socket = studentSocket();
    await gateway.terminalStart(socket, startBody);
    await gateway.terminalAppend(socket, appendBody(1, "z".repeat(8_000)));

    await gateway.terminalStart(socket, { ...startBody, clientRunId: otherRunId });

    expect(terminalStateOf(socket)).toEqual({
      clientRunId: otherRunId,
      sequence: 0,
      bytes: Buffer.byteLength("$ python solution.py\n"),
      truncated: false,
    });
  });

  it("treats a snapshot as authoritative for the numbering that follows", async () => {
    const { gateway } = createGateway();
    const socket = studentSocket();
    await gateway.terminalStart(socket, startBody);

    await gateway.terminalSnapshot(socket, {
      kind: "snapshot",
      draftId,
      clientRunId,
      sequence: 9,
      at,
      lifecycle: "STARTED",
      lines: [{ kind: "out", text: "recovered\n" }],
      passedCount: 0,
      sampleCount: 0,
      awaitingInput: true,
      truncated: false,
    });

    expect(mirrored(socket).at(-1)).toMatchObject({
      room: monitoringRooms.draft(academyId, draftId),
      payload: { kind: "snapshot", origin: "STUDENT" },
    });
    expect(terminalStateOf(socket)?.sequence).toBe(9);

    // And the stream continues from there rather than from the stale count.
    await gateway.terminalAppend(socket, appendBody(10));
    expect(mirrored(socket).at(-1)).toMatchObject({ payload: { sequence: 10 } });
  });

  it("restores student and draft authorization from a cold reconnect snapshot", async () => {
    const prisma = {
      exerciseDraft: {
        findFirst: vi.fn().mockResolvedValue({ course: { academyId } }),
      },
      academyMembership: {
        findFirst: vi.fn().mockResolvedValue({
          id: studentMembershipId,
          classEnrollments: [{ classId }],
        }),
      },
    };
    const { gateway } = createGateway({ prisma });
    const socket = createSocket({ student: null });

    await gateway.terminalSnapshot(socket, {
      kind: "snapshot",
      draftId,
      clientRunId,
      sequence: 7,
      at,
      lifecycle: "STARTED",
      lines: [{ kind: "out", text: "still running\n" }],
      passedCount: 0,
      sampleCount: 0,
      awaitingInput: false,
      truncated: false,
    });

    expect(prisma.exerciseDraft.findFirst).toHaveBeenCalledWith({
      where: {
        id: draftId,
        user: { authUserId: "auth-user" },
      },
      select: { course: { select: { academyId: true } } },
    });
    expect(terminalStateOf(socket)).toMatchObject({
      sequence: 7,
      truncated: false,
    });
    expect(mirrored(socket).at(-1)).toMatchObject({
      room: monitoringRooms.draft(academyId, draftId),
      payload: { kind: "snapshot", origin: "STUDENT" },
    });
  });

  it("clears the mirror and forgets the run when the draft is replaced", async () => {
    const { gateway } = createGateway();
    const socket = studentSocket();
    await gateway.terminalStart(socket, startBody);

    await gateway.terminalClear(socket, { kind: "clear", draftId, at });

    expect(mirrored(socket).at(-1)).toMatchObject({
      payload: { kind: "clear", origin: "STUDENT" },
    });
    expect(terminalStateOf(socket)).toBeNull();
  });

  it("counts a malformed payload against the invalid-payload allowance", async () => {
    const { gateway, metrics } = createGateway();
    const socket = studentSocket();

    await gateway.terminalAppend(socket, { ...appendBody(1), lines: [] });

    expect(metrics.increment).toHaveBeenCalledWith("payload.rejected");
    expect(mirrored(socket)).toHaveLength(0);
  });
});

describe("terminalResync", () => {
  it("asks the student for a snapshot without naming the teacher", async () => {
    const { gateway, emissions } = createGateway();
    const socket = createSocket({
      teacher: {
        claims: new Map(),
        watch: watchState(),
      },
    });

    await gateway.terminalResync(socket, { draftId, identity });

    expect(emissions).toEqual([
      {
        room: monitoringRooms.student(academyId, studentMembershipId),
        event: monitoringServerEvents.terminalSnapshotRequest,
        // A draft id, and nothing that could identify who asked.
        payload: { draftId },
      },
    ]);
  });

  it("refuses a draft the teacher is not watching", async () => {
    const { gateway, emissions } = createGateway();
    const socket = createSocket({
      teacher: {
        claims: new Map(),
        watch: watchState(),
      },
    });

    await gateway.terminalResync(socket, {
      draftId: "a0000000-0000-4000-8000-0000000000ff",
    });
    expect(emissions).toHaveLength(0);
  });

  it("refuses a student asking on their own behalf", async () => {
    const { gateway, emissions } = createGateway();
    await gateway.terminalResync(studentSocket(), { draftId });
    expect(emissions).toHaveLength(0);
  });
});

describe("watchStop", () => {
  it("clears the teacher's pointer and caret for the student left behind", async () => {
    const { gateway, emissions, documents } = createGateway();
    const socket = createSocket({
      teacher: {
        claims: new Map(),
        watch: watchState(),
      },
    });

    await gateway.watchStop(socket, { eventId: visitId, identity });
    expect(documents.endWatch).toHaveBeenCalledWith(draftId, visitId, {
      remoteWatchers: 0,
    });

    // Addressed to this watch's peer alone. A teacher leaving one of five
    // tabs must not take the other four teachers' arrows off the student's
    // screen, which an unqualified `TEACHER` clear would do.
    expect(awarenessClears(emissions)).toEqual([
      {
        room: monitoringRooms.draft(academyId, draftId),
        event: monitoringServerEvents.awarenessChanged,
        payload: {
          draftId,
          cursor: null,
          pointer: null,
          origin: "TEACHER",
          peerId: `teacher:${visitId}`,
          generation: 1,
        },
      },
    ]);
  });

  it("speaks while it is still in the room, not after leaving it", async () => {
    const { gateway, emissions } = createGateway();
    const socket = createSocket({
      teacher: {
        claims: new Map(),
        watch: watchState(),
      },
    });
    let clearsAtLeave = -1;
    socket.leave = vi.fn(async () => {
      clearsAtLeave = awarenessClears(emissions).length;
    }) as unknown as GatewaySocket["leave"];

    await gateway.watchStop(socket, { eventId: visitId, identity });
    expect(clearsAtLeave).toBe(1);
  });

  /**
   * Delivery ends with the watch. Without this leave, a teacher who opened a
   * second student would keep receiving the first one's movement.
   */
  it("leaves the watch-context room it was listening on", async () => {
    const { gateway } = createGateway();
    const socket = createSocket({
      teacher: {
        claims: new Map(),
        watch: watchState(),
      },
    });

    await gateway.watchStop(socket, { eventId: visitId, identity });

    expect(socket.leave).toHaveBeenCalledWith(
      monitoringRooms.watchContext(academyId, classId, studentMembershipId),
    );
  });

  it("has nothing to clear when no watch was open", async () => {
    const { gateway, emissions, visits } = createGateway();
    const socket = createSocket({});

    await gateway.watchStop(socket, { eventId: visitId, identity });
    expect(awarenessClears(emissions)).toHaveLength(0);
    expect(visits.end).not.toHaveBeenCalled();
  });

  /**
   * A tab closing races its own replacement on reload. An unqualified stop
   * would close whichever watch this connection happened to hold when it
   * arrived — which, after the reload has already started, is the new one.
   */
  it("ignores a stop naming a watch this connection no longer holds", async () => {
    const { gateway, visits } = createGateway();
    const socket = createSocket({
      teacher: { claims: new Map(), watch: watchState() },
    });

    await gateway.watchStop(socket, {
      eventId: visitId,
      identity: { ...identity, generation: 0 },
    });

    expect(visits.end).not.toHaveBeenCalled();
    expect(
      (socket.data as { teacher: { watch: unknown } }).teacher.watch,
    ).not.toBeNull();
  });

  it("accepts a stop that names the watch it holds", async () => {
    const { gateway, visits } = createGateway();
    const socket = createSocket({
      teacher: { claims: new Map(), watch: watchState() },
    });

    await gateway.watchStop(socket, { eventId: visitId,
      identity });

    expect(visits.end).toHaveBeenCalledWith(visitId, "TEACHER_LEFT");
  });
});

/**
 * What the student is told when one of several watches ends.
 *
 * The single-watch design emitted `watch.ended` into the student's room and
 * the student unbound its document on it. With five watchers that is wrong in
 * the most damaging way available: the first teacher to close a tab would take
 * the shared document away from the other four, mid-edit.
 */
describe("ending one of several watches", () => {
  it("publishes the aggregate summary to the student", async () => {
    const { gateway, emissions } = createGateway({
      watcherCount: async () => 1,
      summarize: async () => ({
        classId,
        studentMembershipId,
        draftId,
        revision: 4,
        watcherCount: 1,
        helpingCount: 0,
        indicator: "MONITORING" as const,
      }),
    });
    const socket = createSocket({
      teacher: { claims: new Map(), watch: watchState() },
    });

    await gateway.watchStop(socket, { eventId: visitId,
      identity });

    const summary = emissions.find(
      (emission) => emission.event === monitoringServerEvents.watchSummary,
    );
    expect(summary?.room).toBe(
      monitoringRooms.student(academyId, studentMembershipId),
    );
    expect(summary?.payload).toMatchObject({
      watcherCount: 1,
      indicator: "MONITORING",
    });
  });

  it("does not release the document while another instance still watches", async () => {
    const { gateway, documents } = createGateway({
      watcherCount: async () => 2,
    });
    const socket = createSocket({
      teacher: { claims: new Map(), watch: watchState() },
    });

    await gateway.watchStop(socket, { eventId: visitId,
      identity });

    expect(documents.endWatch).toHaveBeenCalledWith(draftId, visitId, {
      remoteWatchers: 2,
    });
  });

  /**
   * The handoff is a promise that the authoritative text is durable. It may
   * only be made once, on the final release, and only after a flush that
   * actually succeeded — `documents.endWatch` returns null otherwise.
   */
  it("offers the snapshot only when nothing else is watching", async () => {
    const { gateway, emissions } = createGateway({
      watcherCount: async () => 0,
      summarize: async () => ({
        classId,
        studentMembershipId,
        draftId,
        revision: 5,
        watcherCount: 0,
        helpingCount: 0,
        indicator: "NONE" as const,
      }),
    });
    const socket = createSocket({
      teacher: { claims: new Map(), watch: watchState() },
    });

    await gateway.watchStop(socket, { eventId: visitId,
      identity });

    const summary = emissions.find(
      (emission) => emission.event === monitoringServerEvents.watchSummary,
    );
    expect(summary?.payload).toMatchObject({
      watcherCount: 0,
      indicator: "NONE",
    });
    // Null because the stubbed flush returned none; the field is present, so
    // the student can tell "no snapshot offered" from "no field at all".
    expect(summary?.payload).toHaveProperty("snapshot", null);
  });

  /** The teacher's own ending still goes to the teacher, named by visit. */
  it("tells the teacher which of their watches ended", async () => {
    const { gateway, emissions } = createGateway();
    const socket = createSocket({
      teacher: { claims: new Map(), watch: watchState() },
    });

    await gateway.watchStop(socket, { eventId: visitId,
      identity });

    const ended = emissions.find(
      (emission) => emission.event === monitoringServerEvents.watchEnded,
    );
    expect(ended?.room).toBe(
      monitoringRooms.teacher(academyId, teacherMembershipId),
    );
    expect(ended?.payload).toMatchObject({ visitId, draftId });
  });
});

/**
 * A watched student changing exercise.
 *
 * The event exists so a teacher's LIVE marker is right without polling. What
 * these tests hold to is the other half of that: it fires on a change and on
 * nothing else, it reaches only an authorized watch's own room, and it names
 * where the student went without carrying anything about what they are doing
 * there.
 */
describe("student movement", () => {
  const courseId = "90000000-0000-4000-8000-000000000001";
  const otherMaterialId = "80000000-0000-4000-8000-000000000002";

  function materialRow(id: string) {
    return {
      id,
      title: "Sum two numbers",
      lecture: {
        id: "c0000000-0000-4000-8000-000000000001",
        title: "Input and output",
        courseModule: {
          id: "b0000000-0000-4000-8000-000000000001",
          title: "Getting started",
          courseId,
          course: { id: courseId, title: "Python Basics" },
        },
      },
    };
  }

  function createStudent(options?: { assigned?: boolean; material?: unknown }) {
    const prisma = {
      material: {
        findFirst: vi.fn().mockImplementation(({ where }: { where: { id: string } }) =>
          options?.material === undefined
            ? Promise.resolve(materialRow(where.id))
            : Promise.resolve(options.material),
        ),
      },
      classCourse: {
        findMany: vi
          .fn()
          .mockResolvedValue(options?.assigned === false ? [] : [{ classId }]),
      },
      classEnrollment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const harness = createGateway({ prisma });
    const socket = createSocket({
      student: {
        academyId,
        membershipId: studentMembershipId,
        classes: [{ classId, membershipId: studentMembershipId }],
        materialId: null,
        courseId: null,
        classId: null,
        draftId: null,
        lastSeenPersistedAt: null,
        terminal: null,
        publishedContext: new Map(),
      },
    });
    const publish = (
      material: string | null,
      openCourseId: string | null = material ? courseId : null,
      visibility: "VISIBLE" | "HIDDEN" = "VISIBLE",
    ) =>
      harness.gateway.presencePublish(socket, {
        protocolVersion: 3,
        academyId,
        materialId: material,
        courseId: openCourseId,
        classId: openCourseId ? classId : null,
        visibility,
        active: true,
      });
    return { ...harness, socket, publish, prisma };
  }

  const movements = (emissions: Emission[]) =>
    emissions.filter(
      (entry) => entry.event === monitoringServerEvents.studentContextChanged,
    );

  it("announces the exercise a student opened, and where it sits", async () => {
    const { emissions, publish } = createStudent();

    await publish(materialId);

    expect(movements(emissions)).toEqual([
      {
        room: monitoringRooms.watchContext(
          academyId,
          classId,
          studentMembershipId,
        ),
        event: monitoringServerEvents.studentContextChanged,
        payload: expect.objectContaining({
          studentMembershipId,
          materialId,
          courseId,
          available: true,
          path: expect.objectContaining({
            course: { id: courseId, title: "Python Basics" },
            exercise: { materialId, title: "Sum two numbers" },
          }),
        }),
      },
    ]);
  });

  /** Fifteen seconds apart, all day, on the same problem. */
  it("stays silent while the student remains on one exercise", async () => {
    const { emissions, publish } = createStudent();

    await publish(materialId);
    await publish(materialId);
    await publish(materialId);

    expect(movements(emissions)).toHaveLength(1);
  });

  it("announces each move", async () => {
    const { emissions, publish } = createStudent();

    await publish(materialId);
    await publish(otherMaterialId);

    expect(movements(emissions).map((entry) => (entry.payload as { materialId: string }).materialId))
      .toEqual([materialId, otherMaterialId]);
  });

  it("reports leaving the workspace as unavailable rather than as a move", async () => {
    const { emissions, publish } = createStudent();

    await publish(materialId);
    await publish(null);

    expect(movements(emissions).at(-1)?.payload).toMatchObject({
      materialId: null,
      courseId: null,
      path: null,
      available: false,
    });
  });

  it("counts an assigned course page without pretending an exercise is open", async () => {
    const { activity, emissions, publish } = createStudent();

    await publish(null, courseId);

    expect(movements(emissions).at(-1)?.payload).toMatchObject({
      materialId: null,
      courseId,
      path: null,
      available: true,
    });
    expect(activity.record).toHaveBeenCalledWith(
      expect.objectContaining({ courseId, active: true }),
    );
  });

  it("closes activity instead of counting an interaction from a hidden tab", async () => {
    const { activity, publish } = createStudent();

    await publish(null, courseId, "HIDDEN");

    expect(activity.record).toHaveBeenCalledWith(
      expect.objectContaining({ courseId, active: false }),
    );
  });

  /**
   * A student in two classes may walk onto a course only one of them teaches.
   * The other teacher is told the student is unavailable, never where they are.
   */
  it("does not broadcast a material this class is not taught", async () => {
    const { emissions, publish } = createStudent({ assigned: false });

    await publish(materialId);

    expect(movements(emissions).at(-1)?.payload).toMatchObject({
      materialId: null,
      available: false,
      path: null,
    });
  });

  it("reports an invisible material as unavailable", async () => {
    const { emissions, publish } = createStudent({ material: null });

    await publish(materialId);

    expect(movements(emissions).at(-1)?.payload).toMatchObject({
      available: false,
      path: null,
    });
  });

  it("carries no code, draft, feedback, or teacher identity", async () => {
    const { emissions, publish } = createStudent();

    await publish(materialId);

    expect(Object.keys(movements(emissions)[0]?.payload as object).sort()).toEqual([
      "available",
      "changedAt",
      "courseId",
      "materialId",
      "path",
      "studentMembershipId",
    ]);
  });
});

describe("first watch draft creation", () => {
  it("adopts a draft created by a concurrent student autosave without overwriting it", async () => {
    const findUnique = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: draftId });
    const create = vi.fn().mockRejectedValue({ code: "P2002" });
    const prisma = {
      exerciseDraft: { findUnique, create },
      programmingExercise: { findUnique: vi.fn().mockResolvedValue({ starterCode: "starter" }) },
    };
    const { gateway } = createGateway({ prisma });
    const ensure = gateway as unknown as { ensureDraft(claim: MonitoringMaterialClaim): Promise<string> };
    expect(await ensure.ensureDraft(claim)).toBe(draftId);
    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("direct live page watch", () => {
  it("joins the teacher notification room without needing a roster subscription", async () => {
    const { gateway, visits } = createGateway({
      snapshot: async () => ({ entries: [{ studentMembershipId, materialId }] }) as unknown as PresenceSnapshot,
    });
    Object.assign(gateway, {
      requireClassClaim: vi.fn().mockResolvedValue(claim),
      ensureDraft: vi.fn().mockResolvedValue(draftId),
      access: {
        requireMonitorableStudent: vi.fn().mockResolvedValue(claim),
        requireMonitorableMaterial: vi.fn().mockResolvedValue(claim),
      },
    });
    Object.assign(visits, { start: vi.fn().mockResolvedValue({ id: visitId, startedAt: new Date(), replaced: null }) });
    const socket = createSocket({});
    try {
      const result = await gateway.watchStart(socket, { eventId: crypto.randomUUID(), academyId, classId, studentMembershipId, sessionId, protocolVersion: 3 });
      expect(result.ok).toBe(true);
      expect(socket.join).toHaveBeenCalledWith(expect.arrayContaining([monitoringRooms.teacher(academyId, teacherMembershipId)]));
    } finally {
      gateway.onModuleDestroy();
    }
  });
});

describe("expired watch authorization", () => {
  it("rechecks enrollment rather than renewing from a teacher's class grant alone", async () => {
    const { gateway } = createGateway();
    const requireMonitorableStudent = vi.fn().mockRejectedValue(new Error("unenrolled"));
    Object.assign(gateway, {
      requireClassClaim: vi.fn().mockResolvedValue({ ...claim, grantedAt: Date.now() }),
      access: { requireMonitorableStudent },
    });
    const revalidate = gateway as unknown as { revalidate(socket: GatewaySocket, claim: MonitoringMaterialClaim): Promise<void> };
    await expect(revalidate.revalidate(createSocket({}), { ...claim, grantedAt: 0 })).rejects.toThrow("unenrolled");
    expect(requireMonitorableStudent).toHaveBeenCalledWith(expect.anything(), studentMembershipId);
  });
});
