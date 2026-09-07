import { describe, expect, it, vi } from "vitest";
import { DEFAULT_POINT_POLICY } from "@cove/shared";

import { PointPolicyService } from "./point-policy.service.js";

const academyId = "20000000-0000-4000-8000-000000000001";
const identity = { authUserId: "auth-1" } as never;

const custom = { ...DEFAULT_POINT_POLICY, solveHard: 25, studentDailyCap: 200 };

function createService(row: Record<string, unknown> | null = null) {
  const audits: { action: string; before: unknown; after: unknown }[] = [];
  const upserts: unknown[] = [];
  const deletes: unknown[] = [];
  const transaction = {
    academyPointPolicy: {
      findUnique: vi.fn().mockResolvedValue(row),
      upsert: vi.fn().mockImplementation((args) => {
        upserts.push(args);
        return Promise.resolve({});
      }),
      deleteMany: vi.fn().mockImplementation((args) => {
        deletes.push(args);
        return Promise.resolve({ count: 1 });
      }),
    },
  };
  const prisma = {
    academyPointPolicy: { findUnique: vi.fn().mockResolvedValue(row) },
    $transaction: vi.fn().mockImplementation((fn) => fn(transaction)),
  };
  const requireManager = vi.fn().mockResolvedValue({ userId: "u1" });
  const service = new PointPolicyService(
    prisma as never,
    { requireManager } as never,
    {
      write: vi.fn().mockImplementation((_tx, input) => {
        audits.push({
          action: input.action,
          before: input.before,
          after: input.after,
        });
        return Promise.resolve({});
      }),
    } as never,
  );
  return { service, audits, upserts, deletes, requireManager };
}

/** A stored row carries its key and timestamps beside the seventeen values. */
const storedRow = {
  academyId,
  ...custom,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("PointPolicyService.get", () => {
  it("serves the defaults, and says nobody has chosen", async () => {
    // The state every academy is in today: the table is empty and the column
    // defaults are the economy.
    const { service } = await createService(null);

    expect(await service.get(identity, { academyId })).toEqual({
      policy: DEFAULT_POINT_POLICY,
      isCustom: false,
    });
  });

  it("serves the row when there is one, without its key or timestamps", async () => {
    const { service } = createService(storedRow);

    const state = await service.get(identity, { academyId });

    expect(state).toEqual({ policy: custom, isCustom: true });
    expect(Object.keys(state.policy)).not.toContain("academyId");
  });

  it("is a manager's read, not a member's", async () => {
    const { service, requireManager } = createService();
    requireManager.mockRejectedValueOnce(new Error("denied"));

    await expect(service.get(identity, { academyId })).rejects.toThrow("denied");
  });
});

describe("PointPolicyService.update", () => {
  it("creates the row on the first save and writes the whole policy", async () => {
    const { service, upserts, audits } = createService(null);

    await service.update(identity, { academyId, policy: custom });

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      where: { academyId },
      create: { academyId, ...custom },
      update: custom,
    });
    // No `before`: the academy had never chosen, which is a different fact
    // from having chosen the defaults.
    expect(audits).toEqual([
      { action: "academy.point_policy.updated", before: undefined, after: custom },
    ]);
  });

  it("records what the values were when there was a row", async () => {
    const { service, audits } = createService(storedRow);

    const next = { ...custom, solveHard: 40 };
    await service.update(identity, { academyId, policy: next });

    expect(audits[0]?.before).toEqual(custom);
    expect(audits[0]?.after).toEqual(next);
  });

  it("refuses anybody the manager guard refuses", async () => {
    const { service, requireManager, upserts } = createService();
    requireManager.mockRejectedValueOnce(new Error("MANAGER_OPERATIONS_ACCESS_DENIED"));

    await expect(
      service.update(identity, { academyId, policy: custom }),
    ).rejects.toThrow("MANAGER_OPERATIONS_ACCESS_DENIED");
    expect(upserts).toHaveLength(0);
  });
});

describe("PointPolicyService.reset", () => {
  it("deletes the row rather than writing the defaults into it", async () => {
    // The difference matters later: an academy with no row follows any future
    // change to `DEFAULT_POINT_POLICY`, and one holding a copy of today's
    // values does not.
    const { service, deletes, audits } = createService(storedRow);

    await service.reset(identity, { academyId });

    expect(deletes).toEqual([{ where: { academyId } }]);
    expect(audits).toEqual([
      {
        action: "academy.point_policy.reset",
        before: custom,
        after: undefined,
      },
    ]);
  });

  it("is a no-op for an academy that never chose", async () => {
    const { service, deletes, audits } = createService(null);

    const state = await service.reset(identity, { academyId });

    expect(deletes).toHaveLength(0);
    expect(audits).toHaveLength(0);
    expect(state).toEqual({ policy: DEFAULT_POINT_POLICY, isCustom: false });
  });
});
