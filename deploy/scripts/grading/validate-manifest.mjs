import { readFile, access } from 'node:fs/promises';
const local=new URL('../../../packages/shared/dist/index.js',import.meta.url);
const installed=new URL('file:///opt/cove/grading/current/node_modules/@cove/shared/dist/index.js');
let moduleUrl=local;
try { await access(local); } catch { moduleUrl=installed; }
const { runtimeManifestSchema } = await import(moduleUrl.href);
const input=await readFile(process.argv[2]);
if(input.length>16*1024*1024)throw new Error('Manifest too large');
runtimeManifestSchema.parse(JSON.parse(input));
