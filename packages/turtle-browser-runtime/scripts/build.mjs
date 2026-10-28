import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = b => createHash('sha256').update(b).digest('hex');
const files = {};
files['BRYTHON-LICENSE.txt'] = await readFile(resolve(root, 'BRYTHON-LICENSE.txt'));
for (const name of ['brython.js', 'brython_stdlib.js']) files[name] = await readFile(resolve(root, 'node_modules/brython', name));
for (const name of await readdir(resolve(root, 'src'))) {
  if (/\.(?:mjs|js|css|html)$/.test(name)) files[name] = await readFile(resolve(root, 'src', name));
}
const bundle = await readFile(resolve(root, '../shared/src/turtle-trial/bundle.ts'), 'utf8');
const extract = name => {
  const found = bundle.match(new RegExp('export const ' + name + ' = String.raw`([\\s\\S]*?)`;'));
  if (!found) throw new Error('Missing native helper ' + name);
  return found[1];
};
const model = await readFile(resolve(root, 'src/turtle.py'), 'utf8');
const parentOrigin = process.env.TURTLE_BROWSER_PARENT_ORIGIN ?? 'https://cs.coveedu.com';
if (new URL(parentOrigin).origin !== parentOrigin || (!parentOrigin.startsWith('https://') && !(process.env.COVE_TURTLE_BROWSER_LOCAL === '1' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(parentOrigin)))) throw new Error('Invalid runtime parent origin');
files['config.mjs'] = Buffer.from('export const parentOrigin = ' + JSON.stringify(parentOrigin) + ';\n');
files['modules.js'] = Buffer.from('__BRYTHON__.update_VFS(' + JSON.stringify({
  turtle: ['.py', model, ['math']],
  custom: ['.py', extract('turtleCustomSource'), ['turtle', 'math']],
  shape: ['.py', extract('turtleShapeSource'), ['turtle']],
}) + ');\n');
const digest = sha(Object.keys(files).sort().map(k => k + ':' + sha(files[k])).join('\n'));
const id = 'brython-3.15.0-' + digest.slice(0, 20);
const dest = resolve(root, 'dist', id); await mkdir(dest, { recursive: true });
for (const [name, data] of Object.entries(files)) await writeFile(resolve(dest, name), data);
const manifest = { profile: 'cove-browser-turtle-v1', engine: 'brython', engineVersion: '3.15.0', protocol: 1,
  id, digest, files: Object.fromEntries(Object.entries(files).map(([name, data]) => [name, { sha256: sha(data), bytes: data.length, gzipBytes: gzipSync(data).length }])),
};
await writeFile(resolve(root, 'dist/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ id, gzipBytes: Object.values(manifest.files).reduce((n, f) => n + f.gzipBytes, 0) }));
