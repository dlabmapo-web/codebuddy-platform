import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

/**
 * Everywhere a Cove Studio URL can be written down.
 *
 * `e2e/` is here because leaving it out is what let the suite rot. This guard
 * has forbidden `/studio/academies` since the rename, and it passed on every
 * commit while nineteen specs still navigated there — it was only ever looking
 * at the application. A test that points at a retired URL fails as "the page
 * has no such button", which reads like a UI regression and buys the drift
 * months.
 */
const scanRoots = [
  { root: new URL('../src/', import.meta.url), label: 'packages/web/src' },
  { root: new URL('../../../e2e/', import.meta.url), label: 'e2e' },
];
const allowedCompatibilityFiles = new Set([
  'lib/routes.ts',
  'lib/routes.spec.ts',
  // Names the retired shapes to explain what it replaced.
  'support/auth.ts',
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

async function visit(directory, base, label) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      await visit(path, base, label);
      continue;
    }
    if (!['.ts', '.tsx'].includes(extname(entry.name))) continue;
    const name = relative(base, path);
    // Unit specs are skipped in the application, where they assert against
    // route helpers rather than navigate. An end-to-end spec is the opposite:
    // navigating is all it does, so `.spec.` earns no exemption under `e2e/`.
    if (label !== 'e2e' && name.includes('.spec.')) continue;
    if (allowedCompatibilityFiles.has(name)) continue;
    const text = await readFile(path, 'utf8');
    for (const value of retired) {
      if (text.includes(value)) violations.push(`${label}/${name}: ${value}`);
    }
  }
}

for (const { root, label } of scanRoots) {
  await visit(root.pathname, root.pathname, label);
}
if (violations.length > 0) {
  console.error('Retired Cove Studio routes found:\n' + violations.join('\n'));
  process.exitCode = 1;
}
