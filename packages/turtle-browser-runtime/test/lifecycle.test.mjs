import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LocalTurtleRuntime } from '../src/runtime.mjs';
import { DrawingRenderer } from '../src/renderer.mjs';

let frames, frameId, clock;
function environment() {
  frames = new Map(); frameId = 0; clock = 0;
  globalThis.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  FakeWorker.all = []; globalThis.Worker = FakeWorker;
}
const step = () => { const pending = [...frames.values()]; frames.clear(); clock += 16; for (const fn of pending) fn(clock); };
const drain = () => { for (let i = 0; frames.size && i < 2000; i++) step(); assert.equal(frames.size, 0); };
function canvas(calls = []) {
  const context = new Proxy({}, { get: (_, key) => (...args) => { calls.push([key, ...args]); return key === 'getImageData' ? {} : undefined; }, set: () => true });
  return { width: 1024, height: 640, getContext: () => context, ownerDocument: { createElement: () => canvas(calls) } };
}
class FakeWorker {
  static all = [];
  constructor() { FakeWorker.all.push(this); this.dead = false; this.sent = []; }
  terminate() { this.dead = true; }
  postMessage(message) { this.sent.push(message); }
  event(data) { this.onmessage?.({ data: { version: 1, ...data } }); }
}
const generation = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const events = (sequence, ops) => ({ version: 1, kind: 'events', generation, sequence, events: ops });
const line = { op: 'line', id: 1, x1: 0, y1: 0, x2: 20, y2: 0, color: 'red', width: 1, duration: 0 };

test('fresh prepared workers, ordered error completion and disposal', async () => {
  environment(); const notified = [];
  const runtime = new LocalTurtleRuntime(canvas(), canvas(), m => notified.push(m));
  assert.equal(FakeWorker.all.length, 1);
  FakeWorker.all[0].event({ kind: 'ready' });
  await runtime.run({ generation, source: 'print(1)', leaseUntil: Date.now() + 30000 });
  assert.equal(FakeWorker.all.length, 2); assert.equal(FakeWorker.all[0].sent.length, 1);
  FakeWorker.all[0].event(events(0, [line, { op: 'output', text: 'after movement' }]));
  FakeWorker.all[0].event({ kind: 'failed', generation, message: 'main.py, line 2: ValueError' });
  FakeWorker.all[0].event(events(1, [{ op: 'output', text: 'late terminal output' }]));
  assert.equal(FakeWorker.all[0].dead, true);
  assert.equal(notified.some(m => m.kind === 'failed'), false);
  drain();
  assert.equal(notified.some(m => m.text === 'late terminal output'), false);
  assert.ok(notified.findIndex(m => m.kind === 'output') < notified.findIndex(m => m.kind === 'failed'));
  FakeWorker.all[1].event({ kind: 'ready' });
  await runtime.run({ generation: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', source: 'print(2)', leaseUntil: Date.now() + 30000 });
  assert.equal(FakeWorker.all.length, 3); assert.equal(FakeWorker.all[1].sent.length, 1);
  assert.equal(FakeWorker.all.filter(w => !w.dead).length, 2);
  runtime.dispose(); assert.equal(FakeWorker.all.filter(w => !w.dead).length, 0); assert.equal(frames.size, 0);
});

test('Stop during preparation cannot start a late worker; old outputs cannot affect a later run', async () => {
  environment(); const notified = [];
  const runtime = new LocalTurtleRuntime(canvas(), canvas(), m => notified.push(m));
  const starting = runtime.run({ generation, source: 'while True: pass', leaseUntil: Date.now() + 30000 });
  runtime.stop(); FakeWorker.all[0].event({ kind: 'ready' }); await starting;
  assert.equal(FakeWorker.all[0].sent.length, 0);
  await runtime.run({ generation, source: 'print(1)', leaseUntil: Date.now() + 30000 });
  const stale = FakeWorker.all[0]; runtime.stop(true);
  stale.event(events(0, [{ op: 'output', text: 'stale' }])); drain();
  assert.equal(notified.some(m => m.text === 'stale'), false); assert.equal(stale.dead, true);
  runtime.dispose();
});

test('renderer validates before queuing, preserves order, and cancels pending paints', () => {
  environment(); const calls = [], output = [];
  const renderer = new DrawingRenderer(canvas(calls), canvas(), { output: text => output.push(text) });
  renderer.reset(generation);
  assert.throws(() => renderer.accept(events(1, [line])), /Invalid drawing/);
  renderer.accept(events(0, [{ ...line, duration: 100 }, { op: 'output', text: 'done' }]));
  step(); assert.equal(output.length, 0); drain(); assert.deepEqual(output, ['done']);
  assert.ok(calls.some(([key]) => key === 'stroke'));
  renderer.accept(events(1, [{ ...line, duration: 100000 }, { op: 'output', text: 'late' }]));
  step(); renderer.stop(); drain(); assert.deepEqual(output, ['done']);
});

test('teaching animation paints before completion without a synchronous CPU pixel readback', () => {
  environment(); const calls = []; let painted = 0;
  const renderer = new DrawingRenderer(canvas(calls), canvas(), { painted: () => painted++ });
  renderer.reset(generation); renderer.accept(events(0, [{ ...line, duration: 1000 }]));
  step(); step(); step();
  assert.equal(painted, 1); assert.ok(renderer.head < renderer.queue.length);
  assert.equal(calls.some(([key]) => key === 'getImageData' || key === 'putImageData'), false);
  renderer.stop();
});

test('tracer/update, fill replay and clear preserve bounded scene order', () => {
  environment(); const calls = [];
  const renderer = new DrawingRenderer(canvas(calls), canvas()); renderer.reset(generation);
  renderer.accept(events(0, [{ op: 'tracer', value: 0 }, { op: 'fillStart', id: 1 }, line, { op: 'fill', id: 1, points: [[0,0],[20,0],[20,20]], color:'blue' }]));
  drain(); assert.equal(calls.some(([key]) => key === 'stroke'), false);
  renderer.accept(events(1, [{ op: 'update' }])); drain();
  assert.ok(calls.findIndex(([key]) => key === 'fill') < calls.findIndex(([key]) => key === 'stroke'));
  renderer.accept(events(2, [{ op: 'clear', id: 1 }, { op: 'update' }])); drain(); assert.equal(renderer.log.length, 0);
  renderer.stop();
});

test('compound fills consume segment budgets rather than hiding unlimited render work', () => {
  environment(); const renderer = new DrawingRenderer(canvas(), canvas()); renderer.reset(generation);
  const fill = { op: 'fill', id: 1, points: Array.from({ length: 10000 }, () => [0,0]), color: 'red' };
  for (let i = 0; i < 5; i++) renderer.accept(events(i, [fill]));
  assert.throws(() => renderer.accept(events(5, [fill])), /Drawing limit/);
  renderer.stop();
});
