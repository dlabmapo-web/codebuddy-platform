import { createHash } from 'node:crypto';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const sha = data => createHash('sha256').update(data).digest('hex');

/**
 * Compressed copies the static origin sends as they are. A class arriving
 * together otherwise makes the edge proxy compress the 6.4 MB engine once per
 * new computer, which starved it of CPU and failed unrelated requests.
 * Order is preference: Caddy serves the first one the browser accepts.
 */
export const encodings = [
  ['br', data => brotliCompressSync(data, { params: {
    [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
    [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
    [constants.BROTLI_PARAM_SIZE_HINT]: data.length,
  } })],
  ['gz', data => gzipSync(data, { level: constants.Z_BEST_COMPRESSION })],
];

/**
 * Returns `{ 'brython.js.br': Buffer, ... }` and their manifest entries. A copy
 * that saves nothing is skipped; the proxy handles those few small files.
 * The runtime ID still hashes only the uncompressed files.
 */
export function encodeAssets(files) {
  const data = {}, manifest = {};
  for (const name of Object.keys(files).sort()) {
    for (const [encoding, encode] of encodings) {
      const encoded = encode(files[name]);
      if (encoded.length >= files[name].length) continue;
      data[name + '.' + encoding] = encoded;
      manifest[name + '.' + encoding] = { source: name, encoding, sha256: sha(encoded), bytes: encoded.length };
    }
  }
  return { data, manifest };
}
