import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWarmConfiguration as validate } from './warm-config.mjs';
import { Telemetry } from './telemetry.mjs';
import { verifySandbox } from './sandbox.mjs';
const env = { NODE_ENV: 'production', GUI_WARM_STANDBY: '1', GUI_REQUIRE_ROOTLESS: 'true', GUI_TRIAL_ONLY: 'true', GUI_SESSION_CAPACITY: '1', GUI_RUNTIME_IMAGE: 'digest', GUI_METRICS_SECRET: 'fixture-metrics-secret-not-production' };
const metrics = 'cove_turtle_slice_collected_at_seconds 0.1\ncove_turtle_slice_memory_limit_bytes 2147483648\n';
const envelope = { version: 1, verified: true, image: 'digest', checkedAt: 100,
  memoryMax: 2147483648, memoryHigh: 1610612736, swapMax: 0, cpuQuota: 1.5, tasksMax: 256, hostMemory: 12 * 1024 ** 3, allocatedMemory: 8 * 1024 ** 3 };
test('warm mode defaults off; rejects invalid values and production test bypasses', () => {
  assert.equal(validate({}), false);
  for (const value of ['true', '2', '']) assert.throws(() => validate({ GUI_WARM_STANDBY: value }));
  assert.throws(() => validate({ ...env, GUI_WARM_LOCAL_FIXTURE: '1', GUI_BIND_ADDRESS: '127.0.0.1', GUI_INSTANCE_ID: 'fixture-test' }));
});
test('verified rootless trial budget is required for production', () => {
  assert.equal(validate(env, envelope, 101, metrics), true);
  for (const key of Object.keys(envelope)) assert.throws(() => validate(env, { ...envelope, [key]: undefined }, 101, metrics), key);
  for (const key of ['GUI_REQUIRE_ROOTLESS', 'GUI_TRIAL_ONLY', 'GUI_SESSION_CAPACITY']) assert.throws(() => validate({ ...env, [key]: 'false' }, envelope, 101, metrics));
  assert.throws(() => validate(env, envelope, 86400200));
  assert.throws(() => validate(env, { ...envelope, allocatedMemory: 10 * 1024 ** 3 }, 101, metrics));
  assert.throws(() => validate(env, envelope, 101, ''));
  assert.throws(() => validate(env, envelope, 70000, metrics));
});
test('explicit local fixture is restricted to test process, loopback, trial and named instance', () => {
  const local = { ...env, NODE_ENV: 'test', GUI_WARM_LOCAL_FIXTURE: '1', GUI_BIND_ADDRESS: '127.0.0.1', GUI_INSTANCE_ID: 'fixture-warm' };
  assert.equal(validate(local), true);
  assert.throws(() => validate({ ...local, GUI_BIND_ADDRESS: '0.0.0.0' }));
  assert.throws(() => validate({ ...local, GUI_INSTANCE_ID: 'trial' }));
});
test('telemetry rejects cardinality inputs and exports cumulative histograms', () => {
  const m = new Telemetry(); m.observe('launch', 'warm', 20); m.observe('launch', 'warm', 2000); m.increment('warm_hit');
  const output = m.render({ allocated: 2 });
  assert.match(output, /cove_turtle_stage_seconds_count\{stage="launch",mode="warm"\} 2/);
  assert.match(output, /cove_turtle_stage_seconds_bucket\{stage="launch",mode="warm",le="1"\} 1/);
  assert.match(output, /cove_turtle_allocated 2/);
  assert.throws(() => m.increment('secret-session-id')); assert.throws(() => m.observe('source', 'warm', 1));
});
test('claim validation checks image, live process, isolation and enforced ceilings', () => {
  const p = { runtimeImage: 'sha256:good', memoryLimitMb: 512 };
  const info = { Image: p.runtimeImage, State: { Running: true }, Config: { User: '1000:1000' }, Mounts: [], HostConfig: {
    NetworkMode: 'none', ReadonlyRootfs: true, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges', 'seccomp=profile'],
    Privileged: false, Memory: 536870912, MemorySwap: 536870912, NanoCpus: 1000000000, PidsLimit: 64, CgroupnsMode: 'private',
    Tmpfs: { '/assets': 'mode=0555,uid=0,gid=0' } } };
  verifySandbox(info, p);
  for (const [key, value] of Object.entries({ NetworkMode: 'host', ReadonlyRootfs: false, CapDrop: [], SecurityOpt: ['seccomp=unconfined'], Privileged: true, Memory: 0, MemorySwap: -1, NanoCpus: 0, PidsLimit: 0, CgroupnsMode: 'host' }))
    assert.throws(() => verifySandbox({ ...info, HostConfig: { ...info.HostConfig, [key]: value } }, p), key);
  assert.throws(() => verifySandbox({ ...info, Image: 'sha256:other' }, p));
  assert.throws(() => verifySandbox({ ...info, State: { Running: false } }, p));
  assert.throws(() => verifySandbox({ ...info, Mounts: [{ Type: 'bind' }] }, p));
  assert.throws(() => verifySandbox({ ...info, HostConfig: { ...info.HostConfig, Tmpfs: { '/assets': 'mode=1777,uid=0,gid=0' } } }, p));
});
