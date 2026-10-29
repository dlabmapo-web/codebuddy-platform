import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { manifest } from '../packages/grading-runtime/test/fixtures.mjs';
import {
  bindAcceptanceAuthority,
  acceptedRuntimeEvidence,
  inspectBrokerArtifact,
} from './native-grading-acceptance-authority.mjs';
function fixture() {
  const socket = '/owned/daemon.sock',
    app = '/owned/app.sock',
    generation = randomUUID();
  const artifacts = [
    'api',
    'worker',
    'web',
    'broker',
    'native',
    'compatibility',
  ].map((role, index) => ({
    role,
    daemonSocket: ['api', 'worker', 'web'].includes(role) ? app : socket,
    configId: 'sha256:' + String(index + 4).repeat(64),
    reference: 'fixture/' + role + '@sha256:' + String(index + 4).repeat(64),
  }));
  artifacts[4].configId = manifest.native.imageDigest;
  artifacts[5].configId = manifest.compatibility.imageDigest;
  const host = {
    daemonSocket: socket,
    applicationSocket: app,
    workerGeneration: generation,
    applicationImages: {
      api: artifacts[0].reference,
      worker: artifacts[1].reference,
    },
    images: [manifest.native, manifest.compatibility].map((r, i) => ({
      configId: r.imageDigest,
      architecture: r.architecture,
      packageManifestHash: r.packageManifestHash,
      pullReference: artifacts[i + 4].reference,
    })),
  };
  const config = {
    artifacts,
    runtime: {
      workerGeneration: generation,
      manifestPath: '/etc/cove-grading/manifest.json',
      socketPath: '/run/cove-grading-control/broker.sock',
    },
  };
  const api = { manifest, workerGeneration: generation },
    trees = {
      imageConfigId: artifacts[3].configId,
      imageTreeIdentity: 'actual-tree',
      hostTreeIdentity: 'actual-tree',
    };
  return { config, host, api, trees };
}
const bind = (f) =>
  bindAcceptanceAuthority(f.config, f.host, manifest, f.api, f.trees);
