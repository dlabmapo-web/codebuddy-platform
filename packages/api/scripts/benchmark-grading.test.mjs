import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cli = fileURLToPath(new URL('./benchmark-grading.mjs', import.meta.url));
const fixture = fileURLToPath(new URL('./benchmark-grading-fixture.mjs', import.meta.url));

test('requires fixture acknowledgement and rejects unbounded/resource-injection settings before Docker', () => {
  for (const args of [[], ['--isolated-fixture', '--runs', '101'], ['--isolated-fixture', '--cpus', '6'],
    ['--isolated-fixture', '--parallel', '20'], ['--isolated-fixture', '--cases', '50'],
    ['--isolated-fixture', '--cgroup-parent', 'system.slice'], ['--isolated-fixture', '--max-seconds', '99999']]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { PATH: '/no-docker-available' } });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Explicit|Invalid bounded/);
    assert.doesNotMatch(result.stderr, /Docker operation/);
  }
});

test('refuses non-fixture database/Redis before loading clients and never echoes supplied secrets', () => {
  const secret = 'PRIVATE_FIXTURE_SENTINEL';
  for (const env of [
    { DATABASE_URL: `postgresql://owner:${secret}@production.example/app`, REDIS_URL: 'redis://perf-redis:6379/0' },
    { DATABASE_URL: 'postgresql://cove_perf:fixture@perf-db/cove_performance', REDIS_URL: `redis://:${secret}@production.example/0` },
  ]) {
    const result = spawnSync(process.execPath, [fixture, 'client'], { encoding: 'utf8', env: { COVE_PERFORMANCE_FIXTURE: '1', ...env } });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /COVE_PERFORMANCE_FAILURE/);
    assert.doesNotMatch(result.stderr + result.stdout, new RegExp(secret));
    assert.doesNotMatch(result.stderr + result.stdout, /production\.example|postgresql:\/\//);
  }
});
