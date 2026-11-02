import { cp, copyFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { validateLauncherLibraries } from './validate-artifacts.mjs';
const artifact=process.argv[2];
await validateLauncherLibraries(artifact);
const relocation=await mkdtemp('/verify/cove-native-linkage-');
try {
 await copyFile(artifact+'/nsjail',relocation+'/nsjail');
 await cp(artifact+'/launcher-lib',relocation+'/launcher-lib',{recursive:true});
 const output=execFileSync(relocation+'/nsjail',[],{env:{LD_TRACE_LOADED_OBJECTS:'1'},encoding:'utf8',timeout:5000,maxBuffer:32768});
 for(const line of output.split('\n')) {
  const match=/^\s*(\S+) => (\S+)/.exec(line);if(!match)continue;
  if(/^(libc|libm|libpthread|librt|libdl)\.so/.test(match[1]))continue;
  assert.equal(match[2],relocation+'/launcher-lib/'+match[1],'ambient/unresolved launcher dependency');
 }
 assert.match(output,/libprotobuf.*launcher-lib/);assert.match(output,/libnl-route.*launcher-lib/);
 console.log(output);console.log('relocated ELF closure with cleared environment PASS');
}finally{await rm(relocation,{recursive:true,force:true});}
