import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve('monaco-editor/package.json'));
const { version } = require('monaco-editor/package.json');
const { revision } = JSON.parse(await readFile(new URL('../src/lib/monaco/assets.json', import.meta.url), 'utf8'));
const destination = new URL(`../public/monaco/${version}-r${revision}/`, import.meta.url);

// Include language chunks, fonts, and module workers together: editor.main.js
// alone renders the editor but silently breaks background worker requests.
await mkdir(destination, { recursive: true });
await cp(join(packageRoot, 'min', 'vs'), new URL('vs/', destination), { recursive: true });
await cp(join(packageRoot, 'LICENSE'), new URL('LICENSE', destination));

// Monaco 0.55.1 ignores promises returned by three word-highlighter Delayers.
// Disposing an editor can cancel one and produce an unhandled rejection. Route
// them through Monaco's existing cancellation-aware error handler; other errors
// still surface normally. Guard the exact distribution when upgrading Monaco.
if (version !== '0.55.1') throw new Error('Review Monaco highlighter cancellation handling after upgrading');
const scripts = (await readdir(new URL('vs/', destination))).filter(name => /^editor\.api-.*\.js$/.test(name));
if (scripts.length !== 1) throw new Error('Unexpected Monaco editor API distribution');
const editorFile = new URL(`vs/${scripts[0]}`, destination);
let source = await readFile(editorFile, 'utf8');
if (!source.includes('function De(o){To(o)||hR.onUnexpectedError(o)}')) throw new Error('Monaco cancellation-aware error handler changed');
for (const delayed of [
  'this.runDelayer.trigger(()=>{this._onPositionChanged(c)})',
  'this.runDelayer.trigger(()=>{this._run()})',
  'this.runDelayer.trigger(()=>{this._run(!1,e)})',
]) {
  if (source.split(delayed).length !== 2) throw new Error('Monaco delayed highlighting implementation changed');
  source = source.replace(delayed, `${delayed}.catch(De)`);
}
await writeFile(editorFile, source);
