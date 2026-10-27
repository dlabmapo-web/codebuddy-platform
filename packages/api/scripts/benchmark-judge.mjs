#!/usr/bin/env node
// Disposable, credential-free Linux sandbox. Never connects to an application DB.
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const option = (key, fallback) => { const at = args.indexOf(`--${key}`); return at < 0 ? fallback : args[at + 1]; };
const image = option('image', 'cove-judge-performance:candidate');
const runs = Number(option('runs', '1')), cases = Number(option('cases', '10'));
const cpus = Number(option('cpus', '1.5')), concurrency = Number(option('concurrency', '2')), spare = Number(option('spare', '1'));
const parallel = Number(option('parallel', '1'));
if (![1, 5, 10].includes(cases) || !Number.isInteger(runs) || runs < 1 || runs > 1000 ||
    !Number.isFinite(cpus) || cpus < .5 || cpus > 4 || ![1, 2].includes(concurrency) || ![0, 1, 2].includes(spare) || ![1, 2].includes(parallel) || parallel > concurrency) throw new Error('Invalid benchmark bounds');
const output = resolve(option('output', `/tmp/cove-judge-benchmark-${Date.now()}.json`));
const name = `cove-judge-bench-${randomUUID()}`;
const inspect = JSON.parse(execFileSync('docker', ['image', 'inspect', image], { encoding: 'utf8' }))[0];
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim());
const script = `
import { startSandbox } from './dist/api/src/judge/sandbox-server.js';
import { createConnection } from 'node:net';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
const socketPath='/run/cove-sandbox/benchmark.sock';
const warmupBegan=performance.now();
const sandbox=await startSandbox({socketPath,clientGid:1001,concurrency:${concurrency},spare:${spare},pyodideVersion:'0.27.5',runnerUidBase:20000,requireIsolation:true});
const warmupMs=performance.now()-warmupBegan;
function exchange(frame){return new Promise((resolve,reject)=>{let data='';const socket=createConnection(socketPath);let settled=false;
 const done=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);socket.destroy();error?reject(error):resolve(value)};
 const timer=setTimeout(()=>done(new Error('transport timeout')),47000);
 socket.on('error',()=>done(new Error('socket error')));socket.on('connect',()=>socket.write(JSON.stringify(frame)+'\\n'));
 socket.on('data',chunk=>{data+=chunk;if(data.length>1048576)return done(new Error('oversized fixture response'));if(data.includes('\\n')){try{done(null,JSON.parse(data.split('\\n')[0]))}catch{done(new Error('invalid response'))}}});
 socket.on('end',()=>{if(!settled)done(new Error('incomplete response'))});
})}
const read=name=>{try{return readFileSync('/sys/fs/cgroup/'+name,'utf8').trim()}catch{return null}};
const resources=()=>({cpu:read('cpu.stat'),quota:read('cpu.max'),memory:read('memory.current'),peak:read('memory.peak'),events:read('memory.events'),pressure:read('cpu.pressure')});
const before=resources(), samples=[];
try {
 for(let run=0;run<${runs};run+=${parallel}){
  const batch=await Promise.all(Array.from({length:Math.min(${parallel},${runs}-run)},async()=>{
  const began=performance.now(), observations=[];
  for(let position=0;position<${cases};position++){
   const start=performance.now();
   try{const result=await exchange({type:'run',protocol:3,id:randomUUID(),request:{code:position%2?'print(input())':'print(1)',stdin:position%2?'한글🙂\\n':'',timeLimitMs:1000,memoryLimitMb:256,inputPromptPolicy:'INCLUDE'}});
    observations.push({wallMs:performance.now()-start,runtimeMs:result.result?.runtimeMs??null,outcome:result.result?.outcome??'ENGINE_ERROR',correct:result.type==='result'&&result.result.outcome==='PASSED'&&result.result.stdout===(position%2?'한글🙂\\n':'1\\n')});
   }catch{observations.push({wallMs:performance.now()-start,outcome:'TRANSPORT_ERROR',correct:false});break}
  }
  return {wallMs:performance.now()-began,cases:observations};
  }));
  samples.push(...batch);
  if(batch.some(sample=>sample.cases.some(o=>!o.correct))) break;
 }
 const health=await exchange({type:'health',id:randomUUID()});
 console.log(JSON.stringify({node:process.version,arch:process.arch,isolated:sandbox.isolated,warmupMs,before,after:resources(),diagnostics:health.diagnostics??null,samples}));
}finally{await sandbox.close()}
`;
let child;
const cleanup = () => { try { execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore', timeout: 10000 }); } catch {} };
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { cleanup(); child?.kill(); process.exit(130); });
child = spawn('docker', ['run', '--rm', '--name', name, '--label', 'cove.performance-fixture=true',
  '--network', 'none', '--read-only', '--user', '0:0', '--cap-drop', 'ALL',
  '--cap-add', 'SETUID', '--cap-add', 'SETGID', '--cap-add', 'KILL', '--security-opt', 'no-new-privileges',
  '--cgroupns', 'private', '--cpus', String(cpus), '--memory', '1280m', '--memory-swap', '1280m', '--pids-limit', '128',
  '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--tmpfs', '/run/cove-sandbox:rw,noexec,nosuid,size=1m',
  '-e', 'SANDBOX_REQUIRE_ISOLATION=1', '--entrypoint', 'node', '-i', inspect.Id, '--input-type=module', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
child.stdin.end(script);
let stdout = '', stderr = '';
child.stdout.on('data', data => { stdout += data; });
child.stderr.on('data', data => { if (stderr.length < 16000) stderr += data; });
const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
cleanup();
if (code !== 0) {
  const report = { version: 1, boundary: 'sandbox execution only; excludes admission, comparator, points and commit',
    commit, dirty, image: inspect.Id, imageRevision: inspect.Config.Labels?.['org.opencontainers.image.revision'] ?? null,
    platform: inspect.Architecture, requestedRuns: runs, cases, cpus, concurrency, spare, parallel,
    releaseAcceptance: 'not assessed', completedRuns: 0, failures: 1, failurePhase: 'fixture process', processCode: code,
    p50Ms: null, p95Ms: null };
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2)+'\n');
  console.log(JSON.stringify({ output, failures: 1, failurePhase: report.failurePhase }));
  process.stderr.write(stderr); process.exit(2);
}
const data = JSON.parse(stdout.trim().split('\n').at(-1));
const values = data.samples.filter(s => s.cases.length === cases && s.cases.every(c => c.correct)).map(s => s.wallMs).sort((a,b) => a-b);
const percentile = p => values.length ? values[Math.min(values.length-1, Math.ceil(p*values.length)-1)] : null;
const report = { version: 1, boundary: 'sandbox execution only; excludes admission, comparator, points and commit',
  commit, dirty, image: inspect.Id, imageRevision: inspect.Config.Labels?.['org.opencontainers.image.revision'] ?? null,
  platform: inspect.Architecture, requestedRuns: runs, cases, cpus, concurrency, spare, parallel,
  releaseAcceptance: 'not assessed; isolated execution microbenchmark only',
  completedRuns: data.samples.length, failures: data.samples.filter(s => s.cases.length !== cases || s.cases.some(c => !c.correct)).length,
  p50Ms: percentile(.5), p95Ms: percentile(.95), ...data };
mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2)+'\n');
console.log(JSON.stringify({ output, completedRuns: report.completedRuns, failures: report.failures, p50Ms: report.p50Ms, p95Ms: report.p95Ms }));
if (report.failures) process.exitCode = 2;
