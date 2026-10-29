/** No failed/queued sample is removed from an acceptance denominator. */
export function summarize(rows, field) {
  const values = rows
    .map((row) =>
      row.error || !Number.isFinite(row[field]) ? Infinity : row[field],
    )
    .sort((a, b) => a - b);
  const at = (p) => values[Math.max(0, Math.ceil(values.length * p) - 1)];
  const finite = (value) => (Number.isFinite(value) ? value : 'unbounded');
  return {
    n: rows.length,
    failures: rows.filter((row) => row.error).length,
    p50: finite(at(0.5)),
    p95: finite(at(0.95)),
    maximum: finite(at(1)),
  };
}
export function assertContinuity(before, after) {
  for (const key of ['hostIdentity', 'configurationIdentity', 'daemonId'])
    if (before[key] !== after[key])
      throw new Error('Host identity changed: ' + key);
  if (after.observedAt < before.observedAt)
    throw new Error('Host clock rolled back');
}
export function assertObservationContinuity(before, after, now = Date.now()) {
  if (
    !Number.isSafeInteger(after.observedAt) ||
    now - after.observedAt > 6000 ||
    after.observedAt > now + 1000
  )
    throw new Error('Stale/future broker observation');
  for (const key of ['brokerGeneration', 'workerGeneration'])
    if (before[key] !== after[key])
      throw new Error('Broker continuity changed: ' + key);
  if (after.observedAt < before.observedAt)
    throw new Error('Observation clock rolled back');
  const prior = before.resources?.family ?? before.family,
    next = after.resources?.family ?? after.family;
  if (prior && next)
    for (const field of [
      'cpuUsageUsec',
      'cpuPeriods',
      'cpuThrottledPeriods',
      'cpuThrottledUsec',
      'oom',
      'oomKill',
    ]) {
      if (
        Number.isFinite(prior[field]) &&
        Number.isFinite(next[field]) &&
        next[field] < prior[field]
      )
        throw new Error('Resource counter reset: ' + field);
    }
}
