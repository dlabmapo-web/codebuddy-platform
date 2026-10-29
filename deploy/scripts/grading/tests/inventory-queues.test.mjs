import test from 'node:test';
import assert from 'node:assert/strict';
import {readQueueBacklog} from '../../../../packages/api/scripts/grading-inventory-queues.mjs';
test('all four queue state sets are read in one atomic transaction',async()=>{
 const calls=[];let executed=0;
 const transaction={llen:key=>calls.push(['llen',key]),zcard:key=>calls.push(['zcard',key]),exec:async()=>{executed++;return calls.map((_,index)=>[null,index===23?1:0]);}};
 const counts=await readQueueBacklog({multi:()=>transaction});assert.equal(executed,1);assert.equal(calls.length,24);assert.equal(counts['cove-regrade'],1);assert.equal(counts['cove-grading'],0);assert.equal(new Set(calls.map(([,key])=>key)).size,24);
});
test('missing or errored queue results cannot authorize a drain',async()=>{
 for(const result of [null,[],Array.from({length:24},()=>[new Error('synthetic'),0])])await assert.rejects(readQueueBacklog({multi:()=>({llen(){},zcard(){},exec:async()=>result})}),/Incomplete/);
});
