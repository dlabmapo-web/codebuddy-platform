// Local component benchmark, never browser or VPS acceptance.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { createSandboxDriver } from '../src/sandbox.mjs';

const args = process.argv.slice(2);
const option = (key, fallback) => { const at = args.indexOf('--' + key); return at < 0 ? fallback : args[at + 1]; };
const pairs = Number(option('pairs', '20')), baseline = option('baseline', '739422ec');
if (!Number.isInteger(pairs) || pairs < 1 || pairs > 100 || !/^[a-f0-9]{7,40}$/.test(baseline)) throw new Error('Invalid fixture bounds/revision');
if (process.env.SSH_CONNECTION || process.env.SSH_CLIENT || (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://'))) throw new Error('Local Docker fixture only');
const docker = (...values) => execFileSync('docker', values, { encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1048576 }).trim();
const context = docker('context', 'show');
if (!JSON.parse(docker('context', 'inspect', context))[0].Endpoints.docker.Host.startsWith('unix://')) throw new Error('Local Unix Docker context required');
const image = JSON.parse(docker('image', 'inspect', option('image', 'cove-turtle-cold:baseline')))[0];
const output = resolve(option('output', '/tmp/cove-turtle-display-readiness.json'));
const baselineSource = execFileSync('git', ['show', baseline + ':packages/gui-runtime/src/sandbox.mjs'], { encoding: 'utf8' });
const directory = await mkdtemp(join(tmpdir(), 'cove-display-baseline-'));
const baselinePath = join(directory, 'sandbox.mjs'); await writeFile(baselinePath, baselineSource);
const sources = [baselineSource, await readFile(new URL('../src/sandbox.mjs', import.meta.url), 'utf8'), await readFile(new URL('../src/display-readiness.mjs', import.meta.url), 'utf8')];
const report = { boundary: 'fresh display preparation plus claim inspection; excludes API, Python program, RFB and browser drawing',
  releaseAcceptance: 'not assessed', baselineRevision: baseline, context, image: image.Id, arch: image.Architecture,
  profile: { memoryMiB: 512, cpus: 1, capacity: 1, warm: false },
  sourceHashes: Object.fromEntries(['baseline', 'candidate', 'watcher'].map((key, i) => [key, createHash('sha256').update(sources[i]).digest('hex')])),
  failures: 0, samples: [] };
let stopped = false, controller;
const cancel = () => { stopped = true; controller?.abort(); };
process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
try {
  const before = await import(pathToFileURL(baselinePath));
  const instance = 'fixture-display-' + randomUUID().slice(0, 8);
  for (let pair = 0; pair < pairs && !stopped && !report.failures; pair++) {
    // Reverse order on every pair to reduce consistent first/second bias.
    for (const mode of pair % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
      const stages = [], sample = { pair, mode, correct: false, cleanup: false };
      const telemetry = { time: async (stage, _mode, operation) => {
        const began = performance.now(); try { return await operation(); }
        finally { stages.push({ stage, ms: performance.now() - began }); }
      } };
      const driver = (mode === 'baseline' ? before.createSandboxDriver : createSandboxDriver)({
        seccomp: fileURLToPath(new URL('../docker/seccomp.json', import.meta.url)), pool: 'trial', instance, telemetry });
      const entry = { name: 'cove-gui-' + instance + '-slot-0', generation: randomUUID(), mode: 'cold',
        profile: { runtimeImage: image.Id, width: 1024, height: 640, memoryLimitMb: 512 } };
      controller = new AbortController();
      const began = performance.now();
      try {
        await driver.prepare(entry, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
        await driver.inspect(entry, AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]));
        sample.ms = performance.now() - began; sample.correct = true;
      } catch (error) { report.failures++; sample.failureKind = error.name; }
      finally {
        sample.stages = stages;
        try { await driver.remove(entry); sample.cleanup = true; }
        catch { report.failures++; }
      }
      report.samples.push(sample);
      if (report.failures || stopped) break;
    }
  }
} catch (error) { report.failures++; report.failureKind = error.name; }
finally {
  process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
  await rm(directory, { recursive: true, force: true });
  report.interrupted = stopped;
  report.summary = Object.fromEntries(['baseline', 'candidate'].map(mode => {
    const samples = report.samples.filter(s => s.mode === mode && s.correct);
    const values = samples.map(s => s.ms).sort((a, b) => a - b);
    const percentile = p => values[Math.max(0, Math.ceil(p * values.length) - 1)] ?? null;
    return [mode, { completed: samples.length, p50Ms: percentile(.5), diagnosticP95Ms: percentile(.95) }];
  }));
  await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, failures: report.failures, ...report.summary }));
}
if (report.failures || stopped) process.exitCode = 2;
