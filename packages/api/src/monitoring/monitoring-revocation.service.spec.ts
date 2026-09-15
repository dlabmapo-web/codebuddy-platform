import { describe, expect, it, vi } from "vitest";
import { monitoringRooms, monitoringServerEvents } from "@cove/shared";
import type { Server } from "socket.io";

import { MonitoringMetricsService } from "./monitoring-metrics.service.js";
import { MonitoringRevocationService } from "./monitoring-revocation.service.js";
import type { MonitoringVisitService } from "./monitoring-visit.service.js";
import type { WatchLease } from "./watch-session.registry.js";

const academyId = "20000000-0000-4000-8000-000000000001";
const classId = "50000000-0000-4000-8000-000000000001";
const otherClassId = "50000000-0000-4000-8000-000000000002";
const teacherMembershipId = "40000000-0000-4000-8000-000000000001";
const studentMembershipId = "60000000-0000-4000-8000-000000000001";
const otherStudentMembershipId = "60000000-0000-4000-8000-000000000002";
const draftId = "a0000000-0000-4000-8000-000000000001";
const otherDraftId = "a0000000-0000-4000-8000-000000000002";

const openVisit = {
  id: "visit-1",
  academyId,
  classId,
  teacherMembershipRef: teacherMembershipId,
  studentMembershipRef: studentMembershipId,
};

function leaseFor(visitId: string, overrides: Partial<WatchLease> = {}): WatchLease {
  return {
    visitId,
    sessionId: "session-1",
    generation: 1,
    teacherMembershipId,
    academyId,
    classId,
    studentMembershipId,
    draftId,
    mode: "MONITORING",
    ...overrides,
  };
}

/**
 * A socket carrying one watch, shaped the way the gateway stores it.
 *
 * The watch is what revocation now matches on. A socket whose watch is another
 * visit is a different tab of the same teacher, and the whole point of the
 * scope is that it survives untouched.
 */
function socketWatching(visitId: string, overrides: Partial<WatchLease> = {}) {
  const lease = leaseFor(visitId, overrides);
  return {
    data: {
      teacher: {
        membershipId: lease.teacherMembershipId,
        claims: new Map([[lease.classId, {}]]),
        watch: {
          visitId,
          draftId: lease.draftId,
          claim: { studentMembershipId: lease.studentMembershipId },
        },
      },
    },
    rooms: new Set([
      monitoringRooms.teacher(academyId, teacherMembershipId),
      monitoringRooms.classPresence(academyId, lease.classId),
      monitoringRooms.draft(academyId, lease.draftId),
    ]),
    emit: vi.fn(),
    leave: vi.fn(),
    disconnect: vi.fn(),
  };
}

function createService(options?: {
  ended?: Array<typeof openVisit>;
  attach?: boolean;
  sockets?: ReturnType<typeof socketWatching>[];
  leases?: Record<string, WatchLease | null>;
  summary?: { watcherCount: number; helpingCount: number };
}) {
  const endOpenVisits = vi.fn().mockResolvedValue(options?.ended ?? [openVisit]);
  const visits = { endOpenVisits } as unknown as MonitoringVisitService;
  const metrics = new MonitoringMetricsService();

  const sockets = options?.sockets ?? [socketWatching("visit-1")];
  const emissions: Array<{ room: string; event: string; payload: unknown }> = [];
  for (const socket of sockets) socket.emit.mockImplementation((event: string, payload: unknown) => {
    emissions.push({ room: 'socket', event, payload });
    return true;
  });
  const fetchSockets = vi.fn().mockResolvedValue(sockets);
  const server = {
    fetchSockets,
    to: vi.fn((room: string) => ({
      emit: (event: string, payload: unknown) => {
        emissions.push({ room, event, payload });
        return true;
      },
    })),
    in: vi.fn(() => ({ fetchSockets })),
  } as unknown as Server;

  const leases = options?.leases ?? { "visit-1": leaseFor("visit-1") };
  const watchSessions = {
    endByVisitId: vi
      .fn()
      .mockImplementation(async (visitId: string) => leases[visitId] ?? null),
    summarize: vi.fn().mockResolvedValue({
      classId: null,
      studentMembershipId,
      draftId,
      revision: 7,
      watcherCount: options?.summary?.watcherCount ?? 0,
      helpingCount: options?.summary?.helpingCount ?? 0,
      indicator:
        (options?.summary?.helpingCount ?? 0) > 0
          ? "HELPING"
          : (options?.summary?.watcherCount ?? 0) > 0
            ? "MONITORING"
            : "NONE",
    }),
  };

  const service = new MonitoringRevocationService(
    visits,
    metrics,
    watchSessions as never,
  );
  if (options?.attach !== false) service.attach(server);
  return {
    service,
    endOpenVisits,
    emissions,
    sockets,
    watchSessions,
    metrics,
    server,
  };
}

