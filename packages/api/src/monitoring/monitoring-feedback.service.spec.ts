import { describe, expect, it, vi } from "vitest";
import { monitoringLimits } from "@cove/shared";

import type { PrismaService } from "../database/prisma.service.js";
import type { MonitoringMaterialClaim } from "./monitoring-access.service.js";
import { MonitoringFeedbackService } from "./monitoring-feedback.service.js";

const academyId = "20000000-0000-4000-8000-000000000001";
const classId = "50000000-0000-4000-8000-000000000001";
const teacherMembershipId = "40000000-0000-4000-8000-000000000001";
const studentMembershipId = "60000000-0000-4000-8000-000000000001";
const materialId = "80000000-0000-4000-8000-000000000001";
const idempotencyKey = "b0000000-0000-4000-8000-000000000001";
const createdAt = new Date("2026-08-04T09:00:00.000Z");

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

function row(body: string) {
  return {
    id: "feedback-1",
    classId,
    teacherMembershipRef: teacherMembershipId,
    studentMembershipRef: studentMembershipId,
    materialId,
    body,
    createdAt,
  };
}

function createService(options?: {
  existing?: ReturnType<typeof row> | null;
  createFails?: boolean;
  racedRow?: ReturnType<typeof row> | null;
}) {
  const findUnique = vi
    .fn()
    .mockResolvedValueOnce(options?.existing ?? null)
    .mockResolvedValue(options?.racedRow ?? null);
  const create = vi.fn().mockImplementation(({ data }: { data: { body: string } }) =>
    options?.createFails
      ? Promise.reject(new Error("unique constraint"))
      : Promise.resolve(row(data.body))
  );
  const prisma = {
    teacherFeedback: { findUnique, create },
  } as unknown as PrismaService;
  return {
    service: new MonitoringFeedbackService(prisma),
    findUnique,
    create,
  };
}

describe("create", () => {
  it("stores the trimmed message and returns the server-owned record", async () => {
    const { service } = createService();
    const record = await service.create(claim, {
      idempotencyKey,
      body: "  try a loop  ",
      visitId: "visit-1",
    });
    expect(record.body).toBe("try a loop");
    expect(record.createdAt).toBe(createdAt.toISOString());
  });

  it("returns no author name, so the indicator's anonymity holds", async () => {
    const { service } = createService();
    const record = await service.create(claim, {
      idempotencyKey,
      body: "hint",
      visitId: null,
    });
    expect(record).not.toHaveProperty("displayName");
    expect(record).not.toHaveProperty("teacherName");
    expect(record.teacherMembershipRef).toBe(teacherMembershipId);
  });

  it("stores the immutable pair beside the live relations", async () => {
    const { service, create } = createService();
    await service.create(claim, {
      idempotencyKey,
      body: "hint",
      visitId: "visit-1",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          teacherMembershipRef: teacherMembershipId,
          studentMembershipRef: studentMembershipId,
          monitoringVisitId: "visit-1",
        }),
      }),
    );
  });

  it("returns the stored row for a retried send instead of posting twice", async () => {
    const { service, create } = createService({ existing: row("already sent") });
    const record = await service.create(claim, {
      idempotencyKey,
      body: "already sent",
      visitId: null,
    });
    expect(record.body).toBe("already sent");
    expect(create).not.toHaveBeenCalled();
  });

  it("resolves a race by reading the winner's row", async () => {
    const { service } = createService({
      createFails: true,
      racedRow: row("winner"),
    });
    await expect(
      service.create(claim, { idempotencyKey, body: "winner", visitId: null }),
    ).resolves.toMatchObject({ body: "winner" });
  });

  it("rethrows when the write failed for a reason other than the key", async () => {
    const { service } = createService({ createFails: true, racedRow: null });
    await expect(
      service.create(claim, { idempotencyKey, body: "lost", visitId: null }),
    ).rejects.toThrow();
  });

  it("refuses an empty message before it reaches the database", async () => {
    const { service, create } = createService();
    await expect(
      service.create(claim, { idempotencyKey, body: "   ", visitId: null }),
    ).rejects.toMatchObject({ code: "MONITORING_FEEDBACK_INVALID" });
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a message over the length limit", async () => {
    const { service } = createService();
    await expect(
      service.create(claim, {
        idempotencyKey,
        body: "a".repeat(monitoringLimits.feedbackMaxLength + 1),
        visitId: null,
      }),
    ).rejects.toMatchObject({ code: "MONITORING_FEEDBACK_INVALID" });
  });
});
