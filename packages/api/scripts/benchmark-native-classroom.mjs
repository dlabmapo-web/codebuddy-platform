#!/usr/bin/env node
import { classroomCorpus } from '../../../deploy/native/corpus.mjs';
import { writeFileSync } from 'node:fs';
import { readFile, lstat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cpus, totalmem, arch, platform } from 'node:os';
import { pathToFileURL } from 'node:url';
export const cohorts = [1, 2, 4, 5, 10, 20, 50, 100, 200];
export function parseArgs(args) {
    const out = { clients: 2, cases: 10, bursts: 1, maxSeconds: 60, mode: 'application', concurrency: 2, assertSlo: false };
    const numeric = { 'clients': 'clients', 'cases': 'cases', 'bursts': 'bursts', 'max-seconds': 'maxSeconds', 'generator-concurrency': 'concurrency' };
    for (let i = 0; i < args.length; i++) {
        const key = args[i];
        if (key === '--assert-slo') {
            out.assertSlo = true;
            continue;
        }
        if (key === '--authorize-isolated-load') {
            out.authorized = true;
            continue;
        }
        if (!['--fixture', '--output', '--mode', ...Object.keys(numeric).map(k => '--' + k)].includes(key) || !args[i + 1] || args[i + 1].startsWith('--'))
            throw Error('Unknown/missing option: ' + key);
        const name = key.slice(2);
        out[numeric[name] ?? name] = numeric[name] ? Number(args[++i]) : args[++i];
    }
    if (!cohorts.includes(out.clients) || ![1, 5, 10].includes(out.cases) || !Number.isInteger(out.bursts) || out.bursts < 1 || out.bursts > 5 || !Number.isInteger(out.maxSeconds) || out.maxSeconds < 5 || out.maxSeconds > 600 || !Number.isInteger(out.concurrency) || out.concurrency < 1 || out.concurrency > 200)
        throw Error('Invalid bounded workload');
    if (!['application', 'next-browser'].includes(out.mode) || !out.fixture || !out.output)
        throw Error('Explicit fixture, output and supported mode required');
    if ((out.clients > 2 || out.concurrency > 2 || out.bursts > 1) && !out.authorized)
        throw Error('Larger load requires --authorize-isolated-load');
    if (out.assertSlo && (out.mode !== 'next-browser' || out.clients !== 200 || out.cases !== 10 || out.bursts !== 5 || out.concurrency < 200))
        throw Error('SLO requires actual Next browser, 200 clients, 10 cases, five bursts and 200 generator capacity');
    return out;
}
export function loopback(value) { const u = new URL(value); if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || !u.port || u.username || u.password)
    throw Error('Explicit loopback fixture destination required'); return u; }
