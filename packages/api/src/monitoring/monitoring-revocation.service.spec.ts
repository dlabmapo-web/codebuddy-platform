import { describe, expect, it, vi } from "vitest";
import { monitoringRooms } from "@cove/shared";
import type { Server } from "socket.io";

import { MonitoringMetricsService } from "./monitoring-metrics.service.js";
import { MonitoringRevocationService } from "./monitoring-revocation.service.js";
import type { MonitoringVisitService } from "./monitoring-visit.service.js";

const academyId = "20000000-0000-4000-8000-000000000001";
const classId = "50000000-0000-4000-8000-000000000001";
const teacherMembershipId = "40000000-0000-4000-8000-000000000001";
const studentMembershipId = "60000000-0000-4000-8000-000000000001";
const draftId = "a0000000-0000-4000-8000-000000000001";

const openVisit = {
  id: "visit-1",
  academyId,
  classId,
  teacherMembershipRef: teacherMembershipId,
  studentMembershipRef: studentMembershipId,
};

function createService(options?: {
  ended?: Array<typeof openVisit>;
  attach?: boolean;
  teacherRooms?: string[];
}) {
  const endOpenVisits = vi.fn().mockResolvedValue(options?.ended ?? [openVisit]);
  const visits = { endOpenVisits } as unknown as MonitoringVisitService;
  const metrics = new MonitoringMetricsService();

  const remoteSocket = {
    rooms: new Set(
      options?.teacherRooms ?? [
        monitoringRooms.teacher(academyId, teacherMembershipId),
        monitoringRooms.classPresence(academyId, classId),
        monitoringRooms.draft(academyId, draftId),
      ],
    ),
    leave: vi.fn(),
    disconnect: vi.fn(),
  };
  const emit = vi.fn();
  const fetchSockets = vi.fn().mockResolvedValue([remoteSocket]);
  const server = {
    to: vi.fn(() => ({ emit })),
    in: vi.fn(() => ({ fetchSockets })),
  } as unknown as Server;

  const activeWatches = { clear: vi.fn().mockResolvedValue(undefined) };
  const service = new MonitoringRevocationService(
    visits,
    metrics,
    activeWatches as never,
  );
  if (options?.attach !== false) service.attach(server);
  return { service, endOpenVisits, emit, remoteSocket, metrics, server };
}

describe("revokeClass", () => {
  it("closes the class's open visits with the typed reason", async () => {
    const { service, endOpenVisits } = createService();
    await service.revokeClass(classId, "CLASS_ARCHIVED");
    expect(endOpenVisits).toHaveBeenCalledWith({ classId }, "CLASS_ARCHIVED");
  });

  it("tells the teacher their access was revoked and the watch ended", async () => {
    const { service, emit } = createService();
    await service.revokeClass(classId, "CLASS_ARCHIVED");
    const events = emit.mock.calls.map(([event]) => event as string);
    expect(events).toContain("access.revoked");
    expect(events).toContain("watch.ended");
  });

  it("removes the teacher from the presence and draft rooms", async () => {
    const { service, remoteSocket } = createService();
    await service.revokeClass(classId, "CLASS_ARCHIVED");
    expect(remoteSocket.leave).toHaveBeenCalledWith(
      monitoringRooms.classPresence(academyId, classId),
    );
    expect(remoteSocket.leave).toHaveBeenCalledWith(
      monitoringRooms.draft(academyId, draftId),
    );
  });

  it("leaves the teacher's own private room, which carries the revocation", async () => {
    const { service, remoteSocket } = createService();
    await service.revokeClass(classId, "CLASS_ARCHIVED");
    expect(remoteSocket.leave).not.toHaveBeenCalledWith(
      monitoringRooms.teacher(academyId, teacherMembershipId),
    );
  });

  it("does nothing when no visit was open, so a retry is free", async () => {
    const { service, emit } = createService({ ended: [] });
    await service.revokeClass(classId, "CLASS_ARCHIVED");
    expect(emit).not.toHaveBeenCalled();
  });

  it("still closes the visits when this process has no gateway", async () => {
    const { service, endOpenVisits } = createService({ attach: false });
    await service.revokeClass(classId, "CLASS_ARCHIVED");
    expect(endOpenVisits).toHaveBeenCalled();
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
