import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readStartupLog } from '../src/startup-log.js';

test('startup diagnostics retain the setup error while bounding the log read', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'native-startup-log-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'nsjail.log');
  await writeFile(path, 'setup refused\n' + 'x'.repeat(100_000));
  const log = await readStartupLog(path);
  assert.ok(log.startsWith('setup refused\n'));
  assert.equal(Buffer.byteLength(log), 8192);
});

test('absent diagnostics do not replace the original startup failure', async () => {
  assert.equal(await readStartupLog('/nonexistent-cove-startup-fixture/nsjail.log'), '<unavailable: ENOENT>');
});
