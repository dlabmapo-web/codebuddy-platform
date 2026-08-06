import {
  monitoringLimits,
  monitoringRooms,
  monitoringServerEvents,
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
  markInterrupted?: () => Promise<null>;
  flush?: () => Promise<void>;
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
  };
  const documents = {
    flush: vi.fn().mockImplementation(overrides?.flush ?? (async () => undefined)),
  };
  const visits = { end: vi.fn().mockResolvedValue(undefined) };
  const activeWatches = {
    clear: vi.fn().mockResolvedValue(undefined),
    isActive: vi.fn().mockResolvedValue(true),
  };
  const metrics = { increment: vi.fn(), incrementWithReason: vi.fn() };

  // Only the collaborators these two paths reach are stubbed; the rest are
  // absent on purpose, so a call that starts touching them fails loudly here.
  const absent = undefined as never;
  const gateway = new MonitoringGateway(
    (overrides?.prisma ?? absent) as never,
    absent,
    absent,
    presence as never,
    documents as never,
    activeWatches as never,
    visits as never,
    absent,
    absent,
    metrics as never,
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

  it("has nothing to clear when no watch was open", async () => {
    const { gateway, emissions, visits } = createGateway();
    const socket = createSocket({});

    await gateway.watchStop(socket, { eventId: visitId });
    expect(awarenessClears(emissions)).toHaveLength(0);
    expect(visits.end).not.toHaveBeenCalled();
  });
});
