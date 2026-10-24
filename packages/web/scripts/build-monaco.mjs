import { cp, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve('monaco-editor/package.json'));
const { version } = require('monaco-editor/package.json');
const destination = new URL(`../public/monaco/${version}/`, import.meta.url);

// Include language chunks, fonts, and module workers together: editor.main.js
// alone renders the editor but silently breaks background worker requests.
await mkdir(destination, { recursive: true });
await cp(join(packageRoot, 'min', 'vs'), new URL('vs/', destination), { recursive: true });
await cp(join(packageRoot, 'LICENSE'), new URL('LICENSE', destination));
