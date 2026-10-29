// Execute in a trusted, network-disabled production image with a bounded budget.
import { access, readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
const kind=process.argv[2];
if(kind==='broker') {
 try {await lstat('node_modules/.pnpm/node_modules/@cove/grading-runtime');throw new Error('Forbidden build-only self-workspace link');} catch(error) {if(error.code!=='ENOENT')throw error;}
 await import('./dist/index.js');await import('./dist/observations.js');await access('guest/seccomp.json');
 for(const path of ['src','test','prototypes']){try{await access(path);throw new Error('Forbidden broker payload');}catch(error){if(error.code!=='ENOENT')throw error;}}
 console.log('broker imports, observations/seccomp and production filesystem verified');
} else if(kind==='migration') {
 for(const path of ['prisma/schema.prisma','prisma.config.ts','scripts/setup-learning-storage.mts','node_modules/prisma/build/index.js','node_modules/tsx/dist/cli.mjs'])await access(path);
 const migrations=await readdir('prisma/migrations');if(migrations.length<70)throw new Error('Missing migration assets');
 for(const path of ['prototypes','/app/deploy','scripts/test-native-grading-isolated.sh','scripts/native-grading-e2e-server.mjs','scripts/native-grading-e2e-worker.mjs','scripts/native-grading-e2e-seed.mjs','scripts/native-grading-e2e-env.mjs','scripts/native-grading-e2e-timings.mjs']){try{await access(path);throw new Error('Forbidden migration payload');}catch(error){if(error.code!=='ENOENT')throw error;}}
 console.log('migration CLI/storage/schema and '+migrations.length+' migration entries verified; private payloads absent');
} else {
await import('@cove/grading-runtime');
const root=kind==='api'?'./dist/src':'./dist/api/src';
await import(`${root}/judge/runtime-registry.js`);
await import(`${root}/judge/broker-engine.js`);
await import(`${root}/generated/prisma/client.js`);
for(const path of ['src','prototypes','test','tests','prisma','scripts/test-native-grading-isolated.sh','scripts/native-grading-e2e-server.mjs','scripts/native-grading-e2e-worker.mjs','scripts/native-grading-e2e-seed.mjs','scripts/native-grading-e2e-env.mjs','scripts/native-grading-e2e-timings.mjs']) {
 try {await access(path);throw new Error('Forbidden production payload: '+path);}
 catch(error){if(error.code!=='ENOENT')throw error;}
}
async function inspect(path) {
 for(const entry of await readdir(path,{withFileTypes:true})) {
  const name=join(path,entry.name);
  if(entry.isDirectory()){if(entry.name==='node_modules')continue;await inspect(name);}
  else if(/\.(spec|test)\.(ts|js|mjs)$/.test(entry.name)||(/\.ts$/.test(entry.name)&&!/\.d\.ts$/.test(entry.name)))throw new Error('Test/source payload: '+name);
 }
}
await inspect('dist');
console.log(`${kind} imports, Prisma and production filesystem verified`);
}
