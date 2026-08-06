import { beforeEach, describe, expect, it, vi } from "vitest";
import { monitoringTiming } from "@cove/shared";

import type { MonitoringRedis } from "./monitoring.tokens.js";
import { PresenceRegistry } from "./presence.registry.js";

const academyId = "20000000-0000-4000-8000-000000000001";
const classId = "50000000-0000-4000-8000-000000000001";
const membershipId = "60000000-0000-4000-8000-000000000001";
const otherMembershipId = "60000000-0000-4000-8000-000000000002";
const materialId = "80000000-0000-4000-8000-000000000001";

/**
 * Enough Redis to exercise the registry's own logic: keys, a set index, and a
 * counter. Expiry is simulated by deleting a key, which is what a lapsed TTL
 * looks like from here.
 */
function fakeRedis() {
  const strings = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  return {
    strings,
    sets,
    get: vi.fn(async (key: string) => strings.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      strings.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (key: string) => (strings.delete(key) ? 1 : 0)),
    mget: vi.fn(async (...keys: string[]) =>
      keys.map((key) => strings.get(key) ?? null)
    ),
    sadd: vi.fn(async (key: string, ...members: string[]) => {
      const set = sets.get(key) ?? new Set<string>();
      members.forEach((member) => set.add(member));
      sets.set(key, set);
      return members.length;
    }),
    srem: vi.fn(async (key: string, ...members: string[]) => {
      const set = sets.get(key);
      members.forEach((member) => set?.delete(member));
      return members.length;
    }),
    smembers: vi.fn(async (key: string) => [...(sets.get(key) ?? [])]),
    incr: vi.fn(async (key: string) => {
      const next = Number(strings.get(key) ?? 0) + 1;
      strings.set(key, String(next));
      return next;
    }),
    eval: vi.fn(
      async (
        _script: string,
        _keyCount: number,
        key: string,
        generation: string,
        now: string,
      ) => {
        const raw = strings.get(key);
        if (!raw) return null;
        const stored = JSON.parse(raw) as {
          socketGeneration: string;
          interruptedAt: number | null;
        };
        if (stored.socketGeneration !== generation) return null;
        stored.interruptedAt = Number(now);
        const updated = JSON.stringify(stored);
        strings.set(key, updated);
        return updated;
      },
    ),
  };
}

function signal(overrides: Partial<Parameters<PresenceRegistry["publish"]>[0]> = {}) {
  return {
    academyId,
    classId,
    studentMembershipId: membershipId,
    socketGeneration: "generation-1",
    materialId,
    courseId: null,
    visibility: "VISIBLE" as const,
    active: true,
    ...overrides,
  };
}

describe("PresenceRegistry", () => {
  let redis: ReturnType<typeof fakeRedis>;
  let registry: PresenceRegistry;

  beforeEach(() => {
    redis = fakeRedis();
    registry = new PresenceRegistry(redis as unknown as MonitoringRedis);
  });

  it("derives the state from the signals rather than trusting a label", async () => {
    const entry = await registry.publish(signal());
    expect(entry?.state).toBe("SOLVING");
  });

  it("reports online when the workspace is not in the foreground", async () => {
    const entry = await registry.publish(signal({ visibility: "HIDDEN" }));
    expect(entry?.state).toBe("ONLINE");
  });

  it("does not move last activity on a heartbeat without activity", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-04T09:00:00.000Z"));
      await registry.publish(signal({ active: true }));
      vi.setSystemTime(new Date("2026-08-04T09:02:00.000Z"));
      const entry = await registry.publish(signal({ active: false }));
      // Two minutes of heartbeats with nothing happening is idle, and the
      // roster has to say so.
      expect(entry?.state).toBe("IDLE");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps an interrupted connection reconnecting inside the grace window", async () => {
    await registry.publish(signal());
    const entry = await registry.markInterrupted(
      academyId,
      classId,
      membershipId,
      "generation-1",
    );
    expect(entry?.state).toBe("RECONNECTING");
  });

  it("ignores an old tab's disconnect after a newer connection replaced it", async () => {
    await registry.publish(signal({ socketGeneration: "generation-2" }));
    const entry = await registry.markInterrupted(
      academyId,
      classId,
      membershipId,
      "generation-1",
    );
    expect(entry).toBeNull();
    expect((await registry.snapshot(academyId, classId))?.entries[0]?.state).toBe(
      "SOLVING",
    );
  });

  it("reports offline once the grace window has passed", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-04T09:00:00.000Z"));
      await registry.publish(signal());
      await registry.markInterrupted(academyId, classId, membershipId, "generation-1");
      vi.setSystemTime(
        new Date(Date.now() + monitoringTiming.recoveryGraceMs + 1_000),
      );
      const snapshot = await registry.snapshot(academyId, classId);
      expect(snapshot?.entries[0]?.state).toBe("OFFLINE");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not resurrect a connection whose key already expired", async () => {
    await registry.publish(signal());
    redis.strings.clear();
    const entry = await registry.markInterrupted(
      academyId,
      classId,
      membershipId,
      "generation-1",
    );
    expect(entry).toBeNull();
  });

  it("counts online and solving from the same snapshot", async () => {
    await registry.publish(signal());
    await registry.publish(
      signal({ studentMembershipId: otherMembershipId, visibility: "HIDDEN" }),
    );
    const snapshot = await registry.snapshot(academyId, classId);
    expect(snapshot?.entries).toHaveLength(2);
    expect(snapshot?.onlineCount).toBe(2);
    expect(snapshot?.solvingCount).toBe(1);
  });

  it("drops an expired entry and repairs the index in the same pass", async () => {
    await registry.publish(signal());
    await registry.publish(signal({ studentMembershipId: otherMembershipId }));
    redis.strings.delete(
      `cove:mon:presence:${academyId}:${classId}:${otherMembershipId}`,
    );

    const snapshot = await registry.snapshot(academyId, classId);
    expect(snapshot?.entries.map((entry) => entry.studentMembershipId)).toEqual([
      membershipId,
    ]);
    expect(redis.srem).toHaveBeenCalledWith(
      `cove:mon:presence-index:${academyId}:${classId}`,
      otherMembershipId,
    );
  });

  it("advances the version so a delta can be placed against it", async () => {
    await expect(registry.nextVersion(academyId, classId)).resolves.toBe(1);
    await expect(registry.nextVersion(academyId, classId)).resolves.toBe(2);
  });

  it("carries no source code, name, or email into a snapshot entry", async () => {
    await registry.publish(signal());
    const snapshot = await registry.snapshot(academyId, classId);
    const entry = snapshot!.entries[0]!;
    expect(Object.keys(entry).sort()).toEqual([
      "courseId",
      "lastActivityAt",
      "latestSubmissionId",
      "materialId",
      "run",
      "state",
      "stateExpiresAt",
      "studentMembershipId",
    ]);
  });

  it("is unavailable without Redis rather than pretending to be live", async () => {
    const offline = new PresenceRegistry(null);
    expect(offline.isAvailable).toBe(false);
    await expect(offline.snapshot(academyId, classId)).resolves.toBeNull();
  });

  it("latches into degraded after a failure instead of retrying every event", async () => {
    redis.get.mockRejectedValue(new Error("connection refused"));
    await registry.publish(signal());
    expect(registry.isAvailable).toBe(false);
    registry.recover();
    expect(registry.isAvailable).toBe(true);
  });
});
