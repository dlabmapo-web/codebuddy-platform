import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, loadAuthority, loopback, summarize, assertSloEvidence, matchesExpectedGrade } from './benchmark-native-classroom.mjs';
const args = ['--fixture', '/fixture', '--output', '/report'];
test('bounded defaults and larger cohorts require explicit authorization', () => { assert.equal(parseArgs(args).clients, 2); for (const extra of [['--clients', '200'], ['--clients', '3'], ['--cases', '2'], ['--max-seconds', '0'], ['--generator-concurrency', '201'], ['--assert-slo']])
    assert.throws(() => parseArgs([...args, ...extra])); assert.equal(parseArgs([...args, '--clients', '200', '--authorize-isolated-load']).clients, 200); });
test('refuses production URLs and preserves all failures in denominator', () => { for (const url of ['https://cove.ac', 'http://localhost:4000', 'http://127.0.0.1', 'http://user:pw@127.0.0.1:3000'])
    assert.throws(() => loopback(url)); assert.deepEqual(summarize([{ correct: true, elapsedMs: 1 }, { correct: false, elapsedMs: 2 }], 4), { expected: 4, observed: 2, correct: 1, failed: 3, p50Ms: 1, p95Ms: 2, p99Ms: 2, maxMs: 2, allUnder5s: false }); assert.throws(() => assertSloEvidence({ stage: 'fixture-browser' })); });
test('requires owned private expiring authority and live fixture process', async () => { const dir = await mkdtemp(join(tmpdir(), 'native-authority-')), path = join(dir, 'owner.json'); try {
    const f = { version: 1, isolated: true, fixtureId: 'native-12345678', pid: process.pid, token: 'a'.repeat(40), expiresAt: Date.now() + 60000, origin: 'http://127.0.0.1:4000' };
    await writeFile(path, JSON.stringify(f), { mode: 0o600 });
    assert.equal((await loadAuthority(path)).fixtureId, f.fixtureId);
    await chmod(path, 0o644);
    await assert.rejects(loadAuthority(path));
    await chmod(path, 0o600);
    await writeFile(path, JSON.stringify({ ...f, origin: 'https://production.example' }));
    await assert.rejects(loadAuthority(path));
}
finally {
    await rm(dir, { recursive: true, force: true });
} });
test('expected FAILED grades count as correct, infrastructure and missing/mismatched cases fail', () => {
    const student = { workload: { status: 'FAILED', score: 0, caseOutcome: 'RUNTIME_ERROR' } };
    const result = { terminal: true, status: 'FAILED', score: 0, totalCount: 1, runtimeFingerprint: 'native-pinned', committed: true, caseOutcomes: ['RUNTIME_ERROR'] };
    assert.equal(matchesExpectedGrade(result, student, 1, 'native-pinned'), true);
    for (const bad of [{ status: 'ERRORED' }, { terminal: false }, { committed: false }, { caseOutcomes: ['WRONG_OUTPUT'] }, { caseOutcomes: [] }, { runtimeFingerprint: 'other' }])
        assert.equal(matchesExpectedGrade({ ...result, ...bad }, student, 1, 'native-pinned'), false);
    assert.equal(summarize([{ correct: true, elapsedMs: 5000 }], 1).allUnder5s, false);
});

test('RPC accepts fractional remaining time and aborts within the same finite deadline', { timeout: 5000 }, async () => {
    const { createServer } = await import('node:http');
    const { createFixtureRpc } = await import('./benchmark-native-classroom.mjs');
    const server = createServer((request, response) => {
        if (request.url === '/ready') response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ready":true}');
        // /stall intentionally waits for the caller's transport budget to expire.
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const clock = { now: 0.75 };
    const deadline = 5000.25;
    const rpc = createFixtureRpc({ origin: `http://127.0.0.1:${server.address().port}`, token: 'synthetic' }, () => {
        const remaining = deadline - clock.now;
        if (remaining <= 0) throw Error('Overall benchmark deadline');
        return remaining;
    });
    try {
        assert.deepEqual(await rpc('/ready'), { ready: true }); // 4999.5ms: formerly ERR_OUT_OF_RANGE.
        clock.now = deadline - 50.5;
        const started = performance.now();
        await assert.rejects(rpc('/stall'), error => error.name === 'TimeoutError');
        assert.ok(performance.now() - started < 1000, 'remaining budget must not reset to 15s');
        clock.now = deadline - 0.75;
        await assert.rejects(rpc('/stall'), error => error.name === 'TimeoutError');
        clock.now = deadline;
        await assert.rejects(rpc('/ready'), /Overall benchmark deadline/);
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});
