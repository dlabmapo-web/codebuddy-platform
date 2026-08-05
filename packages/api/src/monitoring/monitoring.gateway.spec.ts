import { monitoringRooms, monitoringServerEvents } from "@cove/shared";
import type { Server } from "socket.io";
import { describe, expect, it, vi } from "vitest";

import { MonitoringGateway } from "./monitoring.gateway.js";
import type { MonitoringMaterialClaim } from "./monitoring-access.service.js";

/**
 * What the gateway says on behalf of a peer that can no longer say it.
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
  const activeWatches = { clear: vi.fn().mockResolvedValue(undefined) };

  // Only the collaborators these two paths reach are stubbed; the rest are
  // absent on purpose, so a call that starts touching them fails loudly here.
  const absent = undefined as never;
  const gateway = new MonitoringGateway(
    absent,
    absent,
    absent,
    presence as never,
    documents as never,
    activeWatches as never,
    visits as never,
    absent,
    absent,
    { increment: vi.fn(), incrementWithReason: vi.fn() } as never,
  );
  gateway.server = server;
  return { gateway, emissions, presence, documents, visits, activeWatches };
}

function createSocket(
  data: Record<string, unknown>,
): GatewaySocket & { leftAt: number[]; emitted: Emission[] } {
  const leftAt: number[] = [];
  const emitted: Emission[] = [];
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
    leave: vi.fn(async () => undefined),
    leftAt,
    emitted,
  };
  return socket as unknown as GatewaySocket & {
    leftAt: number[];
    emitted: Emission[];
  };
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
