import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('../../scripts/benchmark-native-grading.mjs', import.meta.url));

for (const variable of ['SSH_CONNECTION', 'SSH_CLIENT', 'DOCKER_HOST']) {
  test(`refuses ${variable} remote execution before accessing Docker`, () => {
    const env = { ...process.env, SSH_CONNECTION: '', SSH_CLIENT: '', DOCKER_HOST: '', [variable]: variable === 'DOCKER_HOST' ? 'tcp://example.invalid:2376' : 'remote-fixture' };
    // An empty PATH also proves rejection does not depend on contacting Docker.
    env.PATH = '';
    const result = spawnSync(process.execPath, [script], { env, encoding: 'utf8', timeout: 2000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /refuses SSH\/remote Docker hosts/);
    assert.equal(result.stdout, '');
  });
}

test('rejects an unsupported budget before Docker access', () => {
  const result = spawnSync(process.execPath, [script, '--concurrency', '8'], { env: { ...process.env, PATH: '' }, encoding: 'utf8', timeout: 2000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Only reviewed two\/four-worker prototype budgets/);
});
