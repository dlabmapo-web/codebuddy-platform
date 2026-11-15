import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { monitoringClientEvents, monitoringServerEvents } from '../../packages/shared/src/monitoring/events';
import { routes } from '../../packages/web/src/lib/routes';

const provider = 'http://127.0.0.1:4320';
const studio = 'http://127.0.0.1:3309';
type Fixture = { id: string; academy: { id: string; slug: string } };
async function fixture(request: APIRequestContext, role: string, parentFixtureId?: string): Promise<Fixture> {
  const response = await request.post(provider + '/fixtures', { data: { role, parentFixtureId, name: role === 'student' ? 'Cove Student' : undefined } });
  expect(response.ok()).toBe(true); return response.json();
}
async function enter(page: Page, data: Fixture) {
  const response = await page.request.get('/sso/start', { maxRedirects: 0, timeout: 90_000 });
  const target = new URL(response.headers().location!); target.searchParams.set('fixture', data.id);
  await page.goto(provider + '/os/authorize?' + target.searchParams);
  await expect(page).toHaveURL(new RegExp('/academy/' + data.academy.slug + '/(?:classes|teach/classes|learn/classes)$'));
}
async function code(page: Page, value?: string) {
  return page.evaluate(next => {
    const monaco = (window as unknown as { monaco?: { editor: { getEditors(): Array<{ getDomNode(): HTMLElement | null; getModel(): { getValue(): string; setValue(value: string): void } | null }> } } }).monaco;
    const editor = monaco?.editor.getEditors().find(item => item.getDomNode()?.getClientRects().length && getComputedStyle(item.getDomNode()!).visibility !== 'hidden');
    const model = editor?.getModel();
    if (next !== undefined) model?.setValue(next);
    return model?.getValue();
  }, value);
}
const pointerOffsets = new WeakMap<Page, number>();
async function moveOverCode(page: Page) {
  const lines = page.locator('.monaco-editor .view-lines').first();
  await expect(lines).toBeVisible(); const box = await lines.boundingBox();
  // Each call must end at a new eligible point. Returning to the same pixel
  // can be coalesced into a no-op by the pointer publisher.
  const offset = pointerOffsets.get(page) === 60 ? 100 : 60;
  pointerOffsets.set(page, offset);
  expect(box).not.toBeNull(); await page.mouse.move(box!.x + offset, box!.y + 10, { steps: 4 });
}
const markers = '[data-testid="peer-pointer"], [data-testid="peer-pointer-elsewhere"], [data-testid="peer-pointer-direction"]';

