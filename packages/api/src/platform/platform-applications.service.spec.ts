import type { ResolvedListPlatformApplicationsInput } from "@cove/shared";
import { describe, expect, it, vi } from "vitest";

import type { PlatformAccessService } from "../authorization/platform-access.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { ProfileMediaService } from "../profile/profile-media.service.js";
import { PlatformApplicationsService } from "./platform-applications.service.js";

const identity = { authUserId: "operator" } as never;

type Row = {
  id: string;
  createdAt: Date;
  academy: { id: string; name: string; managers: number };
};

/**
 * A queue standing in for the database, filtered the way Prisma would.
 *
 * The one predicate it has to honour is the leaderless one — `memberships:
 * { none: { role: "MANAGER", status: "ACTIVE" } }` — because the ordering
 * these specs are about is built on it.
 */
function createService(rows: Row[]) {
  const matches = (where: Record<string, unknown>) => {
    const academy = where.academy as
      | { memberships?: unknown; NOT?: { memberships?: unknown } }
      | undefined;
    return rows.filter((row) => {
      if (academy?.memberships) return row.academy.managers === 0;
      if (academy?.NOT) return row.academy.managers > 0;
      return true;
    });
  };

  const findMany = vi.fn(
    ({
      where,
      orderBy,
      skip = 0,
      take,
    }: {
      where: Record<string, unknown>;
      orderBy?: { createdAt?: string }[];
      skip?: number;
      take?: number;
    }) => {
      const order = orderBy;
      const desc = order?.[0]?.createdAt === "desc";
      const page = [...matches(where)].sort(
        (left, right) =>
          (desc ? -1 : 1) *
            (left.createdAt.getTime() - right.createdAt.getTime()) ||
          left.id.localeCompare(right.id),
      );
      return Promise.resolve(
        page.slice(skip, skip + (take ?? page.length)).map((row) => ({
          id: row.id,
          message: null,
          status: "PENDING",
          approvedRole: null,
          reviewReason: null,
          createdAt: row.createdAt,
          reviewedAt: null,
          academy: {
            id: row.academy.id,
            name: row.academy.name,
            slug: row.academy.id,
            _count: { memberships: row.academy.managers },
          },
          user: {
            id: `user-${row.id}`,
            email: `${row.id}@example.com`,
            displayName: row.id,
            avatarUrl: null,
            avatarAsset: null,
          },
        })),
      );
    },
  );

  const prisma = {
    academyJoinRequest: {
      count: vi.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(matches(where).length),
      ),
      findMany,
    },
    academy: {
      count: vi.fn().mockResolvedValue(2),
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;

  const service = new PlatformApplicationsService(
    prisma,
    {
      requirePermission: vi.fn().mockResolvedValue({ userId: "operator" }),
    } as unknown as PlatformAccessService,
    { signMany: vi.fn().mockResolvedValue([]) } as unknown as ProfileMediaService,
  );
  return { service, prisma };
}

const at = (day: number) => new Date(`2026-08-${String(day).padStart(2, "0")}`);

const rows: Row[] = [
  // Newest, but nobody else can review it.
  { id: "c", createdAt: at(20), academy: { id: "empty", name: "Empty", managers: 0 } },
  { id: "a", createdAt: at(10), academy: { id: "run", name: "Running", managers: 1 } },
  { id: "b", createdAt: at(12), academy: { id: "run", name: "Running", managers: 2 } },
];

const query: ResolvedListPlatformApplicationsInput = {
  sort: "waiting",
  direction: "asc",
  page: 1,
  pageSize: 25,
};

describe("PlatformApplicationsService.list", () => {
  it("puts the applications nobody else can review first", async () => {
    const { service } = createService(rows);

    const result = await service.list(identity, query);

    // Not by date. An operator is not this platform's reviewer — managers are
    // — so a straight date sort would bury the one application that has no
    // reviewer but them under two a manager will clear this afternoon.
    expect(result.rows.map((row) => row.id)).toEqual(["c", "a", "b"]);
    expect(result.rows[0]?.academyHasManager).toBe(false);
  });

  it("does not repeat or skip a row across a page boundary", async () => {
    const { service } = createService(rows);

    const first = await service.list(identity, { ...query, pageSize: 2 });
    const second = await service.list(identity, {
      ...query,
      page: 2,
      pageSize: 2,
    });

    // The split at the leaderless total is the whole mechanism; a boundary
    // that double-counts is how an operator sees one applicant twice and
    // another never.
    expect(first.rows.map((row) => row.id)).toEqual(["c", "a"]);
    expect(second.rows.map((row) => row.id)).toEqual(["b"]);
  });

  it("counts an academy with only a suspended manager as leaderless", async () => {
    // The predicate asks for an ACTIVE manager, so a suspended one leaves the
    // academy with nobody who can review — which is what every other console
    // surface already means by leaderless.
    const { service, prisma } = createService(rows);
    await service.list(identity, query);

    expect(prisma.academyJoinRequest.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          academy: {
            memberships: { none: { role: "MANAGER", status: "ACTIVE" } },
          },
        }),
      }),
    );
  });

  it("leaves the leaderless rows in place when sorted by academy", async () => {
    // The operator asked a different question. Forcing the ordering anyway
    // would be ignoring what they clicked.
    const { service, prisma } = createService(rows);
    await service.list(identity, { ...query, sort: "academy" });

    const calls = (prisma.academyJoinRequest.findMany as ReturnType<typeof vi.fn>)
      .mock.calls;
    expect(calls).toHaveLength(1);
  });
});
