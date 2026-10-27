import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { prototypeBudget } from './budget.mjs';
const exec = promisify(execFile);
const MIB = 1048576;
const run = (...args) => exec('docker', args, { timeout: 15000, maxBuffer: 2 * MIB });

export function createDriver({ image, instance, sourceFiles, capacity = 2, python = '3.12.7', seccomp = '/prototype/seccomp.json' }) {
  if (!/^sha256:[a-f0-9]{64}$/.test(image) || !/^[a-f0-9-]{36}$/.test(instance)) throw new Error('Immutable image and fixture identity required');
  const label = 'cove.native.prototype.instance';
  const budget = prototypeBudget(capacity);
  const owned = info => info?.Config?.Labels?.[label] === instance;
  async function inspect(id) { return JSON.parse((await run('inspect', id)).stdout)[0]; }
  function verify(info, entry) {
    const h = info.HostConfig;
    // Docker CLI versions serialize the same capabilities with/without CAP_.
    const caps = values => (values ?? []).map(value => value.replace(/^CAP_/, ''));
    const checks = {
      identity: owned(info) && info.Image === image && info.Config.User === '0:0',
      namespace: h.NetworkMode === 'none' && h.CgroupnsMode === 'private' && !h.Privileged && !h.PidMode,
      filesystem: h.ReadonlyRootfs && !info.Mounts.some(m => m.Type === 'bind' || m.Type === 'volume') && Object.keys(h.Tmpfs ?? {}).join() === '/tmp',
      logging: h.LogConfig?.Type === 'none',
      resources: h.Memory === budget.guestMemoryMiB * MIB && h.MemorySwap === h.Memory && h.NanoCpus === Math.round(budget.guestCpu * 1e9) && h.PidsLimit === 32,
      capabilities: caps(h.CapDrop).includes('ALL') && h.CapAdd?.length === 3 && ['SETUID', 'SETGID', 'KILL'].every(cap => caps(h.CapAdd).includes(cap)),
      security: h.SecurityOpt?.includes('no-new-privileges') && h.SecurityOpt.some(v => v.startsWith('seccomp=') && !v.includes('unconfined')),
      environment: info.Config.Env.includes(`NATIVE_LEARNER_UID=${20000 + entry.slot}`) &&
        !info.Config.Env.some(v => /^(DATABASE_URL|REDIS_URL|SUPABASE_|.*SECRET=|.*TOKEN=|.*PASSWORD=)/.test(v)),
    };
    const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
    if (failed.length) throw new Error('Native guest isolation verification failed: ' + failed.join(','));

  }
  return {
    async prepare(entry) {
      entry.name = `cove-native-${instance}-${entry.slot}`;
      try {
        entry.id = (await run('create', '--name', entry.name, '--label', `${label}=${instance}`, '--label', 'cove.native.prototype.guest=true',
          '--network', 'none', '--read-only', '--log-driver', 'none', '--init', '--user', '0:0', '--cap-drop', 'ALL', '--cap-add', 'SETUID', '--cap-add', 'SETGID', '--cap-add', 'KILL',
          '--security-opt', 'no-new-privileges', '--security-opt', `seccomp=${seccomp}`, '--cgroupns', 'private',
          '--cpus', String(budget.guestCpu), '--memory', `${budget.guestMemoryMiB}m`, '--memory-swap', `${budget.guestMemoryMiB}m`, '--pids-limit', '32',
          '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=8m,mode=1777', '-e', `NATIVE_LEARNER_UID=${20000 + entry.slot}`, '-i', image)).stdout.trim();
        if (!/^[a-f0-9]{64}$/.test(entry.id)) throw new Error('Unknown native create outcome');
      } catch (error) { entry.uncertain = true; throw new Error('Native guest create outcome uncertain'); }
      verify(await inspect(entry.id), entry);
      const child = spawn('docker', ['start', '-a', '-i', entry.id], { stdio: ['pipe', 'pipe', 'pipe'] });
      entry.child = child;
      entry.stderr = ''; entry.frames = []; entry.waiters = new Set(); entry.streamFailure = null;
      let buffer = '';
      const fail = () => {
        entry.streamFailure ??= new Error('Native control stream ended unexpectedly');
        for (const waiter of entry.waiters) waiter.reject(entry.streamFailure);
      };
      child.stderr.on('data', bytes => { if (entry.stderr.length < 16000) entry.stderr += bytes; });
      child.on('error', fail); child.on('close', fail); child.stdin.on('error', fail);
      child.stdout.on('data', bytes => {
        buffer += bytes;
        if (buffer.length > 2 * MIB) { fail(); return; }
        for (;;) {
          const newline = buffer.indexOf('\n'); if (newline < 0) break;
          try {
            const frame = JSON.parse(buffer.slice(0, newline));
            if (!['ready', 'result'].includes(frame.type)) { fail(); return; }
            entry.frames.push(frame);
            for (const waiter of [...entry.waiters]) if (waiter.type === frame.type) waiter.resolve(frame);
          } catch { fail(); return; }
          buffer = buffer.slice(newline + 1);
        }
      });
      entry.nextFrame = (type, timeout, signal) => new Promise((resolve, reject) => {
        const existing = entry.frames.find(f => f.type === type);
        if (existing) { resolve(existing); return; }
        if (entry.streamFailure || signal?.aborted) { reject(entry.streamFailure ?? new Error('Execution cancelled')); return; }
        const finish = (error, value) => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); entry.waiters.delete(waiter); error ? reject(error) : resolve(value); };
        const cancel = () => finish(new Error('Execution cancelled'));
        const waiter = { type, resolve: value => finish(null, value), reject: error => finish(error) };
        const timer = setTimeout(() => finish(new Error('Native control deadline exceeded')), timeout);
        entry.waiters.add(waiter); signal?.addEventListener('abort', cancel, { once: true });
      });
      const ready = await entry.nextFrame('ready', 30000);
      if (ready.python !== python || ready.uid !== 20000 + entry.slot) throw new Error('Native learner readiness mismatch');
      if (!sourceFiles || ['supervisor.py', 'learner.py'].some(name => ready.sourceFiles?.[name] !== sourceFiles[name])) throw new Error('Native guest source/image mismatch');
      verify(await inspect(entry.id), entry);
      entry.python = ready.python;
      entry.sourceFiles = ready.sourceFiles;
    },
    async execute(entry, request) {
      if (entry.executed) throw new Error('Refusing to reuse a native guest');
      entry.executed = true;
      const { code, stdin, timeLimitMs, memoryLimitMb, outputLimitBytes, inputPromptPolicy } = request;
      if (typeof code !== 'string' || Buffer.byteLength(code) > 262144 || typeof stdin !== 'string' || Buffer.byteLength(stdin) > 65536 ||
        !Number.isInteger(timeLimitMs) || timeLimitMs < 1 || timeLimitMs > 3000 || !Number.isInteger(memoryLimitMb) || memoryLimitMb < 32 || memoryLimitMb > 256) throw new Error('Invalid native fixture request');
      const waiting = entry.nextFrame('result', timeLimitMs + 5000, request.signal);
      entry.child.stdin.end(JSON.stringify({ code, stdin, timeLimitMs, memoryLimitMb, outputLimitBytes, inputPromptPolicy }) + '\n');
      const frame = await waiting;
      const result = frame.result;
      if (frame.survivingLearners !== 0 || !['PASSED', 'RUNTIME_ERROR', 'TIME_LIMIT', 'MEMORY_LIMIT'].includes(result?.outcome) ||
        typeof result.stdout !== 'string' || typeof result.stderr !== 'string' || Buffer.byteLength(result.stdout) > 262144 ||
        Buffer.byteLength(result.stderr) > 65536 || !Number.isFinite(result.runtimeMs)) throw new Error('Native result validation failed');
      return frame;
    },
    async remove(entry) {
      if (entry.uncertain) throw new Error('Uncertain create retained as quarantined allocation');
      if (!entry.id) return;
      let info;
      try { info = await inspect(entry.id); }
      catch (error) {
        if (/No such (object|container)/i.test(error.stderr ?? '')) return;
        throw new Error('Cannot confirm native guest identity for cleanup');
      }
      if (!owned(info)) throw new Error('Refusing to remove an unowned container');
      await run('rm', '-f', entry.id);
      entry.child?.stdin.destroy();
    },
  };
}
