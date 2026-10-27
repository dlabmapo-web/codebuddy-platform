import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { NativePool } from './native-pool.mjs';
import { prototypeBudget } from './budget.mjs';

function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function fixture() {
  const created = [], executions = [], removals = [];
  const driver = {
    prepare: async entry => { entry.identity = Symbol(); created.push(entry); },
    execute: (entry, request) => {
      const pending = deferred(); executions.push({ entry, request, pending });
      request.signal.addEventListener('abort', () => pending.reject(new Error('cancelled')), { once: true });
      return pending.promise;
    },
    remove: async entry => { removals.push(entry); },
  };
  return { driver, created, executions, removals, pool: new NativePool(driver) };
}
const request = signal => ({ code: 'print(1)', stdin: '', memoryLimitMb: 256, timeLimitMs: 1000, signal });

test('bounded initial pool and fresh guests after every case', async () => {
  const f = fixture(); await f.pool.warmUp();
  assert.equal(f.pool.stats().allocated, 3);
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    const pending = f.pool.run(request()); await tick();
    const execution = f.executions.at(-1);
    assert.ok(!seen.has(execution.entry.identity)); seen.add(execution.entry.identity);
    execution.pending.resolve({ result: { outcome: 'PASSED' } }); await pending; await tick();
    assert.ok(f.pool.stats().allocated <= 3);
  }
  await f.pool.dispose(); assert.equal(f.pool.stats().allocated, 0);
});

test('a third claim waits despite the ready spare; only two execute', async () => {
  const f = fixture(); await f.pool.warmUp();
  const jobs = [f.pool.run(request()), f.pool.run(request()), f.pool.run(request())]; await tick();
  assert.equal(f.executions.length, 2); assert.equal(f.pool.stats().active, 2); assert.equal(f.pool.stats().waiting, 1);
  f.executions[0].pending.resolve({}); await jobs[0]; await tick();
  assert.equal(f.executions.length, 3);
  f.executions[1].pending.resolve({}); f.executions[2].pending.resolve({}); await Promise.all(jobs); await f.pool.dispose();
});

test('case does not settle or release its physical slot before removal acknowledgement', async () => {
  const f = fixture(); const removal = deferred(); f.driver.remove = () => removal.promise; await f.pool.warmUp();
  let settled = false; const pending = f.pool.run(request()).then(() => { settled = true; }); await tick();
  f.executions[0].pending.resolve({}); await tick();
  assert.equal(settled, false); assert.equal(f.pool.stats().allocated, 3); assert.equal(f.pool.stats().draining, 1);
  removal.resolve(); await pending; await f.pool.dispose();
});

test('cancelled queued work never consumes a guest', async () => {
  const f = fixture(); await f.pool.warmUp();
  const jobs = [f.pool.run(request()), f.pool.run(request())]; const cancel = new AbortController();
  const queued = f.pool.run(request(cancel.signal)); const rejected = assert.rejects(queued, /cancelled/);
  cancel.abort(); await rejected; assert.equal(f.pool.stats().waiting, 0); assert.equal(f.executions.length, 2);
  for (const job of f.executions) job.pending.resolve({}); await Promise.all(jobs); await f.pool.dispose();
});

test('active cancellation retains its slot until the container is removed', async () => {
  const f = fixture(); const removal = deferred(); f.driver.remove = () => removal.promise; await f.pool.warmUp();
  const cancel = new AbortController(); const pending = f.pool.run(request(cancel.signal)); const rejected = assert.rejects(pending, /cancelled/);
  cancel.abort(); await tick(); assert.equal(f.pool.stats().draining, 1); assert.equal(f.pool.stats().active, 1);
  removal.resolve(); await rejected; await f.pool.dispose();
});

test('unconfirmed cleanup quarantines the guest and blocks subsequent admission', async () => {
  const f = fixture(); await f.pool.warmUp();
  const remove = f.driver.remove; f.driver.remove = entry => entry === f.executions[0]?.entry ? Promise.reject(new Error('cleanup failed')) : remove(entry);
  const pending = f.pool.run(request()); const rejected = assert.rejects(pending, /cleanup/); await tick();
  f.executions[0].pending.resolve({}); await rejected;
  assert.equal(f.pool.stats().allocated, 3); assert.equal(f.pool.stats().quarantined, 1); assert.equal(f.pool.stats().healthy, false);
  await assert.rejects(f.pool.run(request()), /cleanup/); await assert.rejects(f.pool.dispose(), /unconfirmed/);
});

test('shutdown during creation waits for known creations and removes them without refill', async () => {
  const f = fixture(); const creation = deferred(); f.driver.prepare = async entry => { f.created.push(entry); await creation.promise; };
  const warm = f.pool.warmUp(); await tick(); assert.equal(f.pool.stats().allocated, 3);
  const closing = f.pool.dispose(); creation.resolve(); await warm; await closing;
  assert.equal(f.created.length, 3); assert.equal(f.removals.length, 3); assert.equal(f.pool.stats().allocated, 0);
  await assert.rejects(f.pool.run(request()), /closed/);
});

test('uncertain creation failure cannot free a slot by pretending nothing exists', async () => {
  const f = fixture(); f.driver.prepare = async entry => { entry.uncertain = true; throw new Error('create uncertain'); };
  f.driver.remove = async () => { throw new Error('cleanup uncertain'); };
  await assert.rejects(f.pool.warmUp()); assert.equal(f.pool.stats().allocated, 3); assert.equal(f.pool.stats().quarantined, 3);
  await assert.rejects(f.pool.run(request())); await assert.rejects(f.pool.dispose());
});

test('four-worker experiment fits the combined budget and still reserves one unused physical slot', async () => {
  const budget = prototypeBudget(4);
  assert.equal(budget.totalMemoryMiB, 2048); assert.equal(budget.totalCpu, 2.25);
  assert.equal(budget.guestMemoryMiB, 320); assert.equal(budget.guestCount, 5);
  const f = fixture(); const pool = new NativePool(f.driver, budget); await pool.warmUp();
  const jobs = Array.from({ length: 5 }, () => pool.run(request())); await tick();
  assert.equal(pool.stats().allocated, 5); assert.equal(pool.stats().active, 4); assert.equal(pool.stats().waiting, 1);
  for (const execution of f.executions) execution.pending.resolve({}); await tick();
  assert.equal(f.executions.length, 5); f.executions[4].pending.resolve({});
  await Promise.all(jobs); await pool.dispose(); assert.equal(pool.stats().allocated, 0);
  assert.throws(() => prototypeBudget(8));
});