test('measured artifacts bind full manifest/application/host image authority before workload', () => {
  const f = fixture();
  assert.equal(
    bind(f).manifest.native.imageDigest,
    manifest.native.imageDigest,
  );
  for (const role of ['native', 'compatibility']) {
    const changed = structuredClone(f),
      image = changed.config.artifacts.find((a) => a.role === role);
    image.configId = 'sha256:' + 'a'.repeat(64);
    image.reference = 'installed-but-unused@sha256:' + 'a'.repeat(64);
    assert.throws(() => bind(changed), /Unused\/mismatched/);
  }
  const changed = structuredClone(f);
  changed.trees.imageTreeIdentity = 'different-installed-broker';
  assert.throws(() => bind(changed), /broker artifact tree/);
  const duplicate = structuredClone(f);
  duplicate.config.artifacts[5] = duplicate.config.artifacts[4];
  assert.throws(() => bind(duplicate), /one artifact/);
  const app = structuredClone(f);
  app.config.artifacts[0].reference = 'unused@sha256:' + 'b'.repeat(64);
  assert.throws(() => bind(app), /Application image/);
  const authority = structuredClone(f);
  authority.api.manifest.native.shimVersion = 'unused';
  authority.api.manifest.capabilities.runtimes[0].shimVersion = 'unused';
  assert.throws(() => bind(authority), /Actual application/);
});
test('accepted complete image/package/shim identity must match; unrecorded baseline stays explicitly unrecorded', () => {
  const authority = bind(fixture()),
    saved = {
      executionRuntimeSnapshot: manifest.native,
      engineVersion: 'cpython-3.12.16',
    };
  assert.equal(
    acceptedRuntimeEvidence(saved, 'candidate', authority).provenance,
    'recorded',
  );
  for (const change of [
    { imageDigest: 'sha256:' + 'e'.repeat(64) },
    { packageManifestHash: 'sha256:' + 'f'.repeat(64) },
    { shimVersion: 'different-shim' },
    { executionPolicy: 'different-policy' },
  ])
    assert.throws(() =>
      acceptedRuntimeEvidence(
        {
          ...saved,
          executionRuntimeSnapshot: { ...manifest.native, ...change },
        },
        'candidate',
        authority,
      ),
    );
  const historical = {
    executionRuntimeSnapshot: null,
    engineVersion: '0.27.5',
  };
  assert.throws(
    () =>
      acceptedRuntimeEvidence(historical, 'candidate', authority, 'unrecorded'),
    /Missing/,
  );
  assert.throws(
    () => acceptedRuntimeEvidence(historical, 'baseline', authority),
    /Missing/,
  );
  const evidence = acceptedRuntimeEvidence(
    historical,
    'baseline',
    authority,
    'unrecorded',
  );
  assert.equal(evidence.provenance, 'unrecorded');
  assert.equal(evidence.descriptor, null);
  assert.equal(
    evidence.actualCompatibilityArtifact,
    manifest.compatibility.imageDigest,
  );
});
test(
  'real stopped immutable broker carrier matches copied host tree and rejects changed host bytes',
  { skip: !process.env.COVE_NATIVE_BROKER_TEST_IMAGE },
  async () => {
    const endpoint = process.env.COVE_NATIVE_DOCKER_ENDPOINT;
    assert.match(endpoint, /^unix:\/\/\//);
    const docker = (args) =>
      execFileSync('docker', ['--host', endpoint, ...args], {
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 2 ** 20,
      });
    const image = JSON.parse(
      docker([
        'image',
        'inspect',
        process.env.COVE_NATIVE_BROKER_TEST_IMAGE,
        '--format',
        '{{json .}}',
      ]),
    );
    const directory = await mkdtemp(join(tmpdir(), 'native-broker-tree-')),
      owner = process.env.COVE_NATIVE_FIXTURE_ID + '-' + randomUUID();
    const id = docker([
      'create',
      '--pull',
      'never',
      '--read-only',
      '--network',
      'none',
      '--memory',
      '128m',
      '--cpus',
      '.1',
      '--pids-limit',
      '16',
      '--label',
      'cove.native.acceptance.artifact=' + owner,
      image.Id,
    ]).trim();
    try {
      docker(['cp', id + ':/opt/grading-runtime/.', directory]);
      const artifact = {
        daemonSocket: endpoint.slice('unix://'.length),
        configId: image.Id,
      };
      const trees = inspectBrokerArtifact(
        artifact,
        process.env.COVE_NATIVE_FIXTURE_ID,
        join(directory, 'dist/main.js'),
      );
      assert.equal(trees.imageTreeIdentity, trees.hostTreeIdentity);
      await appendFile(
        join(directory, 'dist/main.js'),
        '\n// owned changed tree\n',
      );
      const changed = inspectBrokerArtifact(
        artifact,
        process.env.COVE_NATIVE_FIXTURE_ID,
        join(directory, 'dist/main.js'),
      );
      assert.notEqual(changed.imageTreeIdentity, changed.hostTreeIdentity);
      const f = fixture();
      f.config.artifacts[3] = { ...f.config.artifacts[3], ...artifact };
      f.host.daemonSocket = artifact.daemonSocket;
      for (const a of f.config.artifacts.filter((a) =>
        ['native', 'compatibility'].includes(a.role),
      ))
        a.daemonSocket = artifact.daemonSocket;
      f.trees = changed;
      assert.throws(() => bind(f), /broker artifact tree/);
      console.log(
        JSON.stringify({
          evidence: 'actual-stopped-broker-artifact-tree',
          configId: image.Id,
          architecture: image.Architecture,
          imageTreeIdentity: trees.imageTreeIdentity,
          changedHostRejected: true,
          executionStarted: false,
        }),
      );
    } finally {
      const state = JSON.parse(docker(['inspect', id]))[0];
      assert.equal(state.State.Running, false);
      assert.equal(
        state.Config.Labels['cove.native.acceptance.artifact'],
        owner,
      );
      docker(['rm', id]);
      await rm(directory, { recursive: true, force: true });
    }
  },
);
