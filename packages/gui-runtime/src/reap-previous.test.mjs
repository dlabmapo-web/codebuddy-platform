import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reapPrevious } from './reap-previous.mjs';
test('startup waits for removal already in progress and tolerates disappearance', async () => {
  for (const exists of ['', 'container']) {
    let removes = 0;
    await reapPrevious(async (_signal, ...args) => {
      if (args.includes('--format')) return { stdout: JSON.stringify({ id: 'owned', pool: 'trial' }) };
      if (args[0] === 'rm') { removes++; if (removes === 1) throw new Error('already removing'); }
      return { stdout: args[0] === 'ps' ? exists : '' };
    }, 'trial', 'fixture-one', { pause: async () => {} });
    assert.equal(removes, exists ? 2 : 1);
  }
});
test('startup validates all ownership before deleting any container', async () => {
  let removes = 0;
  await assert.rejects(reapPrevious(async (_signal, ...args) => {
    if (args[0] === 'rm') removes++;
    return { stdout: [{ id: 'one', pool: 'trial' }, { id: 'two', pool: 'course' }].map(x => JSON.stringify(x)).join('\n') };
  }, 'trial', 'trial'), /cross-pool cleanup/);
  assert.equal(removes, 0);
});
test('startup cleanup obeys a single deadline across retries', async () => {
  const controller = new AbortController();
  await assert.rejects(reapPrevious(async (_signal, ...args) => {
    if (args.includes('--format')) return { stdout: JSON.stringify({ id: 'one', pool: 'trial' }) };
    if (args[0] === 'rm') throw new Error('pending');
    return { stdout: 'one' };
  }, 'trial', 'trial', { signal: controller.signal, pause: async () => controller.abort() }));
});
