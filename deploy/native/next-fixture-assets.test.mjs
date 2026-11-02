import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { createRequire } from 'node:module';

const repo = resolve(new URL('../..', import.meta.url).pathname);
const require = createRequire(join(repo, 'packages/web/package.json'));
test('sanitized fixture generates and really serves Monaco loader/worker and noVNC', { timeout: 90000 }, async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'native-next-assets-'));
    let next;
    let output = '';
    try {
        const source = join(temporary, 'source');
        const generated = await promisify(execFile)('bash', [join(repo, 'deploy/native/build-next-fixture.sh'), source,
            'http://127.0.0.1:4420', 'http://127.0.0.1:4419', 'http://127.0.0.1:3409', '--assets-only'], { timeout: 45000, maxBuffer: 1024 * 1024 });
        const web = join(source, 'packages/web');
        assert.ok(!(await readdir(web)).some(name => name.startsWith('.env') || name === '.auth'));
        const version = require('monaco-editor/package.json').version;
        const worker = (await readdir(join(dirname(require.resolve('monaco-editor/package.json')), 'min/vs/assets'))).find(name => /^editor\.worker-.*\.js$/.test(name));
        assert.ok(worker, 'pinned Monaco editor worker required');
        const assets = [`/monaco/${version}/vs/loader.js`, `/monaco/${version}/vs/assets/${worker}`, '/novnc-rfb.js'];
        const expected = await Promise.all(assets.map(path => readFile(web + '/public' + path)));
        for (const bytes of expected) assert.ok(bytes.length > 1000, 'actual generator output required');
        const probe = createServer();
        await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
        const port = probe.address().port;
        await new Promise(resolve => probe.close(resolve));
        next = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', web, '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
            cwd: web, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: temporary,
                DOTENV_CONFIG_PATH: '/dev/null', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:4420',
                NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'fixture-public-key', NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4419/api/rpc', NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${port}` },
        });
        for (const stream of [next.stdout, next.stderr]) stream.on('data', bytes => { output = (output + bytes).slice(-32768); });
        const deadline = performance.now() + 30000;
        for (;;) {
            try {
                const response = await fetch(`http://127.0.0.1:${port}` + assets[0], { signal: AbortSignal.timeout(1000) });
                if (response.ok) break;
            } catch { }
            if (next.exitCode !== null || performance.now() >= deadline) throw Error('Bounded Next asset startup failed: ' + output);
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        for (let index = 0; index < assets.length; index++) {
            const response = await fetch(`http://127.0.0.1:${port}` + assets[index], { signal: AbortSignal.timeout(3000) });
            assert.equal(response.status, 200);
            assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected[index], assets[index]);
        }
        console.log(`sanitized generators + real Next static serving: ${assets.join(', ')}; ${generated.stdout.trim()}`);
    } finally {
        if (next) {
            try { process.kill(-next.pid, 'SIGTERM'); } catch { }
            await Promise.race([new Promise(resolve => next.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 2000))]);
            try { process.kill(-next.pid, 'SIGKILL'); } catch { }
        }
        await rm(temporary, { recursive: true, force: true });
    }
});
