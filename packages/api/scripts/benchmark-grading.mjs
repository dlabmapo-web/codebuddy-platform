#!/usr/bin/env node
// Own PostgreSQL + Redis + real judge/sandbox. No application secrets or ports.
import { spawnSync, execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';

const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf('--' + name); return at < 0 ? fallback : args[at + 1]; };
if (!args.includes('--isolated-fixture')) throw new Error('Explicit --isolated-fixture required; never attach to production data');
const image = option('image', 'cove-judge-performance:candidate');
const cases = Number(option('cases', '1')), runs = Number(option('runs', '1')), parallel = Number(option('parallel', '1'));
const cpus = Number(option('cpus', '1.5')), parent = option('cgroup-parent');
const maxSeconds = Number(option('max-seconds', '600'));
if (![1, 5, 10].includes(cases) || !Number.isInteger(runs) || runs < 1 || runs > 100 || ![1, 2].includes(parallel) ||
    ![1.5, 2, 2.5].includes(cpus) || !Number.isInteger(maxSeconds) || maxSeconds < 60 || maxSeconds > 7200 ||
    (parent && !/^cove-performance-[a-z0-9-]+\.slice$/.test(parent))) throw new Error('Invalid bounded fixture settings');
if (platform() === 'linux' && !parent) throw new Error('Native Linux requires a preallocated --cgroup-parent; transfer the execution budget first');
const output = resolve(option('output', `/tmp/cove-grading-${Date.now()}.json`));
const fixture = fileURLToPath(new URL('./benchmark-grading-fixture.mjs', import.meta.url));
const migrations = fileURLToPath(new URL('../prisma/migrations/', import.meta.url));
const token = randomUUID(), name = 'cove-perf-' + token, label = 'cove.performance-run=' + token;
const containers = [];
const roles = new Map();
let network, volume;
const docker = (args, input, allowFailure = false) => {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 240000 });
  if (!allowFailure && (result.error || result.status !== 0)) throw new Error('Fixture Docker operation failed: ' + args[0]);
  return result;
};
const inspect = image => JSON.parse(docker(['image', 'inspect', image]).stdout)[0];
if (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://')) throw new Error('Run on the fixture host using its local Docker socket');
const dockerContext = JSON.parse(docker(['context', 'inspect']).stdout)[0];
if (!dockerContext.Endpoints?.docker?.Host?.startsWith('unix://')) throw new Error('Remote Docker contexts are not supported; run on the fixture host');
const cleanup = () => {
  for (const id of [...containers].reverse()) docker(['rm', '-f', id], undefined, true);
  if (volume) docker(['volume', 'rm', volume], undefined, true);
  if (network) docker(['network', 'rm', network], undefined, true);
};
process.once('SIGINT', () => { cleanup(); process.exit(130); });
process.once('SIGTERM', () => { cleanup(); process.exit(143); });
const judgeImage = inspect(image);
if (platform() === 'linux' && judgeImage.Architecture !== ({ x64: 'amd64', arm64: 'arm64' }[process.arch])) throw new Error('Native Linux fixture architecture must match host');
const pg = inspect(option('postgres-image', 'postgres:17-alpine'));
const redis = inspect(option('redis-image', 'redis:8.0.3-alpine'));
if (![pg, redis].every(i => i.Architecture === judgeImage.Architecture)) throw new Error('Fixture image architectures must match');
let parentResources;
if (platform() === 'linux') {
  for (const name of ['cove-production-judge-worker-1', 'cove-production-judge-sandbox-1']) {
    const existing = docker(['inspect', name], undefined, true);
    if (existing.status === 0 && JSON.parse(existing.stdout)[0].State.Running) throw new Error('Drain/transfer production grading budget before native testing');
  }
  const path = execFileSync('systemctl', ['show', '--property=ControlGroup', '--value', parent], { encoding: 'utf8' }).trim();
  if (!/^\/[a-z0-9./-]+\.slice$/.test(path) || path.includes('..')) throw new Error('Invalid allocated cgroup');
  const root = '/sys/fs/cgroup' + path;
  const memory = Number(readFileSync(root + '/memory.max', 'utf8'));
  const [quota, period] = readFileSync(root + '/cpu.max', 'utf8').trim().split(/\s+/).map(Number);
  if (memory !== 2147483648 || !Number.isFinite(quota / period) || Math.abs(quota / period - 3.5) > .0001) throw new Error('Fixture parent must enforce 2 GiB / 3.5 CPU');
  if (Number(/^MemAvailable:\s+(\d+)/m.exec(readFileSync('/proc/meminfo', 'utf8'))?.[1]) < 3 * 1024 * 1024) throw new Error('Host memory headroom below 3 GiB');
  parentResources = () => Object.fromEntries(['cpu.stat', 'cpu.max', 'memory.current', 'memory.peak', 'memory.events', 'memory.max'].map(file => [file, readFileSync(root + '/' + file, 'utf8').trim()]));
}
const files = readdirSync(migrations).sort().filter(name => /^\d/.test(name));
const hash = createHash('sha256');
for (const entry of files) hash.update(readFileSync(resolve(migrations, entry, 'migration.sql')));
const report = { version: 1, startedAt: new Date().toISOString(), hostOS: platform(), image: judgeImage.Id,
  imageRevision: judgeImage.Config.Labels?.['org.opencontainers.image.revision'] ?? null,
  architecture: judgeImage.Architecture, postgresImage: pg.Id, redisImage: redis.Id,
  migrationsSha256: hash.digest('hex'), fixtureSha256: createHash('sha256').update(readFileSync(fixture)).digest('hex'),
  orchestratorSha256: createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
  cases, runs, parallel, sandbox: { cpus, memoryMiB: 1280, concurrency: 2, spare: 1, network: 'none' },
  worker: { cpus: .75, memoryMiB: 768, comparatorPool: 1 },
  fixtureInfrastructure: { postgresMiB: 192, redisMiB: 64, clientMiB: 768, sharesParentBudget: Boolean(parent) },
  parent: parent ?? null, maxSeconds,
  releaseAcceptance: 'not assessed; fixture excludes HTTP/auth/browser and remote Supabase latency', result: null };
const launch = (suffix, image, options, command) => {
  const id = docker(['run', '-d', '--name', name + '-' + suffix, '--label', label,
    ...(parent ? ['--cgroup-parent', parent] : []), ...options, image, ...command]).stdout.trim();
  containers.push(id); roles.set(id, suffix); return id;
};
const env = ['-e', 'COVE_PERFORMANCE_FIXTURE=1', '-e', 'DATABASE_URL=postgresql://cove_perf:fixture-only-password@perf-db:5432/cove_performance',
  '-e', 'REDIS_URL=redis://perf-redis:6379/0'];
const app = ['--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '128',
  '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '-v', fixture + ':/app/performance-fixture.mjs:ro', '--entrypoint', 'node'];
try {
  network = docker(['network', 'create', '--internal', '--label', label, name]).stdout.trim();
  volume = docker(['volume', 'create', '--label', label, name + '-socket']).stdout.trim();
  const db = launch('db', pg.Id, ['--network', network, '--network-alias', 'perf-db', '--memory', '192m', '--memory-swap', '192m', '--cpus', '.5',
    '--pids-limit', '128', '--tmpfs', '/var/lib/postgresql/data:rw,nosuid,size=256m',
    '-e', 'POSTGRES_USER=cove_perf', '-e', 'POSTGRES_PASSWORD=fixture-only-password', '-e', 'POSTGRES_DB=cove_performance'],
    ['postgres', '-c', 'shared_buffers=16MB', '-c', 'max_connections=40']);
  launch('redis', redis.Id, ['--network', network, '--network-alias', 'perf-redis', '--memory', '64m', '--memory-swap', '64m', '--cpus', '.25', '--pids-limit', '32'],
    ['redis-server', '--save', '', '--appendonly', 'no', '--maxmemory', '32mb', '--maxmemory-policy', 'noeviction']);
  let databaseReady = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    // initdb briefly starts a Unix-only server; only final TCP readiness counts.
    if (docker(['exec', db, 'pg_isready', '-h', '127.0.0.1', '-U', 'cove_perf'], undefined, true).status === 0) { databaseReady = true; break; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!databaseReady) throw new Error('Fixture database startup timeout');
  const sql = "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL AS 'SELECT NULL::uuid'; CREATE SCHEMA storage; CREATE TABLE storage.objects (id UUID, bucket_id TEXT, name TEXT);\n" +
    files.map(entry => readFileSync(resolve(migrations, entry, 'migration.sql'), 'utf8')).join('\n');
  docker(['exec', '-i', db, 'psql', '-U', 'cove_perf', '-d', 'cove_performance', '-v', 'ON_ERROR_STOP=1'], sql);
  const sandbox = launch('sandbox', judgeImage.Id, ['--network', 'none', '--read-only', '--user', '0:0', '--cap-drop', 'ALL',
    '--cap-add', 'SETUID', '--cap-add', 'SETGID', '--cap-add', 'KILL', '--security-opt', 'no-new-privileges', '--cgroupns', 'private',
    '--cpus', String(cpus), '--memory', '1280m', '--memory-swap', '1280m', '--pids-limit', '128',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '-v', volume + ':/run/cove-sandbox',
    '-v', fixture + ':/app/performance-fixture.mjs:ro', '-e', 'COVE_PERFORMANCE_FIXTURE=1', '--entrypoint', 'node'], ['/app/performance-fixture.mjs', 'sandbox']);
  const worker = launch('worker', judgeImage.Id, [...app, '--network', network, '--network-alias', 'perf-worker',
    '--cpus', '.75', '--memory', '768m', '--memory-swap', '768m', '-e', 'NODE_OPTIONS=--max-old-space-size=512',
    '-v', volume + ':/run/cove-sandbox:ro', '-e', 'PERF_PARALLEL=' + parallel, ...env], ['/app/performance-fixture.mjs', 'worker']);
  const client = launch('client', judgeImage.Id, [...app, '--network', network, '--cpus', '.5', '--memory', '768m', '--memory-swap', '768m',
    '-v', volume + ':/run/cove-sandbox:ro', ...env, '-e', 'PERF_CASES=' + cases, '-e', 'PERF_RUNS=' + runs, '-e', 'PERF_PARALLEL=' + parallel],
    ['/app/performance-fixture.mjs', 'client']);
  // Check every five seconds; a dead worker cannot leave a 100-run client hanging.
  const deadline = performance.now() + maxSeconds * 1000;
  while (true) {
    if (performance.now() > deadline) throw new Error('Fixture wall-clock budget exhausted');
    if (parentResources) {
      const resources = parentResources();
      if (/^(oom|oom_kill) [1-9]/m.test(resources['memory.events'])) throw new Error('Fixture parent OOM; stop experiment');
      if (Number(/^MemAvailable:\s+(\d+)/m.exec(readFileSync('/proc/meminfo', 'utf8'))?.[1]) < 3 * 1024 * 1024) throw new Error('Host memory headroom below 3 GiB');
    }
    const state = JSON.parse(docker(['inspect', client]).stdout)[0].State;
    if (!state.Running) { report.clientExitCode = state.ExitCode; break; }
    if ([worker, sandbox].some(id => !JSON.parse(docker(['inspect', id]).stdout)[0].State.Running)) throw new Error('Fixture runtime exited');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  const logs = docker(['logs', client], undefined, true).stdout;
  const line = logs.split('\n').find(line => line.startsWith('COVE_PERFORMANCE_RESULT '));
  if (line) report.result = JSON.parse(line.slice('COVE_PERFORMANCE_RESULT '.length));
  else throw new Error('No complete fixture report');
  report.resources = Object.fromEntries([['worker', worker], ['sandbox', sandbox], ['postgres', db]].map(([kind, id]) => [kind,
    Object.fromEntries(['cpu.stat', 'cpu.max', 'cpu.pressure', 'memory.current', 'memory.peak', 'memory.events', 'memory.max', 'pids.current'].map(file => {
      const result = docker(['exec', id, 'cat', '/sys/fs/cgroup/' + file], undefined, true);
      return [file, result.status === 0 ? result.stdout.trim() : null];
    }))]));
  if (Object.values(report.resources).some(r => /^(oom|oom_kill) [1-9]/m.test(r['memory.events'] ?? ''))) report.oom = true;
  if (report.clientExitCode !== 0 || report.result.failures || report.oom) process.exitCode = 2;
} catch (error) {
  report.infrastructureFailure = error.message;
  report.fixtureFailures = containers.flatMap(id => {
    const result = docker(['logs', '--tail', '20', id], undefined, true);
    return (result.stdout + result.stderr).split('\n').filter(line => line.startsWith('COVE_PERFORMANCE_FAILURE '))
      .map(line => { try { return JSON.parse(line.slice('COVE_PERFORMANCE_FAILURE '.length)); } catch { return { type: 'Invalid diagnostic' }; } });
  });
  process.exitCode = 2;
} finally {
  if (parentResources) { try { report.parentResources = parentResources(); } catch { report.parentResources = null; } }
  report.terminationStates = containers.flatMap(id => {
    const result = docker(['inspect', id], undefined, true);
    try { const state = JSON.parse(result.stdout)[0].State;
      return [{ role: roles.get(id), running: state.Running, exitCode: state.ExitCode, oomKilled: state.OOMKilled }]; } catch { return []; }
  });
  if (report.terminationStates.some(state => state.oomKilled)) { report.oom = true; process.exitCode = 2; }
  report.finishedAt = new Date().toISOString();
  try { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); }
  finally { cleanup(); }
}
console.log(JSON.stringify({ output, failures: report.result?.failures ?? null, infrastructureFailure: report.infrastructureFailure ?? null }));
