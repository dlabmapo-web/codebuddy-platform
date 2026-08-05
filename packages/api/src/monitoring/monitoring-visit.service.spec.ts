import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../database/prisma.service.js";
import type { MonitoringMaterialClaim } from "./monitoring-access.service.js";
import { MonitoringVisitService } from "./monitoring-visit.service.js";

const academyId = "20000000-0000-4000-8000-000000000001";
const classId = "50000000-0000-4000-8000-000000000001";
const teacherMembershipId = "40000000-0000-4000-8000-000000000001";
const studentMembershipId = "60000000-0000-4000-8000-000000000001";
const materialId = "80000000-0000-4000-8000-000000000001";
const startedAt = new Date("2026-08-04T09:00:00.000Z");

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

function createService(options?: {
  openVisit?: { id: string; studentMembershipRef: string } | null;
  openVisits?: Array<{
    id: string;
    academyId: string;
    classId: string;
    teacherMembershipRef: string;
    studentMembershipRef: string;
  }>;
  updatedCount?: number;
}) {
  const visit = {
    findFirst: vi.fn().mockResolvedValue(options?.openVisit ?? null),
    findMany: vi.fn().mockResolvedValue(options?.openVisits ?? []),
    updateMany: vi
      .fn()
      .mockResolvedValue({ count: options?.updatedCount ?? 1 }),
    create: vi.fn().mockResolvedValue({ id: "visit-1", startedAt }),
  };
  const prisma = {
    teacherMonitoringVisit: visit,
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        teacherMonitoringVisit: visit,
        $queryRawUnsafe: vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
      })
    ),
  } as unknown as PrismaService;
  return { service: new MonitoringVisitService(prisma), visit };
}

describe("start", () => {
  it("records the immutable membership pair beside the live relations", async () => {
    const { service, visit } = createService();
    await service.start(claim);
    expect(visit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          teacherMembershipRef: teacherMembershipId,
          studentMembershipRef: studentMembershipId,
          teacherMembershipId,
          studentMembershipId,
          materialId,
        }),
      }),
    );
  });

  it("records no code, cursor, or feedback field", async () => {
    const { service, visit } = createService();
    await service.start(claim);
    const data = visit.create.mock.calls[0]![0].data as Record<string, unknown>;
    for (const forbidden of ["code", "body", "cursor", "pointer", "output"]) {
      expect(data).not.toHaveProperty(forbidden);
    }
  });

  it("closes the teacher's previous watch as replaced", async () => {
    const { service, visit } = createService({
      openVisit: { id: "visit-0", studentMembershipRef: "other" },
    });
    const result = await service.start(claim);
    expect(visit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ endReason: "WATCH_REPLACED" }),
      }),
    );
    expect(result.replaced?.id).toBe("visit-0");
  });

  it("does not invent a replacement when nothing was open", async () => {
    const { service } = createService();
    const result = await service.start(claim);
    expect(result.replaced).toBeNull();
  });
});

describe("end", () => {
  it("closes an open visit exactly once", async () => {
    const { service, visit } = createService();
    await expect(service.end("visit-1", "TEACHER_LEFT")).resolves.toBe(true);
    expect(visit.updateMany).toHaveBeenCalledWith({
      where: { id: "visit-1", endedAt: null },
      data: expect.objectContaining({ endReason: "TEACHER_LEFT" }),
    });
  });

  it("is a no-op the second time, so a duplicate revocation is free", async () => {
    const { service } = createService({ updatedCount: 0 });
    await expect(service.end("visit-1", "TEACHER_LEFT")).resolves.toBe(false);
  });
});

describe("endOpenVisits", () => {
  it("returns nothing and writes nothing when no visit is open", async () => {
    const { service, visit } = createService({ openVisits: [] });
    await expect(service.endOpenVisits({ classId }, "CLASS_ARCHIVED")).resolves
      .toEqual([]);
    expect(visit.updateMany).not.toHaveBeenCalled();
  });

  it("closes every open visit in the revoked scope", async () => {
    const open = [
      {
        id: "visit-1",
        academyId,
        classId,
        teacherMembershipRef: teacherMembershipId,
        studentMembershipRef: studentMembershipId,
      },
    ];
    const { service, visit } = createService({ openVisits: open });
    await expect(
      service.endOpenVisits({ classId }, "CLASS_ARCHIVED"),
    ).resolves.toEqual(open);
    expect(visit.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["visit-1"] } },
      data: expect.objectContaining({ endReason: "CLASS_ARCHIVED" }),
    });
  });

  it("scopes by teacher, student, or class as the change requires", async () => {
    const { service, visit } = createService({ openVisits: [] });
    await service.endOpenVisits(
      { teacherMembershipRef: teacherMembershipId },
      "ROLE_CHANGED",
    );
    expect(visit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endedAt: null, teacherMembershipRef: teacherMembershipId },
      }),
    );
  });
});
