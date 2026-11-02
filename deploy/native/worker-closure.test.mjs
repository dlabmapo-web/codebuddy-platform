import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, cpSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertWorkerClosure, finalizeWorkerClosure } from './worker-closure.mjs';

function fixture(t) {
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'native-worker-closure-')));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const root = join(temporary, 'worker');
  const source = join(temporary, 'source/packages/api');
  const self = join(root, 'node_modules/.pnpm/node_modules/@cove/api');
  mkdirSync(dirname(self), { recursive: true });
  mkdirSync(source, { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@cove/api', type: 'module' }));
  writeFileSync(join(root, 'entry.mjs'), 'export const portable = 42;');
  return { temporary, root, source, self };
}

test('deployed pnpm self-reference survives relocation and removal of the build source', async t => {
  const { temporary, root, source, self } = fixture(t);
  symlinkSync(relative(dirname(self), source), self);
  finalizeWorkerClosure(root, source);
  const moved = join(temporary, 'exported/worker');
  cpSync(root, moved, { recursive: true, verbatimSymlinks: true });
  rmSync(root, { recursive: true });
  rmSync(source, { recursive: true });
  assertWorkerClosure(moved);
  const relocated = join(moved, 'node_modules/.pnpm/node_modules/@cove/api');
  assert.equal(realpathSync(relocated), moved);
  assert.equal((await import(pathToFileURL(join(relocated, 'entry.mjs')).href)).portable, 42);
});

test('worker closure refuses external dependency links even when their targets exist', t => {
  const { root, source } = fixture(t);
  symlinkSync(source, join(root, 'node_modules/leaked-source'));
  assert.throws(() => assertWorkerClosure(root), /escapes worker/);
});

test('worker closure refuses dangling dependency links', t => {
  const { root } = fixture(t);
  symlinkSync('./missing-package', join(root, 'node_modules/missing'));
  assert.throws(() => assertWorkerClosure(root), /dangling worker/);
});

test('worker closure refuses absolute links that would break after relocation', t => {
  const { root } = fixture(t);
  symlinkSync(root, join(root, 'node_modules/absolute-self'));
  assert.throws(() => assertWorkerClosure(root), /cannot relocate/);
});

test('finalization does not rewrite an unexpected self-reference', t => {
  const { root, source, self, temporary } = fixture(t);
  const unrelated = join(temporary, 'unrelated');
  mkdirSync(unrelated);
  symlinkSync(unrelated, self);
  assert.throws(() => finalizeWorkerClosure(root, source), /Unexpected worker self-reference/);
  assert.equal(realpathSync(self), unrelated);
});
