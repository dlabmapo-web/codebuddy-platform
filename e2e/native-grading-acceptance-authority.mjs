/** Evidence identity checks; production schemas remain the grading authority. */
import { isDeepStrictEqual } from 'node:util';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import {
  runtimeManifestSchema,
  runtimeDescriptorSchema,
  runtimeDescriptorIdentity,
} from '../packages/shared/dist/index.js';
const roles = ['api', 'worker', 'web', 'broker', 'native', 'compatibility'];
export function bindAcceptanceAuthority(
  config,
  hostConfig,
  inputManifest,
  apiAuthority,
  brokerTrees,
) {
  const manifest = runtimeManifestSchema.parse(inputManifest);
  if (
    !Array.isArray(config.artifacts) ||
    config.artifacts.length !== roles.length ||
    new Set(config.artifacts.map((a) => a.role)).size !== roles.length ||
    !roles.every((role) => config.artifacts.some((a) => a.role === role))
  )
    throw new Error('Exactly one artifact per measured role required');
  if (
    config.runtime?.workerGeneration !== hostConfig.workerGeneration ||
    apiAuthority.workerGeneration !== hostConfig.workerGeneration ||
    !isDeepStrictEqual(
      runtimeManifestSchema.parse(apiAuthority.manifest),
      manifest,
    )
  )
    throw new Error('Actual application manifest/worker authority mismatch');
  if (
    config.runtime.manifestPath !== '/etc/cove-grading/manifest.json' ||
    config.runtime.socketPath !== '/run/cove-grading-control/broker.sock'
  )
    throw new Error('Fixture must use the verified production mount authority');
  const byRole = Object.fromEntries(config.artifacts.map((a) => [a.role, a]));
  for (const role of ['api', 'worker', 'web']) {
    if (byRole[role].daemonSocket !== hostConfig.applicationSocket)
      throw new Error('Application daemon authority mismatch');
    if (
      role !== 'web' &&
      byRole[role].reference !== hostConfig.applicationImages[role]
    )
      throw new Error('Application image authority mismatch');
  }
  const registered = new Map();
  for (const image of hostConfig.images) {
    if (registered.has(image.configId))
      throw new Error('Duplicate host guest image authority');
    registered.set(image.configId, image);
  }
  for (const runtime of manifest.capabilities.runtimes) {
    const image = registered.get(runtime.imageDigest);
    if (
      !image ||
      image.architecture !== runtime.architecture ||
      image.packageManifestHash !== runtime.packageManifestHash
    )
      throw new Error(
        'Full manifest capability image/package authority mismatch',
      );
  }
  if (!manifest.native) throw new Error('Candidate native runtime is absent');
  for (const [role, runtime] of [
    ['native', manifest.native],
    ['compatibility', manifest.compatibility],
  ]) {
    const artifact = byRole[role],
      image = registered.get(runtime.imageDigest);
    if (
      artifact.daemonSocket !== hostConfig.daemonSocket ||
      artifact.configId !== runtime.imageDigest ||
      artifact.reference !== image.pullReference
    )
      throw new Error('Unused/mismatched ' + role + ' artifact');
  }
  if (
    byRole.broker.daemonSocket !== hostConfig.daemonSocket ||
    brokerTrees.imageConfigId !== byRole.broker.configId ||
    brokerTrees.imageTreeIdentity !== brokerTrees.hostTreeIdentity
  )
    throw new Error('Unused/mismatched broker artifact tree');
  return { manifest, byRole, brokerTrees };
}
export function acceptedRuntimeEvidence(
  saved,
  phase,
  authority,
  baselineProvenance = 'recorded',
) {
  if (saved.executionRuntimeSnapshot == null) {
    if (
      phase !== 'baseline' ||
      baselineProvenance !== 'unrecorded' ||
      ![
        authority.manifest.compatibility.engineVersion,
        'pyodide-' + authority.manifest.compatibility.engineVersion,
      ].includes(saved.engineVersion)
    )
      throw new Error('Missing recorded runtime identity');
    return {
      provenance: 'unrecorded',
      engineVersion: saved.engineVersion,
      descriptor: null,
      actualCompatibilityArtifact: authority.byRole.compatibility.configId,
      limitation:
        'Historical row has no recorded image/package provenance; actual adapter artifact is separately bound',
    };
  }
  const descriptor = runtimeDescriptorSchema.parse(
      saved.executionRuntimeSnapshot,
    ),
    expected =
      phase === 'candidate'
        ? authority.manifest.native
        : authority.manifest.compatibility;
  if (
    runtimeDescriptorIdentity(descriptor) !==
    runtimeDescriptorIdentity(expected)
  )
    throw new Error(
      'Accepted full runtime descriptor differs from measured authority',
    );
  return { provenance: 'recorded', descriptor };
}
/** Inspect an artifact carrier without ever starting its code. Exact owned ID cleanup. */
export function inspectBrokerArtifact(artifact, fixtureId, hostEntrypoint) {
  if (
    !isAbsolute(artifact.daemonSocket) ||
    !isAbsolute(hostEntrypoint) ||
    !/^[a-z0-9-]{8,80}$/.test(fixtureId) ||
    !/^sha256:[a-f0-9]{64}$/.test(artifact.configId)
  )
    throw new Error('Explicit local owned artifact inspection required');
  const docker = (args, options = {}) =>
    execFileSync(
      'docker',
      ['--host', 'unix://' + artifact.daemonSocket, ...args],
      { timeout: 30000, maxBuffer: 64 * 2 ** 20, ...options },
    );
  const owner = fixtureId + '-' + randomUUID();
  const id = docker([
    'create',
    '--pull',
    'never',
    '--network',
    'none',
    '--read-only',
    '--memory',
    '128m',
    '--cpus',
    '.1',
    '--pids-limit',
    '16',
    '--label',
    'cove.native.acceptance.artifact=' + owner,
    artifact.configId,
  ])
    .toString()
    .trim();
  if (!/^[a-f0-9]{64}$/.test(id))
    throw new Error('Invalid artifact carrier ID');
  const owned = () =>
    JSON.parse(
      docker(
        [
          'inspect',
          '--format',
          '{{json .State.Running}} {{json .Config.Labels}}',
          id,
        ],
        { encoding: 'utf8' },
      ).replace(/^(true|false) /, '[$1,') + ']',
    );
  try {
    const [running, labels] = owned();
    if (running || labels['cove.native.acceptance.artifact'] !== owner)
      throw new Error('Artifact carrier ownership/state mismatch');
    const tar = docker(['cp', id + ':/opt/grading-runtime/.', '-']);
    return {
      ...JSON.parse(
        execFileSync(
          'python3',
          ['e2e/native-grading-broker-tree.py', hostEntrypoint],
          { input: tar, timeout: 30000, maxBuffer: 2 ** 20, encoding: 'utf8' },
        ),
      ),
      imageConfigId: artifact.configId,
    };
  } finally {
    const [running, labels] = owned();
    if (running || labels['cove.native.acceptance.artifact'] !== owner)
      throw new Error('Refusing unowned/running artifact cleanup');
    docker(['rm', id]);
  }
}
