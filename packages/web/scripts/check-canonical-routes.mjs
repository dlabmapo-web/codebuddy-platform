import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const sourceRoot = new URL('../src/', import.meta.url);
const allowedCompatibilityFiles = new Set([
  'lib/routes.ts',
  'lib/routes.spec.ts',
]);
const retired = [
  '/studio/academies',
  '/studio/my-page',
  '/auth/login',
  '/auth/signup',
  '/learn/exercises/${',
  '/academy/${',
  '/admin/academies/${',
];
const violations = [];

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(path);
      continue;
    }
    if (!['.ts', '.tsx'].includes(extname(entry.name))) continue;
    const name = relative(sourceRoot.pathname, path);
    if (name.includes('.spec.')) continue;
    if (allowedCompatibilityFiles.has(name)) continue;
    const text = await readFile(path, 'utf8');
    for (const value of retired) {
      if (text.includes(value)) violations.push(`${name}: ${value}`);
    }
  }
}

await visit(sourceRoot.pathname);
if (violations.length > 0) {
  console.error('Retired Cove Studio routes found:\n' + violations.join('\n'));
  process.exitCode = 1;
}
