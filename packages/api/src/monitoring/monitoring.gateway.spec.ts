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
  const activeWatches = {
    clear: vi.fn().mockResolvedValue(undefined),
    isActive: vi.fn().mockResolvedValue(true),
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
    activeWatches as never,
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
    activeWatches,
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
        watch: {
          claim: { ...claim, grantedAt: Date.now() },
          visitId,
          draftId,
          helping: false,
        },
      },
    });

    const ack = await gateway.documentSync(socket, {
      eventId: visitId,
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
        watch: {
          claim: { ...claim, grantedAt: Date.now() },
          visitId,
          draftId,
          helping: false,
        },
      },
    });

    const ack = await gateway.documentSync(socket, {
      eventId: visitId,
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
        payload: { draftId, cursor: null, pointer: null, origin: "STUDENT" },
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
  it("does not let an older authorized packet overwrite a newer position", async () => {
    const { gateway } = createGateway();
    const socket = createSocket({
      teacher: {
        claims: new Map(),
        watch: { claim, visitId, draftId, helping: false },
      },
    });

    await gateway.awarenessUpdate(socket, {
      draftId,
      sequence: 2,
      cursor: null,
      pointer: { surface: "editor", x: 0.5, y: 0.5 },
    });
    await gateway.awarenessUpdate(socket, {
      draftId,
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
        watch: { claim, visitId, draftId, helping: false },
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
        watch: { claim, visitId, draftId, helping: false },
      },
    });

    await gateway.terminalResync(socket, { draftId });

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
        watch: { claim, visitId, draftId, helping: false },
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
    const { gateway, emissions } = createGateway();
    const socket = createSocket({
      teacher: {
        claims: new Map(),
        watch: { claim, visitId, draftId, helping: false },
      },
    });

    await gateway.watchStop(socket, { eventId: visitId });

    expect(awarenessClears(emissions)).toEqual([
      {
        room: monitoringRooms.draft(academyId, draftId),
        event: monitoringServerEvents.awarenessChanged,
        payload: { draftId, cursor: null, pointer: null, origin: "TEACHER" },
      },
    ]);
  });

  it("speaks while it is still in the room, not after leaving it", async () => {
    const { gateway, emissions } = createGateway();
    const socket = createSocket({
      teacher: {
        claims: new Map(),
        watch: { claim, visitId, draftId, helping: false },
      },
    });
    let clearsAtLeave = -1;
    socket.leave = vi.fn(async () => {
      clearsAtLeave = awarenessClears(emissions).length;
    }) as unknown as GatewaySocket["leave"];

    await gateway.watchStop(socket, { eventId: visitId });
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
        watch: { claim, visitId, draftId, helping: false },
      },
    });

    await gateway.watchStop(socket, { eventId: visitId });

    expect(socket.leave).toHaveBeenCalledWith(
      monitoringRooms.watchContext(academyId, classId, studentMembershipId),
    );
  });

  it("has nothing to clear when no watch was open", async () => {
    const { gateway, emissions, visits } = createGateway();
    const socket = createSocket({});

    await gateway.watchStop(socket, { eventId: visitId });
    expect(awarenessClears(emissions)).toHaveLength(0);
    expect(visits.end).not.toHaveBeenCalled();
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
        academyId,
        materialId: material,
        courseId: openCourseId,
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
