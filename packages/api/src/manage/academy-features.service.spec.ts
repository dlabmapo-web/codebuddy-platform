import { describe, expect, it, vi } from "vitest";

import { AcademyFeaturesService } from "./academy-features.service.js";

const academyId = "20000000-0000-4000-8000-000000000001";
const identity = { authUserId: "auth-1" } as never;

function createService(rows: { feature: string; isEnabled: boolean }[] = []) {
  const upserts: { feature: string; isEnabled: boolean }[] = [];
  const transaction = {
    academyFeatureFlag: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation(({ where, update }) => {
        upserts.push({
          feature: where.academyId_feature.feature,
          isEnabled: update.isEnabled,
        });
        return Promise.resolve({});
      }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    academyFeatureFlag: { findMany: vi.fn().mockResolvedValue(rows) },
    $transaction: vi.fn().mockImplementation((fn) => fn(transaction)),
  };
  const service = new AcademyFeaturesService(
    prisma as never,
    { requirePermission: vi.fn().mockResolvedValue({ userId: "u1" }) } as never,
    { requireManager: vi.fn().mockResolvedValue({ userId: "u1" }) } as never,
    { write: vi.fn().mockResolvedValue({}) } as never,
  );
  return { service, upserts };
}

describe("AcademyFeaturesService", () => {
  it("reports every feature, and a missing row as off", async () => {
    const { service } = createService([
      { feature: "STUDENT_POINTS", isEnabled: true },
    ]);

    const { features } = await service.list(identity, { academyId });

    expect(features).toHaveLength(4);
    expect(features.find((f) => f.feature === "STUDENT_POINTS")?.isEnabled).toBe(true);
    // No row is off — the same rule every reader of these flags applies.
    expect(features.find((f) => f.feature === "TEACHER_LIVE_MONITORING")?.isEnabled).toBe(false);
  });

  /*
   * The board is computed from the ledger. Enabling one without the other
   * renders an empty board, which reads as a fault rather than a setting.
   */
  it("turns points on when the class board is turned on", async () => {
    const { service, upserts } = createService();

    await service.setEnabled(identity, {
      academyId,
      feature: "STUDENT_CLASS_LEADERBOARD",
      isEnabled: true,
    });

    expect(upserts).toEqual([
      { feature: "STUDENT_CLASS_LEADERBOARD", isEnabled: true },
      { feature: "STUDENT_POINTS", isEnabled: true },
    ]);
  });

  it("takes the class board down when points are turned off", async () => {
    const { service, upserts } = createService();

    await service.setEnabled(identity, {
      academyId,
      feature: "STUDENT_POINTS",
      isEnabled: false,
    });

    expect(upserts).toEqual([
      { feature: "STUDENT_POINTS", isEnabled: false },
      { feature: "STUDENT_CLASS_LEADERBOARD", isEnabled: false },
    ]);
  });

  it("leaves unrelated features alone", async () => {
    const { service, upserts } = createService();

    await service.setEnabled(identity, {
      academyId,
      feature: "TEACHER_LIVE_MONITORING",
      isEnabled: false,
    });

    expect(upserts).toEqual([
      { feature: "TEACHER_LIVE_MONITORING", isEnabled: false },
    ]);
  });
});
