import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDeployment } from './deployment-contract.mjs';
const config = { cgroupRoot: '/sys/fs/cgroup/fixture', manifest: { descriptor: { engine: 'native' }, resources: { physicalMemoryMb: 4096, envelopeMemoryMb: 2560, maxCaseMemoryMb: 512 } } };
const good = { family: 'native', descriptor: JSON.stringify(config.manifest.descriptor), uid: 0, launcherUid: 0, workerUid: 0, readOnlySource: true, readOnlyRootfs: true, workerCapsDropped: true, launcherPrivateEnvironment: true, serviceLeaf: config.cgroupRoot + '/service', parentPids: 256, mounts: [{ kind: 'artifact', readOnly: true }], network: 'private' };
test('requires immutable exact descriptor, private mounts, common UID and envelope', () => {
    assert.equal(validateDeployment(good, config), true);
    for (const bad of [{ family: 'pyodide' }, { descriptor: 'wrong' }, { publicPorts: [80] }, { privileged: true }, { dockerSocket: true }, { hostRoot: true }, { network: 'host' }, { workerUid: 42 }, { workerCapsDropped: false }, { readOnlyRootfs: false }, { serviceLeaf: '/other' }, { parentPids: 0 }, { parentPids: undefined }, { mounts: [{ kind: 'host' }] }])
        assert.throws(() => validateDeployment({ ...good, ...bad }, config));
    assert.throws(() => validateDeployment(good, { ...config, manifest: { ...config.manifest, resources: { ...config.manifest.resources, envelopeMemoryMb: 4000 } } }));
});
