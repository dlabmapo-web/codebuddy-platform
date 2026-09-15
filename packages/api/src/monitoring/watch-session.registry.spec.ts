import { describe, expect, it } from "vitest";

import {
  WatchSessionRegistry,
  type WatchLease,
} from "./watch-session.registry.js";
import { createRedisDouble } from "./redis-double.js";

const academyId = "20000000-0000-4000-8000-000000000001";
const classId = "50000000-0000-4000-8000-000000000001";
const teacherMembershipId = "40000000-0000-4000-8000-000000000001";
const studentMembershipId = "60000000-0000-4000-8000-000000000001";
const draftId = "a0000000-0000-4000-8000-000000000001";

function createRegistry() {
  const redis = createRedisDouble();
  return { registry: new WatchSessionRegistry(redis as never), redis };
}

function leaseFor(overrides: Partial<WatchLease> = {}): WatchLease {
  return {
    visitId: "visit-1",
    sessionId: "session-1",
    generation: 1,
    teacherMembershipId,
    academyId,
    classId,
    studentMembershipId,
    draftId,
    mode: "MONITORING",
    ...overrides,
  };
}

/** Opens one watch for a distinct tab, the way five browser tabs would. */
async function openTab(
  registry: WatchSessionRegistry,
  index: number,
  overrides: Partial<WatchLease> = {},
) {
  const lease = leaseFor({
    visitId: `visit-${index}`,
    sessionId: `session-${index}`,
    ...overrides,
  });
  const result = await registry.register(lease);
  return { lease, result };
}

describe("independent sessions", () => {
  it("keeps two watches when a second tab opens", async () => {
    const { registry } = createRegistry();
    await openTab(registry, 1, { studentMembershipId: "student-a" });
    await openTab(registry, 2, { studentMembershipId: "student-b" });

    const open = await registry.list({ teacherMembershipId });
    expect(open.map((lease) => lease.visitId).sort()).toEqual([
      "visit-1",
      "visit-2",
    ]);
  });

  /** The browser acceptance target, asserted where it is cheap to assert. */
  it("keeps all five leases for five students", async () => {
    const { registry } = createRegistry();
    for (let index = 1; index <= 5; index += 1) {
      await openTab(registry, index, { studentMembershipId: `student-${index}` });
    }
    expect(await registry.list({ teacherMembershipId })).toHaveLength(5);
  });

  /**
   * Duplicate tabs on one student, which the previous singleton made
   * impossible: the second tab took the teacher's one slot and the first was
   * disconnected.
   */
  it("keeps both watches when two tabs watch the same student", async () => {
    const { registry } = createRegistry();
    await openTab(registry, 1);
    await openTab(registry, 2);

    expect(await registry.watcherCount(draftId)).toBe(2);
  });

  it("ending one duplicate leaves the other watching", async () => {
    const { registry } = createRegistry();
    const first = await openTab(registry, 1);
    await openTab(registry, 2);

    await registry.end(first.lease);

    expect(await registry.watcherCount(draftId)).toBe(1);
    const summary = await registry.summarize({
      academyId,
      classId,
      studentMembershipId,
      draftId,
    });
    expect(summary.indicator).toBe("MONITORING");
  });
});

describe("generations and fencing", () => {
  it("replaces only the visit its own session held", async () => {
    const { registry } = createRegistry();
    await openTab(registry, 1, { studentMembershipId: "student-a" });
    await openTab(registry, 2, { studentMembershipId: "student-b" });

    // Session 1 reconnects: a new visit, a higher generation, same session.
    const generation = await registry.nextGeneration(
      teacherMembershipId,
      "session-1",
    );
    const reconnect = await registry.register(
      leaseFor({
        visitId: "visit-1b",
        sessionId: "session-1",
        generation: generation + 1,
        studentMembershipId: "student-a",
      }),
    );

    expect(reconnect.replacedVisitId).toBe("visit-1");
    // The other tab is untouched.
    expect(await registry.read("visit-2")).not.toBeNull();
  });

  it("refuses a start the session has already superseded", async () => {
    const { registry } = createRegistry();
    await registry.register(leaseFor({ visitId: "visit-new", generation: 5 }));

    const late = await registry.register(
      leaseFor({ visitId: "visit-old", generation: 3 }),
    );

    expect(late.ok).toBe(false);
    expect(await registry.read("visit-new")).not.toBeNull();
  });

  it("does not let an old generation's stop close its replacement", async () => {
    const { registry } = createRegistry();
    await registry.register(leaseFor({ visitId: "visit-1", generation: 2 }));

    const closed = await registry.end({ ...leaseFor(), generation: 1 });

    expect(closed).toBe(false);
    expect(await registry.read("visit-1")).not.toBeNull();
  });

  it("refuses renewal from a superseded generation", async () => {
    const { registry } = createRegistry();
    await registry.register(leaseFor({ generation: 2 }));
    await expect(
      registry.renew({ ...leaseFor(), generation: 1 }),
    ).resolves.toBe(false);
  });

  /** Identity is all three values; the visit alone is not enough. */
  it("rejects a matching visit under a different session", async () => {
    const { registry } = createRegistry();
    await registry.register(leaseFor());
    await expect(
      registry.isCurrent({
        visitId: "visit-1",
        generation: 1,
        sessionId: "someone-else",
      }),
    ).resolves.toBeNull();
  });

  it("allocates strictly increasing generations for one session", async () => {
    const { registry } = createRegistry();
    const first = await registry.nextGeneration(teacherMembershipId, "session-1");
    const second = await registry.nextGeneration(teacherMembershipId, "session-1");
    expect(second).toBeGreaterThan(first);
  });
});

