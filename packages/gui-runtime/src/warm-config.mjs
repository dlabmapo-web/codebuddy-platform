export function validateWarmConfiguration(env, envelope, now = Date.now(), sliceMetrics = '') {
  const value = env.GUI_WARM_STANDBY ?? '0';
  if (!['0', '1'].includes(value)) throw new Error('GUI_WARM_STANDBY must be 0 or 1');
  if (value === '0') return false;
  if (env.GUI_TRIAL_ONLY !== 'true' || env.GUI_SESSION_CAPACITY !== '1') throw new Error('Warm mode requires one-session trial profile');
  const fixture = env.NODE_ENV === 'test' && env.GUI_WARM_LOCAL_FIXTURE === '1' &&
    ['localhost', '127.0.0.1'].includes(env.GUI_BIND_ADDRESS) && /^fixture-[a-z0-9-]+$/.test(env.GUI_INSTANCE_ID || '');
  if (fixture) return true;
  const collected = Number(sliceMetrics.match(/^cove_turtle_slice_collected_at_seconds ([0-9.]+)$/m)?.[1]);
  const sliceMemory = Number(sliceMetrics.match(/^cove_turtle_slice_memory_limit_bytes ([0-9]+)$/m)?.[1]);
  if (env.GUI_REQUIRE_ROOTLESS !== 'true' || !envelope || envelope.version !== 1 || !envelope.verified ||
      !env.GUI_METRICS_SECRET || env.GUI_METRICS_SECRET.length < 32 ||
      !Number.isFinite(collected) || collected * 1000 > now || now - collected * 1000 > 60000 || sliceMemory !== 2147483648 ||
      envelope.image !== env.GUI_RUNTIME_IMAGE || !Number.isFinite(envelope.checkedAt) || envelope.checkedAt > now || now - envelope.checkedAt > 86400000 ||
      envelope.memoryMax !== 2147483648 || envelope.memoryHigh !== 1610612736 || envelope.swapMax !== 0 ||
      envelope.cpuQuota !== 1.5 || envelope.tasksMax !== 256 ||
      !Number.isFinite(envelope.hostMemory) || !Number.isFinite(envelope.allocatedMemory) || envelope.allocatedMemory < 2147483648 + 268435456 ||
      envelope.hostMemory - envelope.allocatedMemory < 3221225472)
    throw new Error('Warm mode requires a current verified rootless host resource envelope');
  return true;
}
