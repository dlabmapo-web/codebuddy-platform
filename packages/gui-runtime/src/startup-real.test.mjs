import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { mkdtemp, writeFile, chmod, unlink, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const exec = promisify(execFile);
test('real warm runtime: isolation, input, FIFO, cancellation, metrics, dead standby and crash recovery',
  { skip: process.env.GUI_STARTUP_REAL_TEST !== '1', timeout: 120000 }, async () => {
    const { turtleCustomSource, turtleShapeSource, turtleRunnerSource } = await import('../../shared/dist/turtle-trial/bundle.js');
    const url = 'http://127.0.0.1:4029', secret = 'local-startup-control-never-production', metrics = 'local-startup-metrics-never-production';
    const headers = { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' };
    const temporary = await mkdtemp(join(tmpdir(), 'cove-startup-real-'));
    const marker = join(temporary, 'deny-removal');
    const delayCreation = join(temporary, 'delay-create'), creationEntered = join(temporary, 'create-entered');
    const realDocker = (await exec('which', ['docker'])).stdout.trim();
    const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
    const shim = join(temporary, 'docker');
    await writeFile(shim, '#!/bin/sh\nif [ "$1" = rm ] && [ -f ' + quote(marker) + ' ]; then exit 125; fi\n' +
      'if [ "$1" = run ] && [ -f ' + quote(delayCreation) + ' ]; then case "$*" in *--name*) touch ' + quote(creationEntered) + '; sleep 3;; esac; fi\n' +
      'exec ' + quote(realDocker) + ' "$@"\n');
    await chmod(shim, 0o755);
    let broker, output = '';
    const startBroker = (warm = true) => {
      broker = spawn(process.execPath, ['src/server.mjs'], { cwd: new URL('..', import.meta.url), env: {
        ...process.env, PATH: temporary + ':' + process.env.PATH, NODE_ENV: 'test', GUI_SERVICE_SECRET: secret, GUI_METRICS_SECRET: metrics,
        GUI_RUNTIME_IMAGE: 'cove-turtle-trial:dev', GUI_SESSION_CAPACITY: '1', GUI_TRIAL_ONLY: 'true',
        GUI_BIND_ADDRESS: '127.0.0.1', GUI_ALLOWED_ORIGINS: 'http://127.0.0.1:3067', GUI_PORT: '4029',
        GUI_INSTANCE_ID: 'fixture-startup-real', GUI_WARM_STANDBY: warm ? '1' : '0', GUI_WARM_LOCAL_FIXTURE: '1',
      }, stdio: ['ignore', 'pipe', 'pipe'] });
      broker.stdout.on('data', b => { output = (output + b).slice(-50000); });
      broker.stderr.on('data', b => { output = (output + b).slice(-50000); });
    };
    async function request(path, method = 'GET', body) {
      const r = await fetch(url + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      const value = await r.json(); assert(r.ok, `${method} ${path}: ${r.status}`); return value;
    }
    async function until(fn, predicate, timeout = 15000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        try { const value = await fn(); if (predicate(value)) return value; } catch {}
        await new Promise(r => setTimeout(r, 50));
      }
      assert.fail('Real runtime did not reach expected state');
    }
    const run = source => ({ owner: 'trial:' + randomUUID(), requestKey: randomUUID(),
      authorizationExpiresAt: Date.now() + 120000, timeLimitSeconds: 120, memoryLimitMb: 512,
      outputLimitBytes: 262144, width: 1024, height: 640, assets: [], entryPoint: '_cove_trial_runner.py',
      files: { 'main.py': source, 'custom.py': turtleCustomSource, 'shape.py': turtleShapeSource, '_cove_trial_runner.py': turtleRunnerSource } });
    try {
      startBroker(); await until(() => request('/health'), h => h.standby.ready === 1);
      assert.equal((await fetch(url + '/metrics', { headers: { Authorization: `Bearer ${secret}` } })).status, 401);
      assert.equal((await fetch(url + '/health', { headers: { Authorization: `Bearer ${metrics}` } })).status, 401);
      const metricResponse = await fetch(url + '/metrics', { headers: { Authorization: `Bearer ${metrics}` } });
      assert.equal(metricResponse.status, 200); assert.match(await metricResponse.text(), /cove_turtle_allocated 1/);
      const aBody = run('from custom import *\nimport pathlib,subprocess,socket,os\nassert not os.access("/assets",os.W_OK)\npathlib.Path("/work/private-marker").write_text("first run")\nsubprocess.Popen(["sleep","60"])\nassert pathlib.Path("/sys/fs/cgroup/memory.max").read_text().strip() == "536870912"\nassert pathlib.Path("/sys/fs/cgroup/pids.max").read_text().strip() == "64"\ntry:\n socket.create_connection(("1.1.1.1",443),timeout=0.2)\nexcept OSError:\n print("NETWORK_DENIED",flush=True)\nelse:\n raise AssertionError("network reachable")\nspeed(0)\nTForward(100)\nprint(input("INPUT_READY:"),flush=True)\n');
      const a = await request('/sessions', 'POST', aBody);
      assert.equal((await request('/sessions', 'POST', aBody)).id, a.id);
      await until(() => request('/sessions/' + a.id), s => s.output.includes('INPUT_READY:'));
      await request('/sessions/' + a.id + '/input', 'POST', { text: 'INPUT_OK' });
      await until(() => request('/sessions/' + a.id), s => s.output.includes('INPUT_OK') && s.state === 'DISPLAYING');
      const bridge = await new Promise((resolve, reject) => {
        const ws = new WebSocket(url.replace('http', 'ws') + `/sessions/${a.id}/display`, [`cove.${a.token}`], { origin: 'http://127.0.0.1:3067' });
        ws.once('message', chunk => { resolve(chunk.toString()); ws.close(); }); ws.once('error', reject);
      });
      assert.match(bridge, /RFB 003/);
      const b = await request('/sessions', 'POST', run('import pathlib\nassert not pathlib.Path("/work/private-marker").exists()\nprint("ISOLATION_OK",flush=True)\n'));
      const c = await request('/sessions', 'POST', run('print("CANCELLED_SHOULD_NOT_RUN")\n'));
      assert.equal(b.state, 'QUEUED'); assert.equal(c.state, 'QUEUED');
      await request('/sessions/' + c.id, 'DELETE');
      const health = await request('/health'); assert(health.standby.allocated <= 2);
      await writeFile(marker, 'simulate failed Docker removal');
      const failedRemoval = await fetch(url + '/sessions/' + a.id, { method: 'DELETE', headers });
      assert.equal(failedRemoval.status, 503);
      assert.equal((await request('/health')).ready, false);
      assert.equal((await request('/sessions/' + b.id)).state, 'QUEUED');
      assert((await request('/health')).standby.allocated <= 2);
      await unlink(marker);
      await until(() => request('/health'), h => h.ready);
      await request('/sessions/' + a.id, 'DELETE');
      const readyB = await until(() => request('/sessions/' + b.id), s => s.output.includes('ISOLATION_OK'));
      assert.equal(readyB.expiresAt - readyB.startedAt, 120000);
      assert.equal((await request('/sessions/' + c.id)).output, '');
      await request('/sessions/' + b.id, 'DELETE');
      await until(() => request('/health'), h => h.standby.ready === 1);
      const ids = (await exec('docker', ['ps', '-q', '--filter', 'label=cove.gui.instance=fixture-startup-real'])).stdout.trim().split('\n');
      assert.equal(ids.length, 1); await exec('docker', ['kill', ids[0]]);
      const d = await request('/sessions', 'POST', run('print("DEAD_STANDBY_RECOVERED",flush=True)\n'));
      await until(() => request('/sessions/' + d.id), s => s.output.includes('DEAD_STANDBY_RECOVERED'));
      await request('/sessions/' + d.id, 'DELETE');
      await until(() => request('/health'), h => h.standby.ready === 1);
      const standbyName = (await exec('docker', ['ps', '--filter', 'label=cove.gui.instance=fixture-startup-real', '--format', '{{.Names}}'])).stdout.trim();
      if (standbyName.endsWith('-slot-1')) {
        const flip = await request('/sessions', 'POST', run('print("PREPARE_SLOT_ZERO",flush=True)\n'));
        await until(() => request('/health'), h => h.standby.ready === 1);
        await request('/sessions/' + flip.id, 'DELETE');
      }
      await writeFile(delayCreation, 'delay standby creation until after broker crash');
      await request('/sessions', 'POST', run('print("CRASH_DURING_REFILL",flush=True)\n'));
      await until(() => stat(creationEntered).then(() => true).catch(() => false), value => value);
      const exiting = new Promise(r => broker.once('exit', r)); broker.kill('SIGKILL'); await exiting;
      await unlink(delayCreation);
      startBroker(false); await until(() => request('/health'), h => !h.standby.enabled && h.standby.allocated === 0);
      const cold = await request('/sessions', 'POST', run('print("COLD_FALLBACK_OK",flush=True)\n'));
      await until(() => request('/sessions/' + cold.id), s => s.output.includes('COLD_FALLBACK_OK'));
      const containers = async () => (await exec('docker', ['ps', '-q', '--filter', 'label=cove.gui.instance=fixture-startup-real'])).stdout.trim().split('\n').filter(Boolean);
      await until(containers, ids => ids.length === 2);
      await until(containers, ids => ids.length === 1);
      await request('/sessions/' + cold.id, 'DELETE');
      assert.equal((await request('/health')).standby.allocated, 0);
    } finally {
      if (broker && broker.exitCode === null) {
        const ended = new Promise(r => broker.once('exit', r)); broker.kill('SIGTERM'); await ended;
      }
      const left = (await exec('docker', ['ps', '-aq', '--filter', 'label=cove.gui.instance=fixture-startup-real'])).stdout.trim();
      if (left) await exec('docker', ['rm', '-f', ...left.split('\n')]);
      await rm(temporary, { recursive: true, force: true });
    }
    assert(!output.includes('private-marker'), 'Student source leaked into broker logs');
  });
