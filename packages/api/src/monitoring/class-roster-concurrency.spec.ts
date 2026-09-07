import { applyPresenceDelta, type PresenceEntry } from "@cove/shared";
import { describe, expect, it } from "vitest";

import type { MonitoringRedis } from "./monitoring.tokens.js";
import { PresenceRegistry } from "./presence.registry.js";

/**
 * A whole class publishing at once, which is the only load the roster ever
 * sees: every student in a lesson types within the same few seconds, and each
 * keystroke past the activity floor is another presence publish racing the
 * other nine.
 *
 * The registry's own rules are covered by `presence.registry.spec.ts`. What is
 * here is what only concurrency can break — that ten students produce ten rows
 * and not nine, that the counts a teacher reads are the counts the server
 * holds, and that the version protocol the client folds these deltas through
 * survives a delivery order it did not choose.
 */

const academyId = "20000000-0000-4000-8000-000000000001";
const classId = "50000000-0000-4000-8000-000000000001";
const materialId = "80000000-0000-4000-8000-000000000001";
const courseId = "90000000-0000-4000-8000-000000000001";
const CLASS_SIZE = 10;

const student = (n: number) =>
  `60000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;

/**
 * Redis behind one connection, which is what the API actually opens: commands
 * are answered in the order they were issued, so two handlers in flight keep
 * their order all the way through. Every command yields, or the publishes
 * would run to completion one at a time and race nothing.
 */
function serialRedis() {
  const strings = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const pending: Array<() => void> = [];
  let draining = false;

  const drain = () => {
    if (draining) return;
    draining = true;
    queueMicrotask(function step() {
      const next = pending.shift();
      if (!next) {
        draining = false;
        return;
      }
      next();
      queueMicrotask(step);
    });
  };

  const command = <T>(run: () => T): Promise<T> =>
    new Promise<T>((resolve) => {
      pending.push(() => resolve(run()));
      drain();
    });

  return {
    get: (key: string) => command(() => strings.get(key) ?? null),
    set: (key: string, value: string) =>
      command(() => (strings.set(key, value), "OK")),
    del: (key: string) => command(() => (strings.delete(key) ? 1 : 0)),
    mget: (...keys: string[]) =>
      command(() => keys.map((key) => strings.get(key) ?? null)),
    sadd: (key: string, ...members: string[]) =>
      command(() => {
        const set = sets.get(key) ?? new Set<string>();
        members.forEach((member) => set.add(member));
        sets.set(key, set);
        return members.length;
      }),
    srem: (key: string, ...members: string[]) =>
      command(() => {
        members.forEach((member) => sets.get(key)?.delete(member));
        return members.length;
      }),
    smembers: (key: string) => command(() => [...(sets.get(key) ?? [])]),
    incr: (key: string) =>
      command(() => {
        const next = Number(strings.get(key) ?? 0) + 1;
        strings.set(key, String(next));
        return next;
      }),
    psetex: (key: string, _ttlMs: number, value: string) =>
      command(() => (strings.set(key, value), "OK")),
    eval: () => command(() => null),
    on: () => undefined,
  } as unknown as MonitoringRedis;
}

type Delta = {
  classId: string;
  version: number;
  previousVersion: number;
  entry: PresenceEntry;
  onlineCount: number;
  solvingCount: number;
};

/** The gateway's `publishPresence`, in the shape that matters here. */
async function emitDelta(
  registry: PresenceRegistry,
  entry: PresenceEntry | null,
  emit: (delta: Delta) => void,
): Promise<void> {
  if (!entry) return;
  const version = await registry.nextVersion(academyId, classId);
  if (version === null) return;
  const snapshot = await registry.snapshot(academyId, classId);
  if (!snapshot) return;
  emit({
    classId,
    version,
    previousVersion: version - 1,
    entry,
    onlineCount: snapshot.onlineCount,
    solvingCount: snapshot.solvingCount,
  });
}

function beat(registry: PresenceRegistry, n: number) {
  return registry.publish({
    academyId,
    classId,
    studentMembershipId: student(n),
    socketGeneration: `generation-${n}`,
    materialId,
    courseId,
    visibility: "VISIBLE",
    active: true,
  });
}

describe("a class of ten on one roster", () => {
  it("shows every student solving, and the teacher applies every delta", async () => {
    const registry = new PresenceRegistry(serialRedis());
    let roster = { entries: [] as PresenceEntry[], version: 0 };
    let gaps = 0;

    // The teacher's hook, folding each delta the moment it lands rather than
    // after the class has stopped typing.
    const onDelta = (delta: Delta) => {
      const result = applyPresenceDelta(roster, delta);
      if (result.outcome === "gap") return void gaps++;
      if (result.outcome === "stale") return;
      roster = { entries: result.entries, version: result.version };
    };

    for (let round = 0; round < 5; round++) {
      await Promise.all(
        Array.from({ length: CLASS_SIZE }, async (_, index) => {
          const entry = await beat(registry, index + 1);
          await emitDelta(registry, entry, onDelta);
        }),
      );
    }

    const snapshot = await registry.snapshot(academyId, classId);
    expect(snapshot?.entries).toHaveLength(CLASS_SIZE);
    expect(snapshot?.solvingCount).toBe(CLASS_SIZE);
    // The roster the teacher is looking at, not merely the one Redis holds.
    expect(roster.entries).toHaveLength(CLASS_SIZE);
    expect(roster.entries.every((entry) => entry.state === "SOLVING")).toBe(true);
    // One connection answers in order, so nothing the class did should have
    // cost the teacher a resync. A regression here is a re-authorization and a
    // snapshot per keystroke, which is why the count is asserted and not just
    // the convergence above.
    expect(gaps).toBe(0);
  });

  it("recovers with one snapshot when a delta is delivered out of order", async () => {
    const registry = new PresenceRegistry(serialRedis());
    const deltas: Delta[] = [];
    for (let n = 1; n <= 3; n++) {
      await emitDelta(registry, await beat(registry, n), (delta) =>
        deltas.push(delta),
      );
    }

    let roster = { entries: [] as PresenceEntry[], version: 0 };
    let resyncs = 0;
    // Second and third swapped: whatever reorders them — another API instance,
    // a slow reply — the client must not apply a delta onto a roster that
    // never saw the one before it.
    for (const delta of [deltas[0]!, deltas[2]!, deltas[1]!]) {
      const result = applyPresenceDelta(roster, delta);
      if (result.outcome === "gap") {
        resyncs++;
        const snapshot = await registry.snapshot(academyId, classId);
        roster = { entries: snapshot!.entries, version: snapshot!.version };
        continue;
      }
      if (result.outcome === "stale") continue;
      roster = { entries: result.entries, version: result.version };
    }

    expect(resyncs).toBe(1);
    // Converged on all three regardless, which is what makes the resync a cost
    // rather than a correctness problem.
    expect(roster.entries).toHaveLength(3);
  });
});
