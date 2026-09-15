import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WatchSessionRegistry, type WatchLease } from "./watch-session.registry.js";

// Explicit opt-in: use a disposable Redis, never the application's live database.
const url = process.env.MONITORING_TEST_REDIS_URL;
describe.skipIf(!url)("watch leases on real Redis", () => {
  let redis: Redis;
  let other: Redis;
  let a: WatchSessionRegistry;
  let b: WatchSessionRegistry;
  const prefix = randomUUID();
  function lease(overrides: Partial<WatchLease> = {}): WatchLease {
    return { visitId: randomUUID(), sessionId: randomUUID(), generation: 1,
      teacherMembershipId: prefix, academyId: prefix, classId: prefix,
      studentMembershipId: randomUUID(), draftId: randomUUID(), mode: "MONITORING", ...overrides };
  }
  beforeAll(() => { redis = new Redis(url!); other = new Redis(url!); a = new WatchSessionRegistry(redis); b = new WatchSessionRegistry(other); });
  afterAll(async () => { await redis.quit(); await other.quit(); });
  it("keeps five independent sessions across two clients", async () => {
    const watches = Array.from({ length: 5 }, () => lease());
    await Promise.all(watches.map((watch, i) => (i % 2 ? a : b).register(watch)));
    const found = await a.list({ teacherMembershipId: prefix });
    for (const watch of watches) expect(found.some((row) => row.visitId === watch.visitId)).toBe(true);
    await a.end(watches[0]!);
    expect(await b.isCurrent(watches[1]!)).not.toBeNull();
  });
  it("fences a superseded lease before asynchronous cleanup", async () => {
    const first = lease();
    await a.register(first);
    const second = { ...first, visitId: randomUUID(), generation: 2 };
    await b.register(second);
    expect(await a.renew(first, "HELPING")).toBe(false);
    expect(await a.isCurrent(first)).toBeNull();
    expect(await a.watcherCount(first.draftId)).toBe(1);
    await a.end(first);
    expect(await b.isCurrent(second)).not.toBeNull();
  });
  it("renews every index along with the lease", async () => {
    const watch = lease();
    await a.register(watch);
    const index = `cove:mon:watch-by-draft:${watch.draftId}`;
    await redis.pexpire(index, 1000);
    expect(await b.renew(watch)).toBe(true);
    expect(await redis.pttl(index)).toBeGreaterThan(300_000);
    // Renewal also repairs an index lost before renewal.
    await redis.del(index);
    await b.renew(watch);
    expect(await a.watcherCount(watch.draftId)).toBe(1);
  });
  it("does not resurrect an expired lease", async () => {
    const watch = lease(); await a.register(watch);
    await redis.del(`cove:mon:watch:${watch.visitId}`);
    expect(await a.renew(watch)).toBe(false);
    expect(await b.watcherCount(watch.draftId)).toBe(0);
  });
  it("orders summaries atomically with mode changes", async () => {
    const watch = lease(); await a.register(watch);
    const scope = { academyId: watch.academyId, studentMembershipId: watch.studentMembershipId, classId: null, draftId: watch.draftId };
    const before = await a.summarize(scope);
    await b.renew(watch, "HELPING");
    const after = await b.summarize(scope);
    expect(after.revision).toBeGreaterThan(before.revision);
    expect(after.helpingCount).toBe(1);
    await a.end(watch);
    expect((await b.summarize(scope)).watcherCount).toBe(0);
  });
  it("concurrent starts converge on the highest generation", async () => {
    const initial = lease();
    const contenders = Array.from({ length: 20 }, (_, i) => ({ ...initial, visitId: randomUUID(), generation: i + 1 }));
    await Promise.all(contenders.map((watch, i) => (i % 2 ? a : b).register(watch)));
    expect(await a.watcherCount(initial.draftId)).toBe(1);
    expect(await a.isCurrent(contenders[19]!)).not.toBeNull();
    for (const old of contenders.slice(0, -1)) expect(await b.renew(old)).toBe(false);
  });
});
