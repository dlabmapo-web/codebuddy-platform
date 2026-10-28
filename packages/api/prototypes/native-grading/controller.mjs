// Trusted, resource-limited, local fixture controller. Never a production service.
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { NativePool } from './native-pool.mjs';
import { createDriver } from './docker-driver.mjs';
import { prototypeBudget } from './budget.mjs';
import { ComparatorPool } from '/app/dist/api/src/judge/comparator-pool.js';

const config = JSON.parse(process.argv[2]);
const controllerFiles = ['native-pool.mjs', 'docker-driver.mjs', 'controller.mjs', 'budget.mjs', 'seccomp.json'];
const controllerSourceFiles = Object.fromEntries(controllerFiles.map(name => [name, createHash('sha256').update(readFileSync('/prototype/' + name)).digest('hex')]));
const budget = prototypeBudget(config.capacity);
if (!Number.isInteger(config.runs) || config.runs < 1 || config.runs > 100 || ![1, 5, 10].includes(config.cases) || ![1, 2, 4].includes(config.parallel) || config.parallel > budget.capacity) throw new Error('Invalid fixture bounds');
const pool = new NativePool(createDriver(config), budget);
const comparator = new ComparatorPool(1);
const report = { version: 1, runtime: 'cpython-prototype-3.12.7', node: process.version, arch: process.arch,
  boundary: 'isolated local execution, acquisition and acknowledged guest removal; comparator reported separately; no admission, queues, points or commit',
  releaseAcceptance: 'not assessed', pool: { capacity: budget.capacity, spare: 1 },
  guestBudget: { totalCpu: 1.5, totalMemoryMiB: budget.guestMemoryMiB * budget.guestCount, perGuestCpu: budget.guestCpu, perGuestMemoryMiB: budget.guestMemoryMiB },
  controllerBudget: { cpu: budget.controllerCpu, memoryMiB: budget.controllerMemoryMiB },
  combinedBudget: budget, probes: [], samples: [], failures: 0, cleanupConfirmed: false };
