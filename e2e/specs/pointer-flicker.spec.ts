import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { monitoringClientEvents, monitoringServerEvents } from '../../packages/shared/src/monitoring/events';
import { observationEvents } from '../../packages/shared/src/monitoring/observation';
import { routes } from '../../packages/web/src/lib/routes';

const provider = 'http://127.0.0.1:4320';
const studio = 'http://127.0.0.1:3309';
type Fixture = { id: string; academy: { id: string; slug: string } };
type AuditResult = { frames: number; missing: number; replaced: number; removals: number; positions: number };
type AuditWindow = Window & { pointerAudit?: { stop: () => AuditResult } };

async function fixture(request: APIRequestContext, role: string, parentFixtureId?: string): Promise<Fixture> {
  const response = await request.post(provider + '/fixtures', { data: { role, parentFixtureId, name: role === 'student' ? 'Pointer Student' : undefined } });
  expect(response.ok()).toBe(true); return response.json();
}
async function enter(page: Page, data: Fixture) {
  const response = await page.request.get('/sso/start', { maxRedirects: 0, timeout: 90_000 });
  const target = new URL(response.headers().location!); target.searchParams.set('fixture', data.id);
  await page.goto(provider + '/os/authorize?' + target.searchParams);
  await expect(page).toHaveURL(new RegExp('/academy/' + data.academy.slug + '/(?:classes|teach/classes|learn/classes)$'));
}
async function code(page: Page, next?: string) {
  return page.evaluate(value => {
    const monaco = (window as unknown as { monaco?: { editor: { getEditors(): Array<{
      getDomNode(): HTMLElement | null;
      getModel(): { getValue(): string; setValue(value: string): void } | null;
    }> } } }).monaco;
    const model = monaco?.editor.getEditors().find(editor => editor.getDomNode()?.getClientRects().length && getComputedStyle(editor.getDomNode()!).visibility !== 'hidden')?.getModel();
    if (value !== undefined) model?.setValue(value);
    return model?.getValue();
  }, next);
}
async function appendCode(page: Page) {
  await page.evaluate(() => {
    const monaco = (window as unknown as { monaco: { editor: { getEditors(): Array<{
      getDomNode(): HTMLElement | null;
      getModel(): { getFullModelRange(): { endLineNumber: number; endColumn: number } };
      executeEdits(source: string, edits: Array<{ range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }; text: string }>): void;
    }> } } }).monaco;
    const editor = monaco.editor.getEditors().find(item => item.getDomNode()?.getClientRects().length)!;
    const end = editor.getModel().getFullModelRange();
    editor.executeEdits('pointer-flicker-test', [{ range: { ...end, startLineNumber: end.endLineNumber, startColumn: end.endColumn }, text: '\n# typing while pointing' }]);
  });
}
function transport(page: Page) {
  const counts = { opened: 0, closed: 0, starts: 0, stops: 0, awareness: 0, sentAwareness: [] as unknown[], receivedAwareness: [] as unknown[] };
  const remember = (list: unknown[], wire: string) => {
    try { list.push(JSON.parse(wire.slice(wire.indexOf('[')))); if (list.length > 3) list.shift(); } catch { /* Other Socket.IO packet types are not JSON events. */ }
  };
  page.on('websocket', socket => {
    if (!socket.url().includes('/socket.io')) return;
    counts.opened++; socket.on('close', () => counts.closed++);
    socket.on('framesent', frame => {
      if (typeof frame.payload !== 'string') return;
      if (frame.payload.includes(`"${monitoringClientEvents.watchStart}"`)) counts.starts++;
      if (frame.payload.includes(`"${monitoringClientEvents.watchStop}"`)) counts.stops++;
      if (frame.payload.includes(`"${monitoringClientEvents.awarenessUpdate}"`)) remember(counts.sentAwareness, frame.payload);
    });
    socket.on('framereceived', frame => {
      if (typeof frame.payload !== 'string') return;
      if ([monitoringServerEvents.awarenessChanged, observationEvents.awareness, observationEvents.teacherAwareness]
        .some(event => frame.payload.includes(`"${event}"`))) { counts.awareness++; remember(counts.receivedAwareness, frame.payload); }
    });
  });
  return counts;
}
const connectionCounts = (counts: ReturnType<typeof transport>) => ({ opened: counts.opened, closed: counts.closed, starts: counts.starts, stops: counts.stops });

