import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {join} from 'node:path';
import {observeCgroup} from '../dist/observations.js';
test('cgroup observation reads actual numeric files and refuses missing/invalid counters',async()=>{
 const root=await mkdtemp(join(tmpdir(),'grading-counters-'));
 try {
  for(const [name,value] of Object.entries({'memory.current':'123','memory.peak':'456','pids.current':'4','cpu.stat':'usage_usec 1234\nnr_periods 8\nnr_throttled 2\nthrottled_usec 90\n','memory.events':'low 0\nhigh 0\nmax 2\noom 1\noom_kill 1\n'})) await writeFile(join(root,name),value);
  const actual=await observeCgroup(root);assert.equal(actual.memoryPeakBytes,456);assert.equal(actual.cpuThrottledUsec,90);assert.equal(actual.oomKill,1);
  await writeFile(join(root,'pids.current'),'max');await assert.rejects(observeCgroup(root),/Invalid observation/);
  await rm(join(root,'cpu.stat'));await assert.rejects(observeCgroup(root));
 }finally{await rm(root,{recursive:true,force:true});}
});