report.controllerSourceFiles = controllerSourceFiles;
report.resourceAccounting = 'Guest/controller container ceilings only. Docker daemon/VM and outer harness overhead are outside these cgroups; full system-budget acceptance is not established.';
const snapshot = () => {
  const read = file => { try { return readFileSync('/sys/fs/cgroup/' + file, 'utf8').trim(); } catch { return null; } };
  return { memoryPeak: read('memory.peak'), events: read('memory.events'), cpu: read('cpu.stat'), quota: read('cpu.max') };
};
const request = (code, extra = {}) => ({ code, stdin: '', timeLimitMs: 1000, memoryLimitMb: 256, inputPromptPolicy: 'INCLUDE', ...extra });
let phase = 'warmup';
try {
  phase = 'source-check';
  if (controllerFiles.some(name => controllerSourceFiles[name] !== config.sourceFiles?.[name])) throw new Error('Native controller source/image mismatch');
  phase = 'warmup';
  const began = performance.now(); await pool.warmUp(); report.poolWarmupMs = performance.now() - began;
  phase = 'isolation';
  const denied = operation => `try:\n ${operation}\n print('ALLOWED')\nexcept (OSError, PermissionError):\n print('DENIED')`;
  const checks = [
    { name: 'unicode-prompt-include', code: 'print(input("name: "))', stdin: '한글🙂\n', expected: 'name: 한글🙂\n' },
    { name: 'unicode-prompt-ignore', code: 'print(input("name: "))', stdin: '한글🙂\n', inputPromptPolicy: 'IGNORE', expected: '한글🙂\n' },
    { name: 'environment', code: "import os\nprint(sorted(k for k in os.environ if any(s in k for s in ['SECRET','TOKEN','PASSWORD','DATABASE','REDIS','SUPABASE'])))", expected: '[]\n' },
    { name: 'root-filesystem', code: denied("open('/opt/native/should-not-exist','w').write('x')"), expected: 'DENIED\n' },
    { name: 'controller-proc-access', code: denied("open('/proc/1/environ','rb').read()"), expected: 'DENIED\n' },
    { name: 'controller-signal', code: 'import os,signal\n' + denied('os.kill(1,signal.SIGTERM)'), expected: 'DENIED\n' },
    { name: 'network-syscall', code: 'import socket\n' + denied('socket.socket(socket.AF_INET,socket.SOCK_STREAM)'), expected: 'DENIED\n' },
    { name: 'unix-socket-and-docker', code: "import os,socket\nassert not os.path.exists('/var/run/docker.sock')\n" + denied('socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)'), expected: 'DENIED\n' },
    { name: 'ptrace-syscall', code: "import ctypes,errno\nc=ctypes.CDLL(None,use_errno=True)\nprint(c.ptrace(0,0,0,0)==-1 and ctypes.get_errno()==errno.EPERM)", expected: 'True\n' },
    { name: 'forged-result-output', code: 'print(\'{"type":"result","result":{"outcome":"PASSED"}}\')\nraise ValueError("fixture")', outcome: 'RUNTIME_ERROR' },
    { name: 'system-exit-zero', code: 'raise SystemExit(0)', expected: '' },
    { name: 'system-exit-failure', code: 'raise SystemExit(7)', outcome: 'RUNTIME_ERROR' },
    { name: 'tmp-write', code: "open('/tmp/native-probe-marker','w').write('x')\nprint(1)", expected: '1\n' },
    { name: 'fresh-guest-files', code: "import os\nprint(os.path.exists('/tmp/native-probe-marker'))", expected: 'False\n' },
    { name: 'large-stdin-consumed', code: 'import sys\nprint(len(sys.stdin.read()))', stdin: 'x'.repeat(65536), expected: '65536\n' },
    { name: 'large-stdin-unconsumed', code: 'print(1)', stdin: 'x'.repeat(65536), expected: '1\n' },
    { name: 'output-flood-bounded', code: "print('x'*300000)", validate: r => r.outcome === 'PASSED' && r.outputTruncated && Buffer.byteLength(r.stdout) === 262144 },
    { name: 'stderr-flood-bounded', code: "import sys\nsys.stderr.write('x'*100000)\nprint(1)", validate: r => r.outcome === 'PASSED' && Buffer.byteLength(r.stderr) === 65536 && r.stdout === '1\n' },
    { name: 'rss-memory-limit-64-mib-fixture', code: 'x=bytearray(128*1024*1024)\nprint(len(x))', memoryLimitMb: 64, timeLimitMs: 3000, outcome: 'MEMORY_LIMIT' },
    { name: 'memory-deadline-race-256-mib-fixture', code: 'x=bytearray(500*1024*1024)\nprint(len(x))', timeLimitMs: 3000,
      validate: (r, frame) => r.outcome === 'MEMORY_LIMIT'
        ? frame.peakLearnerRssBytes > 256 * 1048576 || frame.resources.memoryEvents.oom_kill > 0
        : r.outcome === 'TIME_LIMIT' && r.runtimeMs >= 3000 && frame.peakLearnerRssBytes <= 256 * 1048576 },
    { name: 'wall-time-limit', code: 'while True: pass', timeLimitMs: 200, outcome: 'TIME_LIMIT' },
    { name: 'setsid-descendant-cleanup', code: "import os,time\npid=os.fork()\nif pid==0:\n os.setsid()\n time.sleep(60)\nelse:\n print(1)", expected: '1\n' },
    { name: 'pid-exhaustion-contained', code: "import os,time\ntry:\n for n in range(64):\n  if os.fork()==0:\n   time.sleep(60)\n   os._exit(0)\nexcept OSError:\n pass\nprint(1)", expected: '1\n' },
    { name: 'thread-exhaustion-contained', code: "import threading,time\ntry:\n for n in range(64):\n  threading.Thread(target=lambda:time.sleep(60),daemon=True).start()\nexcept RuntimeError:\n pass\nprint(1)", expected: '1\n' },
  ];
  for (const probe of checks) {
    const began = performance.now();
    const frame = await pool.run(request(probe.code, { stdin: probe.stdin ?? '', inputPromptPolicy: probe.inputPromptPolicy ?? 'INCLUDE', timeLimitMs: probe.timeLimitMs ?? 1000, memoryLimitMb: probe.memoryLimitMb ?? 256 }));
    const result = frame.result;
    const correct = probe.validate ? probe.validate(result, frame) : result.outcome === (probe.outcome ?? 'PASSED') && (probe.expected === undefined || result.stdout === probe.expected);
    report.probes.push({ name: probe.name, correct, outcome: result.outcome, wallMs: performance.now() - began,
      runtimeMs: result.runtimeMs, resources: frame.resources, peakLearnerRssBytes: frame.peakLearnerRssBytes, survivingLearners: frame.survivingLearners });
    if (!correct) throw new Error('Native correctness/isolation probe failed');
  }
  const cancel = new AbortController();
  const pending = pool.run(request('import time\ntime.sleep(30)', { signal: cancel.signal })).then(() => false, () => true);
  const cancelDeadline = performance.now() + 5000;
  while (!pool.stats().active && performance.now() < cancelDeadline) await new Promise(resolve => setTimeout(resolve, 5));
  const wasActive = pool.stats().active > 0;
  await new Promise(resolve => setTimeout(resolve, 20)); cancel.abort();
  const cancelled = await pending;
  report.probes.push({ name: 'active-cancel-cleanup', correct: wasActive && cancelled && pool.stats().active === 0 });
  if (!wasActive || !cancelled) throw new Error('Cancellation failed');
  phase = 'comparator-warmup';
  const comparatorBegan = performance.now(); await comparator.warmUp(); report.comparatorWarmupMs = performance.now() - comparatorBegan;
  report.comparatorVersion = comparator.version;
  report.queueCommitGate = { assessed: false, reason: 'Current grading snapshots require the Pyodide runtime identity; native queue/commit acceptance needs a separate runtime-contract design. No identity was relabeled.' };
  phase = 'benchmark';
  for (let index = 0; index < config.runs; index += config.parallel) {
    const batch = await Promise.all(Array.from({ length: Math.min(config.parallel, config.runs - index) }, async () => {
      const began = performance.now(); const cases = []; let engineOnlyMs = 0;
      for (let position = 0; position < config.cases; position++) {
        const start = performance.now();
        const frame = await pool.run(request(position % 2 ? 'print(input())' : 'print(1)', { stdin: position % 2 ? '한글🙂\n' : '' }));
        const engineMs = performance.now() - start; engineOnlyMs += engineMs;
        const compareStart = performance.now();
        const comparison = await comparator.compare({ comparator: 'STDOUT', actual: frame.result.stdout, expected: position % 2 ? '한글🙂\n' : '1\n', budgetMs: 1000 });
        const correct = frame.result.outcome === 'PASSED' && comparison.kind === 'match';
        cases.push({ correct, outcome: frame.result.outcome, engineMs, runtimeMs: frame.result.runtimeMs,
          comparatorMs: performance.now() - compareStart, resources: frame.resources });
        if (!correct) break;
      }
      return { wallMs: performance.now() - began, engineOnlyMs, cases };
    }));
    report.samples.push(...batch);
    if (batch.some(s => s.cases.length !== config.cases || s.cases.some(c => !c.correct))) throw new Error('Native benchmark correctness failed');
  }
} catch (error) {
  report.failures++; report.failurePhase = phase;
  // No source/stdin/stdout/stderr or credentials are copied into reports.
  report.failureKind = error.message.startsWith('Native') || error.message.includes('cleanup') ? error.message : error.name;
} finally {
  try { await pool.dispose(); report.cleanupConfirmed = true; } catch { report.failures++; report.cleanupConfirmed = false; }
  await comparator.dispose();
  report.poolFinal = pool.stats(); report.stageObservations = pool.observations; report.controllerResources = snapshot();
  console.log(JSON.stringify(report));
}
if (report.failures) process.exitCode = 2;
