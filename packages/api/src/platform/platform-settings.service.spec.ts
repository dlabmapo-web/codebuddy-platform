import { describe, expect, it, vi } from "vitest";

import { DEFAULT_POINT_POLICY } from "@cove/shared";

import { PlatformSettingsService } from "./platform-settings.service.js";

const identity = { authUserId: "operator" } as never;
const mapo = "10000000-0000-4000-8000-000000000001";
const seoul = "10000000-0000-4000-8000-000000000002";
const closed = "10000000-0000-4000-8000-000000000003";

/**
 * Three academies, each configured a different way, because the joins are
 * where this service can be wrong:
 *
 * - **Mapo** has written rows: two features and its own policy.
 * - **Seoul** has written nothing at all — no flag rows, no policy row. It is
 *   the case that produces gaps rather than answers if a join is wrong.
 * - **Closed** is archived, and is here because it must still appear.
 */
function createPrisma(
  overrides: {
    flags?: { academyId: string; feature: string; isEnabled: boolean }[];
    policies?: { academyId: string; solveHard: number }[];
  } = {},
) {
  const academies = [
    { id: closed, name: "Closed Academy", slug: "closed", status: "ARCHIVED" },
    { id: mapo, name: "D.Lab Mapo", slug: "mapo", status: "ACTIVE" },
    { id: seoul, name: "Cove Seoul", slug: "seoul", status: "ACTIVE" },
  ];
  const flags = overrides.flags ?? [
    { academyId: mapo, feature: "STUDENT_POINTS", isEnabled: true },
    { academyId: mapo, feature: "TEACHER_LIVE_MONITORING", isEnabled: false },
  ];
  return {
    academy: {
      count: vi.fn().mockResolvedValue(academies.length),
      findMany: vi.fn().mockResolvedValue(academies),
    },
    academyFeatureFlag: {
      findMany: vi.fn(({ where }: { where: { feature?: string } }) =>
        Promise.resolve(
          where.feature
            ? flags.filter((flag) => flag.feature === where.feature)
            : flags,
        ),
      ),
    },
    academyPointPolicy: {
      findMany: vi.fn().mockResolvedValue(
        (overrides.policies ?? [{ academyId: mapo, solveHard: 99 }]).map(
          (policy) => ({ ...DEFAULT_POINT_POLICY, ...policy }),
        ),
      ),
    },
  };
}

function createService(prisma: ReturnType<typeof createPrisma>) {
  const access = { requirePermission: vi.fn().mockResolvedValue(undefined) };
  return {
    service: new PlatformSettingsService(prisma as never, access as never),
    access,
  };
}

describe("every academy's features, in one board", () => {
  it("refuses a caller without platform read", async () => {
    const { service, access } = createService(createPrisma());
    await service.features(identity, {});
    expect(access.requirePermission).toHaveBeenCalledWith(
      "operator",
      "platform.academies.read",
    );
  });

  /*
   * The property the board rests on. An academy that never wrote a flag row
   * still has an answer for every feature, and it is "off" — a gap would be
   * drawn as missing data, which an operator cannot tell from off.
   */
  it("answers for every feature, including ones never written", async () => {
    const { service } = createService(createPrisma());
    const board = await service.features(identity, {});

    const never = board.rows.find((row) => row.academyId === seoul)!;
    expect(never.features).toHaveLength(4);
    expect(never.features.every((state) => state.isEnabled === false)).toBe(
      true,
    );
  });

  it("reads the rows an academy did write", async () => {
    const { service } = createService(createPrisma());
    const board = await service.features(identity, {});

    const written = board.rows.find((row) => row.academyId === mapo)!;
    expect(
      written.features.find((state) => state.feature === "STUDENT_POINTS")
        ?.isEnabled,
    ).toBe(true);
    expect(
      written.features.find(
        (state) => state.feature === "TEACHER_LIVE_MONITORING",
      )?.isEnabled,
    ).toBe(false);
  });

  /*
   * One query for every flag row, not one per academy. The board's whole
   * purpose is many rows, so a per-row read is the failure that only shows up
   * once a customer has forty academies.
   */
  it("reads the flags in one query however many academies there are", async () => {
    const prisma = createPrisma();
    const { service } = createService(prisma);
    await service.features(identity, {});

    expect(prisma.academyFeatureFlag.findMany).toHaveBeenCalledTimes(1);
  });

  it("keeps an archived academy on the board", async () => {
    const { service } = createService(createPrisma());
    const board = await service.features(identity, {});

    expect(board.rows.map((row) => row.academyId)).toContain(closed);
  });
});

describe("every academy's point policy, side by side", () => {
  it("gives an academy with no row the platform defaults, and says so", async () => {
    const { service } = createService(createPrisma());
    const board = await service.pointPolicies(identity, {});

    const never = board.rows.find((row) => row.academyId === seoul)!;
    expect(never.isDefault).toBe(true);
    expect(never.policy.solveHard).toBe(DEFAULT_POINT_POLICY.solveHard);
  });

  it("reads a stored policy and marks it as chosen", async () => {
    const { service } = createService(createPrisma());
    const board = await service.pointPolicies(identity, {});

    const written = board.rows.find((row) => row.academyId === mapo)!;
    expect(written.isDefault).toBe(false);
    expect(written.policy.solveHard).toBe(99);
  });

  /*
   * The numbers are meaningless without this. Two academies showing identical
   * defaults are a different fact depending on whether either of them pays
   * anybody, and the board cannot be compared until it says which.
   */
  it("reports whether the numbers pay anyone", async () => {
    const { service } = createService(createPrisma());
    const board = await service.pointPolicies(identity, {});

    expect(
      board.rows.find((row) => row.academyId === mapo)?.pointsEnabled,
    ).toBe(true);
    expect(
      board.rows.find((row) => row.academyId === seoul)?.pointsEnabled,
    ).toBe(false);
  });
});

describe("the board's ceiling", () => {
  it("says it is a subset rather than answering quietly", async () => {
    const prisma = createPrisma();
    prisma.academy.count.mockResolvedValue(500);
    const { service } = createService(prisma);

    const board = await service.features(identity, {});
    expect(board.total).toBe(500);
    expect(board.truncated).toBe(true);
  });

  it("is not truncated when every academy fits", async () => {
    const { service } = createService(createPrisma());
    const board = await service.features(identity, {});

    expect(board.truncated).toBe(false);
  });
});
