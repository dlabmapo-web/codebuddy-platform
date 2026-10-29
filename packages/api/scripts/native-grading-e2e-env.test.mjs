import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const base = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  DOTENV_CONFIG_PATH: '/dev/null',
  COVE_NATIVE_FIXTURE_ID: 'owned-native-fixture-123',
  COVE_NATIVE_TEST_DATABASE_URL:
    'postgresql://synthetic:synthetic@127.0.0.1:54321/cove_native_test',
  COVE_NATIVE_TEST_REDIS_URL: 'redis://127.0.0.1:54322/0',
};
function probe(extra = {}) {
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const {fixtureEnvironment}=await import('./packages/api/scripts/native-grading-e2e-env.mjs');fixtureEnvironment();console.log(JSON.stringify({native:process.env.GRADING_NATIVE_ENABLED,manifest:process.env.GRADING_RUNTIME_MANIFEST_PATH,bind:process.env.API_BIND_ADDRESS}));`,
    ],
    {
      cwd: new URL('../../..', import.meta.url),
      env: { ...base, ...extra },
      encoding: 'utf8',
    },
  );
}
test('fixture refuses remote/wrong database or Redis and missing ownership before boot', () => {
  for (const extra of [
    {
      COVE_NATIVE_TEST_DATABASE_URL:
        'postgresql://synthetic:synthetic@remote.invalid:5432/cove_native_test',
    },
    {
      COVE_NATIVE_TEST_DATABASE_URL:
        'postgresql://synthetic:synthetic@127.0.0.1:5432/production',
    },
    { COVE_NATIVE_TEST_REDIS_URL: 'redis://remote.invalid:6379/0' },
    { COVE_NATIVE_FIXTURE_ID: '' },
    { DOTENV_CONFIG_PATH: '' },
  ])
    assert.notEqual(probe(extra).status, 0);
});
test('default fixture overrides inherited native activation and binds loopback', () => {
  const result = probe({
    GRADING_NATIVE_ENABLED: 'true',
    GRADING_RUNTIME_MANIFEST_PATH: '/not-read-production-manifest',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    native: 'false',
    bind: '127.0.0.1',
  });
});

test('launcher refuses a remote Docker context before any run/migration', async () => {
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'native-docker-guard-'));
  try {
    const log = join(directory, 'calls');
    await writeFile(
      join(directory, 'docker'),
      `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\nprintf '%s\\n' ssh://fixture-remote.invalid\n`,
      { mode: 0o700 },
    );
    const result = spawnSync(
      'bash',
      ['packages/api/scripts/test-native-grading-isolated.sh'],
      {
        cwd: new URL('../../..', import.meta.url),
        env: { ...base, PATH: directory + ':' + base.PATH },
        encoding: 'utf8',
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refusing non-local Docker/);
    assert.deepEqual((await readFile(log, 'utf8')).trim().split('\n'), [
      'context inspect --format {{.Endpoints.docker.Host}}',
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
