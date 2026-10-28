// Bounded operator audit, never loaded by the production application.
// Execution requires an explicit request to use Playwright for this test.
const { createRequire } = require('node:module');
const { writeFile, mkdir } = require('node:fs/promises');
const { setTimeout: delay } = require('node:timers/promises');
const path = require('node:path');
const load = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium, expect } = load('@playwright/test');
const site = 'https://cs.coveedu.com';
const pinnedFrame = 'https://turtle-runtime.coveedu.com/brython-3.15.0-2ab1760c5c7107d57457/index.html';
const count = 10, holdMs = 30000;
if (process.env.COVE_TURTLE_CONCURRENCY_APPROVED !== '10') throw new Error('Explicit ten-visitor Playwright opt-in required');
const pin = process.env.COVE_TURTLE_TEST_PIN;
if (!/^\d{6}$/.test(pin || '')) throw new Error('Supply the existing classroom code through the environment');
const output = process.env.COVE_TURTLE_AUDIT_OUTPUT || '/tmp/cove-turtle-ten-visitors';
const visitors = [];
let browser;
const report = { visitorsRequested: count, holdRequestedMs: holdMs, target: site + '/turtle', frame: pinnedFrame,
  method: 'Ten isolated headless Chromium contexts on one Mac; real public page, PIN, BFF, API and production runtime. Visitors authorize sequentially, reload once with their own grant, then wait for the runtime and editor; Run clicks dispatch together. Fresh-entry frame failures from earlier attempts remain separate. This is not ten physical student devices or a cold-download burst.',
  startedAt: new Date().toISOString(), setup: [], runs: [], cleanup: [], failures: [] };
