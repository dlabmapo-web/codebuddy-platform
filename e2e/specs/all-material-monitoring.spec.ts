import { test, expect, type Page, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { resolve } from 'node:path';
const provider = 'http://127.0.0.1:4320';
type Fixture = { id: string; academy: { id: string; slug: string } };
async function fixture(request: APIRequestContext, role: string, parentFixtureId?: string): Promise<Fixture> {
  const response = await request.post(provider + '/fixtures', { data: { role, parentFixtureId } });
  expect(response.ok(), await response.text()).toBe(true); return response.json();
}
async function token(page: Page) {
  const parts = (await page.context().cookies()).filter(cookie => /auth-token(?:\.\d+)?$/.test(cookie.name)).sort((a,b) => a.name.localeCompare(b.name));
  return JSON.parse(Buffer.from(parts.map(cookie => cookie.value).join('').replace(/^base64-/, ''), 'base64url').toString()).access_token as string;
}
async function rpc(page: Page, request: APIRequestContext, method: string, input: object) {
  return request.post('http://127.0.0.1:4319/api/rpc/' + method, { headers: { Authorization: 'Bearer ' + await token(page) }, data: { json: input } });
}
async function enter(page: Page, fixture: Fixture) {
  const response = await page.request.get('/sso/start', { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  const target = new URL(response.headers().location!); target.searchParams.set('fixture', fixture.id);
  await page.goto(provider + '/os/authorize?' + target.searchParams);
  await expect(page).toHaveURL(new RegExp('/academy/' + fixture.academy.slug + '$'));
}
async function media(context: BrowserContext) {
  await context.route('https://os.dlabcampus.com/**', route => route.abort());
  // Only the external storage object is doubled; Cove's authenticated PDF read
  // and signed URL authorization still execute against the real local API.
  await context.route('https://dlab-sso-provider.invalid/storage/v1/object/sign/**', route => route.fulfill({
    path: resolve('e2e/fixtures/lecture-material.pdf'), contentType: 'application/pdf',
    headers: { 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin' },
  }));
}
async function visibleCode(page: Page, code?: string) {
  return page.evaluate(next => {
    const monaco = (window as unknown as { monaco?: { editor: { getEditors(): Array<{ getDomNode(): HTMLElement | null; getModel(): { setValue(value: string): void; getValue(): string } | null }> } } }).monaco;
    const model = monaco?.editor.getEditors().find(editor => editor.getDomNode()?.getClientRects().length)?.getModel();
    if (!model) return null;
    if (next !== undefined) model.setValue(next);
    return model.getValue();
  }, code);
}

for (const role of ['lab_head', 'instructor', 'tutor'] as const) {
  test(`${role} monitors live quiz, answers, PDF, video and actual Turtle output in one tab`, async ({ browser, page, request }, info) => {
    test.setTimeout(info.project.name === 'webkit' ? 900000 : 360000);
    const learnerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3309' });
    const ownerContext = role === 'lab_head' ? null : await browser.newContext({ baseURL: 'http://127.0.0.1:3309' });
    const learner = await learnerContext.newPage();
    const owner = ownerContext ? await ownerContext.newPage() : page;
    // Keep student sockets on API A and staff sockets on API B. This changes
    // only the endpoint; all Socket.IO traffic and authorization remain real.
    await page.addInitScript(() => {
      const NativeWebSocket = window.WebSocket;
      window.WebSocket = class extends NativeWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(String(url).replace('127.0.0.1:4319/socket.io', '127.0.0.1:4339/socket.io'), protocols);
        }
      };
    });
    await media(page.context()); await media(learnerContext); if (ownerContext) await media(ownerContext);
    const pageErrors: string[] = [];
    learner.on('dialog', async dialog => {
      if (dialog.type() === 'confirm' && dialog.message() === 'Your answer has not been submitted. Discard it and leave?') await dialog.accept();
      else { pageErrors.push('Unexpected dialog: ' + dialog.message()); await dialog.dismiss(); }
    });
    const navigating = new Set<Page>();
    const navigationAborts: string[] = [];
    const navigation = async (target: Page, action: () => Promise<unknown>) => {
      navigating.add(target);
      try { await action(); } finally { navigating.delete(target); }
    };
    const protocol: Array<{ side: string; direction: string; packet: string }> = [];
    for (const [side, observedPage] of [['staff', page], ['student', learner]] as const) {
      observedPage.on('websocket', socket => {
        const record = (direction: string, payload: string | Buffer) => {
          if (typeof payload === 'string' && (/(?:watch\.|document\.|access\.|server\.|class\.|presence\.)/.test(payload) || payload.startsWith('43/monitoring'))) {
            if (protocol.length >= 2000) protocol.shift();
            protocol.push({ side, direction, packet: payload.slice(0, 2500) });
          }
        };
        socket.on('framesent', event => record('sent', event.payload));
        socket.on('framereceived', event => record('received', event.payload));
      });
    }
    let observationStarts = 0;
    const monitoringPorts = new Set<string>();
    page.on('websocket', socket => {
      if (socket.url().includes('/socket.io')) monitoringPorts.add(new URL(socket.url()).port);
      socket.on('framesent', event => {
      if (typeof event.payload === 'string' && event.payload.includes('"observation.start"')) observationStarts++;
      });
    });
    for (const target of [page, learner]) target.on('pageerror', error => {
      // WebKit exposes cancelled outgoing fetches as resource exceptions during
      // controlled navigation/offline checks. Keep errors outside that window.
      if (info.project.name === 'webkit' && navigating.has(target) && error.name === 'Fetch API cannot load http' && error.message.endsWith('due to access control checks.'))
        navigationAborts.push(error.message);
      else pageErrors.push(error.message);
    });
    try {
      const manager = await fixture(request, 'lab_head'); await enter(owner, manager);
      const staff = role === 'lab_head' ? manager : await fixture(request, role, manager.id);
      if (role !== 'lab_head') await enter(page, staff);
      const student = await fixture(request, 'student', manager.id); await enter(learner, student);
      const seeded = await request.post(provider + '/fixtures/' + manager.id + '/classroom', { data: { studentFixtureId: student.id, includePdf: true, includeTurtle: true } });
      expect(seeded.ok(), await seeded.text()).toBe(true);
      const classroom = await seeded.json(); const classId: string = classroom.classes[0].id;
      if (role === 'tutor') {
        const member = await (await request.get(provider + '/fixtures/' + staff.id)).json();
        const assigned = await rpc(owner, request, 'academyClasses/setTeacher', { academyId: manager.academy.id, classId,
          teacherMembershipId: member.memberships[0].id, expectedUpdatedAt: classroom.classes[0].updatedAt });
        expect(assigned.ok(), await assigned.text()).toBe(true);
      }
      // The setup account is no longer needed; keep only the two people whose
      // live interactions are under test, especially on memory-limited hosts.
      await ownerContext?.close();
      const root = '/academy/' + manager.academy.slug;
      const learn = (kind: string, id: string) => `${root}/learn/${kind}/${id}?classId=${classId}`;
      const scope = { academyId: manager.academy.id, classId, membershipId: classroom.studentMembershipId };
      const navigateStudent = async (kind: string, id: string, title: string) => {
        if (!learner.url().includes(root + '/learn/')) await navigation(learner, () => learner.goto(learn(kind, id)));
        else {
          const outline = learner.getByRole('complementary', { name: 'Course', exact: true });
          if (!await outline.isVisible()) await learner.getByRole('button', { name: 'Show or hide the course outline', exact: true }).click();
          await outline.getByRole('button').filter({ hasText: title }).click();
        }
        await expect(learner.getByRole('heading', { name: title, exact: true })).toBeVisible({ timeout: info.project.name === 'webkit' ? 90000 : 25000 });
        await expect(learner).toHaveURL(new RegExp(id));
      };
      const follow = async (title: string) => {
        await expect(page.getByTestId('student-current-material')).toContainText(title);
        await page.getByRole('button', { name: 'Return to live', exact: true }).click();
        await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
        await expect(page.getByRole('complementary', { name: 'Course', exact: true }).getByRole('button').filter({ hasText: title }).getByText('Live', { exact: true })).toBeVisible();
      };
      await navigateStudent('quizzes', classroom.quizMaterialId, 'Choose the operator');
      await navigation(page, () => page.goto(`${root}/teach/classes/${classId}`));
      await expect(page.getByRole('link', { name: 'Open live', exact: true })).toBeVisible({ timeout: 90000 });
      await page.getByRole('link', { name: 'Open live', exact: true }).click();
      await expect(page.getByTestId('observation-connection')).toHaveText('Live', { timeout: 90000 });
      await expect(page.getByRole('heading', { name: 'Choose the operator', exact: true })).toBeVisible();
      await expect(learner.getByText('Teacher is monitoring', { exact: true })).toBeVisible();
      const initialStarts = observationStarts;
      expect(initialStarts).toBeGreaterThan(0);
      expect([...monitoringPorts]).toEqual(['4339']);
      await learner.getByRole('radio').first().check();
      await expect(page.getByRole('radio').first()).toBeChecked();
      await expect(page.getByRole('radio').first()).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Submit', exact: true })).toHaveCount(0);
      const snapshot = await rpc(page, request, 'monitoring/getObservedMaterial', { ...scope, materialId: classroom.quizMaterialId });
      expect(snapshot.ok()).toBe(true);
      expect(JSON.stringify(await snapshot.json())).not.toMatch(/correctOptionIds|expectedAnswer|modelAnswer|solutionFiles/);
      expect((await rpc(learner, request, 'monitoring/getObservedMaterial', { ...scope, materialId: classroom.quizMaterialId })).status()).toBe(403);
      if (role === 'tutor') expect((await rpc(page, request, 'monitoring/getObservedMaterial', { ...scope, classId: classroom.classes[1].id, materialId: classroom.quizMaterialId })).status()).toBe(403);
      const tabCount = page.context().pages().length;
      const course = page.getByRole('complementary', { name: 'Course', exact: true });
      await expect(course.getByRole('button').filter({ hasText: 'Choose the operator' }).getByText('Live', { exact: true })).toBeVisible();
      const lecture = course.getByRole('button').filter({ hasText: 'Addition lesson' });
      await lecture.click();
      await expect(lecture).toHaveAttribute('aria-expanded', 'false');
      await expect(lecture.getByText('Live', { exact: true })).toBeVisible();
      await lecture.click();
      await course.getByRole('button').filter({ hasText: 'Lesson reference PDF' }).click();
      await expect(page.getByTestId('pdf-reader')).toBeVisible();
      await expect(page.getByTestId('student-current-material')).toContainText('Choose the operator');
      expect(page.context().pages()).toHaveLength(tabCount);
      expect(observationStarts).toBe(initialStarts);
      await navigation(page, () => page.goBack()); await expect(page.getByRole('heading', { name: 'Choose the operator', exact: true })).toBeVisible();
      await navigateStudent('turtle', classroom.shortMaterialId, 'Name the language');
      await follow('Name the language');
      await learner.getByRole('textbox').fill('Unsaved live Python answer');
      await expect(page.getByRole('textbox', { name: 'Student answer' })).toHaveValue('Unsaved live Python answer');
      await learner.getByRole('textbox').fill('');
      await expect(page.getByRole('textbox', { name: 'Student answer' })).toHaveValue('');
      await learner.getByRole('textbox').fill('Recovered live answer');
      await navigation(page, () => page.reload());
      await expect(page.getByRole('textbox', { name: 'Student answer' })).toHaveValue('Recovered live answer');
      await navigation(page, async () => {
        await page.context().setOffline(true); await page.context().setOffline(false);
        await learner.getByRole('textbox').fill('After staff reconnect');
        await expect(page.getByRole('textbox', { name: 'Student answer' })).toHaveValue('After staff reconnect');
      });
      await navigation(learner, async () => {
        await learnerContext.setOffline(true); await learnerContext.setOffline(false);
        await learner.getByRole('textbox').fill('After student reconnect');
        await expect(page.getByRole('textbox', { name: 'Student answer' })).toHaveValue('After student reconnect');
      });
      await expect(learner.getByText('Teacher is monitoring', { exact: true })).toBeVisible();
      await navigateStudent('turtle', classroom.writtenMaterialId, 'Explain your addition');
      await follow('Explain your addition');
      await learner.getByRole('textbox').fill('Add both inputs without submitting.');
      await expect(page.getByRole('textbox', { name: 'Student answer' })).toHaveValue('Add both inputs without submitting.');
      await navigateStudent('documents', classroom.pdfMaterialId, 'Lesson reference PDF');
      await follow('Lesson reference PDF');
      await expect(page.getByTestId('pdf-reader')).toBeVisible();
      await expect(page.getByTestId('student-pdf-position')).toContainText('1');
      await navigateStudent('videos', classroom.videoMaterialId, 'Lesson video');
      await follow('Lesson video');
      await expect(learner.locator('video')).toBeVisible();
      await expect.poll(() => learner.locator('video').evaluate((node: HTMLVideoElement) => node.readyState)).toBeGreaterThan(1);
      await learner.locator('video').evaluate(async (node: HTMLVideoElement) => { node.currentTime = 3; await node.play(); });
      await expect(page.getByTestId('student-video-state')).toContainText('Playing');
      await learner.locator('video').evaluate((node: HTMLVideoElement) => { node.pause(); node.currentTime = 5; });
      await expect(page.getByTestId('student-video-state')).toContainText('5s');
      await expect(page.getByTestId('student-video-state')).toContainText('Paused');
      expect(await page.locator('video').evaluate((node: HTMLVideoElement) => node.paused)).toBe(true);
      await page.getByRole('button', { name: 'Return to live', exact: true }).click();
      await expect.poll(() => page.locator('video').evaluate((node: HTMLVideoElement) => Math.abs(node.currentTime - 5))).toBeLessThan(0.5);
      await page.locator('video').evaluate(async (node: HTMLVideoElement) => { await node.play(); });
      expect(await learner.locator('video').evaluate((node: HTMLVideoElement) => node.paused)).toBe(true);
      await expect(page.getByTestId('student-video-state')).toContainText('Paused');
      await page.locator('video').evaluate((node: HTMLVideoElement) => node.pause());
      await navigateStudent('turtle', classroom.turtleMaterialId, 'Draw a red square');
      await follow('Draw a red square');
      await expect(page.getByTestId('student-source')).toContainText('turtle.Turtle');
      const turtleCanvas = learner.getByTestId('turtle-display').locator('canvas');
      for (let attempt = 0; attempt < 3; attempt++) {
        await learner.getByRole('button', { name: 'Run', exact: true }).click();
        // Docker Desktop can reject a cold launch while Next compiles. Retry
        // only this explicit infrastructure failure through the real Run UI.
        await expect.poll(async () => await turtleCanvas.isVisible() ? 'ready'
          : await learner.getByRole('alert').filter({ hasText: 'GUI launch failed' }).isVisible() ? 'launch_failed' : 'starting', { timeout: 60000 }).not.toBe('starting');
        if (await turtleCanvas.isVisible()) break;
        expect(attempt, 'Local Docker runtime failed three launches').toBeLessThan(2);
        info.annotations.push({ type: 'local-runtime-retry', description: 'GUI launch failed; retried the real Run action' });
      }
      await expect(turtleCanvas).toBeVisible();
      await expect(page.getByTestId('student-drawing')).toBeVisible({ timeout: 60000 });
      await expect(page.getByLabel('Student terminal output')).toContainText('MONITORED TURTLE', { timeout: 60000 });
      const drawing = page.getByTestId('student-drawing');
      await expect.poll(async () => drawing.evaluate(async (node: HTMLImageElement) => {
        if (!node.complete || !node.naturalWidth) return 0;
        const canvas = document.createElement('canvas'); canvas.width = node.naturalWidth; canvas.height = node.naturalHeight;
        const ctx = canvas.getContext('2d')!; ctx.drawImage(node, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let red = 0; for (let i=0; i<pixels.length; i+=4) if (pixels[i]>170 && pixels[i+1]<120 && pixels[i+2]<120) red++;
        return red;
      }), { timeout: 60000 }).toBeGreaterThan(100);
      await page.screenshot({ path: info.outputPath('live-turtle-monitor.png') });
      await learner.getByRole('button', { name: 'Stop', exact: true }).click();
      await navigateStudent('exercises', classroom.materialId, 'Add two numbers');
      await expect(page.getByTestId('student-current-material')).toContainText('Add two numbers');
      await page.getByRole('button', { name: 'Return to live', exact: true }).click();
      await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 60000 });
      await expect(page.getByText('Live on Add two numbers', { exact: true })).toBeVisible();
      const edit = page.getByRole('button', { name: 'Edit code · Off', exact: true });
      await expect(edit).toBeEnabled(); await edit.click();
      await expect(page.getByRole('button', { name: 'Edit code · On', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await visibleCode(page, 'print("staff live edit")');
      await expect.poll(() => visibleCode(learner)).toBe('print("staff live edit")');
      await visibleCode(learner, 'print("student follow-up")');
      await expect.poll(() => visibleCode(page)).toBe('print("student follow-up")');
      const codeStarts = observationStarts;
      await page.getByRole('complementary', { name: 'Course', exact: true }).getByRole('button').filter({ hasText: 'Lesson reference PDF' }).click();
      await expect(page.getByTestId('pdf-reader')).toBeVisible();
      await expect(page.getByTestId('student-current-material')).toContainText('Add two numbers');
      expect(observationStarts).toBe(codeStarts);
      expect(page.context().pages()).toHaveLength(tabCount);
      await navigation(page, () => page.goBack());
      await expect(page.locator('.monaco-editor')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Edit code · Off', exact: true })).toBeEnabled();
      expect(observationStarts).toBe(codeStarts);
      await navigation(page, () => page.reload());
      await expect(page.getByRole('button', { name: 'Edit code · Off', exact: true })).toBeEnabled({ timeout: 90000 });
      await page.getByRole('complementary', { name: 'Course', exact: true }).getByRole('button').filter({ hasText: 'Lesson reference PDF' }).click();
      await expect(page.getByTestId('pdf-reader')).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByRole('button', { name: 'Materials', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Materials', exact: true }).click();
      await expect(page.getByRole('complementary', { name: 'Course', exact: true })).toHaveCount(0);
      await expect(page.getByTestId('pdf-reader')).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath('mobile-pdf-monitor.png') });
      expect(pageErrors).toEqual([]);
      // The idempotent fixture PUT may reuse an idle provider connection.
      const revoked = await request.put(provider + '/fixtures/' + staff.id, { data: { role: 'student' }, maxRetries: 2 });
      expect(revoked.ok(), await revoked.text()).toBe(true);
      await expect(page.locator('main[role="alert"]')).toContainText('Monitoring access has ended.');
    } finally {
      await info.attach('monitoring-protocol', { body: Buffer.from(JSON.stringify(protocol)), contentType: 'application/json' });
      await info.attach('navigation-resource-aborts', { body: Buffer.from(JSON.stringify(navigationAborts)), contentType: 'application/json' });
      await learnerContext.close(); await ownerContext?.close();
    }
  });
}
