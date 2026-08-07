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
const updatedAt = new Date("2026-08-04T09:30:00.000Z");

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

function row(body: string, overrides?: { readAt?: Date | null }) {
  return {
    id: "feedback-1",
    classId,
    teacherMembershipRef: teacherMembershipId,
    studentMembershipRef: studentMembershipId,
    materialId,
    body,
    createdAt,
    updatedAt,
    readAt: overrides?.readAt ?? null,
    teacherMembership: { user: { displayName: "Kim" } },
  };
}

function createService(options?: {
  /** A row matching the idempotency key: this send is a retry. */
  retried?: ReturnType<typeof row> | null;
  /** A note this teacher already left on this exercise. */
  standing?: { id: string } | null;
  writeFails?: boolean;
  racedRow?: ReturnType<typeof row> | null;
}) {
  const findUnique = vi
    .fn()
    .mockResolvedValueOnce(options?.retried ?? null)
    .mockResolvedValue(options?.racedRow ?? null);
  const findFirst = vi.fn().mockResolvedValue(options?.standing ?? null);
  const create = vi
    .fn()
    .mockImplementation(({ data }: { data: { body: string } }) =>
      options?.writeFails
        ? Promise.reject(new Error("unique constraint"))
        : Promise.resolve(row(data.body))
    );
  const update = vi
    .fn()
    .mockImplementation(({ data }: { data: { body: string } }) =>
      options?.writeFails
        ? Promise.reject(new Error("unique constraint"))
        : Promise.resolve(row(data.body))
    );
  const prisma = {
    teacherFeedback: { findUnique, findFirst, create, update },
  } as unknown as PrismaService;
  return {
    service: new MonitoringFeedbackService(prisma),
    findUnique,
    findFirst,
    create,
    update,
  };
}

/**
 * One note per teacher, per student, per exercise.
 *
 * The behaviour these tests exist to pin down is that a second send is a
 * rewrite and not a second remark — a teacher revising their advice must not
 * leave the student with two versions of it to reconcile.
 */
describe("upsert", () => {
  it("stores the trimmed note and returns the server-owned record", async () => {
    const { service } = createService();
    const record = await service.upsert(claim, {
      idempotencyKey,
      body: "  try a loop  ",
      visitId: "visit-1",
    });
    expect(record.body).toBe("try a loop");
    expect(record.createdAt).toBe(createdAt.toISOString());
    expect(record.updatedAt).toBe(updatedAt.toISOString());
  });

  it("names its author, unlike the live indicator", async () => {
    const { service } = createService();
    const record = await service.upsert(claim, {
      idempotencyKey,
      body: "hint",
      visitId: null,
    });
    expect(record.teacherName).toBe("Kim");
    expect(record.teacherMembershipRef).toBe(teacherMembershipId);
  });

  it("creates the first note with the immutable pair beside the live relations", async () => {
    const { service, create, update } = createService();
    await service.upsert(claim, {
      idempotencyKey,
      body: "hint",
      visitId: "visit-1",
    });
    expect(update).not.toHaveBeenCalled();
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

  it("rewrites the standing note instead of adding a second one", async () => {
    const { service, create, update } = createService({
      standing: { id: "feedback-1" },
    });
    await service.upsert(claim, {
      idempotencyKey,
      body: "read both numbers first",
      visitId: "visit-2",
    });

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "feedback-1" },
        data: expect.objectContaining({ body: "read both numbers first" }),
      }),
    );
  });

  /**
   * The words changed, so the student has not read what it now says. Leaving
   * the stamp in place would silently withhold the correction.
   */
  it("marks a rewritten note unread again", async () => {
    const { service, update } = createService({
      standing: { id: "feedback-1" },
    });
    await service.upsert(claim, {
      idempotencyKey,
      body: "revised",
      visitId: null,
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ readAt: null }),
      }),
    );
  });

  it("adopts the new key so a retry of the rewrite is recognized too", async () => {
    const { service, update } = createService({
      standing: { id: "feedback-1" },
    });
    await service.upsert(claim, {
      idempotencyKey,
      body: "revised",
      visitId: null,
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ idempotencyKey }),
      }),
    );
  });

  it("looks for the standing note by author, student, and exercise", async () => {
    const { service, findFirst } = createService();
    await service.upsert(claim, { idempotencyKey, body: "hint", visitId: null });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          teacherMembershipRef: teacherMembershipId,
          studentMembershipRef: studentMembershipId,
          materialId,
        },
      }),
    );
  });

  it("returns the stored row for a retried send instead of writing twice", async () => {
    const { service, create, update } = createService({
      retried: row("already sent"),
    });
    const record = await service.upsert(claim, {
      idempotencyKey,
      body: "already sent",
      visitId: null,
    });
    expect(record.body).toBe("already sent");
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("resolves a race by reading the winner's row", async () => {
    const { service } = createService({
      writeFails: true,
      racedRow: row("winner"),
    });
    await expect(
      service.upsert(claim, { idempotencyKey, body: "winner", visitId: null }),
    ).resolves.toMatchObject({ body: "winner" });
  });

  it("rethrows when the write failed for a reason other than the key", async () => {
    const { service } = createService({ writeFails: true, racedRow: null });
    await expect(
      service.upsert(claim, { idempotencyKey, body: "lost", visitId: null }),
    ).rejects.toThrow();
  });

  it("refuses an empty note before it reaches the database", async () => {
    const { service, create, update } = createService();
    await expect(
      service.upsert(claim, { idempotencyKey, body: "   ", visitId: null }),
    ).rejects.toMatchObject({ code: "MONITORING_FEEDBACK_INVALID" });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses a note over the length limit", async () => {
    const { service } = createService();
    await expect(
      service.upsert(claim, {
        idempotencyKey,
        body: "a".repeat(monitoringLimits.feedbackMaxLength + 1),
        visitId: null,
      }),
    ).rejects.toMatchObject({ code: "MONITORING_FEEDBACK_INVALID" });
  });
});
