/** Trusted disposable-fixture diagnostics only. Never packaged in app images. */
import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
const ttl = 14_400;
const append = `
local bytes=tonumber(redis.call('GET',KEYS[2]) or '0')
if bytes+string.len(ARGV[2])>33554432 then return redis.error_reply('fixture timing byte bound') end
if redis.call('SISMEMBER',KEYS[1],KEYS[3])==0 and redis.call('SCARD',KEYS[1])>=4096 then return redis.error_reply('fixture timing job bound') end
if redis.call('LLEN',KEYS[3])>=8192 then return redis.error_reply('fixture timing record bound') end
redis.call('SADD',KEYS[1],KEYS[3]); redis.call('RPUSH',KEYS[3],ARGV[2]); redis.call('INCRBY',KEYS[2],string.len(ARGV[2]))
for i=1,3 do redis.call('EXPIRE',KEYS[i],ARGV[1]) end
return 1`;
const clear = `local keys=redis.call('SMEMBERS',KEYS[1]); for _,key in ipairs(keys) do redis.call('DEL',key) end; redis.call('DEL',KEYS[1],KEYS[2]); return #keys`;
export function fixtureTimings(redis, fixtureId, source, file) {
  if (
    !/^[a-z0-9-]{8,80}$/.test(fixtureId) ||
    !['api', 'worker'].includes(source)
  )
    throw new Error('Owned fixture timing identity required');
  const prefix = `native-e2e:${fixtureId}:timings:`,
    index = prefix + 'index',
    bytes = prefix + 'bytes',
    producer = randomUUID();
  const jobKey = (id) => {
    if (id !== '_unscoped' && !/^[a-f0-9-]{36}$/.test(id))
      throw new Error('Invalid timing job identity');
    return prefix + 'job:' + id;
  };
  return {
    async record(value) {
      const record = { ...value, fixtureId, source, producer };
      if (
        !Number.isFinite(record.at) ||
        !Number.isFinite(record.elapsedMs) ||
        record.elapsedMs < 0 ||
        !Number.isFinite(record.ackMonotonicMs)
      )
        throw new Error('Invalid acknowledged timing');
      const raw = JSON.stringify(record);
      if (Buffer.byteLength(raw) > 4096)
        throw new Error('Fixture timing record oversized');
      // Capture was made by the caller at the real ack, before this transport.
      await redis.eval(
        append,
        3,
        index,
        bytes,
        jobKey(record.jobId ?? '_unscoped'),
        ttl,
        raw,
      );
      if (file) appendFileSync(file, raw + '\n');
    },
    async read(id) {
      const keys = id ? [jobKey(id)] : await redis.smembers(index);
      if (
        keys.length > 4096 ||
        keys.some((key) => !key.startsWith(prefix + 'job:'))
      )
        throw new Error('Invalid owned timing index');
      const rows = [];
      for (const key of keys) {
        const values = await redis.lrange(key, 0, -1);
        if (values.length > 8192) throw new Error('Oversized timing history');
        for (const raw of values) {
          if (Buffer.byteLength(raw) > 4096)
            throw new Error('Oversized timing record');
          const row = JSON.parse(raw);
          if (
            row.fixtureId !== fixtureId ||
            !['api', 'worker'].includes(row.source) ||
            (id && row.jobId !== id)
          )
            throw new Error('Wrong timing ownership');
          rows.push(row);
        }
      }
      return rows;
    },
    async clear() {
      return redis.eval(clear, 2, index, bytes);
    },
  };
}
export function acknowledgedTimings(rows, id) {
  const selected = rows.filter((row) => row.jobId === id);
  const admission = selected.find(
    (row) => row.source === 'api' && row.event === 'admission-ack',
  );
  const commit = selected.find(
    (row) => row.source === 'worker' && row.event === 'commit-ack',
  );
  const transaction =
    commit &&
    selected.find(
      (row) =>
        row.source === 'worker' &&
        row.event === 'db-transaction-ack' &&
        row.transactionId === commit.transactionId &&
        row.commitSpanId === commit.commitSpanId &&
        row.clockId === commit.clockId &&
        row.producer === commit.producer,
    );
  if (
    !admission ||
    !commit ||
    commit.at < admission.at ||
    !transaction ||
    !/^[a-f0-9-]{36}$/.test(commit.commitSpanId ?? '') ||
    !/^[a-f0-9-]{36}$/.test(commit.transactionId ?? '') ||
    !/^[a-f0-9-]{36}$/.test(commit.clockId ?? '') ||
    ['at', 'ackMonotonicMs', 'elapsedMs', 'clockTimeOriginMs'].some(
      (key) => transaction[key] !== commit[key],
    ) ||
    !Number.isFinite(commit.postCommitObservationMs) ||
    commit.postCommitObservationMs < 0
  )
    throw new Error('Missing/invalid acknowledged timing boundaries');
  return { admission, commit, rows: selected };
}

