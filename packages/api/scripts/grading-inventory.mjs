// Run only inside the trusted API/worker environment. No dotenv loading.
// Read-only projection; never emit code, answers, users, credentials or raw jobs.
import pg from 'pg';
import { z } from 'zod';
import { readQueueBacklog } from './grading-inventory-queues.mjs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Redis } from 'ioredis';
import { runtimeDescriptorSchema, runtimeDescriptorIdentity, runtimeManifestSchema } from '@cove/shared';
// Match SavedSampleLease/ExecutionLeaseIdentity: these private records survive
// public sample expiry and are removed only after confirmed broker retirement.
const sampleAuthoritySchema = z.strictObject({
  lease: z.strictObject({ id: z.uuid(), attemptId: z.uuid(), kind: z.literal('sample'),
    generation: z.literal(1), leaseToken: z.uuid(), workerGeneration: z.uuid(), brokerGeneration: z.uuid(),
    reservationId: z.uuid().nullable(), admissionEpoch: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    runtime: runtimeDescriptorSchema, memoryLimitMb: z.number().int().min(16).max(4096) }),
  sourceReleased: z.boolean(), terminalCommitId: z.uuid().nullable(), receiptId: z.uuid().optional(), checkpointId: z.uuid().optional(),
});
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
  // Read the bounded index and records atomically: concurrent confirmed
  // retirement must not appear as a corrupt missing record halfway through.
  // SampleExecution caps this index at 512; fail closed on any lost authority.
  const privateSamples=await redis.eval(`
    if redis.call('SCARD',KEYS[1])>512 then return redis.error_reply('sample authority bound') end
    local rows={}
    for _,id in ipairs(redis.call('SMEMBERS',KEYS[1])) do
      if #id~=36 then return redis.error_reply('sample authority identity') end
      local key=ARGV[1]..id
      local size=redis.call('STRLEN',key)
      if size==0 or size>16384 then return redis.error_reply('sample authority unavailable') end
      table.insert(rows,{id,redis.call('GET',key)})
    end
    return rows
  `,1,'cove:grading:sample-leases','cove:grading:sample-lease:');
  for(const [id,raw] of privateSamples) {
    z.uuid().parse(id);
    const saved=sampleAuthoritySchema.parse(JSON.parse(raw));
    if(saved.lease.attemptId!==id || (saved.sourceReleased && !saved.lease.reservationId)) throw new Error('Invalid private sample identity');
    add(saved.lease.runtime);
  }
  const queueBacklog=await readQueueBacklog(redis);
  await database.query('COMMIT');
  console.log(JSON.stringify({version:1,observedAt:Math.floor(Date.now()/1000),complete:true,activeProfiles:profiles.rows,references:[...references.values()].sort((a,b)=>runtimeDescriptorIdentity(a).localeCompare(runtimeDescriptorIdentity(b))),pending:Number(counts.pending),legacyPending:Number(counts.legacy)+legacySamples,recoverable:Number(counts.recoverable)+privateSamples.length,ephemeralPending,queueBacklog,admissionFence}));
} catch {
  process.stderr.write('Read-only grading inventory failed; no complete evidence produced.\n');process.exitCode=1;
} finally { await database.end().catch(()=>{});redis.disconnect(); }
