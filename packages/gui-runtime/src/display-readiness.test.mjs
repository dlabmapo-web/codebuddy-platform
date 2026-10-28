import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { displayReadinessProbe } from './display-readiness.mjs';

async function portReservation() {
  const server = createServer(socket => socket.end());
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { server, port: server.address().port };
}
function probe(port, timeoutMs = 2000, signal) {
  const child = spawn('python3', ['-c', displayReadinessProbe({ port, timeoutMs })], { signal });
  let stderr = ''; child.stderr.on('data', b => { stderr += b; });
  const result = new Promise((resolve, reject) => {
    child.once('error', reject); child.once('close', code => resolve({ code, stderr }));
  });
  return { child, result };
}

test('ready display succeeds and leaves no readiness process running', async () => {
  const { server, port } = await portReservation();
  try { assert.equal((await probe(port).result).code, 0); }
  finally { await new Promise(resolve => server.close(resolve)); }
});

test('one watcher waits for delayed display startup', async () => {
  const { server, port } = await portReservation();
  await new Promise(resolve => server.close(resolve));
  const { child, result } = probe(port);
  let settled = false; void result.then(() => { settled = true; });
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(settled, false);
  server.listen(port, '127.0.0.1'); await once(server, 'listening');
  try { assert.equal((await result).code, 0); assert.equal(child.exitCode, 0); }
  finally { await new Promise(resolve => server.close(resolve)); }
});

test('unavailable display fails within its bounded readiness deadline', async () => {
  const { server, port } = await portReservation();
  await new Promise(resolve => server.close(resolve));
  const began = performance.now(); const result = await probe(port, 100).result;
  assert.equal(result.code, 1); assert.match(result.stderr, /Display readiness deadline exceeded/);
  assert.ok(performance.now() - began < 2000);
});

test('cancellation stops a waiting watcher', async () => {
  const { server, port } = await portReservation();
  await new Promise(resolve => server.close(resolve));
  const controller = new AbortController(); const { child, result } = probe(port, 2000, controller.signal);
  const rejected = assert.rejects(result, { name: 'AbortError' });
  controller.abort(); await rejected;
  if (child.exitCode === null && child.signalCode === null) await once(child, 'close');
  assert.ok(child.exitCode !== null || child.signalCode !== null);
});
