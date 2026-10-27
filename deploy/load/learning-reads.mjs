#!/usr/bin/env node
// Dedicated local fixture accounts only. GET reads, bounded concurrency, no submits.
import { readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const flag = (name, fallback) => { const at = args.indexOf(`--${name}`); return at < 0 ? fallback : args[at + 1]; };
let base;
try { base = new URL(flag('base-url', 'http://127.0.0.1:3000')); } catch { throw new Error('Invalid loopback fixture URL'); }
if (!['localhost', '127.0.0.1'].includes(base.hostname) || !['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Dedicated loopback fixture only');
const rounds = Number(flag('rounds', '5'));
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 100) throw new Error('Invalid round count');
const path = flag('fixture');
if (!path) throw new Error('Supply a private fixture JSON containing separate actors with headers and read paths');
let fixture;
try { fixture = JSON.parse(readFileSync(path, 'utf8')); } catch { throw new Error('Invalid private fixture JSON'); }
if (!Array.isArray(fixture.actors) || !fixture.actors.length || fixture.actors.length > 20) throw new Error('Provide 1–20 fixture actors');
const actors = fixture.actors.map(actor => {
  if (!actor || !Array.isArray(actor.reads) || !actor.reads.length || actor.reads.length > 3) throw new Error('Invalid actor reads');
  const headers = actor.headers ?? {};
  if (Object.keys(headers).some(key => !['authorization', 'cookie', 'x-cove-view-role'].includes(key.toLowerCase()))) throw new Error('Unsupported fixture header');
  return { headers, reads: actor.reads.map(read => {
    let url; try { url = new URL(read.path, base); } catch { throw new Error('Invalid fixture read URL'); }
    if (url.origin !== base.origin || !['lesson', 'status'].includes(read.surface) ||
      !(/^\/(?:academy\/|turtle$|login$)/.test(url.pathname) || url.pathname === '/api/manual/latest-submission')) throw new Error('Only fixture lesson/status GET paths are allowed');
    return { url, surface: read.surface };
  }) };
});
const percentile = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? null; };
const stages = [];
for (const clients of [1, 2, 5, 10, 20].filter(count => count <= actors.length)) {
  const samples = [];
  for (let round = 0; round < rounds; round++) {
    await Promise.all(actors.slice(0, clients).map(async actor => {
      for (const read of actor.reads) {
        const began = performance.now(); const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        try {
          const response = await fetch(read.url, { method: 'GET', headers: actor.headers, redirect: 'error', signal: controller.signal });
          let bytes = 0; const reader = response.body?.getReader();
          while (reader) { const next = await reader.read(); if (next.done) break; bytes += next.value.byteLength; if (bytes > 2097152) { controller.abort(); throw new Error(); } }
          samples.push({ surface: read.surface, ms: performance.now() - began, bytes, status: response.status, ok: response.status === 200 });
        } catch { samples.push({ surface: read.surface, ms: performance.now() - began, ok: false, status: null }); }
        finally { clearTimeout(timer); }
      }
    }));
    if (samples.some(sample => !sample.ok)) break;
    if (round + 1 < rounds) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  const summary = ['lesson', 'status'].flatMap(surface => {
    const selected = samples.filter(sample => sample.surface === surface); if (!selected.length) return [];
    return [{ surface, count: selected.length, failures: selected.filter(sample => !sample.ok).length,
      p50Ms: percentile(selected.map(sample => sample.ms), .5), p95Ms: percentile(selected.map(sample => sample.ms), .95) }];
  });
  stages.push({ clients, summary, samples }); console.log(JSON.stringify({ clients, summary }));
  if (summary.some(surface => surface.failures || surface.p95Ms > (surface.surface === 'status' ? 750 : 1500))) break;
}
writeFileSync(flag('output', '/tmp/cove-learning-reads.json'), JSON.stringify({ version: 1,
  scope: 'authenticated fixture reads only; excludes grading throughput, drawing slots and browser readiness', rounds, stages }, null, 2) + '\n');
if (stages.some(stage => stage.samples.some(sample => !sample.ok))) process.exitCode = 2;
else if (stages.some(stage => stage.summary.some(surface => surface.p95Ms > (surface.surface === 'status' ? 750 : 1500)))) process.exitCode = 3;
