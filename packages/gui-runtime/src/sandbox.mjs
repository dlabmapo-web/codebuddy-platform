import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { displayReadinessProbe } from './display-readiness.mjs';
const exec = promisify(execFile);
export const profileKey = p => `${p.runtimeImage}:${p.width}:${p.height}:${p.memoryLimitMb}`;
export function verifySandbox(info, profile) {
  const h = info?.HostConfig;
  if (!info?.State?.Running) throw Object.assign(new Error('Prepared display exited'), { unavailable: true });
  if (!h || !info.Config || !Array.isArray(info.Mounts) || info.Image !== profile.runtimeImage || info.Config.User !== '1000:1000' ||
      h.NetworkMode !== 'none' || !h.ReadonlyRootfs || !h.CapDrop?.includes('ALL') ||
      !h.SecurityOpt?.includes('no-new-privileges') || info.Mounts.some(m => m.Type === 'bind') ||
      h.Privileged || h.Memory !== profile.memoryLimitMb * 1048576 || h.MemorySwap !== h.Memory ||
      !['mode=0555', 'uid=0', 'gid=0'].every(option => h.Tmpfs?.['/assets']?.split(',').includes(option)) ||
      h.NanoCpus !== 1000000000 || h.PidsLimit !== 64 || h.CgroupnsMode !== 'private' ||
      !h.SecurityOpt.some(v => v.startsWith('seccomp=') && !v.includes('unconfined')))
    throw Object.assign(new Error('Sandbox isolation verification failed'), { integrity: true });
}
export function createSandboxDriver({ seccomp, pool, instance, telemetry }) {
  const docker = (...args) => exec('docker', args, { timeout: 10000, maxBuffer: 1024 * 1024 });
  const bounded = (signal, ...args) => exec('docker', args, { signal, timeout: 15000, maxBuffer: 1024 * 1024 });
  async function inspect(entry, signal) {
    let result;
    try { result = await bounded(signal, 'inspect', entry.id); }
    catch (error) { error.unavailable = true; throw error; }
    const info = JSON.parse(result.stdout)[0];
    verifySandbox(info, entry.profile);
    if (info.Config.Labels?.['cove.gui.instance'] !== instance ||
        info.Config.Labels?.['cove.gui.generation'] !== entry.generation ||
        info.Config.Labels?.['cove.gui.pool'] !== pool)
      throw Object.assign(new Error('Sandbox ownership verification failed'), { integrity: true });
    return info;
  }
  return {
    async inventory() {
      // One snapshot: inspecting IDs from a prior list races ordinary teardown.
      const format = '{"id":{{json .ID}},"name":{{json .Names}},"pool":{{json (.Label "cove.gui.pool")}},"generation":{{json (.Label "cove.gui.generation")}}}';
      const result = await docker('ps', '-a', '--no-trunc', '--filter', 'label=cove.gui=true', '--filter', `label=cove.gui.instance=${instance}`, '--format', format);
      const values = result.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
      if (values.some(info => info.pool !== pool))
        throw Object.assign(new Error('Refusing cross-pool reconciliation'), { integrity: true });
      return values.map(info => ({ ...info, mode: 'cold' }));
    },
    async prepare(entry, signal) {
      const p = entry.profile;
      try {
        const result = await telemetry.time('create', entry.mode, () => bounded(signal,
          'run', '--pull=never', '--detach', '--name', entry.name,
          '--label', 'cove.gui=true', '--label', `cove.gui.pool=${pool}`,
          '--label', `cove.gui.instance=${instance}`, '--label', `cove.gui.generation=${entry.generation}`,
          '--label', 'cove.gui.profile=standby-v1', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
          '--security-opt', 'no-new-privileges', '--security-opt', `seccomp=${seccomp}`, '--cgroupns', 'private',
          '--cpus', '1', '--memory', `${p.memoryLimitMb}m`, '--memory-swap', `${p.memoryLimitMb}m`, '--pids-limit', '64',
          '--tmpfs', '/tmp:rw,nosuid,nodev,size=8m,uid=1000,gid=1000',
          '--tmpfs', '/work:rw,nosuid,nodev,size=16m,uid=1000,gid=1000',
          '--tmpfs', '/assets:rw,nosuid,nodev,noexec,size=21m,mode=0555,uid=0,gid=0', '--shm-size', '8m',
          '-e', `GUI_WIDTH=${p.width}`, '-e', `GUI_HEIGHT=${p.height}`, p.runtimeImage));
        entry.id = result.stdout.trim();
        if (!/^[a-f0-9]{64}$/.test(entry.id)) throw Object.assign(new Error('Unknown container creation outcome'), { uncertain: true });
      } catch (error) {
        // Killing a CLI does not cancel the daemon's create request. Keep the slot quarantined.
        if (error.killed || error.name === 'AbortError' || signal.aborted) error.uncertain = true;
        throw error;
      }
      // Cancellation never kills a create RPC: wait for its bounded acknowledgement,
      // then remove the known ID. Killing the CLI mid-create would lose ownership.
      if (entry.cancelled) throw new Error('Preparation cancelled');
      await telemetry.time('display', entry.mode, async () => {
        for (;;) {
          signal.throwIfAborted();
          if (entry.cancelled) throw new Error('Preparation cancelled');
          try {
            await bounded(signal, 'exec', entry.id, 'python3', '-c',
              displayReadinessProbe());
            break;
          } catch (error) { signal.throwIfAborted(); await delay(100, undefined, { signal }); }
        }
      });
      if (entry.cancelled) throw new Error('Preparation cancelled');
      entry.state = 'VERIFYING';
      await telemetry.time('inspect', entry.mode, () => inspect(entry, signal));
    },
    inspect,
    async remove(entry) {
      if (!entry.id) {
        const found = await docker('ps', '-aq', '--filter', `name=^/${entry.name}$`);
        if (!found.stdout.trim()) return;
        const info = JSON.parse((await docker('inspect', entry.name)).stdout)[0];
        if (info.Config.Labels?.['cove.gui.instance'] !== instance || info.Config.Labels?.['cove.gui.pool'] !== pool)
          throw new Error('Refusing to remove an unowned container');
      }
      try { await docker('rm', '-f', entry.id || entry.name); }
      catch (error) {
        const found = await docker('ps', '-aq', '--filter', `name=^/${entry.name}$`);
        if (found.stdout.trim()) throw error;
      }
      // Docker acknowledged removal. Unknown creates retain their slot regardless.
    },
    async assets(entry, assets, signal) {
      if (!assets.length) return;
      await new Promise((resolve, reject) => {
        const child = spawn('docker', ['exec', '--user', '0', '-i', entry.id, 'python3', '-c',
          "import os,runpy; os.chmod('/assets',0o755); runpy.run_path('/opt/assets.py',run_name='__main__')"],
          { signal, stdio: ['pipe', 'ignore', 'ignore'] });
        child.on('error', reject);
        child.on('exit', code => code === 0 ? resolve() : reject(new Error('Asset setup failed')));
        child.stdin.on('error', reject);
        child.stdin.end(JSON.stringify(assets));
      });
    },
    program(entry, data) {
      return spawn('docker', ['exec', '-i', entry.id, 'python3', '-u', '/opt/run.py'], { stdio: ['pipe', 'pipe', 'pipe'] });
    },
  };
}
