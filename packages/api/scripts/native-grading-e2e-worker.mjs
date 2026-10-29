/** Faults surround real worker calls; execution/comparison/persistence are unchanged. */
import { fixtureEnvironment } from './native-grading-e2e-env.mjs';
fixtureEnvironment();
import { Redis } from 'ioredis';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { existsSync } from 'node:fs';
import { fixtureTimings } from './native-grading-e2e-timings.mjs';
import { performance } from 'node:perf_hooks';
const compiledRoot = existsSync(
  new URL('../dist/src/judge/grading.service.js', import.meta.url),
)
  ? '../dist/src/'
  : '../dist/api/src/';
const { GradingService } = await import(
  compiledRoot + 'judge/grading.service.js'
);
const { PracticeRunner } = await import(
  compiledRoot + 'judge/practice.runner.js'
);
const { ExecutionTelemetry, executionLogContext } = await import(
  compiledRoot + 'judge/execution-telemetry.js'
);
const redis = new Redis(process.env.REDIS_URL);
const timings = fixtureTimings(
  redis,
  process.env.COVE_NATIVE_FIXTURE_ID,
  'worker',
  process.env.COVE_NATIVE_TIMINGS_FILE,
);
// Surface bounded OS-helper diagnostics during this real execution fixture.
const originalExec = childProcess.execFileSync;
childProcess.execFileSync = function (file, args, options) {
  try {
    return originalExec.call(this, file, args, options);
  } catch (error) {
    if (file === '/usr/bin/cc' || /cove-memory-[^/]+\/footprint$/.test(file))
      console.error(
        JSON.stringify({
          event: 'memory-helper-failure',
          operation: file === '/usr/bin/cc' ? 'compile' : 'measure',
          code: error.code,
          status: error.status,
          signal: error.signal,
          stderr: String(error.stderr ?? '').slice(0, 2048),
        }),
      );
    throw error;
  }
};
syncBuiltinESMExports();
for (const [prototype, method, kind] of [
  [GradingService.prototype, 'grade', 'official'],
  [PracticeRunner.prototype, 'run', 'practice'],
]) {
  const original = prototype[method];
  prototype[method] = async function (id, ...args) {
    if (!this.prisma.__nativeTransactionsWrapped) {
      const transaction = this.prisma.$transaction.bind(this.prisma);
      this.prisma.$transaction = async (...args) => {
        const began = performance.now(),
          context = executionLogContext();
        const value = await transaction(...args);
        await timings.record({
          event: 'db-transaction-ack',
          ...context,
          at: Date.now(),
          ackMonotonicMs: performance.now(),
          elapsedMs: performance.now() - began,
        });
        return value;
      };
      this.prisma.__nativeTransactionsWrapped = true;
    }
    const model =
      kind === 'official'
        ? this.prisma?.submission
        : this.prisma?.staffPracticeAttempt;
    if (await redis.getdel('native-e2e:fail:' + id)) {
      // Before any source executes, retain a real failed BullMQ event for this ID.
      await model.update({
        where: { id },
        data: { status: 'RUNNING', startedAt: new Date() },
      });
      await redis.set('native-e2e:retry:' + id, kind);
      throw new Error('private injected queue transport failure');
    }
    if (await redis.exists('native-e2e:retry:' + id)) {
      while (await redis.exists('native-e2e:hold:' + kind))
        await new Promise((resolve) => setTimeout(resolve, 50));
      await redis.del('native-e2e:retry:' + id);
      await model.update({ where: { id }, data: { status: 'QUEUED' } });
    }
    return original.call(this, id, ...args);
  };
}
const originalTime = ExecutionTelemetry.prototype.time;
ExecutionTelemetry.prototype.time = async function (stage, action, ...args) {
  const started = performance.now();
  const value = await originalTime.call(this, stage, action, ...args);
  await timings.record({
    event: stage === 'commit' ? 'commit-ack' : 'stage-ack',
    stage,
    ...executionLogContext(),
    at: Date.now(),
    ackMonotonicMs: performance.now(),
    elapsedMs: performance.now() - started,
  });
  return value;
};
process.on('SIGTERM', () => redis.disconnect());
await import(compiledRoot + 'judge/judge.main.js');
