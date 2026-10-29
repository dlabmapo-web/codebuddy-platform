// Run only inside the trusted API/worker environment. No dotenv loading.
// Read-only projection; never emit code, answers, users, credentials or raw jobs.
import pg from 'pg';
import { readQueueBacklog } from './grading-inventory-queues.mjs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Redis } from 'ioredis';
import { runtimeDescriptorSchema, runtimeDescriptorIdentity, runtimeManifestSchema } from '@cove/shared';
if (!process.env.DATABASE_URL || !process.env.REDIS_URL) throw new Error('Explicit trusted application environment required');
const database=new pg.Client({connectionString:process.env.DATABASE_URL,statement_timeout:15000});
const redis=new Redis(process.env.REDIS_URL,{lazyConnect:true,maxRetriesPerRequest:0,connectTimeout:2000,commandTimeout:3000,retryStrategy:()=>null});
redis.on('error',()=>undefined);
try {
  await database.connect(); await redis.connect();
  let admissionFence=null;
  const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>JSON.stringify(key)+':'+canonical(item)).join(',')+'}':JSON.stringify(value);
  if(process.env.GRADING_RUNTIME_MANIFEST_PATH && process.env.GRADING_WORKER_GENERATION) {
    const manifest=runtimeManifestSchema.parse(JSON.parse(await readFile(process.env.GRADING_RUNTIME_MANIFEST_PATH,'utf8')));
    const manifestIdentity=createHash('sha256').update(canonical(manifest)).digest('hex');
    const workerGeneration=process.env.GRADING_WORKER_GENERATION;
    const key=`cove:grading:readiness:v1:${manifestIdentity}:${workerGeneration}`;
    admissionFence={manifestIdentity,workerGeneration,readinessAbsent:(await redis.get(key))===null && (await redis.pttl(key))<0};
  }
  await database.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const profiles=await database.query('SELECT DISTINCT memory_limit_mb AS "memoryLimitMb", time_limit_ms AS "timeLimitMs" FROM programming_exercises WHERE quiz IS NULL ORDER BY memory_limit_mb,time_limit_ms');
  // Conservative retention includes historical recorded descriptors. Removing
  // old images requires a separately reviewed reconciliation policy, never GC here.
  const runtimeRows=await database.query(`SELECT execution_runtime_snapshot AS runtime FROM submissions WHERE execution_runtime_snapshot IS NOT NULL
    UNION SELECT snapshot->'executionRuntimeSnapshot' FROM staff_practice_attempts WHERE snapshot ? 'executionRuntimeSnapshot'
    UNION SELECT runtime FROM grading_execution_leases
    UNION SELECT execution_runtime_snapshot FROM grading_case_checkpoints`);
  const references=new Map();
  const add=(value)=>{const runtime=runtimeDescriptorSchema.parse(value);references.set(runtimeDescriptorIdentity(runtime),runtime);};
  for(const row of runtimeRows.rows) add(row.runtime);
  const counts=(await database.query(`SELECT
    (SELECT count(*) FROM submissions WHERE status IN ('QUEUED','RUNNING')) + (SELECT count(*) FROM staff_practice_attempts WHERE status IN ('QUEUED','RUNNING')) AS pending,
    (SELECT count(*) FROM submissions WHERE status IN ('QUEUED','RUNNING') AND execution_runtime_snapshot IS NULL) + (SELECT count(*) FROM staff_practice_attempts WHERE status IN ('QUEUED','RUNNING') AND NOT snapshot ? 'executionRuntimeSnapshot') AS legacy,
    (SELECT count(*) FROM grading_execution_leases WHERE retired_at IS NULL) AS recoverable`)).rows[0];
  let cursor='0',ephemeralPending=0,legacySamples=0;
  do {
    const batch=await redis.scan(cursor,'MATCH','cove:sample-check:*','COUNT',100);cursor=batch[0];
    for(const key of batch[1]) {
      if(!/^cove:sample-check:[a-f0-9-]{36}$/.test(key)) continue;
      const raw=await redis.get(key); if(!raw) continue;
      const record=JSON.parse(raw);
      if(record.snapshot?.executionRuntimeSnapshot) add(record.snapshot.executionRuntimeSnapshot);
      if(['QUEUED','RUNNING','STOPPING'].includes(record.status)) {ephemeralPending++;if(!record.snapshot?.executionRuntimeSnapshot)legacySamples++;}
    }
  } while(cursor!=='0');
  const queueBacklog=await readQueueBacklog(redis);
  await database.query('COMMIT');
  console.log(JSON.stringify({version:1,observedAt:Math.floor(Date.now()/1000),complete:true,activeProfiles:profiles.rows,references:[...references.values()].sort((a,b)=>runtimeDescriptorIdentity(a).localeCompare(runtimeDescriptorIdentity(b))),pending:Number(counts.pending),legacyPending:Number(counts.legacy)+legacySamples,recoverable:Number(counts.recoverable),ephemeralPending,queueBacklog,admissionFence}));
} catch {
  process.stderr.write('Read-only grading inventory failed; no complete evidence produced.\n');process.exitCode=1;
} finally { await database.end().catch(()=>{});redis.disconnect(); }
