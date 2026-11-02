import { lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync, symlinkSync, unlinkSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export function assertWorkerClosure(root) {
  root = realpathSync(root);
  const inside = target => target === root || target.startsWith(root + sep);
  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) scan(path);
      else if (entry.isSymbolicLink()) {
        const target = readlinkSync(path);
        if (isAbsolute(target) || !inside(resolve(directory, target))) {
          throw new Error(`Link escapes worker or cannot relocate: ${path} -> ${target}`);
        }
        let actual;
        try { actual = realpathSync(path); }
        catch (cause) { throw new Error(`Invalid or dangling worker link: ${path}`, { cause }); }
        if (!inside(actual)) throw new Error(`Link escapes worker: ${path} -> ${actual}`);
      }
    }
  }
  scan(root);
}

export function finalizeWorkerClosure(root, source) {
  root = resolve(root);
  source = resolve(source);
  if (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name !== '@cove/api') {
    throw new Error('Expected deployed @cove/api worker');
  }
  // pnpm 9 deploy retains this workspace self-link pointing at the build tree.
  // Relocate only that known link; every other escaping/dangling link is an error.
  const self = join(root, 'node_modules/.pnpm/node_modules/@cove/api');
  let stat;
  try { stat = lstatSync(self); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (stat) {
    if (!stat.isSymbolicLink()) throw new Error('Unexpected worker self-reference type');
    const target = resolve(dirname(self), readlinkSync(self));
    if (target !== root && target !== source) throw new Error(`Unexpected worker self-reference: ${target}`);
    unlinkSync(self);
    symlinkSync(relative(dirname(self), root), self);
  }
  assertWorkerClosure(root);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [, , mode, root, source] = process.argv;
  if (mode === '--finalize' && root && source) finalizeWorkerClosure(root, source);
  else if (mode === '--verify' && root && !source) assertWorkerClosure(root);
  else throw new Error('Usage: worker-closure.mjs --finalize WORKER BUILD_SOURCE | --verify WORKER');
  console.log('self-contained relocatable worker closure PASS');
}