async function startAudit(page: Page, surface: string) {
  await page.evaluate(surfaceName => {
    const selector = `[data-testid="peer-pointer"][data-peer-surface="${surfaceName}"]`;
    const original = document.querySelector<HTMLElement>(selector);
    if (!original) throw new Error('Warm up a valid pointer before auditing movement');
    let frames = 0, missing = 0, replaced = 0, removals = 0, raf = 0;
    const positions = new Set<string>();
    const sample = () => {
      const marker = document.querySelector<HTMLElement>(selector); frames++;
      if (!marker || !marker.getClientRects().length || getComputedStyle(marker).visibility === 'hidden' || getComputedStyle(marker).opacity === '0') missing++;
      else {
        if (marker !== original) replaced++;
        const box = marker.getBoundingClientRect(); positions.add(`${Math.round(box.x)},${Math.round(box.y)}`);
      }
      raf = requestAnimationFrame(sample);
    };
    const removed = (records: MutationRecord[]) => {
      for (const record of records) for (const node of record.removedNodes) {
        if (node === original || node.contains(original)) removals++;
      }
    };
    const observer = new MutationObserver(removed); observer.observe(document.body, { childList: true, subtree: true });
    raf = requestAnimationFrame(sample);
    (window as AuditWindow).pointerAudit = { stop() {
      cancelAnimationFrame(raf); removed(observer.takeRecords()); observer.disconnect();
      return { frames, missing, replaced, removals, positions: positions.size };
    } };
  }, surface);
}

async function sweep(sender: Page, receiver: Page, region: Locator, surface: string, onStep?: (step: number) => Promise<void>) {
  const box = await region.boundingBox(); expect(box).not.toBeNull();
  const x = box!.x + Math.min(100, box!.width / 3), y = box!.y + Math.min(12, box!.height / 3);
  const arrow = receiver.locator(`[data-testid="peer-pointer"][data-peer-surface="${surface}"]`).first();
  // Binding and the first pointer can race. Keep exercising real capture until
  // both sides establish a valid projection, before starting the measured segment.
  let warmup = 0;
  await expect.poll(async () => {
    await sender.mouse.move(x + (++warmup % 2), y);
    return arrow.isVisible();
  }, { intervals: [150], timeout: 20_000 }).toBe(true);
  await startAudit(receiver, surface);
  let result: AuditResult;
  try {
    for (let step = 0; step < 36; step++) {
      await sender.mouse.move(x + (step % 12) * Math.min(8, box!.width / 40), y + (step % 3) * 3);
      await onStep?.(step);
      await sender.waitForTimeout(85); // Exercise the real 80ms publisher, rather than injecting packets.
    }
  } finally {
    result = await receiver.evaluate(() => (window as AuditWindow).pointerAudit!.stop());
  }
  expect(result.frames).toBeGreaterThan(50);
  expect(result.positions).toBeGreaterThan(8);
  expect(result.missing, JSON.stringify(result)).toBe(0);
  expect(result.replaced, JSON.stringify(result)).toBe(0); expect(result.removals, JSON.stringify(result)).toBe(0);
  return result;
}

