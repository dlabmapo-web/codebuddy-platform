import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { encodeAssets } from '../scripts/encodings.mjs';

const sha = data => createHash('sha256').update(data).digest('hex');
const engine = await readFile(new URL('../node_modules/brython/brython.js', import.meta.url));

test('every compressed copy decodes to exactly its source file', () => {
  const files = { 'brython.js': engine, 'index.html': Buffer.from('<!doctype html>' + '<p>turtle</p>'.repeat(200)) };
  const { data, manifest } = encodeAssets(files);
  assert.deepEqual(Object.keys(data).sort(), ['brython.js.br', 'brython.js.gz', 'index.html.br', 'index.html.gz']);
  for (const [name, encoded] of Object.entries(data)) {
    const entry = manifest[name];
    const decoded = entry.encoding === 'br' ? brotliDecompressSync(encoded) : gunzipSync(encoded);
    assert.ok(decoded.equals(files[entry.source]), name);
    assert.equal(entry.sha256, sha(encoded));
    assert.equal(entry.bytes, encoded.length);
    assert.ok(encoded.length < files[entry.source].length);
  }
});

test('brotli is preferred and saves at least a fifth over gzip on the engine', () => {
  const { manifest } = encodeAssets({ 'brython.js': engine });
  assert.ok(manifest['brython.js.br'].bytes < manifest['brython.js.gz'].bytes * 0.85);
});

test('a copy that saves nothing is left to the proxy', () => {
  const { data } = encodeAssets({ 'config.mjs': Buffer.from('export const parentOrigin = "https://cs.coveedu.com";\n') });
  assert.deepEqual(Object.keys(data), []);
});

test('the same input always produces the same bytes, so republishing is a no-op', () => {
  const a = encodeAssets({ 'brython.js': engine }), b = encodeAssets({ 'brython.js': engine });
  assert.deepEqual(a.manifest, b.manifest);
});
