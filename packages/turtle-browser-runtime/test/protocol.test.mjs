import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { validateBatch, validateEvent, validateControl } from '../src/protocol.mjs';
const line = { op: 'line', id: 1, x1: 0, y1: 0, x2: 100, y2: 0, color: '#e11d48', width: 5, duration: 0 };
const batch = { version: 1, kind: 'events', generation: 'current', sequence: 0, events: [line] };
test('valid 64 KiB programs survive JSON escaping while control messages stay finite and allowlisted', () => {
  const run = { version: 1, kind: 'run', generation: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', leaseUntil: Date.now() + 30000, source: '#\\"\n'.repeat(16000) };
  assert.equal(validateControl(run), true);
  assert.equal(validateControl({ ...run, source: 'a'.repeat(65537) }), false);
  assert.equal(validateControl({ ...run, leaseUntil: Infinity }), false);
  assert.equal(validateControl({ ...run, token: 'forbidden' }), false);
  assert.equal(validateControl({ version: 1, kind: 'stop', clear: true }), true);
  assert.equal(validateControl({ version: 1, kind: '__proto__' }), false);
});
test('only current ordered drawing data is admitted', () => {
  assert.equal(validateBatch(batch, 'current', 0), true);
  assert.equal(validateBatch(batch, 'old', 0), false);
  assert.equal(validateBatch(batch, 'current', 1), false);
  assert.equal(validateBatch({ ...batch, token: 'unexpected' }, 'current', 0), false);
});
test('non-finite coordinates and executable/oversized rendering values are denied', () => {
  for (const mutation of [{ x2: NaN }, { x2: Infinity }, { color: 'url(https://example.org)' }, { color: '<svg onload=evil()>' }, { id: -1 }, { width: -1 }, { duration: 1e9 }, { extra: 'field' }]) assert.equal(validateEvent({ ...line, ...mutation }), false);
  assert.equal(validateBatch({ ...batch, events: Array(257).fill(line) }, 'current', 0), false);
  assert.equal(validateEvent({ op: 'world', bounds: [0, 0, 0, 5] }), false);
  assert.equal(validateEvent({ op: 'output', text: 'x'.repeat(65536) }), false);
  assert.equal(validateEvent({ op: '__proto__' }), false);
});
test('real public helper modules satisfy the local Turtle model contract', () => {
  const result = spawnSync('python3', ['-B', new URL('./model_test.py', import.meta.url).pathname], { encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