for (const [role, locale] of [['lab_head', 'en'], ['instructor', 'ko'], ['tutor', 'en']] as const) {
  test(`${role} (${locale}): continuous bidirectional pointers with real sockets`, async ({ page, browser, request }, info) => {
    test.setTimeout(600_000);
    const ownerContext = await browser.newContext({ baseURL: studio });
    const learnerContext = await browser.newContext({ baseURL: studio, viewport: { width: 1280, height: 900 }, recordVideo: { dir: info.outputPath('learner-video') } });
    const results: Record<string, AuditResult> = {};
    const staffTransport = transport(page);
    let learnerTransport: ReturnType<typeof transport> | undefined;
    const capture = async (target: Page, name: string) => {
      const path = info.outputPath(`${name}.png`); await target.screenshot({ path }); await info.attach(name, { path, contentType: 'image/png' });
    };
    try {
      await page.context().addCookies([{ name: 'i18next', value: locale, url: studio }]);
      await learnerContext.addCookies([{ name: 'i18next', value: locale, url: studio }]);
      const owner = await ownerContext.newPage(), learner = await learnerContext.newPage();
      learnerTransport = transport(learner);
      const manager = await fixture(request, 'lab_head'); await enter(owner, manager);
      const student = await fixture(request, 'student', manager.id); await enter(learner, student);
      const staff = role === 'lab_head' ? manager : await fixture(request, role, manager.id); await enter(page, staff);
      const response = await request.post(`${provider}/fixtures/${manager.id}/classroom`, { data: { studentFixtureId: student.id, teacherFixtureId: staff.id, includeSecondProgramming: true } });
      expect(response.ok(), await response.text()).toBe(true);
      const data = await response.json() as { classes: Array<{ id: string }>; materialId: string; writtenMaterialId: string; studentMembershipId: string };
      const classId = data.classes[0].id, slug = staff.academy.slug;
      await learner.goto(routes.academyLearnMaterial(slug, data.materialId, 'PROGRAMMING_EXERCISE', { classId }));
      await expect.poll(() => code(learner)).toBeTruthy();
      await code(learner, '# POINTER CONTINUITY\nimport time\nfor i in range(15):\n    print("POINTER RUN", i, flush=True)\n    time.sleep(0.3)\n# shared live code\n');
      await page.goto(routes.academyTeachStudentLive(slug, classId, data.studentMembershipId));
      await expect.poll(() => code(page)).toContain('POINTER CONTINUITY');
      await expect(page.getByTestId('observation-connection')).toContainText(locale === 'ko' ? '실시간' : 'Live');
      const stableStaff = connectionCounts(staffTransport), stableLearner = connectionCounts(learnerTransport);
      await learner.getByRole('button', { name: locale === 'ko' ? '실행' : 'Run', exact: true }).click();
      await expect(learner.getByTestId('terminal')).toContainText('POINTER RUN');
      await expect(page.getByTestId('mirrored-terminal')).toContainText('POINTER RUN');
      const outputBeforeMovement = await page.getByTestId('mirrored-terminal').textContent();
      const packetsBefore = staffTransport.awareness;
      results.studentEditor = await sweep(learner, page, learner.locator('.monaco-editor .view-lines').first(), 'editor', async step => {
        if (step === 12 || step === 24) await appendCode(learner);
      });
      await expect.poll(() => code(page)).toContain('typing while pointing');
      expect(await page.getByTestId('mirrored-terminal').textContent()).not.toBe(outputBeforeMovement);
      await expect(page.getByTestId('mirrored-terminal')).toContainText('POINTER RUN 14');
      expect(staffTransport.awareness - packetsBefore).toBeGreaterThan(10);
      await capture(page, '01-staff-sees-continuous-student-pointer');
      results.staffEditor = await sweep(page, learner, page.locator('.monaco-editor .view-lines').first(), 'editor');
      await capture(learner, '02-student-sees-continuous-staff-pointer');
      await expect(learner.getByTestId('peer-pointer')).toHaveCount(0, { timeout: 6000 });
      // A student marker stays visible on the staff screen beyond teacher expiry.
      await expect(page.getByTestId('peer-pointer').first()).toBeVisible();
      await capture(page, '03-student-pointer-retained-while-idle');
      for (const surface of ['statement', 'terminal']) {
        if (surface === 'terminal') await page.getByRole('tab', { name: locale === 'ko' ? '내 실행' : 'Your run', exact: true }).click();
        results[`staff-${surface}`] = await sweep(page, learner, page.locator(`[data-collab-surface="${surface}"]`).first(), surface);
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      results.reducedMotion = await sweep(learner, page, learner.locator('.monaco-editor .view-lines').first(), 'editor', async step => {
        if (step === 18) await page.setViewportSize({ width: 1400, height: 960 });
      });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      expect(connectionCounts(staffTransport)).toEqual(stableStaff);
      expect(connectionCounts(learnerTransport)).toEqual(stableLearner);

      await code(learner, '# POINTER CONTINUITY UPDATED\nprint(4)\n');
      await expect.poll(() => code(page)).toContain('CONTINUITY UPDATED');
      // Current live watches request editing directly; there is no separate toggle.
      await code(page, '# STAFF HELPED\nprint(5)\n');
      await expect.poll(() => code(learner)).toContain('STAFF HELPED');
      await capture(page, '04-two-way-live-code');

      // A second monitor's independently expiring arrow must not interrupt the first.
      if (role === 'lab_head') {
        await owner.goto(routes.academyTeachStudentLive(slug, classId, data.studentMembershipId));
        await expect.poll(() => code(owner)).toContain('STAFF HELPED');
        results.secondMonitor = await sweep(owner, learner, owner.locator('.monaco-editor .view-lines').first(), 'editor');
        const lines = await page.locator('.monaco-editor .view-lines').first().boundingBox();
        await page.mouse.move(lines!.x + 60, lines!.y + 12);
        await expect(learner.getByTestId('peer-pointer')).toHaveCount(2);
        await capture(learner, '05-two-independent-monitors');
        await owner.goto(routes.academyTeachClasses(slug));
        await expect(learner.getByTestId('peer-pointer')).toHaveCount(1);
      }

      await learner.goto(routes.academyLearnMaterial(slug, data.writtenMaterialId, 'WRITTEN_RESPONSE', { classId }));
      await learner.locator('textarea').first().fill('Continuous observation pointers');
      await expect(page.getByText(locale === 'ko' ? 'Explain your addition 실시간' : 'Live on Explain your addition', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: locale === 'ko' ? '실시간으로 돌아가기' : 'Return to live', exact: true }).click();
      await expect(page.getByTestId('observed-manual-workspace').locator('textarea')).toHaveValue('Continuous observation pointers');
      results.studentObservation = await sweep(learner, page, learner.locator('textarea').first(), 'answer');
      results.staffObservation = await sweep(page, learner, page.getByTestId('observed-manual-workspace').locator('textarea'), 'answer');
      await capture(page, '06-observed-written-response');
      await capture(learner, '07-student-observation-pointer');
      await info.attach('continuity-and-transport', { body: JSON.stringify({ results, staffTransport, learnerTransport }, null, 2), contentType: 'application/json' });
    } finally {
      const path = info.outputPath('continuity-results.json');
      await writeFile(path, JSON.stringify({ results, staffTransport, learnerTransport }, null, 2));
      await info.attach('checks-including-partial-results', { path, contentType: 'application/json' });
      await learnerContext.close(); await ownerContext.close();
    }
  });
}
