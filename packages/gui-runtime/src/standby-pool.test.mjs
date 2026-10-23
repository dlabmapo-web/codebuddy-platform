import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StandbyPool } from './standby-pool.mjs';
import { SessionScheduler } from './session-scheduler.mjs';
import { Telemetry } from './telemetry.mjs';
import { randomUUID } from 'node:crypto';
const profile = { runtimeImage: 'sha256:fixture', width: 1024, height: 640, memoryLimitMb: 512 };
const signal = () => new AbortController().signal;
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(r => setImmediate(r));
function setup(options = {}) {
  const live = new Set(), used = new Set();
  const driver = {
    async prepare(e) { e.id = randomUUID(); live.add(e.id); },
    async inspect(e) { assert(live.has(e.id)); assert(!used.has(e.id)); },
    async remove(e) { live.delete(e.id); },
    ...options.driver,
  };
  const telemetry = new Telemetry();
  const pool = new StandbyPool({ enabled: true, capacity: 1, profile, telemetry, ...options, driver });
  return { pool, driver, live, used, telemetry };
}
test('ready containers are claimed once, replaced and never returned after use', async () => {
  const { pool, used } = setup(); pool.refill(); await tick();
  assert.equal(pool.status().ready, 1);
  const a = await pool.claim(profile, signal()); used.add(a.id);
  assert.equal(a.mode, 'warm'); pool.refill(); await tick();
  assert.equal(pool.status().allocated, 2);
  await pool.retire(a);
  const b = await pool.claim(profile, signal()); assert.notEqual(a.id, b.id);
  await pool.retire(b); await pool.close(); assert.equal(pool.entries.size, 0);
});
test('parallel claims and refill respect the physical two-slot bound', async () => {
  const { pool } = setup();
  const [a, b] = await Promise.all([pool.claim(profile, signal()), pool.claim(profile, signal())]);
  assert.notEqual(a, b); assert.equal(pool.entries.size, 2);
  pool.refill(); assert.equal(pool.entries.size, 2);
  await assert.rejects(pool.claim(profile, signal()), /capacity/);
  await pool.close();
});
test('claim awaits the existing builder instead of creating another', async () => {
  const wait = deferred(); let creates = 0;
  const { pool } = setup({ driver: { async prepare(e) { creates++; e.id = e.name; await wait.promise; }, async inspect() {} } });
  pool.refill(); pool.refill();
  const claiming = pool.claim(profile, signal()); assert.equal(creates, 1);
  wait.resolve(); const e = await claiming; assert.equal(e.mode, 'cold');
  await pool.close();
});
test('failed cleanup keeps its slot and prevents new allocation until reconciliation', async () => {
  let fail = true;
  const { pool } = setup({ driver: { async remove() { if (fail) throw new Error('busy'); } } });
  const e = await pool.claim(profile, signal()); await pool.retire(e);
  assert.equal(pool.entries.size, 1); assert.equal(pool.status().healthy, false);
  await assert.rejects(pool.claim(profile, signal()), /cleanup pending/);
  fail = false; await pool.reconcile(); await pool.close(); assert.equal(pool.entries.size, 0);
});
test('an unknown create cannot release capacity even after apparent removal', async () => {
  const { pool } = setup({ driver: { async prepare() { throw Object.assign(new Error('timeout'), { uncertain: true }); } } });
  await assert.rejects(pool.claim(profile, signal())); await tick();
  assert.equal(pool.status().uncertain, 1); assert.equal(pool.status().healthy, false);
  await pool.reconcile(); assert.equal(pool.entries.size, 1);
  await pool.close(); assert.equal(pool.entries.size, 1);
});
test('security failures fail closed, including during a warm claim reinspection', async () => {
  let fail = false;
  const { pool } = setup({ driver: { async inspect() { if (fail) throw Object.assign(new Error('isolation'), { integrity: true }); } } });
  pool.refill(); await tick(); fail = true;
  await assert.rejects(pool.claim(profile, signal()), /isolation/);
  assert.equal(pool.status().healthy, false); pool.refill(); assert.equal(pool.entries.size, 0);
  await pool.close();
});
test('a dead unused standby is removed and replaced through the cold path', async () => {
  let fail = true;
  const { pool } = setup({ driver: { async inspect() { if (fail) { fail = false; throw Object.assign(new Error('dead'), { unavailable: true }); } } } });
  pool.refill(); await tick(); const old = [...pool.entries][0];
  const next = await pool.claim(profile, signal()); assert.notEqual(next.id, old.id);
  assert.equal(next.mode, 'cold'); assert.equal(pool.status().healthy, true); await pool.close();
});
test('idle expiry removes the old standby before replacement', async () => {
  let now = 1; const { pool } = setup({ now: () => now, ttl: 10 });
  pool.refill(); await tick(); const old = [...pool.entries][0]; now = 20;
  const next = await pool.claim(profile, signal()); assert.notEqual(old.id, next.id);
  assert(!pool.entries.has(old)); await pool.close();
});
test('a different runtime profile is never assigned a prepared standby', async () => {
  const { pool } = setup(); pool.refill(); await tick();
  const other = await pool.claim({ ...profile, runtimeImage: 'sha256:other' }, signal());
  assert.equal(other.profile.runtimeImage, 'sha256:other'); assert.equal(other.mode, 'cold');
  assert.equal(pool.status().ready, 1); await pool.close();
});
test('cancelling a claim after preparation removes rather than returns it', async () => {
  const wait = deferred(); const controller = new AbortController();
  const { pool } = setup({ driver: { async inspect() { await wait.promise; } } });
  const claiming = pool.claim(profile, controller.signal); await tick(); controller.abort(); wait.resolve();
  await assert.rejects(claiming); assert.equal(pool.entries.size, 0); await pool.close();
});
test('cancellation during creation waits for acknowledgement and retires the known container', async () => {
  const wait = deferred(), controller = new AbortController();
  const { pool, live, telemetry } = setup({ driver: { async prepare(e) {
    await wait.promise; e.id = e.name; live.add(e.id);
    if (e.cancelled) throw new Error('cancelled');
  } } });
  const claiming = pool.claim(profile, controller.signal); await tick(); controller.abort();
  assert.equal(pool.entries.size, 1); assert.equal(pool.status().uncertain, 0);
  wait.resolve(); await assert.rejects(claiming); await tick();
  assert.equal(pool.status().healthy, true); assert.equal(live.size, 0);
  assert.equal(telemetry.counters.get('prepare_failure') || 0, 0); await pool.close();
});
test('shutdown awaits an in-flight builder and removes its late result', async () => {
  const wait = deferred();
  const { pool, live } = setup({ driver: { async prepare(e) { await wait.promise; e.id = e.name; live.add(e.id); } } });
  pool.refill(); const closing = pool.close(); wait.resolve(); await closing; await tick();
  assert.equal(pool.status().ready, 0); assert.equal(live.size, 0); assert.equal(pool.entries.size, 0);
});
test('three preparation failures open a bounded circuit and recover after cooldown', async () => {
  let now = 100, fail = true;
  const { pool } = setup({ now: () => now, driver: { async prepare(e) { if (fail) throw new Error('failed'); e.id = e.name; }, async inspect() {} } });
  for (let i = 0; i < 3; i++) {
    pool.refill(); await tick(); now = pool.retryAt + 1;
  }
  assert.equal(pool.failures.length, 3); assert(pool.retryAt > 60000);
  fail = false; pool.refill(); await tick(); assert.equal(pool.status().ready, 1); await pool.close();
});
test('cold-only mode never prepares speculative containers', async () => {
  const { pool } = setup({ enabled: false }); pool.refill(); assert.equal(pool.entries.size, 0);
  const a = await pool.claim(profile, signal()); await assert.rejects(pool.claim(profile, signal()), /capacity/);
  await pool.retire(a); pool.refill(); assert.equal(pool.entries.size, 0); await pool.close();
});
test('scheduler dispatches FIFO immediately after confirmed retirement, including closed sessions', async () => {
  const a = { id: 'a', state: 'QUEUED' }, b = { id: 'b', state: 'QUEUED' }, c = { id: 'c', state: 'QUEUED' };
  const launched = [], sessions = new Map([['a', a], ['b', b], ['c', c]]);
  const scheduler = new SessionScheduler(sessions, 1, async s => { launched.push(s.id); });
  scheduler.dispatch(); a.closed = true; scheduler.dispatch(); assert.deepEqual(launched, ['a']);
  scheduler.release(a); assert.deepEqual(launched, ['a', 'b']); scheduler.release(b); assert.deepEqual(launched, ['a', 'b', 'c']);
});
test('unhealthy pool or shutdown prevents dispatch', () => {
  const a = { state: 'QUEUED' }; const scheduler = new SessionScheduler(new Map([['a', a]]), 1, () => assert.fail(), () => false);
  scheduler.dispatch(); assert.equal(scheduler.active, 0);
});
test('slot names survive broker generations while immutable identities remain fresh', async () => {
  const one = setup(), two = setup();
  const a = await one.pool.claim(profile, signal()), b = await two.pool.claim(profile, signal());
  assert.equal(a.name, b.name); assert.notEqual(a.id, b.id);
  await one.pool.close(); await two.pool.close();
});
test('inventory removes an unassigned container from an earlier generation', async () => {
  const orphan = { id: 'orphan', name: 'cove-gui-trial-slot-1', generation: 'old', mode: 'cold' };
  let removed = false;
  const { pool } = setup({ driver: { async inventory() { return removed ? [] : [orphan]; }, async remove(e) { assert.equal(e.id, 'orphan'); removed = true; } } });
  await pool.reconcile(false); assert(removed); assert.equal(pool.entries.size, 0); await pool.close();
});
test('inventory never treats an in-flight current slot as an orphan', async () => {
  const wait = deferred(); let pool;
  const result = setup({ driver: { async prepare(e) { await wait.promise; e.id = 'current'; }, async inspect() {},
    async inventory() { return [{ id: 'current', name: [...pool.entries][0].name, generation: pool.generation, mode: 'cold' }]; },
    async remove() {} } });
  pool = result.pool; pool.refill(); await pool.reconcile(false);
  assert.equal(pool.status().healthy, true); assert.equal(pool.entries.size, 1);
  wait.resolve(); await pool.close();
});
test('orphan removal failure retains capacity and blocks further admission', async () => {
  const { pool } = setup({ driver: { async inventory() { return [{ id: 'old', name: 'old', generation: 'old', mode: 'cold' }]; }, async remove() { throw new Error('unavailable'); } } });
  await pool.reconcile(false); assert.equal(pool.status().healthy, false); assert.equal(pool.entries.size, 1);
  await assert.rejects(pool.claim(profile, signal())); await pool.close();
});
test('an inventory snapshot racing acknowledged teardown does not poison readiness', async () => {
  const wait = deferred();
  const { pool } = setup({ driver: { async inventory() { return wait.promise; } } });
  const e = await pool.claim(profile, signal());
  const reconciling = pool.reconcile(false);
  await pool.retire(e);
  wait.resolve([{ id: e.id, name: e.name, generation: pool.generation, mode: 'cold' }]);
  await reconciling; assert.equal(pool.status().healthy, true); assert.equal(pool.entries.size, 0); await pool.close();
});
