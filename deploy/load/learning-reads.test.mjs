import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = mkdtempSync(join(tmpdir(), 'cove-learning-load-'));
after(() => rmSync(directory, { recursive: true, force: true }));
const script = fileURLToPath(new URL('./learning-reads.mjs', import.meta.url));
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args]); let out = '', err = '';
    child.stdout.on('data', chunk => { out += chunk; }); child.stderr.on('data', chunk => { err += chunk; });
    child.on('error', reject); child.on('close', code => resolve({ code, out, err }));
  });
}
test('refuses production/cross-origin/mutating paths and does not print private fixture contents', async () => {
  assert.notEqual((await run(['--base-url', 'https://cs.coveedu.com'])).code, 0);
  const path = join(directory, 'invalid.json'); writeFileSync(path, '{"token":"DO_NOT_LOG_PRIVATE_FIXTURE"');
  const invalid = await run(['--fixture', path]); assert.notEqual(invalid.code, 0); assert.ok(!invalid.err.includes('DO_NOT_LOG_PRIVATE_FIXTURE'));
  for (const readPath of ['https://example.com/', '/api/manual/submit']) {
    writeFileSync(path, JSON.stringify({ actors: [{ reads: [{ surface: 'status', path: readPath }] }] }));
    assert.notEqual((await run(['--fixture', path])).code, 0);
  }
});
test('measures bounded loopback GET reads with separate actors and sanitized evidence', async () => {
  const server = createServer((request, response) => {
    assert.equal(request.method, 'GET'); response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{"status":"fixture"}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const fixture = join(directory, 'actors.json'), output = join(directory, 'report.json');
    writeFileSync(fixture, JSON.stringify({ actors: Array.from({ length: 2 }, (_, i) => ({
      headers: { Authorization: 'Bearer PRIVATE_FIXTURE_TOKEN_' + i }, reads: [{ surface: 'status', path: '/api/manual/latest-submission?academyId=private-fixture-id' }],
    })) }));
    const result = await run(['--base-url', `http://127.0.0.1:${address.port}`, '--fixture', fixture, '--rounds', '1', '--output', output]);
    assert.equal(result.code, 0, result.err);
    const raw = readFileSync(output, 'utf8'), report = JSON.parse(raw);
    assert.deepEqual(report.stages.map(stage => stage.clients), [1, 2]);
    assert.ok(!raw.includes('PRIVATE_FIXTURE_TOKEN')); assert.ok(!raw.includes('private-fixture-id'));
    assert.ok(report.stages.every(stage => stage.samples.every(sample => sample.ok)));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