export async function loadAuthority(path) {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) || stat.uid !== process.getuid())
        throw Error('Owned private regular fixture authority required');
    const f = JSON.parse(await readFile(path, 'utf8'));
    if (f.version !== 1 || f.isolated !== true || !/^native-[a-z0-9-]{8,80}$/.test(f.fixtureId) || !Number.isInteger(f.pid) || f.pid < 2 || !Number.isFinite(f.expiresAt) || f.expiresAt < Date.now() || f.expiresAt > Date.now() + 3600000 || !/^\w{32,}$/.test(f.token))
        throw Error('Invalid/expired fixture authority');
    process.kill(f.pid, 0);
    loopback(f.origin);
    if (f.next) {
        loopback(f.next.origin);
        if (typeof f.next.buildIdentity !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(f.next.buildIdentity))
            throw Error('Measured isolated Next build identity required');
        loopback(f.next.apiOrigin);
    }
    return f;
}
export function matchesExpectedGrade(result, student, cases, fingerprint) { return result.terminal === true && result.status === student.workload.status && result.score === student.workload.score && result.totalCount === cases && result.runtimeFingerprint === fingerprint && result.committed === true && Array.isArray(result.caseOutcomes) && result.caseOutcomes.length === cases && result.caseOutcomes.every(o => o === student.workload.caseOutcome); }
export function summarize(rows, expected) { const elapsed = rows.filter(r => Number.isFinite(r.elapsedMs)).map(r => r.elapsedMs).sort((a, b) => a - b), correct = rows.filter(r => r.correct === true).length; const percentile = p => elapsed.length ? elapsed[Math.ceil(p * elapsed.length) - 1] : null; return { expected, observed: rows.length, correct, failed: expected - correct, p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), maxMs: elapsed.length ? elapsed.at(-1) : null, allUnder5s: rows.length === expected && correct === expected && elapsed.length === expected && elapsed.every(ms => ms < 5000) }; }
export function assertSloEvidence(report) {
    if (report.stage !== 'actual-next-click-to-committed-display' || report.options.clients !== 200 || report.options.bursts !== 5 || report.bursts.length !== 5 || report.bursts.some(b => b.workloadBounds?.memoryLimitMb !== 512 || !Number.isFinite(b.workloadBounds?.executionOutputLimitBytes) || !Number.isFinite(b.workloadBounds?.generatedMaxOutputBytes) || b.workloadBounds.generatedMaxOutputBytes > 16384 || !Number.isFinite(b.workloadBounds?.sourceChars) || b.workloadBounds.sourceChars > 10000 || !Number.isFinite(b.workloadBounds?.aggregateStdinBytes) || b.workloadBounds.aggregateStdinBytes > 65536 || classroomCorpus.some(c => !b.rows.some(r => r.workload === c.kind && r.sourceDigest === ('sha256:' + createHash('sha256').update(c.code).digest('hex')))) || !b.summary.allUnder5s || b.arrivalWindowMs > 1000 || !b.commitVerified || !b.visibleBrowser || b.rows.some(r => !r.clickEvidence?.trusted || Math.abs(r.clickEvidence.alignmentMs) > 5)) || report.network.rttMs !== 80 || report.network.mbps !== 20)
        throw Error('All-200/five-burst SLO evidence failed or incomplete');
}
/** Node requires an integer delay; a live sub-millisecond budget still gets 1ms. */
export function createFixtureRpc(fixture, remaining) {
    return async (path, data) => { const response = await fetch(fixture.origin + path, { method: data ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + fixture.token, 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined, redirect: 'error', signal: AbortSignal.timeout(Math.max(1, Math.floor(Math.min(15000, remaining())))) }); if (!response.ok)
        throw Error('Fixture HTTP ' + response.status); return response.json(); };
}
async function main() {
    const options = parseArgs(process.argv.slice(2)), fixture = await loadAuthority(options.fixture);
    await lstat(options.output).then(() => { throw Error('Output already exists'); }, error => { if (error.code !== 'ENOENT') throw error; });
    const deadline = performance.now() + options.maxSeconds * 1000;
    const remaining = () => { const n = deadline - performance.now(); if (n <= 0)
        throw Error('Overall benchmark deadline'); return n; };
    const rpc = createFixtureRpc(fixture, remaining);
    const report = { version: 1, stage: options.mode === 'application' ? 'authorized-service-admission-to-committed-read' : 'actual-next-click-to-committed-display', options, fixtureId: fixture.fixtureId, nextBuildIdentity: fixture.next?.buildIdentity ?? null, network: { rttMs: options.mode === 'next-browser' ? 80 : null, mbps: options.mode === 'next-browser' ? 20 : null }, generator: { arch: arch(), platform: platform(), cpus: cpus().length, memoryBytes: totalmem(), maxConcurrency: options.concurrency }, unmeasured: ['production-auth-provider-latency', 'cross-machine-commit-to-display', 'database-pool-wait'], bursts: [], status: 'FAILED' };
    let browser;
    // One process-wide watchdog bounds browser/transport stalls as well as polling.
    // Persist partial observations before the small browser-cleanup grace expires.
    const watchdog = setTimeout(() => {
        report.status = 'FAILED';
        report.error = 'Overall benchmark deadline exceeded';
        const rows = report.bursts.flatMap(b => b.rows).concat(report.activeRows ?? []);
        report.total = summarize(rows, options.clients * options.bursts);
        report.unattempted = options.clients * options.bursts - rows.length;
        try {
            writeFileSync(options.output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        }
        catch { }
        const hardStop = setTimeout(() => process.exit(124), 2500);
        void Promise.resolve(browser?.close()).finally(() => { clearTimeout(hardStop); process.exit(124); });
    }, options.maxSeconds * 1000);
    try {
        if (options.mode === 'next-browser') {
            if (!fixture.next)
                throw Error('Prepared isolated actual Next fixture authority required');
            const { chromium } = await import('@playwright/test');
            browser = await chromium.launch({ headless: false, timeout: Math.min(30000, remaining()) });
        }
        for (let burst = 0; burst < options.bursts; burst++) {
            const readinessAt = performance.now();
            const ready = await rpc('/ready');
            if (!ready.ready || ready.fixtureId !== fixture.fixtureId || ready.backend !== 'nsjail')
                throw Error('Actual native readiness required before every cohort');
            const readinessMs = performance.now() - readinessAt;
            const cohort = await rpc('/cohort', { clients: options.clients, cases: options.cases, burst });
            if (cohort.students.length !== options.clients || new Set(cohort.students.map(s => s.id)).size !== options.clients)
                throw Error('Distinct student cohort required');
            for (const student of cohort.students)
                if (!classroomCorpus.some(c => JSON.stringify(c) === JSON.stringify(student.workload)))
                    throw Error('Unreviewed/incomplete workload specification');
            const rows = [], starts = [], pages = [];
            report.activeRows = rows;
            const preparationAt = performance.now();
            if (browser) {
                if (!Array.isArray(cohort.nextStudents) || cohort.nextStudents.length !== options.clients)
                    throw Error('Insufficient prepared authorized browser users');
                for (let i = 0; i < options.clients; i++) {
                    const student = cohort.nextStudents[i];
                    if (student.id !== cohort.students[i].id || new URL(student.url).origin !== fixture.next.origin || !student.url.includes('/learn/exercises/' + cohort.materialId))
                        throw Error('Prepared Next identity/material differs from owned cohort');
                    const context = await browser.newContext({ storageState: student.storageState });
                    const page = await context.newPage();
                    const cdp = await context.newCDPSession(page);
                    await cdp.send('Network.enable');
                    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 80, downloadThroughput: 20e6 / 8, uploadThroughput: 20e6 / 8 });
                    // No route interception or replacement of the real Next/BFF/hooks.
                    await page.goto(student.url, { timeout: Math.min(30000, remaining()) });
                    if (!await page.evaluate(() => Array.isArray(window.__next_f)))
                        throw Error('Actual Next application required');
                    await page.locator('.monaco-editor').first().waitFor({ state: 'visible', timeout: Math.min(15000, remaining()) });
                    await page.waitForFunction(code => { const m = window.monaco?.editor.getModels()[0]; if (!m)
                        return false; m.setValue(code); return true; }, cohort.students[i].workload.code, { timeout: Math.min(15000, remaining()) });
                    pages.push({ page, context, student });
                }
            }
            const preparationMs = performance.now() - preparationAt;
            let cursor = 0;
            const run = async () => {
                while (cursor < options.clients) {
                    const i = cursor++, student = cohort.students[i];
                    const started = performance.now();
                    if (!browser)
                        starts.push(started);
                    let submissionId;
                    try {
                        let result;
                        if (!browser) {
                            const accepted = await rpc('/submit', { studentId: student.id, code: student.workload.code });
                            submissionId = accepted.submissionId;
                            do {
                                result = await rpc('/result/' + submissionId);
                                if (!result.terminal)
                                    await new Promise(r => setTimeout(r, 25));
                                remaining();
                            } while (!result.terminal);
                        }
                        else {
                            const { page, student: prepared } = pages[i];
                            const acceptance = page.waitForResponse(r => r.request().method() === 'POST' && r.url().startsWith(fixture.next.apiOrigin + '/api/rpc') && r.url().includes('submit'), { timeout: Math.min(30000, remaining()) });
                            await page.evaluate(() => { const initial = document.querySelector('[data-testid="result-hero"]')?.textContent ?? ''; window.__nativeObservedChange = false; window.__nativeResultObserver = new MutationObserver(() => { const next = document.querySelector('[data-testid="result-hero"]')?.textContent ?? ''; if (next !== initial)
                                window.__nativeObservedChange = true; }); window.__nativeResultObserver.observe(document.body, { childList: true, subtree: true, characterData: true }); return performance.now(); });
                            const submitButton = page.getByRole('button', { name: fixture.next.submitLabel ?? 'Submit', exact: true });
                            await submitButton.evaluate(button => button.addEventListener('click', event => { window.__nativeClick = { trusted: event.isTrusted, monotonic: performance.now(), epoch: performance.timeOrigin + performance.now(), alignmentMs: Date.now() - (performance.timeOrigin + performance.now()) }; }, { capture: true, once: true }));
                            await page.getByRole('button', { name: fixture.next.submitLabel ?? 'Submit', exact: true }).click({ timeout: Math.min(15000, remaining()) });
                            const response = await acceptance;
                            const payload = await response.json();
                            const findId = v => v && typeof v === 'object' ? (typeof v.submissionId === 'string' ? v.submissionId : Object.values(v).map(findId).find(Boolean)) : undefined;
                            submissionId = findId(payload);
                            if (!submissionId)
                                throw Error('Missing actual submit acceptance');
                            await page.getByRole('heading', { name: fixture.next.headings?.[student.workload.kind] ?? student.workload.heading, exact: true }).waitFor({ state: 'visible', timeout: Math.min(30000, remaining()) });
                            await page.waitForFunction(() => window.__nativeObservedChange, {}, { timeout: Math.min(15000, remaining()) });
                            // Browser-local monotonic clock includes actual click/Next/BFF/SSE/render path.
                            const observed = await page.evaluate(() => ({ displayMs: performance.now() - window.__nativeClick.monotonic, ...window.__nativeClick }));
                            if (!observed.trusted || Math.abs(observed.alignmentMs) > 5)
                                throw Error('Untrusted or unaligned actual Submit click clock');
                            starts.push(observed.epoch);
                            const displayMs = observed.displayMs;
                            result = await rpc('/commit/' + submissionId + '?student=' + prepared.id);
                            result.clickEvidence = observed;
                            result.displayMs = displayMs;
                        }
                        const correct = matchesExpectedGrade(result, student, options.cases, ready.runtimeFingerprint);
                        rows.push({ student: student.id, workload: student.workload.kind, sourceDigest: 'sha256:' + createHash('sha256').update(student.workload.code).digest('hex'), submissionId, correct, elapsedMs: browser ? result.displayMs : performance.now() - started, status: result.status, commitVerified: result.committed === true, clickEvidence: result.clickEvidence ?? null, stages: result.stages ?? null });
                    }
                    catch (error) {
                        rows.push({ student: student.id, submissionId, correct: false, elapsedMs: performance.now() - started, error: String(error) });
                    }
                }
            };
            await Promise.all(Array.from({ length: Math.min(options.clients, options.concurrency) }, run));
            await Promise.all(pages.map(p => p.context.close()));
            const summary = summarize(rows, options.clients);
            report.bursts.push({ burst, readinessMs, workerStartupAndComparatorWarmMs: ready.workerWarmMs, preparationMs, arrivalWindowMs: Math.max(...starts) - Math.min(...starts), summary, rows, commitVerified: rows.every(r => r.commitVerified), visibleBrowser: Boolean(browser), arrivalClock: browser ? 'actual trusted click: browser timeOrigin plus monotonic; alignment <=5ms' : 'generator monotonic before service admission', resources: ready.resources, workloadBounds: cohort.bounds, runtimeFingerprint: ready.runtimeFingerprint, replenishment: { kind: 'fresh-interpreter-per-case', measuredMs: null }, postCohortReadiness: await rpc('/ready') });
            delete report.activeRows;
            if (summary.failed)
                throw Error('Correctness/resource failure: cohort growth stopped');
        }
        if (options.assertSlo)
            assertSloEvidence(report);
        report.status = 'PASS';
    }
    catch (error) {
        report.error = String(error);
        process.exitCode = 1;
    }
    finally {
        await browser?.close();
        clearTimeout(watchdog);
        report.total = summarize(report.bursts.flatMap(b => b.rows).concat(report.activeRows ?? []), options.clients * options.bursts);
        report.unattempted = options.clients * options.bursts - report.bursts.reduce((n, b) => n + b.rows.length, 0) - (report.activeRows?.length ?? 0);
        await writeFile(options.output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    }
    console.log(JSON.stringify({ status: report.status, stage: report.stage, output: options.output }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
    await main();
