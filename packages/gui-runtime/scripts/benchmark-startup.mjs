// Real public PIN -> BFF -> API -> Docker -> noVNC benchmark. Local only.
import { chromium, webkit } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const url = process.env.TURTLE_BENCH_URL || 'http://127.0.0.1:3067/turtle';
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Local benchmark only');
const count = Number(process.env.TURTLE_BENCH_RUNS || 100);
if (!Number.isInteger(count) || count < 1 || count > 200) throw new Error('Invalid sample count');
const browserName = process.env.TURTLE_BENCH_BROWSER || 'chromium';
if (!['chromium', 'webkit'].includes(browserName)) throw new Error('Unsupported benchmark browser');
const browser = await ({ chromium, webkit }[browserName]).launch({ headless: true });
const samples = [], failures = [];
let context, page, pageLoad;
try {
  for (let i = 0; i < count; i++) {
    if (i % 10 === 0) {
      await context?.close();
      context = await browser.newContext();
      page = await context.newPage();
      const began = performance.now();
      await page.goto(url);
      if (!['localhost', '127.0.0.1'].includes(new URL(page.url()).hostname)) throw new Error('Fixture redirected away from localhost');
      const shellMs = performance.now() - began;
      await page.getByLabel(/체험 코드|Classroom code/, { exact: true }).fill('012345');
      await page.getByRole('button', { name: /시작하기|Start drawing/ }).click();
      await page.locator('.monaco-editor').waitFor();
      pageLoad = { shellMs, editorReadyMs: performance.now() - began, cache: 'new-browser-context',
        // No bodies, queries, credentials, user paths or arbitrary host labels.
        resources: await page.evaluate(() => performance.getEntriesByType('resource').slice(0, 200).map(entry => {
          const path = new URL(entry.name).pathname;
          return { asset: /^\/(?:_next\/static|monaco)\//.test(path) || path === '/novnc-rfb.js' ? path : '[application-read]',
            durationMs: entry.duration, transferBytes: entry.transferSize };
        })) };
    }
    const source = 'from custom import *\nspeed(0)\ncolor("red")\nTForward(100)\nTLeft(90)\nTForward(100)\nprint("BENCH_' + i + '")\n';
    await page.waitForFunction(next => {
      const model = window.monaco?.editor.getModels()[0];
      if (!model) return false;
      model.setValue(next); return true;
    }, source);
    await page.waitForFunction(next => {
      const d = JSON.parse(sessionStorage.getItem('cove:turtle:tab:v1') || '{}');
      return d.buffers?.[d.starter] === next;
    }, source);
    const response = page.waitForResponse(r => r.url().endsWith('/turtle/api/runs') && r.request().method() === 'POST');
    await page.evaluate(() => { window.turtleBenchmarkStart = performance.now(); });
    try {
      await page.getByRole('button', { name: /^(실행|Run)$/ }).click();
      const created = await response;
      if (!created.ok()) throw new Error('Run returned ' + created.status());
      const session = await created.json();
      const responseMs = await page.evaluate(() => performance.now() - window.turtleBenchmarkStart);
      await page.waitForFunction(() => {
        const canvas = document.querySelector('[data-testid="turtle-display"] canvas');
        if (!canvas || !canvas.width || !canvas.height) return false;
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let red = 0;
        for (let j = 0; j < pixels.length; j += 4) if (pixels[j] > 180 && pixels[j + 1] < 80 && pixels[j + 2] < 80) red++;
        return red > 300;
      }, undefined, { timeout: 20000 });
      const firstDrawingMs = await page.evaluate(() => performance.now() - window.turtleBenchmarkStart);
      // Diagnostics stay private; execution used the normal PIN/BFF path above.
      const diagnostic = await fetch('http://127.0.0.1:4017/sessions/' + session.id,
        { headers: { Authorization: 'Bearer local-trial-runtime-secret-never-production' } }).then(r => r.json());
      samples.push({ run: i, kind: i % 10 === 0 ? 'initial' : 'repeat', responseMs, firstDrawingMs,
        allocation: diagnostic.startupMode || 'unclassified', queueWaitMs: diagnostic.queueWaitMs ?? null,
        ...(i % 10 === 0 ? { pageLoad } : {}) });
      process.stdout.write(JSON.stringify(samples.at(-1)) + '\n');
    } catch (error) {
      failures.push({ run: i, message: String(error.message).slice(0, 100) });
      break;
    }
    if (i % 10 === 9 || i === count - 1) {
      await page.getByRole('button', { name: /더 보기|More options/ }).click();
      await page.getByRole('button', { name: /^(나가기|Exit)$/ }).click();
    }
  }
} finally { await browser.close(); }
const percentile = (values, p) => values.sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)];
const summary = { samples: samples.length, failures: failures.length,
  p50: percentile(samples.map(s => s.firstDrawingMs), .5), p95: percentile(samples.map(s => s.firstDrawingMs), .95) };
await writeFile(process.env.TURTLE_BENCH_OUTPUT || '/tmp/cove-turtle-startup.json', JSON.stringify({ browser: browserName, mode: process.env.TURTLE_BENCH_MODE || 'cold', summary, samples, failures }, null, 2));
process.stdout.write(JSON.stringify(summary) + '\n');
if (failures.length || samples.length !== count) process.exitCode = 1;