for (const [role, locale] of [['lab_head', 'en'], ['instructor', 'ko'], ['tutor', 'en']] as const) {
  test(`${role} (${locale}): presence follows the displayed material without restarting monitoring`, async ({ page, browser, request }, info) => {
    test.setTimeout(600_000);
    const ownerContext = await browser.newContext({ baseURL: studio });
    const learnerContext = await browser.newContext({ baseURL: studio, viewport: { width: 1440, height: 1000 } });
    let opened = 0, closed = 0, starts = 0, stops = 0, pointerFrames = 0;
    page.on('websocket', socket => {
      if (!socket.url().includes('/socket.io')) return;
      opened++; socket.on('close', () => { closed++; });
      socket.on('framesent', frame => {
        if (typeof frame.payload !== 'string') return;
        if (frame.payload.includes(`"${monitoringClientEvents.watchStart}"`)) starts++;
        if (frame.payload.includes(`"${monitoringClientEvents.watchStop}"`)) stops++;
      });
      socket.on('framereceived', frame => {
        if (typeof frame.payload === 'string' && frame.payload.includes(`"${monitoringServerEvents.awarenessChanged}"`) &&
          /"(?:pointer|editorPointer)":\{/.test(frame.payload)) pointerFrames++;
      });
    });
    const transport = () => ({ opened, closed, starts, stops });
    const capture = async (target: Page, name: string) => {
      const path = info.outputPath(`${locale}-${name}.png`);
      await target.screenshot({ path }); await info.attach(name, { path, contentType: 'image/png' });
    };
    try {
      await page.context().addCookies([{ name: 'i18next', value: locale, url: studio }]);
      await learnerContext.addCookies([{ name: 'i18next', value: locale, url: studio }]);
      const owner = await ownerContext.newPage(), learner = await learnerContext.newPage();
      const manager = await fixture(request, 'lab_head'); await enter(owner, manager);
      const student = await fixture(request, 'student', manager.id); await enter(learner, student);
      const staff = role === 'lab_head' ? manager : await fixture(request, role, manager.id); await enter(page, staff);
      const response = await request.post(`${provider}/fixtures/${manager.id}/classroom`, { data: { studentFixtureId: student.id, teacherFixtureId: staff.id, includeSecondProgramming: true } });
      expect(response.ok(), await response.text()).toBe(true);
      const data = await response.json() as { classes: Array<{ id: string }>; materialId: string; secondProgrammingMaterialId: string; writtenMaterialId: string; studentMembershipId: string };
      const classId = data.classes[0].id, slug = staff.academy.slug;
      await learner.goto(routes.academyLearnMaterial(slug, data.materialId, 'PROGRAMMING_EXERCISE', { classId }));
      await expect.poll(() => code(learner), { timeout: 90_000 }).toBeTruthy();
      await code(learner, '# STUDENT LIVE A\nprint(101)\n');
      await capture(learner, '01-student-current-lesson');
      await page.goto(routes.academyClassroom(slug, classId));
      await expect(page.getByTestId('classroom-live-counts')).toContainText(locale === 'ko' ? '접속 1명' : '1 online');
      await moveOverCode(page); await expect(learner.locator(markers)).toHaveCount(0);
      await capture(page, '02-private-teaching');
      await page.getByRole('button', { name: locale === 'ko' ? /^학생 전환,/ : /^Switch student,/ }).click();
      await page.getByRole('dialog').locator(`a[href="${routes.academyTeachStudentLive(slug, classId, data.studentMembershipId)}"]`).first().click();
      await expect.poll(() => code(page), { timeout: 90_000 }).toContain('STUDENT LIVE A');
      await expect(page.getByTestId('observation-connection')).toContainText(locale === 'ko' ? '실시간' : 'Live');
      await expect(page.locator(`[data-collab-anchor="exercise:${data.materialId}"]`)).toBeVisible();
      await moveOverCode(learner); await expect(page.getByTestId('peer-pointer').first()).toBeVisible();
      await capture(page, '03-same-lesson-pointer');
      const stable = transport();
      const panel = page.getByRole('complementary');
      const selectB = async () => {
        const branch = panel.getByRole('button', { name: /Another chapter/ });
        if (await branch.getAttribute('aria-expanded') === 'false') await branch.click();
        await panel.locator(`[data-collab-anchor="exercise:${data.secondProgrammingMaterialId}"]`).click();
        await expect.poll(() => code(page)).toContain('DIFFERENT CHAPTER');
      };
      const returnLive = async () => {
        await page.getByRole('button', { name: locale === 'ko' ? '실시간으로 돌아가기' : 'Return to live', exact: true }).click();
        await expect.poll(() => code(page)).toContain('STUDENT LIVE');
        await expect(page.getByTestId('programming-monitor')).toHaveAttribute('data-display-mode', 'live');
        await expect(page.getByTestId('programming-monitor')).toHaveAttribute('data-pointer-source-material', data.materialId);
      };
      await selectB();
      await expect(page.locator(markers)).toHaveCount(0);
      // Same title, different IDs: neither the title nor mouse movement can imply a match.
      const beforeMovement = pointerFrames;
      await moveOverCode(learner);
      await expect.poll(() => pointerFrames).toBeGreaterThan(beforeMovement);
      await page.setViewportSize({ width: 1400, height: 1000 });
      await expect(page.locator(markers)).toHaveCount(0);
      await expect.poll(() => code(page)).toContain('DIFFERENT CHAPTER');
      await page.locator('[data-collab-surface="header"]').first().hover();
      await expect(learner.locator(markers)).toHaveCount(0);
      await code(learner, '# STUDENT LIVE UPDATED WHILE PREVIEWING\nprint(102)\n');
      await moveOverCode(learner); await expect(page.locator(markers)).toHaveCount(0);
      expect(transport()).toEqual(stable);
      await capture(page, '04-different-chapter-no-pointer-or-banner');
      await returnLive();
      await expect.poll(() => code(page)).toContain('UPDATED WHILE PREVIEWING');
      await moveOverCode(learner); await expect(page.getByTestId('peer-pointer').first()).toBeVisible();
      expect(transport()).toEqual(stable);
      await capture(page, '05-return-live-updates-and-pointer');

      // Production regression: the student catches up to the lesson staff
      // already previewed. Observation alone must not stand in for rebinding
      // the authorized collaborative document.
      await selectB();
      const beforeHandoff = transport();
      await learner.goto(routes.academyLearnMaterial(slug, data.secondProgrammingMaterialId, 'PROGRAMMING_EXERCISE', { classId }));
      await expect.poll(() => code(learner), { timeout: 90_000 }).toContain('DIFFERENT CHAPTER');
      await code(learner, '# STUDENT CAUGHT UP TO PREVIEW B\nprint(202)\n');
      await expect.poll(() => code(page), { timeout: 15_000 }).toContain('CAUGHT UP TO PREVIEW B');
      await expect(page.getByTestId('observation-connection')).toContainText(locale === 'ko' ? '실시간' : 'Live');
      await expect(page.getByTestId('programming-monitor')).toHaveAttribute('data-display-mode', 'live');
      await moveOverCode(learner); await expect(page.getByTestId('peer-pointer').first()).toBeVisible();
      expect(transport()).toEqual({ ...beforeHandoff, starts: beforeHandoff.starts + 1 });
      await code(page, '# DIFFERENT CHAPTER\n# TEACHER LIVE AFTER PREVIEW HANDOFF\nprint(203)\n');
      await expect.poll(() => code(learner)).toContain('TEACHER LIVE AFTER PREVIEW HANDOFF');
      await moveOverCode(page); await expect(learner.getByTestId('peer-pointer').first()).toBeVisible();
      await capture(page, '05b-student-enters-previewed-lesson-live');
      // Repeat through the student's in-app outline, preserving its providers
      // and sockets as in the production reproduction.
      await panel.locator(`[data-collab-anchor="exercise:${data.materialId}"]`).click();
      await expect.poll(() => code(page)).toContain('UPDATED WHILE PREVIEWING');
      const beforeClientHandoff = transport();
      const learnerPanel = learner.getByRole('complementary');
      const firstLecture = learnerPanel.getByRole('button', { name: /Addition lesson/ });
      if (await firstLecture.getAttribute('aria-expanded') === 'false') await firstLecture.click();
      await learnerPanel.locator(`[data-collab-anchor="exercise:${data.materialId}"]`).click();
      await expect(page.getByText(locale === 'ko' ? 'Add two numbers 실시간' : 'Live on Add two numbers', { exact: true })).toBeVisible();
      await expect.poll(() => code(page)).toContain('UPDATED WHILE PREVIEWING');
      await expect(page.getByTestId('programming-monitor')).toHaveAttribute('data-display-mode', 'live');
      await expect(page.getByTestId('observation-connection')).toContainText(locale === 'ko' ? '실시간' : 'Live');
      await moveOverCode(learner); await expect(page.getByTestId('peer-pointer').first()).toBeVisible();
      expect(transport()).toEqual({ ...beforeClientHandoff, starts: beforeClientHandoff.starts + 1 });
      await capture(page, '05c-student-client-navigation-handoff-live');

      await learner.goto(routes.academyLearnMaterial(slug, data.writtenMaterialId, 'WRITTEN_RESPONSE', { classId }));
      await learner.locator('textarea').first().fill('LIVE WRITTEN RESPONSE');
      await expect(page.getByText(locale === 'ko' ? 'Explain your addition 실시간' : 'Live on Explain your addition', { exact: true })).toBeVisible();
      await learner.locator('textarea').first().hover(); await expect(page.locator(markers)).toHaveCount(0);
      await expect.poll(() => code(page)).toContain('UPDATED WHILE PREVIEWING');
      await capture(page, '06-student-changes-lesson-instructor-stays');
      await page.getByRole('button', { name: locale === 'ko' ? '실시간으로 돌아가기' : 'Return to live', exact: true }).click();
      await expect(page.getByTestId('observed-manual-workspace').locator('textarea')).toHaveValue('LIVE WRITTEN RESPONSE');
      await learner.locator('textarea').first().hover();
      await expect(page.getByTestId('peer-pointer').first()).toBeVisible();
      await capture(page, '07-matching-written-response');
      await selectB(); await learner.locator('textarea').first().hover();
      await expect(page.locator(markers)).toHaveCount(0);
      await capture(page, '08-mixed-material-preview');

      if (role === 'lab_head') {
        await page.context().setOffline(true);
        await expect(page.locator(markers)).toHaveCount(0);
        await capture(page, '09-reconnecting-no-stale-pointer');
        await page.context().setOffline(false);
        await expect(page.getByTestId('observation-connection')).toContainText('Live', { timeout: 45_000 });
        await expect.poll(() => code(page)).toContain('DIFFERENT CHAPTER');
        await learner.locator('textarea').first().fill('LIVE AFTER RECONNECT');
        await expect(page.locator(markers)).toHaveCount(0);
        await capture(page, '10-reconnected-preview-still-independent');
      }
      await learner.goto(routes.academyLearnMaterial(slug, data.materialId, 'PROGRAMMING_EXERCISE', { classId }));
      await expect.poll(() => code(learner)).toContain('STUDENT LIVE');
      await code(learner, '# STUDENT LIVE FINAL\nprint(103)\n');
      // The student's editor can be ready before the observation channel has
      // announced the new material. Return must target the new lesson, rather
      // than the previous written response still shown by an older snapshot.
      await expect(page.getByText(locale === 'ko'
        ? /^(Add two numbers 실시간|학생의 현재 자료: Add two numbers)$/
        : /^(Live on Add two numbers|Student is on Add two numbers)$/)).toBeVisible();
      await returnLive(); await expect.poll(() => code(page)).toContain('STUDENT LIVE FINAL');
      await moveOverCode(learner); await expect(page.getByTestId('peer-pointer').first()).toBeVisible();
      await capture(page, '11-live-code-after-material-return');
      await page.setViewportSize({ width: 390, height: 844 });
      await capture(page, '12-compact-header-mobile');
      await info.attach('transport-checks', { body: JSON.stringify({ initial: stable, final: transport(), previewNavigationPreservedTransport: true }), contentType: 'application/json' });
    } finally { await page.context().setOffline(false); await ownerContext.close(); await learnerContext.close(); }
  });
}