describe("modes and the aggregate summary", () => {
  it("defaults to monitoring and reports it", async () => {
    const { registry } = createRegistry();
    await registry.register(leaseFor());
    const summary = await registry.summarize({
      academyId,
      classId,
      studentMembershipId,
      draftId,
    });
    expect(summary).toMatchObject({
      watcherCount: 1,
      helpingCount: 0,
      indicator: "MONITORING",
    });
  });

  it("reports helping when any one watch enables editing", async () => {
    const { registry } = createRegistry();
    const first = await openTab(registry, 1);
    await openTab(registry, 2);

    await registry.renew(first.lease, "HELPING");

    const summary = await registry.summarize({
      academyId,
      classId,
      studentMembershipId,
      draftId,
    });
    expect(summary).toMatchObject({
      watcherCount: 2,
      helpingCount: 1,
      indicator: "HELPING",
    });
  });

  it("returns to monitoring when the helping watch steps back", async () => {
    const { registry } = createRegistry();
    const first = await openTab(registry, 1);
    await registry.renew(first.lease, "HELPING");
    await registry.renew(first.lease, "MONITORING");

    const summary = await registry.summarize({
      academyId,
      classId,
      studentMembershipId,
      draftId,
    });
    expect(summary.indicator).toBe("MONITORING");
  });

  it("reports nobody watching once the last watch ends", async () => {
    const { registry } = createRegistry();
    const only = await openTab(registry, 1);
    await registry.end(only.lease);

    const summary = await registry.summarize({
      academyId,
      classId,
      studentMembershipId,
      draftId,
    });
    expect(summary).toMatchObject({ watcherCount: 0, indicator: "NONE" });
  });

  /** A late summary must be discardable, so the revision has to advance. */
  it("advances the revision on every summary", async () => {
    const { registry } = createRegistry();
    await registry.register(leaseFor());
    const scope = { academyId, classId, studentMembershipId, draftId };
    const first = await registry.summarize(scope);
    const second = await registry.summarize(scope);
    expect(second.revision).toBeGreaterThan(first.revision);
  });

  /**
   * One counter per student, never per class.
   *
   * The gateway pushes summaries per class and the student fetches across
   * classes; two counters would produce incomparable sequences and a client
   * would discard whichever arrived second.
   */
  it("shares one revision sequence across a student's classes", async () => {
    const { registry } = createRegistry();
    await registry.register(leaseFor());
    const byClass = await registry.summarize({
      academyId,
      classId,
      studentMembershipId,
      draftId,
    });
    const byStudent = await registry.summarize({
      academyId,
      classId: null,
      studentMembershipId,
      draftId,
    });
    expect(byStudent.revision).toBe(byClass.revision + 1);
  });
});

describe("expiry and crashed owners", () => {
  it("stops counting a lease whose owner stopped renewing", async () => {
    const { registry, redis } = createRegistry();
    await openTab(registry, 1);
    await openTab(registry, 2);

    // The API holding visit-1 crashed: nothing renews, and the key lapses.
    redis.expireNow(`cove:mon:watch:visit-1`);

    expect(await registry.watcherCount(draftId)).toBe(1);
  });

  it("prunes the expired member out of the index it read", async () => {
    const { registry, redis } = createRegistry();
    await openTab(registry, 1);
    redis.expireNow(`cove:mon:watch:visit-1`);

    await registry.watcherCount(draftId);

    expect(redis.smembers(`cove:mon:watch-by-draft:${draftId}`)).toEqual([]);
  });

  it("renewal of an expired lease fails rather than resurrecting it", async () => {
    const { registry, redis } = createRegistry();
    const only = await openTab(registry, 1);
    redis.expireNow(`cove:mon:watch:visit-1`);

    await expect(registry.renew(only.lease)).resolves.toBe(false);
  });
});

describe("scoped enumeration", () => {
  it("finds a scope's watches without touching another class's", async () => {
    const { registry } = createRegistry();
    await openTab(registry, 1);
    await openTab(registry, 2, {
      classId: "other-class",
      studentMembershipId: "other-student",
      draftId: "other-draft",
    });

    const scoped = await registry.list({ academyId, classId });
    expect(scoped.map((lease) => lease.visitId)).toEqual(["visit-1"]);
  });

  it("ends a lease known only by its visit id", async () => {
    const { registry } = createRegistry();
    await openTab(registry, 1);
    const ended = await registry.endByVisitId("visit-1");
    expect(ended?.draftId).toBe(draftId);
    expect(await registry.watcherCount(draftId)).toBe(0);
  });

  it("treats an already-expired lease as nothing to end", async () => {
    const { registry } = createRegistry();
    await expect(registry.endByVisitId("never-existed")).resolves.toBeNull();
  });
});

describe("without Redis", () => {
  /**
   * Fails closed, in every direction.
   *
   * A watcher count that only counted this process would hand a student's
   * document back to local drafting while another instance's teacher was
   * still typing into it, so refusing is the only safe answer.
   */
  it("reports itself unavailable", () => {
    expect(new WatchSessionRegistry(null).isAvailable).toBe(false);
  });

  it("authorizes nothing", async () => {
    const registry = new WatchSessionRegistry(null);
    await expect(
      registry.isCurrent({
        visitId: "visit-1",
        generation: 1,
        sessionId: "session-1",
      }),
    ).resolves.toBeNull();
    await expect(registry.watcherCount(draftId)).resolves.toBe(0);
    await expect(registry.renew(leaseFor())).resolves.toBe(false);
  });

  it("refuses to open a watch rather than opening an unverifiable one", async () => {
    const registry = new WatchSessionRegistry(null);
    await expect(registry.register(leaseFor())).rejects.toThrow();
  });
});
