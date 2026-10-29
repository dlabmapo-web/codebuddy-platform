/** Explicit disposable Linux CI coordinator. No Docker, host state or admin API. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, lstat, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const PHASES = ['functional', 'isolation', 'limits', 'cancellation', 'recovery'];
export const MAX = 8388608;
const sha = value => createHash('sha256').update(value).digest('hex');
const delay = ms => new Promise(r => setTimeout(r, ms));
export function capture(value) { return { bytes: Buffer.byteLength(value), sha256: sha(value) }; }
export function fixtures(phase, engine) {
  if (phase === 'functional') return [
    ...['INCLUDE', 'IGNORE'].map(policy => ({ name: `unicode-${policy.toLowerCase()}`, code: 'print(input("prompt:"))', stdin: '한😀\n', policy, expected: `${policy === 'INCLUDE' ? 'prompt:' : ''}한😀\n` })),
    { name: 'stdin-consumed', code: 'import sys; print(len(sys.stdin.read()))', stdin: 'x'.repeat(MAX), expected: `${MAX}\n` },
    { name: 'stdin-unconsumed', code: 'print("done")', stdin: 'x'.repeat(MAX), expected: 'done\n' },
    { name: 'program-error', code: "raise ValueError('ci-check')", outcome: 'RUNTIME_ERROR', error: 'ValueError: ci-check' },
    { name: 'timeout', code: 'while True: pass', outcome: 'TIME_LIMIT', timeLimitMs: 1000 },
    { name: 'output-exact', code: `import sys; sys.stdout.write("\\0" * ${MAX})`, expected: '\0'.repeat(MAX) },
    { name: 'output-over', code: `import sys; sys.stdout.write("\\0" * ${MAX + 1})`, expected: '\0'.repeat(MAX), truncated: true },
  ];
  if (engine !== 'cpython') return [];
  if (phase === 'isolation') return [{ name: 'isolation', marked: true, code: isolationSource, isolation: true }];
  if (phase === 'limits') return [
    { name: 'memory', marked: true, code: 'import time\ntime.sleep(3)\nx=bytearray(512*1024*1024)', outcome: 'MEMORY_LIMIT' },
    { name: 'pids', marked: true, descendants: true, code: 'time.sleep(3)\nprint("fork-limited")', expected: 'fork-limited\n' },
  ];
  if (phase === 'cancellation') return [{ name: 'cancel', marked: true, descendants: true, code: 'time.sleep(25)', fault: 'cancel' }];
  if (phase === 'recovery') return [
    { name: 'retained', code: 'import secrets; print(secrets.token_hex(32))', fault: 'retained' },
    { name: 'active-restart', marked: true, descendants: true, code: 'time.sleep(25)', fault: 'restart' },
    { name: 'parent-oom', marked: true, code: 'time.sleep(8)', fault: 'parent-oom' },
    { name: 'control-oom', marked: true, code: 'time.sleep(8)', fault: 'control-oom' },
  ];
  throw new Error('Unknown phase');
}
const isolationSource = `import os, json, socket, time
assert os.getuid() == 1000 and os.getgid() == 1000
fds=[]
for i in range(3,128):
 try: os.fstat(i); fds.append(i)
 except OSError: pass
assert fds == []
for p in ['/run/cove-grading-control/broker.sock','/var/run/docker.sock','/home/cove-grading','/opt/cove','/etc/cove-ci-host-canary','/app','/workspace','/sys/fs/cgroup/cgroup.procs']:
 if p.endswith('cgroup.procs'): continue
 assert not os.path.exists(p), p
for p in ['/ci-write-test','/sys/fs/cgroup/cgroup.procs','/opt/guest/ci-write-test']:
 try:
  with open(p,'w') as f: f.write('x')
 except OSError: pass
 else: raise AssertionError(p)
scratch={}
for p in ['/tmp','/dev/shm']:
 v=os.statvfs(p)
 assert 0 < v.f_blocks*v.f_frsize <= 64*1024*1024
 if p == '/tmp': assert v.f_blocks*v.f_frsize == 16*1024*1024
 with open(p+'/scratch','xb') as f: f.write(b'x'*(1024*1024))
 scratch[p]=v.f_blocks*v.f_frsize
try:
 s=socket.socket(); s.settimeout(.2)
 assert s.connect_ex(('192.0.2.1',443)) != 0
 s.close()
except OSError as e:
 assert e.errno in (1,13,97)
assert sorted(os.listdir('/sys/class/net')) == ['lo']
status=open('/proc/self/status').read()
assert 'NoNewPrivs:\\t1' in status
assert 'CapEff:\\t0000000000000000' in status
assert 'Seccomp:\\t2' in status
mounts=open('/proc/self/mountinfo').read()
assert not any(p in mounts for p in ['/home/cove-grading','/run/cove-grading-control','/var/run/docker.sock'])
print(json.dumps({'uid':os.getuid(),'pid':os.getpid(),'fds':fds,'pidns':os.readlink('/proc/self/ns/pid'),'netns':os.readlink('/proc/self/ns/net'),'userns':os.readlink('/proc/self/ns/user'),'scratch':scratch,'mountHashInputBytes':len(mounts)}))
time.sleep(3)`;

export function sourceFor(fixture, token) {
  if (!fixture.marked) return fixture.code;
  const marker = `with open('/tmp/cove-ci-marker','x') as f: json.dump({'token':${JSON.stringify(token)},'pid':os.getpid(),'children':children},f)\n`;
  if (fixture.isolation) return 'children=[]\n' + fixture.code.replace('time.sleep(3)', marker + 'time.sleep(3)');
  let prelude = 'import os, json, time\nchildren=[]\n';
  if (fixture.descendants) prelude += `limited=False
for i in range(40):
 try: child=os.fork()
 except OSError as e:
  assert e.errno == 11
  limited=True
  break
 if child == 0:
  os.setsid()
  time.sleep(30)
  os._exit(0)
 children.append(child)
assert limited and 0 < len(children) < 32
`;
  return prelude + marker + fixture.code;
}
export async function submitOnce(client, scope, input) {
  const until = Date.now() + 60000;
  while (true) {
    const reply = await client.request({ type: 'run', ...scope, input });
    if (reply.type !== 'error' || reply.code !== 'BUSY') return reply;
    assert(Date.now() < until, 'Pre-release BUSY budget exhausted');
    await delay(100);
  }
}
export async function receiptOnly(client, scope, initial) {
  let reply = initial;
  const until = Date.now() + 90000;
  while (reply.type === 'pending') {
    assert(Date.now() < until, 'Receipt deadline exceeded; never resubmit');
    await delay(50);
    reply = await client.request({ type: 'receipt', ...scope });
  }
  return reply;
}
async function atomic(path, value) {
  await writeFile(path + '.next', JSON.stringify(value) + '\n', { mode: 0o600 });
  await rename(path + '.next', path);
}
async function main() {
  const args = process.argv.slice(2);
  assert.deepEqual(args.filter((_, i) => i % 2 === 0), ['--phase', '--config', '--result']);
  const [phase, configPath, resultPath] = [args[1], args[3], args[5]];
  assert(PHASES.includes(phase));
  assert.equal(process.platform, 'linux');
  assert(process.getuid() !== 0, 'Coordinator must be unprivileged');
  assert.equal(configPath, '/opt/cove/grading/ci/config.json');
  const info = await lstat(configPath);
  assert(info.isFile() && info.uid === 0 && !(info.mode & 0o022));
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  assert.deepEqual(Object.keys(config).sort(), ['brokerSocket', 'evidenceDirectory', 'manifest', 'version', 'workerGeneration']);
  assert.equal(config.version, 1);
  assert.equal(config.brokerSocket, '/run/cove-grading-control/broker.sock');
  assert.equal(resultPath, `${config.evidenceDirectory}/${phase}.json`);
  for (const probe of [() => readFile('/var/lib/cove-grading-ci/state.json'), () => readdir('/home/cove-grading')]) {
    await assert.rejects(probe, error => error.code === 'EACCES' || error.code === 'EPERM');
  }
  const { BrokerClient } = await import('/opt/cove/grading/current/dist/index.js');
  const client = new BrokerClient(config.brokerSocket);
  const result = { version: 1, phase, cases: [], success: false };
  let sequence = 0;
  async function sync(stage, value) {
    const serial = ++sequence;
    await atomic(`${config.evidenceDirectory}/${phase}.request.json`, { version: 1, serial, stage, ...value });
    const until = Date.now() + 90000;
    while (Date.now() < until) {
      try {
        const reply = JSON.parse(await readFile(`${config.evidenceDirectory}/${phase}.reply.json`, 'utf8'));
        if (reply.serial === serial) { assert.equal(reply.ok, true, 'Host check failed'); return; }
      } catch (e) { if (e.code !== 'ENOENT') throw e; }
      await delay(50);
    }
    throw new Error('Host observation/fault timed out');
  }
  try {
    let health = await client.request({ type: 'health' });
    assert.equal(health.type, 'health');
    assert.deepEqual(health.capabilities, config.manifest.capabilities);
    assert.equal(health.workerGeneration, config.workerGeneration);
    assert.deepEqual(health.capabilities.runtimes.map(x => x.engine).sort(), ['cpython', 'pyodide']);
    for (const runtime of health.capabilities.runtimes) for (const fixture of fixtures(phase, runtime.engine)) {
      const context = { attemptId: randomUUID(), kind: 'submission', caseId: randomUUID(), generation: 1, leaseToken: randomUUID(), workerGeneration: config.workerGeneration };
      health = await client.request({ type: 'health' });
      assert.equal(health.type, 'health');
      const bound = { brokerGeneration: health.brokerGeneration, context, runtime };
      const reserved = await client.request({ type: 'reserve', ...bound, admissionEpoch: health.admissionEpoch, memoryLimitMb: 128 });
      assert.equal(reserved.type, 'reserved');
      const scope = { ...bound, reservationId: reserved.reservationId };
      const token = randomUUID();
      const code = sourceFor(fixture, token);
      const sourceHash = sha(code);
      const identity = { name: fixture.name, engine: runtime.engine, context, reservationId: scope.reservationId, sourceHash, token };
      await sync('armed', identity);
      let reply = await submitOnce(client, scope, { code, stdin: fixture.stdin ?? '', inputPromptPolicy: fixture.policy ?? 'IGNORE', timeLimitMs: fixture.timeLimitMs ?? (fixture.fault ? 30000 : 15000), memoryLimitMb: 128, outputLimitBytes: MAX });
      assert(['pending', 'receipt'].includes(reply.type), `Run refused: ${reply.code}`);
      await sync('pending', identity);
      if (fixture.fault === 'cancel') {
        // A successful pre-cleanup release is a contract violation.
        const premature = await client.request({ type: 'release', ...scope });
        assert.equal(premature.type, 'error'); assert.equal(premature.code, 'BUSY');
        const cancelled = await client.request({ type: 'cancel', ...scope });
        assert.equal(cancelled.type, 'released'); assert.equal(cancelled.cleanup, 'removed');
        const after = await client.request({ type: 'receipt', ...scope });
        assert.equal(after.type, 'error'); assert.equal(after.code, 'UNCERTAIN');
        await sync('removed', identity);
        result.cases.push({ ...identity, outcome: 'CANCELLED', cleanup: 'removed', nonScoring: true });
      } else if (['restart', 'parent-oom', 'control-oom'].includes(fixture.fault)) {
        health = await client.request({ type: 'health' });
        assert.equal(health.type, 'health');
        scope.brokerGeneration = health.brokerGeneration;
        const uncertain = await receiptOnly(client, scope, await client.request({ type: 'receipt', ...scope }));
        assert.equal(uncertain.type, 'error'); assert(['UNCERTAIN', 'INFRASTRUCTURE'].includes(uncertain.code));
        const released = await client.request({ type: 'release', ...scope });
        assert.equal(released.type, 'released'); assert.equal(released.cleanup, 'removed');
        await sync('removed', identity);
        result.cases.push({ ...identity, outcome: uncertain.code, cleanup: 'removed', nonScoring: true });
      } else {
        reply = await receiptOnly(client, scope, reply);
        assert.equal(reply.type, 'receipt', `No receipt: ${reply.code}`);
        assert.equal(reply.receipt.cleanup, 'removed');
        const receipt = reply.receipt;
        const value = receipt.result;
        assert.equal(value.outcome, fixture.outcome ?? 'PASSED');
        assert.equal(value.outputTruncated, fixture.truncated ?? false);
        if (fixture.expected !== undefined) assert.equal(value.stdout, fixture.expected);
        if (fixture.error) assert(value.stderr.includes(fixture.error) && Buffer.byteLength(value.stderr) <= 262144);
        else assert.equal(value.stderr, '');
        if (fixture.isolation) {
          const facts = JSON.parse(value.stdout);
          assert.equal(facts.uid, 1000); assert.deepEqual(facts.fds, []);
          identity.isolation = facts;
        }
        const receiptHash = sha(JSON.stringify(receipt));
        if (fixture.fault === 'retained') {
          const before = { ...identity, receiptHash };
          await sync('retained', before);
          health = await client.request({ type: 'health' });
          assert.equal(health.type, 'health');
          assert.notEqual(health.brokerGeneration, scope.brokerGeneration);
          scope.brokerGeneration = health.brokerGeneration;
          const recovered = await client.request({ type: 'receipt', ...scope });
          assert.equal(recovered.type, 'receipt');
          assert.deepEqual(recovered.receipt, receipt);
          await sync('recovered', { ...identity, receiptHash: sha(JSON.stringify(recovered.receipt)) });
        }
        const ack = await client.request({ type: 'ack', ...scope, receiptId: receipt.receiptId, checkpointId: randomUUID() });
        assert.equal(ack.type, 'acknowledged');
        const released = await client.request({ type: 'release', ...scope });
        assert.equal(released.type, 'released'); assert.equal(released.cleanup, 'removed');
        await sync('removed', identity);
        result.cases.push({ ...identity, receiptHash, outcome: value.outcome, cleanup: 'removed', stdout: capture(value.stdout), stderr: capture(value.stderr), outputTruncated: value.outputTruncated, runtimeMs: value.runtimeMs });
      }
      await atomic(resultPath, result);
    }
    result.success = true;
  } catch (error) {
    // Assertions can contain multi-MiB output; retain only bounded classification.
    result.failure = { category: 'coordinator', name: error.name, code: error.code ?? null, completedCases: result.cases.length };
    process.exitCode = 1;
  } finally { await atomic(resultPath, result); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