/** The exact fixture instrumentation used by the worker and nested-boundary test. */
export function instrumentWorkerTimings(
  prototype,
  timings,
  executionLogContext,
) {
  const spans = new AsyncLocalStorage(),
    wrapped = new WeakSet();
  const clockId = randomUUID(),
    clockTimeOriginMs = performance.timeOrigin;
  const originalTime = prototype.time;
  prototype.time = async function (stage, action, ...args) {
    const began = performance.now(),
      context = executionLogContext();
    const span =
      stage === 'commit'
        ? { id: randomUUID(), context, transactions: [], closed: false }
        : null;
    let value;
    try {
      // A nested checkpoint/claim stage must not inherit a final-commit span.
      value = await spans.run(span, () =>
        originalTime.call(this, stage, action, ...args),
      );
    } finally {
      if (span) span.closed = true;
    }
    const observedMonotonicMs = performance.now(),
      observedAt = Date.now();
    if (span) {
      if (span.transactions.length !== 1)
        throw new Error(
          'Missing/ambiguous final commit transaction acknowledgement',
        );
      const ack = span.transactions[0];
      await timings.record({
        ...ack,
        event: 'commit-ack',
        stage,
        observedAt,
        observedMonotonicMs,
        spanElapsedMs: observedMonotonicMs - began,
        postCommitObservationMs: observedMonotonicMs - ack.ackMonotonicMs,
      });
    } else {
      await timings.record({
        event: 'stage-ack',
        stage,
        ...context,
        at: observedAt,
        ackMonotonicMs: observedMonotonicMs,
        elapsedMs: observedMonotonicMs - began,
        clockId,
        clockTimeOriginMs,
      });
    }
    return value;
  };
  return {
    wrapTransactions(prisma) {
      if (wrapped.has(prisma)) return;
      const original = prisma.$transaction.bind(prisma);
      prisma.$transaction = async (...args) => {
        const began = performance.now(),
          context = executionLogContext(),
          span = spans.getStore();
        const value = await original(...args);
        const ackMonotonicMs = performance.now();
        const active = span && !span.closed;
        const ack = Object.freeze({
          event: 'db-transaction-ack',
          ...context,
          at: Date.now(),
          ackMonotonicMs,
          elapsedMs: ackMonotonicMs - began,
          transactionId: randomUUID(),
          commitSpanId: active ? span.id : null,
          clockId,
          clockTimeOriginMs,
        });
        if (active) {
          if (
            context.jobId !== span.context.jobId ||
            context.kind !== span.context.kind
          )
            throw new Error('Final commit transaction context mismatch');
          // Preserve the original ack before awaiting Redis or local-file transport.
          span.transactions.push(ack);
        }
        await timings.record(ack);
        return value;
      };
      wrapped.add(prisma);
    },
    restore() {
      prototype.time = originalTime;
    },
  };
}
