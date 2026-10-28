// Synthetic loopback API/Redis cohort. This does not measure twenty devices.
import { randomUUID, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
if (process.env.COVE_TURTLE_BROWSER_FIXTURE !== '1') throw new Error('Explicit local fixture opt-in required');
const base = 'http://127.0.0.1:4028/api/turtle-trial/';
const secret = 'synthetic-browser-fixture-bff-secret-20261028';
const clients = [];
const started = performance.now();
async function request(path, method, token = '', data, nonce = '') {
  const response = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', 'X-Cove-Bff-Secret': secret,
      'X-Cove-Turtle-Session': token, 'X-Cove-Turtle-Nonce': nonce, 'X-Cove-Client-IP': '127.0.0.1' },
    body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`${method} ${path.split('/')[0]} failed: ${response.status}`);
  return response.json();
}
const sourceHash = createHash('sha256').update('from custom import *\nTForward(100)\n').digest('hex');
const durations = [], renewals = [];
let cleanupFailures = 0, summary;
try {
  const setup = await Promise.allSettled(Array.from({ length: 20 }, async () => {
    const { nonce } = await request('challenge', 'POST', '', {});
    const { token } = await request('access', 'POST', '', { pin: '012345' }, nonce);
    clients.push({ token, key: randomUUID() });
  }));
  if (setup.some(result => result.status !== 'fulfilled')) throw new Error('Fixture visitor creation failed');
  const admissions = await Promise.allSettled(clients.map(async client => {
    const before = performance.now();
    client.run = await request('browser-runs', 'POST', client.token, {
      requestKey: client.key, sourceHash, starterId: 'drawing', helperVersion: 'cove-trial-v1', profile: 'cove-browser-turtle-v1',
    });
    durations.push(performance.now() - before);
    if (client.run.engine !== 'browser' || client.run.state !== 'ACTIVE') throw new Error('Expected active browser execution');
  }));
  if (admissions.some(result => result.status !== 'fulfilled')) throw new Error('Fixture browser admission failed');
  if (new Set(clients.map(client => client.run.id)).size !== 20) throw new Error('Run ownership was not independent');
  const active = await Promise.all(clients.map(client => request('browser-runs/request/' + client.key, 'GET', client.token)));
  if (active.some(run => run.state !== 'ACTIVE' || run.engine !== 'browser')) throw new Error('Twenty browser runs did not coexist');
  const renewed = await Promise.allSettled(clients.map(async client => {
    const before = performance.now();
    await request('browser-runs/' + client.run.id + '/renew', 'POST', client.token, {});
    renewals.push(performance.now() - before);
  }));
  if (renewed.some(result => result.status !== 'fulfilled')) throw new Error('Fixture browser renewal failed');
  const stats = samples => {
    const sorted = [...samples].sort((a, b) => a - b);
    return { count: sorted.length, p50Ms: sorted[Math.ceil(sorted.length * .5) - 1], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], maxMs: sorted.at(-1) };
  };
  summary = { visitors: 20, simultaneousActiveBrowserAdmissions: 20, admission: stats(durations), renewal: stats(renewals),
    elapsedMs: performance.now() - started, sourceUploaded: false,
    scope: 'Synthetic loopback Nest/Redis fixture; broker methods throw. Excludes Next BFF, production academy DB reads, network and browser drawing/device costs.' };
} finally {
  await Promise.all(clients.map(async client => {
    try {
      try {
        if (client.run) await request('browser-runs/' + client.run.id, 'DELETE', client.token);
      } finally {
        await request('access', 'DELETE', client.token);
      }
    } catch { cleanupFailures++; }
  }));
}
if (cleanupFailures) throw new Error('Fixture cleanup failed');
summary.cleanedUpVisitors = clients.length;
console.log(JSON.stringify(summary, null, 2));
if (process.env.COVE_FIXTURE_LOAD_OUTPUT) await writeFile(process.env.COVE_FIXTURE_LOAD_OUTPUT, JSON.stringify(summary, null, 2) + '\n');
