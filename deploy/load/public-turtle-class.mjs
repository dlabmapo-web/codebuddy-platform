#!/usr/bin/env node
// A class arriving at public Turtle on computers that never opened it: real
// browsers (empty caches) open the page together, enter the class PIN, write
// for a while and press Run. More students can be added as engine downloads
// only, since one machine runs a limited number of browsers.
//
//   TURTLE_PIN=<class PIN> node deploy/load/public-turtle-class.mjs \
//     --base-url https://cs.coveedu.com --students 10 --extra-downloads 40 --write-seconds 60
//
// Production: run it outside class hours. Each browser is a guest of that
// academy for the run and signs out at the end. The PIN is read from the
// environment only, never from arguments or output.
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const flag = (name, fallback) => { const at = args.indexOf('--' + name); return at < 0 ? fallback : args[at + 1]; };
const base = new URL(flag('base-url', 'http://localhost:3028'));
const loopback = ['localhost', '127.0.0.1'].includes(base.hostname);
// The local fixture serves its engine with a self-signed certificate; nothing else is relaxed.
if (loopback) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const students = Number(flag('students', '10')), extra = Number(flag('extra-downloads', '0')), writeMs = Number(flag('write-seconds', '0')) * 1000;
if (!Number.isInteger(students) || students < 1 || students > 40) throw new Error('--students must be 1–40 browsers');
if (!Number.isInteger(extra) || extra < 0 || extra > 200) throw new Error('--extra-downloads must be 0–200');
const pin = process.env.TURTLE_PIN ?? (loopback ? '012345' : '');
if (!/^\d{6}$/.test(pin)) throw new Error('Set TURTLE_PIN to the six-digit class PIN');
const limits = { strokeP95Ms: 2000 };
const source = 'from custom import *\nTForward(100)\nTLeft(90)\nTForward(100)\n';
const runButton = /^(Run|실행)$/;

const browser = await chromium.launch();
async function student() {
  const context = await browser.newContext({ locale: 'en-US', ignoreHTTPSErrors: loopback });
  const page = await context.newPage();
  const problems = []; const t0 = Date.now(); const at = () => Date.now() - t0;
  page.on('pageerror', e => problems.push('script error: ' + String(e).slice(0, 120)));
  page.on('response', r => { if (r.status() >= 500) problems.push(r.status() + ' ' + new URL(r.url()).pathname.slice(0, 80)); });
  let frames = 0, lastFrame = null, retryShown = false, runtime = '';
  const watch = setInterval(async () => {
    const s = await page.evaluate(() => {
      const f = document.querySelector('iframe[title]'); if (f) f.__classId ??= Math.random();
      return { id: f?.__classId ?? null, src: f?.src ?? '', retry: [...document.querySelectorAll('button')].some(b => /Try browser Turtle again|브라우저 터틀 다시 시도/.test(b.textContent ?? '')) };
    }).catch(() => null);
    if (!s) return;
    if (s.id && s.id !== lastFrame) { frames++; lastFrame = s.id; }
    runtime ||= s.src; retryShown ||= s.retry;
  }, 100);
  let admitted = false;
  try {
    await page.goto(new URL('/turtle', base).href, { waitUntil: 'commit', timeout: 120000 });
    await page.getByLabel(/Classroom code|체험 코드/).first().click({ timeout: 90000 });
    await page.keyboard.type(pin);
    await page.getByRole('button', { name: /Start drawing|시작하기/ }).click();
    await page.locator('.monaco-editor').waitFor({ timeout: 90000 });
    admitted = true;
    await page.evaluate(next => window.monaco.editor.getModels()[0].setValue(next), source);
    if (writeMs) await page.waitForTimeout(writeMs);
    await page.waitForFunction(pattern => {
      const b = [...document.querySelectorAll('button')].find(x => new RegExp(pattern).test(x.textContent?.trim() ?? ''));
      return b && !b.disabled;
    }, runButton.source, { timeout: 120000, polling: 100 });
    const readyMs = at();
    await page.getByRole('button', { name: runButton }).click();
    const stroke = await page.waitForFunction(() => performance.getEntriesByName('cove.turtle.browser.click-to-stroke')[0]?.duration, null, { timeout: 60000, polling: 50 });
    return { ok: true, readyMs, strokeMs: Math.round(await stroke.jsonValue()), restarts: frames - 1, retryShown, runtime, problems };
  } catch (error) {
    return { ok: false, failedAtMs: at(), error: String(error.message ?? error).split('\n')[0].slice(0, 120), restarts: Math.max(0, frames - 1), retryShown, runtime, problems };
  } finally {
    clearInterval(watch);
    if (admitted) await page.evaluate(() => fetch('/turtle/api/access', { method: 'DELETE', headers: { 'X-Cove-Turtle': '1' } })).catch(() => {});
    await context.close().catch(() => {});
  }
}

// Extra students: the same engine files a new computer downloads, same encodings.
async function download(runtimeBase) {
  const started = Date.now();
  for (const name of ['index.html', 'frame.mjs', 'runtime.mjs', 'worker.js', 'brython.js', 'brython_stdlib.js', 'modules.js']) {
    const response = await fetch(runtimeBase + name, { headers: { 'Accept-Encoding': 'br, gzip' } }).catch(() => null);
    if (!response?.ok) return { ok: false, ms: Date.now() - started };
    await response.arrayBuffer();
  }
  return { ok: true, ms: Date.now() - started };
}
let runtimeBase = '';
if (extra) {
  const html = await (await fetch(new URL('/turtle', base))).text();
  const match = html.match(/src="(https?:\/\/[^"]+\/brython-3\.15\.0-[a-f0-9]{20}\/)index\.html"/);
  if (!match) throw new Error('No browser engine on this page; extra downloads need it');
  runtimeBase = match[1];
}
console.log(`${students} browsers + ${extra} extra downloads arriving together at ${base.origin}`);
const [results, downloads] = await Promise.all([
  Promise.all(Array.from({ length: students }, student)),
  Promise.all(Array.from({ length: extra }, () => download(runtimeBase))),
]);
await browser.close();

const ok = results.filter(r => r.ok);
const pct = (values, p) => { const a = [...values].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN; };
const strokeP95 = pct(ok.map(r => r.strokeMs), .95);
console.log(`drew: ${ok.length}/${students} | Run ready p50 ${pct(ok.map(r => r.readyMs), .5)} ms, max ${pct(ok.map(r => r.readyMs), 1)} ms (from opening the page) | click to first stroke p50 ${pct(ok.map(r => r.strokeMs), .5)} ms, p95 ${strokeP95} ms`);
console.log(`engine restarts: ${results.reduce((n, r) => n + r.restarts, 0)} | "Try browser Turtle again" shown: ${results.filter(r => r.retryShown).length} | server errors: ${results.reduce((n, r) => n + r.problems.filter(p => /^5\d\d /.test(p)).length, 0)}`);
if (extra) console.log(`extra downloads: ${downloads.filter(d => d.ok).length}/${extra} ok, p50 ${pct(downloads.map(d => d.ms), .5)} ms, max ${pct(downloads.map(d => d.ms), 1)} ms`);
for (const r of results.filter(r => !r.ok || r.problems.length || r.restarts)) console.log(JSON.stringify(r));
const passed = ok.length === students && !results.some(r => r.retryShown) && strokeP95 <= limits.strokeP95Ms && downloads.every(d => d.ok);
console.log(passed ? 'PASS' : `FAIL (every student draws, no retry button, first stroke p95 <= ${limits.strokeP95Ms} ms)`);
process.exitCode = passed ? 0 : 1;
