/** Disposable CI bundle: real image projections, production descriptor/schema. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { runtimeDescriptorSchema, runtimeManifestSchema } from '../../../../packages/shared/dist/index.js';
import { gradingDataLimits } from '../../../../packages/shared/dist/grading-limits.js';
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const check = (condition, message) => { if (!condition) throw new Error(message); };
export function descriptor(image, identity, packageBytes) {
  check(image.Os === 'linux' && image.Architecture === 'amd64', 'Linux AMD64 image required');
  check(/^sha256:[a-f0-9]{64}$/.test(image.Id), 'Immutable image config ID required');
  check(sha(packageBytes.toString().replace(/\n$/, '')) === identity.packageManifestHash, 'Package manifest content changed');
  const labels = image.Config?.Labels;
  for (const [label, key] of Object.entries({package:'packageManifestHash', shim:'shimVersion', engine:'engine', version:'engineVersion', python:'pythonVersion'}))
    check(labels?.['io.cove.grading.' + label] === identity[key], 'Pinned image label identity differs');
  check(identity.shimVersion === 'cove-guest-1', 'Unknown guest shim');
  check(identity.engine === 'cpython' ? identity.engineVersion === '3.12.16' && identity.pythonVersion === '3.12.16' : identity.engine === 'pyodide' && identity.engineVersion === '0.27.5' && identity.pythonVersion === '3.12.7', 'Unknown pinned engine identity');
  return runtimeDescriptorSchema.parse({version:1, ...identity, platform:'linux', architecture:'amd64', imageDigest:image.Id,
    memoryPolicy:identity.engine === 'cpython' ? 'native-cgroup-growth-v1' : 'pyodide-charged-growth-v1', executionPolicy:'wall-v1'});
}
export function bundle(native, compatibility) {
  check(native.engine === 'cpython' && compatibility.engine === 'pyodide' && native.imageDigest !== compatibility.imageDigest, 'Both distinct engines required');
  const manifest = runtimeManifestSchema.parse({version:1, compatibility, native, academyAllowances:[], certifications:[], historical:[], capabilities:{
    version:1, protocol:1, runtimes:[native, compatibility], nativeMemoryPolicy:'native-cgroup-growth-v1', maxActive:2, maxBackground:1, maxSpare:0,
    nativeProfile:{packageProfile:'standard-library', pythonFamily:'3.12', memoryLimitMb:{min:32,max:256}, timeLimitMs:{min:100,max:60000}},
    compatibilityProfile:{memoryLimitMb:{min:16,max:4096}, timeLimitMs:{min:1,max:60000}},
    codeChars:gradingDataLimits.codeChars, stdinChars:gradingDataLimits.testTextChars, stdoutBytes:gradingDataLimits.stdoutBytes, stderrBytes:gradingDataLimits.stderrBytes}});
  // 256 MiB control + (128+128) native + (128+320) compatibility = 960 MiB.
  return {manifest, warmProfiles:[native,compatibility].map(runtime => ({runtime,memoryLimitMb:128,targetReady:1}))};
}
async function main() {
  const [input, output] = process.argv.slice(2);
  check(input && output && process.argv.length === 4, 'Usage: bundle.mjs INPUT OUTPUT');
  const raw = await readFile(input); check(raw.length <= 1024*1024, 'Oversized image projections');
  const entries = JSON.parse(raw);
  const runtimes = await Promise.all(['cpython','pyodide'].map(async engine => {
    const entry = entries[engine];
    return descriptor(entry.image, entry.identity, await readFile(entry.packageManifestPath));
  }));
  await writeFile(output, JSON.stringify(bundle(...runtimes)) + '\n', {mode:0o600,flag:'wx'});
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
