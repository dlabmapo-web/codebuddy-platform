// Startup cleanup tolerates concurrent acknowledged removal by the old broker.
export async function reapPrevious(run, pool, instance, { signal = AbortSignal.timeout(15000), pause = () => new Promise(r => setTimeout(r, 100)) } = {}) {
  signal.throwIfAborted();
  const format = '{"id":{{json .ID}},"pool":{{json (.Label "cove.gui.pool")}}}';
  const snapshot = await run(signal, 'ps', '-a', '--no-trunc', '--filter', 'label=cove.gui=true',
    ...(instance !== pool ? ['--filter', `label=cove.gui.instance=${instance}`] : []), '--format', format);
  const entries = snapshot.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  if (entries.some(entry => (entry.pool || 'course') !== pool))
    throw new Error('Guest and course brokers require separate Docker daemons; refusing cross-pool cleanup');
  for (const { id } of entries) {
    for (;;) {
      signal.throwIfAborted();
      try { await run(signal, 'rm', '-f', id); break; }
      catch {
        signal.throwIfAborted();
        const exists = await run(signal, 'ps', '-aq', '--no-trunc', '--filter', `id=${id}`);
        if (!exists.stdout.trim()) break;
        await pause();
      }
    }
  }
}
