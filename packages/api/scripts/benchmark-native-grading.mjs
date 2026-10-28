#!/usr/bin/env node
// Local-only feasibility experiment. This is never an application execution path.
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prototypeBudget } from '../prototypes/native-grading/budget.mjs';

const args = process.argv.slice(2);
const option = (key, fallback) => { const at = args.indexOf('--' + key); return at < 0 ? fallback : args[at + 1]; };
const runs = Number(option('runs', '3')), cases = Number(option('cases', '5')), parallel = Number(option('parallel', '1'));
const capacity = Number(option('concurrency', '2')), budget = prototypeBudget(capacity);
if (!Number.isInteger(runs) || runs < 1 || runs > 100 || ![1, 5, 10].includes(cases) || ![1, 2, 4].includes(parallel) || parallel > capacity) throw new Error('Invalid local fixture bounds');
const command = (...items) => execFileSync('docker', items, { encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1048576 }).trim();
if (process.env.SSH_CONNECTION || process.env.SSH_CLIENT || (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://'))) throw new Error('Local prototype refuses SSH/remote Docker hosts');
const context = command('context', 'show');
const contextInfo = JSON.parse(command('context', 'inspect', context))[0];
if (!contextInfo.Endpoints?.docker?.Host?.startsWith('unix://')) throw new Error('Local Unix Docker context required');
if (command('ps', '-aq', '--filter', 'label=cove.native.prototype.instance') || command('ps', '-q', '--filter', 'label=cove.performance-fixture=true')) throw new Error('Another grading fixture exists; do not overlap experiment budgets');
const image = JSON.parse(command('image', 'inspect', option('image', 'cove-native-grading:prototype')))[0];
const controllerImage = JSON.parse(command('image', 'inspect', option('controller-image', 'cove-native-controller:prototype')))[0];
if (image.Config.Labels?.['cove.native.prototype.guest'] !== 'true' || controllerImage.Config.Labels?.['cove.native.prototype.controller'] !== 'true') throw new Error('Approved local prototype images required');
const instance = randomUUID(), name = `cove-native-controller-${instance}`;
const label = 'cove.native.prototype.instance';
const output = resolve(option('output', `/tmp/cove-native-${Date.now()}.json`));
const prototypeDirectory = fileURLToPath(new URL('../prototypes/native-grading/', import.meta.url));
const sourceFiles = Object.fromEntries(['supervisor.py', 'learner.py', 'native-pool.mjs', 'docker-driver.mjs', 'controller.mjs', 'seccomp.json', 'budget.mjs'].map(file =>
  [file, createHash('sha256').update(readFileSync(resolve(prototypeDirectory, file))).digest('hex')]));
let child, interrupted = false;
function cleanup() {
  const ids = command('ps', '-aq', '--no-trunc', '--filter', `label=${label}=${instance}`).split('\n').filter(Boolean);
  for (const id of ids) {
    const info = JSON.parse(command('inspect', id))[0];
    if (info.Config.Labels?.[label] !== instance) throw new Error('Refusing cross-fixture cleanup');
    command('rm', '-f', id);
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  interrupted = true;
  try { cleanup(); } catch { /* Final cleanup/result records the failure. */ }
  child?.kill('SIGTERM');
});
const config = { image: image.Id, instance, runs, cases, parallel, capacity, sourceFiles };
child = spawn('docker', ['run', '--name', name, '--label', `${label}=${instance}`,
  '--network', 'none', '--read-only', '--log-driver', 'none', '--user', '0:0', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
  '--cpus', String(budget.controllerCpu), '--memory', `${budget.controllerMemoryMiB}m`, '--memory-swap', `${budget.controllerMemoryMiB}m`, '--pids-limit', '128',
  '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '-v', '/var/run/docker.sock:/var/run/docker.sock:ro',
  controllerImage.Id, JSON.stringify(config)], { stdio: ['ignore', 'pipe', 'pipe'] });
let stdout = '', stderr = '';
child.stdout.on('data', bytes => { stdout += bytes; if (stdout.length > 8 * 1048576) child.kill(); });
child.stderr.on('data', bytes => { if (stderr.length < 16000) stderr += bytes; });
const deadline = setTimeout(() => { interrupted = true; try { cleanup(); } catch {} child.kill(); }, 30 * 60_000);
let code, cleanupError, controllerTermination;
try { code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); }); }
finally {
  clearTimeout(deadline);
  try { const state = JSON.parse(command('inspect', name))[0].State; controllerTermination = { oomKilled: state.OOMKilled, exitCode: state.ExitCode }; } catch {}
  try { cleanup(); } catch (error) { cleanupError = error.name; }
}
let data;
try { data = JSON.parse(stdout.trim().split('\n').at(-1)); }
catch { data = { failures: 1, failurePhase: 'controller', failureKind: 'Missing valid fixture report', cleanupConfirmed: false, samples: [] }; }
const sourceMatches = ['native-pool.mjs', 'docker-driver.mjs', 'controller.mjs', 'budget.mjs', 'seccomp.json'].every(name => data.controllerSourceFiles?.[name] === sourceFiles[name]);
if (!sourceMatches) { data.failures++; data.failurePhase = 'source-check'; data.failureKind = 'Native controller source/image mismatch'; }
const values = data.samples.filter(s => s.cases.length === cases && s.cases.every(c => c.correct)).map(s => s.engineOnlyMs).sort((a, b) => a - b);
const percentile = p => values.length ? values[Math.min(values.length - 1, Math.ceil(p * values.length) - 1)] : null;
const report = { ...data, hostBoundary: 'local Linux Docker fixture; not production VPS performance', context,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()), sourceFiles,
  image: image.Id, controllerImage: controllerImage.Id, imageArchitecture: image.Architecture,
  requestedRuns: runs, cases, parallel, capacity, completedRuns: data.samples.length,
  diagnosticEngineP50Ms: percentile(.5), diagnosticEngineP95Ms: percentile(.95),
  interrupted, sourceMatches, controllerTermination, outerCleanupConfirmed: !cleanupError, ...(cleanupError ? { cleanupError } : {}) };
mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, failures: report.failures, failurePhase: report.failurePhase, completedRuns: report.completedRuns,
  p50Ms: report.diagnosticEngineP50Ms, p95Ms: report.diagnosticEngineP95Ms, cleanupConfirmed: report.cleanupConfirmed && report.outerCleanupConfirmed }));
if (code !== 0 || report.failures || interrupted || cleanupError) {
  if (!stdout.trim()) process.stderr.write(stderr);
  process.exitCode = 2;
}
