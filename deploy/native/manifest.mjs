import { validateLauncherLibraries } from './validate-artifacts.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { arch, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [artifactArg, cgroupRoot, output] = process.argv.slice(2);
if (!artifactArg || !(cgroupRoot === '/sys/fs/cgroup' || cgroupRoot?.startsWith('/sys/fs/cgroup/')) || !output?.startsWith('/'))
    throw Error('Usage: manifest.mjs ARTIFACT ABSOLUTE_DELEGATED_CGROUP ABSOLUTE_CONFIG');
const artifact = resolve(artifactArg);
await validateLauncherLibraries(artifact);
const { fileDigest, rootfsDigest } = await import(pathToFileURL(artifact + '/worker/node_modules/@cove/grading-runtime/dist/index.js'));
const { actualComparatorIdentity } = await import(pathToFileURL(artifact + '/worker/dist/src/judge/comparator-identity.js'));
const { nativeReleaseManifestSchema } = await import(pathToFileURL(artifact + '/worker/node_modules/@cove/shared/dist/index.js'));
// Qualification sizing by default. A production node passes its own envelope and
// admission scope; physical memory is always measured, never configured.
const resources = { envelopeMemoryMb: 2560, serviceOverheadMb: 1024, caseOverheadMb: 128, cpuSlots: 2, officialReservedSlots: 1, officialReservedMemoryMb: 656, maxCaseMemoryMb: 512, maxCasePids: 8, scratchMb: 16, ...JSON.parse(process.env.NATIVE_NODE_RESOURCES || '{}'), physicalMemoryMb: Math.floor(totalmem() / 1048576) };
const eligibility = JSON.parse(process.env.NATIVE_ELIGIBILITY || '[]');
const rootfsPath = artifact + '/rootfs', nsjailPath = artifact + '/nsjail', policyPath = artifact + '/python.policy';
const manifest = nativeReleaseManifestSchema.parse({ schemaVersion: 1, descriptor: { schemaVersion: 1, engine: 'native-cpython', pythonVersion: '3.12.12', architecture: arch() === 'arm64' ? 'arm64' : 'amd64', rootfsDigest: await rootfsDigest(rootfsPath), packageManifestDigest: await fileDigest(rootfsPath + '/opt/cove/packages.json'), nsjailRevision: 'd8415bc8eea43cdd413daba25af63127019a1189', nsjailBinaryDigest: await fileDigest(nsjailPath), sandboxPolicyVersion: 'nsjail-cpython-v1', sandboxPolicyDigest: await fileDigest(policyPath), guestBootstrapDigest: await fileDigest(rootfsPath + '/opt/cove/bootstrap.py'), comparator: await actualComparatorIdentity() }, resources, eligibility });
if (manifest.descriptor.rootfsDigest !== (await readFile(artifact + '/rootfs.digest', 'utf8')).trim())
    throw Error('Rootfs does not match build');
await writeFile(output, JSON.stringify({ manifest, rootfsPath, nsjailPath, policyPath, cgroupRoot, workRoot: resolve(output, '../work'), socketPath: resolve(output, '../socket/executor.sock') }, null, 2), { mode: 0o600 });
const plan = { family: 'native', descriptor: JSON.stringify(manifest.descriptor), uid: process.getuid(), launcherUid: process.getuid(), workerUid: process.getuid(), readOnlySource: true, readOnlyRootfs: true, workerCapsDropped: true, launcherPrivateEnvironment: true, serviceLeaf: cgroupRoot + '/service', parentPids: 256, mounts: [{ kind: 'artifact', readOnly: true }, { kind: 'work', readOnly: false }, { kind: 'socket', readOnly: false }, { kind: 'cgroup', readOnly: false }], network: 'private', publicPorts: [] };
await writeFile(output + '.deployment.json', JSON.stringify(plan, null, 2), { mode: 0o600 });
console.log(JSON.stringify(manifest));