function eventsIn(
  emissions: Array<{ event: string }>,
): string[] {
  return emissions.map((emission) => emission.event);
}

describe("revokeClass", () => {
  it("closes the class's open visits with the typed reason", async () => {
    const { service, endOpenVisits } = createService();
    await service.revokeClass(classId, "CLASS_ARCHIVED");
    expect(endOpenVisits).toHaveBeenCalledWith({ classId }, "CLASS_ARCHIVED");
  });

  it("tells the teacher their access was revoked and the watch ended", async () => {
    const { service, emissions } = createService();
    await service.revokeClass(classId, "CLASS_ARCHIVED");
    expect(eventsIn(emissions)).toContain(monitoringServerEvents.accessRevoked);
    expect(eventsIn(emissions)).toContain(monitoringServerEvents.watchEnded);
  });

  /**
   * The ending names the watch it ended.
   *
   * A teacher with five tabs receives this in all five, because they share the
   * teacher room. Only the tab holding this visit may act on it, and the visit
   * id is the only thing that tells them apart when two tabs watch one student.
   */
  it("qualifies the ending with the visit and draft it ended", async () => {
    const { service, emissions } = createService();
    await service.revokeClass(classId, "CLASS_ARCHIVED");
    const ended = emissions.find(
      (emission) => emission.event === monitoringServerEvents.watchEnded,
    );
    expect(ended?.payload).toMatchObject({ visitId: "visit-1", draftId });
  });

  it("ends the revoked watch's lease so every instance refuses it", async () => {
    const { service, watchSessions } = createService();
    await service.revokeClass(classId, "CLASS_ARCHIVED");
    expect(watchSessions.endByVisitId).toHaveBeenCalledWith("visit-1");
  });

  it("removes the revoked watch from its draft and watch-context rooms", async () => {
    const { service, sockets } = createService();
    await service.revokeClass(classId, "CLASS_ARCHIVED");
    expect(sockets[0]!.leave).toHaveBeenCalledWith(
      monitoringRooms.draft(academyId, draftId),
    );
    expect(sockets[0]!.leave).toHaveBeenCalledWith(
      monitoringRooms.watchContext(academyId, classId, studentMembershipId),
    );
  });

  it("leaves the teacher's own private room, which carries the revocation", async () => {
    const { service, sockets } = createService();
    await service.revokeClass(classId, "CLASS_ARCHIVED");
    expect(sockets[0]!.leave).not.toHaveBeenCalledWith(
      monitoringRooms.teacher(academyId, teacherMembershipId),
    );
  });

  /**
   * The behaviour this spec exists to change.
   *
   * The previous implementation matched draft rooms by prefix and then called
   * `disconnect(true)` on every socket in the teacher's room. With five tabs
   * open that ends five sessions to revoke one — four of them watching
   * students this revocation says nothing about.
   */
  it("does not disconnect the socket it revoked", async () => {
    const { service, sockets } = createService();
    await service.revokeClass(classId, "CLASS_ARCHIVED");
    expect(sockets[0]!.disconnect).not.toHaveBeenCalled();
  });

  it("preserves the same teacher's watch on an unrelated student", async () => {
    const revoked = socketWatching("visit-1");
    const unrelated = socketWatching("visit-2", {
      classId: otherClassId,
      studentMembershipId: otherStudentMembershipId,
      draftId: otherDraftId,
    });
    const { service } = createService({ sockets: [revoked, unrelated] });

    await service.revokeClass(classId, "CLASS_ARCHIVED");

    expect(unrelated.leave).not.toHaveBeenCalledWith(
      monitoringRooms.draft(academyId, otherDraftId),
    );
    expect(unrelated.disconnect).not.toHaveBeenCalled();
    expect(unrelated.emit).not.toHaveBeenCalled();
    expect(
      (unrelated.data as { teacher: { watch: unknown } }).teacher.watch,
    ).not.toBeNull();
  });

  /**
   * A roster subscription is a separate grant from a watch, so it needs a
   * separate sweep — a teacher who was only reading the class list holds no
   * visit for the eviction loop to find.
   */
  it("removes the revoked class's roster subscription", async () => {
    const { service, sockets } = createService();
    await service.revokeClass(classId, "CLASS_ARCHIVED");
    expect(sockets[0]!.leave).toHaveBeenCalledWith(
      monitoringRooms.classPresence(academyId, classId),
    );
    expect(
      (sockets[0]!.data as { teacher: { claims: Map<string, unknown> } }).teacher
        .claims.has(classId),
    ).toBe(false);
  });

  it("preserves a roster subscription for a class it did not revoke", async () => {
    const { service, sockets } = createService();
    await service.revokeClass(classId, "CLASS_ARCHIVED");
    expect(sockets[0]!.leave).not.toHaveBeenCalledWith(
      monitoringRooms.classPresence(academyId, otherClassId),
    );
  });

  /**
   * The student is told a count, not an ending.
   *
   * Revoking one of three watchers leaves two, and a bare `watch.ended` would
   * have cleared the indicator and unbound the document for both of them.
   */
  it("republishes the student's summary, preserving remaining watchers", async () => {
    const { service, emissions } = createService({
      summary: { watcherCount: 2, helpingCount: 1 },
    });
    await service.revokeClass(classId, "CLASS_ARCHIVED");
    const summary = emissions.find(
      (emission) => emission.event === monitoringServerEvents.watchSummary,
    );
    expect(summary?.room).toBe(
      monitoringRooms.student(academyId, studentMembershipId),
    );
    expect(summary?.payload).toMatchObject({
      watcherCount: 2,
      helpingCount: 1,
      indicator: "HELPING",
    });
  });

  it("publishes one summary per student, not one per revoked visit", async () => {
    const { service, emissions } = createService({
      ended: [
        openVisit,
        { ...openVisit, id: "visit-2", teacherMembershipRef: "teacher-2" },
      ],
      leases: {
        "visit-1": leaseFor("visit-1"),
        "visit-2": leaseFor("visit-2", { teacherMembershipId: "teacher-2" }),
      },
    });
    await service.revokeClass(classId, "CLASS_ARCHIVED");
    const summaries = emissions.filter(
      (emission) => emission.event === monitoringServerEvents.watchSummary,
    );
    expect(summaries).toHaveLength(1);
  });

  it("revokes roster access even when no watch visit was open", async () => {
    const { service, emissions } = createService({ ended: [] });
    await service.revokeClass(classId, "CLASS_ARCHIVED");
    expect(eventsIn(emissions)).toContain(monitoringServerEvents.accessRevoked);
    expect(eventsIn(emissions)).not.toContain(monitoringServerEvents.watchEnded);
  });

  it("still closes the visits when this process has no gateway", async () => {
    const { service, endOpenVisits } = createService({ attach: false });
    await service.revokeClass(classId, "CLASS_ARCHIVED");
    expect(endOpenVisits).toHaveBeenCalled();
  });

  /** A lapsed lease is the outcome revocation wanted, not a failure. */
  it("completes when the lease has already expired", async () => {
    const { service, emissions } = createService({ leases: {} });
    await service.revokeClass(classId, "CLASS_ARCHIVED");
    expect(eventsIn(emissions)).toContain(monitoringServerEvents.watchEnded);
  });
});

describe("revokeMembership", () => {
  it("revokes both what the member taught and what they were taught", async () => {
    const { service, endOpenVisits } = createService();
    await service.revokeMembership(teacherMembershipId, "MEMBERSHIP_INACTIVE");
    expect(endOpenVisits).toHaveBeenCalledWith(
      { teacherMembershipRef: teacherMembershipId },
      "MEMBERSHIP_INACTIVE",
    );
    expect(endOpenVisits).toHaveBeenCalledWith(
      { studentMembershipRef: teacherMembershipId },
      "MEMBERSHIP_INACTIVE",
    );
  });

  it("counts what it applied", async () => {
    const { service, metrics } = createService();
    await service.revokeStudent(studentMembershipId, "ENROLLMENT_REMOVED");
    expect(metrics.snapshot().counters["revocation.applied"]).toBe(1);
  });
});