const safeError = e => String(e?.message || e).replaceAll(pin, '[redacted]').replace(/[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}/gi, '[id]').replace(/[a-f\d]{64}/gi, '[digest]').slice(0, 350);
const stamp = () => performance.now();
const headers = { Origin: site, 'X-Cove-Turtle': '1' };
const save = async () => writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
const progress = value => console.log(JSON.stringify(value));
async function activeSnapshot(label) {
  const results = await Promise.all(visitors.map(async v => {
    if (!v.admission?.requestKey) return false;
    const r = await v.context.request.get(site + '/turtle/api/browser-runs/request/' + v.admission.requestKey, { timeout: 10000 });
    if (!r.ok()) return false;
    const d = await r.json(); return d.engine === 'browser' && d.state === 'ACTIVE' && d.id === v.admission.id;
  }));
  const ui = await Promise.all(visitors.map(async v => ({visitor:v.index,phase:await v.page.locator('[data-runtime-phase]').getAttribute('data-runtime-phase'),fullPythonOffered:await v.page.getByRole('button',{name:'Run with full Python',exact:true}).count()>0})));
  if(ui.some(v=>v.fullPythonOffered)) throw new Error('A supported visitor showed a runtime preparation failure');
  const row = { label, active: results.filter(Boolean).length, observedAt: new Date().toISOString(), ui };
  (report.activeSnapshots ||= []).push(row); await save(); progress(row); return row.active;
}
(async () => {
  await mkdir(output, { recursive: true });
  try {
    browser = await chromium.launch({ headless: true, chromiumSandbox: true });
    report.browserVersion = browser.version();
    const setupBegan = stamp();
    for (let index = 1; index <= count; index++) {
      if (stamp() - setupBegan > 180000) throw new Error('Setup bound exceeded');
      const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
      const page = await context.newPage();
      const v = { index, context, page, renewals: 0, errors: [], cookie: '' }; visitors.push(v);
      page.on('pageerror',e=>v.errors.push('page-error:'+safeError(e)));
      page.on('crash', () => { v.crashed = true; v.errors.push('page-crashed'); });
      page.on('response', async r => {
        try {
          if (r.url().startsWith(site+'/turtle/api/') && !r.ok()) v.errors.push('api-http-'+r.status()+':'+r.url().split('/').slice(-1)[0]);
          if(r.url()===site+'/turtle/api/access' && r.request().method()==='POST')v.accessHttpStatus=r.status();
          if (r.url() === site + '/turtle/api/browser-runs' && r.request().method() === 'POST') {
            if (!r.ok()) { v.errors.push('admission-http-' + r.status()); return; }
            const d = await r.json();
            if (d.engine !== 'browser' || d.profile?.runtimeId !== pinnedFrame.split('/')[3]) { v.errors.push('unexpected-engine'); return; }
            v.admission = { id: d.id, requestKey: d.requestKey };
          }
          if (r.url().startsWith(site + '/turtle/api/browser-runs/') && r.url().endsWith('/renew')) {
            if (r.ok()) v.renewals++; else v.errors.push('renewal-http-' + r.status());
          }
        } catch { v.errors.push('response-observation-failed'); }
      });
      const began = stamp(); v.stage='page-entry';
      await page.goto(site + '/turtle', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.getByLabel('Classroom code', { exact: true }).fill(pin, { timeout: 20000 });
      v.stage='code-entry';
      const entryResponse = page.waitForResponse(r=>r.url()===site+'/turtle/api/access' && r.request().method()==='POST',{timeout:15000});
      await page.getByRole('button', { name: 'Start drawing', exact: true }).click({ timeout: 15000 });
      const entered = await entryResponse; if(!entered.ok())throw new Error('Access failed: '+entered.status());
      await entered.finished();
      const initialCookies = await context.cookies(site);
      v.cookie = initialCookies.find(c=>c.name==='__Host-cove-turtle')?.value || '';
      if(!v.cookie)throw new Error('Access grant cookie missing');
      v.authorizedReload = true;
      await page.reload({waitUntil:'domcontentloaded',timeout:30000});
      v.stage='workspace';
      await expect(page.locator('iframe[title="Drawing"]')).toHaveAttribute('src', pinnedFrame, { timeout: 20000 });
      await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled({ timeout: 20000 });
      const cookies = await context.cookies(site);
      v.cookie = cookies.find(c => c.name === '__Host-cove-turtle')?.value || '';
      if (!v.cookie) throw new Error('Missing isolated visitor grant');
      const program = 'from custom import *; speed(1); color("blue"); [(TForward(160), TLeft(90)) for i in range(200)]';
      v.stage='editor';
      await page.bringToFront();
      const editorInput = page.getByRole('textbox', {name:/Editor content/});
      await editorInput.waitFor({state:'attached',timeout:20000});
      await editorInput.focus();
      await expect(editorInput).toBeFocused({timeout:3000});
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.insertText(program);
      await expect(page.locator('section[aria-label="Python code"]')).toContainText('range(200)', {timeout:5000});
      const visibility = await page.evaluate(() => document.visibilityState);
      if (visibility !== 'visible') throw new Error('Test visitor is background-throttled');
      report.setup.push({ visitor: index, readyMs: stamp() - began, visibility });
      await save(); progress({ stage: 'visitor-ready', visitor: index, readyMs: report.setup.at(-1).readyMs });
    }
    report.independentGrantCookies = new Set(visitors.map(v => v.cookie)).size;
    if (report.independentGrantCookies !== count) throw new Error('Visitor grants are not independent');
    const barrier = stamp();
    const started = await Promise.allSettled(visitors.map(async v => {
      v.dispatchBeganMs = stamp() - barrier;
      await v.page.getByRole('button', { name: 'Run', exact: true }).click({ timeout: 10000 });
      v.clickReturnedMs = stamp() - barrier;
      await v.page.locator('[data-first-stroke-ms]').waitFor({ state: 'visible', timeout: 15000 });
      v.metrics = await v.page.locator('[data-runtime-phase]').evaluate(el => ({ phase: el.getAttribute('data-runtime-phase'), firstStrokeMs: Number(el.getAttribute('data-first-stroke-ms')), admissionMs: Number(el.getAttribute('data-admission-ms')), dispatchToStrokeMs: Number(el.getAttribute('data-dispatch-to-stroke-ms')) }));
    }));
    report.runs = visitors.map(v => ({ visitor: v.index, dispatchBeganMs: v.dispatchBeganMs, clickReturnedMs: v.clickReturnedMs, metrics: v.metrics, errors: v.errors }));
    if (started.some(r => r.status !== 'fulfilled')) {
      report.failures.push(...started.filter(r => r.status === 'rejected').map(r => safeError(r.reason)));
      throw new Error('One or more simultaneous starts failed');
    }
    report.independentRunIds = new Set(visitors.map(v => v.admission?.id).filter(Boolean)).size;
    if (report.independentRunIds !== count) throw new Error('Expected ten independent admitted runs');
    if (await activeSnapshot('all-first-strokes-observed') !== count) throw new Error('Ten active runs did not coexist');
    progress({ stage: 'ten-running', holdMs });
    for (const v of visitors) {
      await v.page.screenshot({ path: path.join(output, 'visitor-' + String(v.index).padStart(2, '0') + '.png') });
    }
    await delay(17000);
    if (await activeSnapshot('after-normal-lease-renewal') !== count) throw new Error('A run ended before the concurrent lease check');
    await delay(13000);
    if (await activeSnapshot('end-of-hold') !== count) throw new Error('A run ended before the concurrent hold completed');
    report.runs = visitors.map(v => ({ visitor: v.index, dispatchBeganMs: v.dispatchBeganMs, clickReturnedMs: v.clickReturnedMs, metrics: v.metrics, successfulRenewals: v.renewals, errors: v.errors }));
    if (visitors.some(v => v.crashed || v.errors.length || v.renewals < 1)) throw new Error('A visitor crashed, failed renewal or reported an error');
    report.success = true;
  } catch (error) { report.success = false; report.failures.push(safeError(error));
    for(const v of visitors) if(!v.page.isClosed()) {try {
      await v.page.screenshot({path:path.join(output,'failed-workspace-'+v.index+'.png'),mask:[v.page.locator('#turtle-pin')]});
      (report.failedWorkspaces ||= []).push({visitor:v.index,stage:v.stage,accessHttpStatus:v.accessHttpStatus,errors:v.errors,body:safeError(await v.page.locator('body').innerText({timeout:1000})),visibleCode:await v.page.locator('section[aria-label="Python code"]').innerText({timeout:1000}).catch(()=>null)});
    } catch {}}
  }
  finally {
    await Promise.allSettled(visitors.map(async v => {
      let revoked = false;
      try {
        if (!v.page.isClosed()) {
          const stop = v.page.getByRole('button', { name: 'Stop', exact: true });
          if (await stop.isEnabled({ timeout: 1500 }).catch(() => false)) await stop.click({ timeout: 2500 }).catch(() => {});
        }
        const r = await v.context.request.delete(site + '/turtle/api/access', { headers, timeout: 10000 }); revoked = r.ok() || r.status() === 401;
      } catch {}
      if (!revoked && v.cookie) {
        try { const r = await fetch(site + '/turtle/api/access', { method: 'DELETE', headers: { ...headers, Cookie: '__Host-cove-turtle=' + v.cookie, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10000) }); revoked = r.ok() || r.status() === 401; } catch {}
      }
      report.cleanup.push({ visitor: v.index, accessRevoked: revoked });
      await v.context.close().catch(() => {});
    }));
    if (browser) await browser.close().catch(() => {});
    report.finishedAt = new Date().toISOString();
    report.cleanupComplete = report.cleanup.length === visitors.length && report.cleanup.every(r => r.accessRevoked);
    if (!report.cleanupComplete) report.success = false;
    await save(); progress({ stage: 'finished', success: report.success, createdContexts: visitors.length, prepared: report.setup.length, cleanupComplete: report.cleanupComplete, failures: report.failures });
    if (!report.success) process.exitCode = 1;
  }
})().catch(() => { console.error('Audit failed before initialization'); process.exitCode = 1; });
