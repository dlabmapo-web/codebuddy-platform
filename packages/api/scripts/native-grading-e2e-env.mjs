import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { runtimeManifestSchema } from '@cove/shared';
/** Test scripts only: require the unique disposable endpoints before imports/boot. */
export function fixtureEnvironment() {
  const id = process.env.COVE_NATIVE_FIXTURE_ID;
  if (
    !id ||
    !/^[a-z0-9-]{8,80}$/.test(id) ||
    process.env.DOTENV_CONFIG_PATH !== '/dev/null'
  )
    throw new Error('Owned native fixture required');
  for (const [name, protocol, path] of [
    ['COVE_NATIVE_TEST_DATABASE_URL', 'postgresql:', '/cove_native_test'],
    ['COVE_NATIVE_TEST_REDIS_URL', 'redis:', '/0'],
  ]) {
    const url = new URL(process.env[name] ?? 'http://invalid');
    if (
      url.protocol !== protocol ||
      url.hostname !== '127.0.0.1' ||
      !url.port ||
      url.pathname !== path
    )
      throw new Error('Explicit loopback fixture required: ' + name);
  }
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: process.env.COVE_NATIVE_TEST_DATABASE_URL,
    DIRECT_URL: process.env.COVE_NATIVE_TEST_DATABASE_URL,
    REDIS_URL: process.env.COVE_NATIVE_TEST_REDIS_URL,
    MONITORING_REDIS_URL: process.env.COVE_NATIVE_TEST_REDIS_URL,
    API_BIND_ADDRESS: '127.0.0.1',
    PORT: '4419',
    WEB_ORIGIN: 'http://127.0.0.1:3409',
    SUPABASE_URL: 'https://native-grading-provider.invalid',
    SUPABASE_SECRET_KEY: 'local-native-admin-key',
    BFF_SHARED_SECRET: 'local-native-bff-secret-only-never-production',
    DLAB_SSO_ENABLED: 'false',
    GUI_ENABLED: 'false',
    VIDEO_LESSONS_ENABLED: 'false',
    GRADING_NATIVE_ENABLED: 'false',
    JUDGE_CONCURRENCY: '2',
    JUDGE_COMPARATOR_POOL_SIZE: '1',
    JUDGE_HEALTH_PORT: '4421',
    JUDGE_HEALTH_BIND: '127.0.0.1',
    GRADING_RUNTIME_MANIFEST_PATH: '',
    JUDGE_SANDBOX_SOCKET: '',
    GRADING_WORKER_GENERATION: '',
  });
  // Optional keys must be absent, not invalid empty descriptors/socket paths.
  for (const key of [
    'GRADING_RUNTIME_MANIFEST_PATH',
    'JUDGE_SANDBOX_SOCKET',
    'GRADING_WORKER_GENERATION',
  ])
    delete process.env[key];
  if (process.env.COVE_NATIVE_ACCEPTANCE_ENV) {
    if (
      process.platform !== 'linux' ||
      process.arch !== 'x64' ||
      !isAbsolute(process.env.COVE_NATIVE_ACCEPTANCE_ENV)
    )
      throw new Error('Isolated native acceptance requires Linux AMD64');
    const candidate = JSON.parse(
      readFileSync(process.env.COVE_NATIVE_ACCEPTANCE_ENV, 'utf8'),
    );
    if (
      candidate.fixtureId !== id ||
      candidate.isolated !== true ||
      !isAbsolute(candidate.runtime.manifestPath) ||
      !isAbsolute(candidate.runtime.socketPath) ||
      !/^[a-f0-9-]{36}$/.test(candidate.runtime.workerGeneration)
    )
      throw new Error('Invalid isolated runtime authority');
    // API/worker fixtures never receive a daemon socket or Docker authority.
    // The operator-side acceptance driver validates the actual host first;
    // normal worker/broker startup and readiness enforce runtime capability.
    runtimeManifestSchema.parse(
      JSON.parse(readFileSync(candidate.runtime.manifestPath, 'utf8')),
    );
    Object.assign(process.env, {
      GRADING_RUNTIME_MANIFEST_PATH: candidate.runtime.manifestPath,
      JUDGE_SANDBOX_SOCKET: candidate.runtime.socketPath,
      GRADING_WORKER_GENERATION: candidate.runtime.workerGeneration,
      GRADING_NATIVE_ENABLED:
        candidate.phase === 'candidate' ? 'true' : 'false',
      JUDGE_READINESS_GUARD: 'true',
    });
  }
  return id;
}
