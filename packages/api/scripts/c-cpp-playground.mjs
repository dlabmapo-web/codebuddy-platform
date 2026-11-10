// Keep the existing isolated acceptance environment open for manual practice.
import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { readFile, access, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const directory = process.env.COVE_CPP_FIXTURE_DIR;
if (!directory || process.env.DOTENV_CONFIG_PATH !== '/dev/null') throw Error('Use pnpm dev:c-cpp');
const repository = resolve(import.meta.dirname, '../../..');
const children = [];
let closing = false;
let failure;
function start(command, args, env, log) {
  const fd = openSync(resolve(directory, log), 'a', 0o600);
  const child = spawn(command, args, { cwd: repository, env: { ...process.env, ...env }, detached: true, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  children.push(child);
  child.on('error', error => { failure = error; });
  child.on('exit', code => { if (!closing) failure = Error(`${command} exited (${code}); see ${directory}/${log}`); });
}
async function close() {
  if (closing) return;
  closing = true;
  for (const child of children) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
  await Promise.race([
    Promise.all(children.map(child => child.exitCode !== null || child.signalCode !== null ? undefined : new Promise(r => child.once('exit', r)))),
    delay(5000),
  ]);
  for (const child of children) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
}
process.once('SIGTERM', () => void close());
process.once('SIGINT', () => void close());
try {
  start(process.execPath, ['packages/api/scripts/c-cpp-e2e-server.mjs'], { COVE_CPP_PLAYGROUND: '1' }, 'api.log');
  start('pnpm', ['--filter', '@cove/web', 'dev', '--hostname', '127.0.0.1', '--port', '3317'], {
    COVE_DLAB_E2E: '1', DLAB_SSO_ENABLED: 'false', BFF_SHARED_SECRET: 'local-cpp-bff-secret-only-never-production',
    NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3317', NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4317/api/rpc', INTERNAL_API_RPC_URL: 'http://127.0.0.1:4317/api/rpc',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:4327', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-cpp-fixture-public-key', NEXT_PUBLIC_TURNSTILE_SITE_KEY: '',
  }, 'web.log');
  const deadline = Date.now() + 180_000;
  while (!closing) {
    if (failure) throw failure;
    if (Date.now() > deadline) throw Error(`Playground startup timed out; see ${directory}/api.log and web.log`);
    try {
      await access(resolve(directory, 'browser.json'));
      const response = await fetch('http://127.0.0.1:3317/login', { signal: AbortSignal.timeout(2000) });
      if (response.ok) break;
    } catch {}
    await delay(500);
  }
  if (!closing) {
    const { slug, ids } = JSON.parse(await readFile(resolve(directory, 'browser.json'), 'utf8'));
    await writeFile(resolve(repository, 'test-results/c-cpp-local/playground.json'), JSON.stringify({ url: 'http://127.0.0.1:4327/', academySlug: slug, courseId: ids.course, logDirectory: directory }, null, 2));
    console.log('\nC/C++ practice is ready: http://127.0.0.1:4327/');
    console.log('Choose C or C++ to sign in as the local student. No password needed.');
    console.log('Keep this terminal running. Stop with Ctrl+C or pnpm dev:c-cpp:stop.');
    console.log('This practice data is disposable and is removed when stopped.\n');
  }
  while (!closing && !failure) await delay(500);
  if (failure) throw failure;
} finally {
  await close();
}
