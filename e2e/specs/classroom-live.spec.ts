import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { routes } from '../../packages/web/src/lib/routes';

const provider = 'http://127.0.0.1:4320';
type Fixture = { id: string; academy: { id: string; slug: string } };
async function fixture(request: APIRequestContext, role: string, parentFixtureId?: string, name?: string): Promise<Fixture> {
  const response = await request.post(provider + '/fixtures', { data: { role, parentFixtureId, name } });
  expect(response.ok()).toBe(true); return response.json();
}
async function enter(page: Page, fixture: Fixture) {
  const response = await page.request.get('/sso/start', { maxRedirects: 0, timeout: 90_000 });
  const target = new URL(response.headers().location!); target.searchParams.set('fixture', fixture.id);
  await page.goto(provider + '/os/authorize?' + target.searchParams);
  await expect(page).toHaveURL(new RegExp('/academy/' + fixture.academy.slug + '/(?:classes|teach/classes|learn/courses)$'));
}
async function visibleCode(page: Page, next?: string) {
  return page.evaluate(value => {
    const monaco = (window as unknown as { monaco?: { editor: { getEditors(): Array<{ getDomNode(): HTMLElement | null; getModel(): { getValue(): string; setValue(value: string): void } | null }> } } }).monaco;
    const model = monaco?.editor.getEditors().find(editor => editor.getDomNode()?.getClientRects().length && getComputedStyle(editor.getDomNode()!).visibility !== 'hidden')?.getModel();
    if (value !== undefined) model?.setValue(value);
    return model?.getValue();
  }, next);
}

for (const role of ['lab_head', 'instructor', 'tutor'] as const) {
  test(`${role}: classroom keeps live counts and transports while switching students`, async ({ page, browser, request }, info) => {
    test.setTimeout(600_000);
    const ownerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3309' });
    const firstContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3309' });
    const secondContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3309' });
    let opened = 0, closed = 0;
    let activity: ReturnType<typeof setInterval> | undefined;
    page.on('websocket', socket => {
      if (!socket.url().includes('/socket.io')) return;
      opened++; socket.on('close', () => { closed++; });
    });
    try {
      const owner = await ownerContext.newPage();
      const ownerFixture = await fixture(request, 'lab_head'); await enter(owner, ownerFixture);
      const firstFixture = await fixture(request, 'student', ownerFixture.id, 'Live One');
      const secondFixture = await fixture(request, 'student', ownerFixture.id, 'Live Two');
      const first = await firstContext.newPage(), second = await secondContext.newPage();
      await enter(first, firstFixture); await enter(second, secondFixture);
      const staff = role === 'lab_head' ? ownerFixture : await fixture(request, role, ownerFixture.id);
      await enter(page, staff);
      const setup = await request.post(`${provider}/fixtures/${ownerFixture.id}/classroom`, { data: { studentFixtureId: firstFixture.id, reviewStudentFixtureId: secondFixture.id, teacherFixtureId: staff.id } });
      expect(setup.ok(), await setup.text()).toBe(true);
      const data = await setup.json() as { classes: Array<{ id: string }>; materialId: string; writtenMaterialId: string; studentMembershipId: string; reviewStudentMembershipId: string };
      const classId = data.classes[0].id, slug = staff.academy.slug;
      await first.goto(routes.academyLearnMaterial(slug, data.writtenMaterialId, 'WRITTEN_RESPONSE', { classId }));
      await second.goto(routes.academyLearnMaterial(slug, data.writtenMaterialId, 'WRITTEN_RESPONSE', { classId }));
      await first.locator('textarea').first().fill('LIVE ONE 1');
      await second.locator('textarea').first().fill('LIVE TWO 1');
      activity = setInterval(() => {
        void Promise.all([first.keyboard.press('Shift'), second.keyboard.press('Shift')]).catch(() => undefined);
      }, 10_000);
      await page.goto(routes.academyClassroom(slug, classId));
      const counts = page.getByTestId('classroom-live-counts');
      await expect(counts).toHaveText('2 online · 0 offline · 2 solving');
      await expect(page.getByRole('complementary', { name: 'Lessons', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Tutoring', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Student history', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Show answer', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Grade submission', exact: true }).click();
      await page.getByTestId('inline-tutoring').getByRole('button').filter({ hasText: 'Live Two' }).first().click();
      await expect(page.getByTestId('tutor-student-work')).toBeVisible();
      await expect.poll(() => visibleCode(page), { timeout: 90_000 }).toContain('OFFLINE STUDENT SUBMISSION');
      await page.getByRole('button', { name: /^Switch student,/ }).click();
      await page.getByRole('button', { name: 'Teach this class', exact: true }).click();
      await expect(page.getByTestId('inline-tutoring')).toHaveCount(0);
      const classSockets = opened, classClosed = closed; // The separate landing-page connection has already closed.
      await page.getByRole('button', { name: 'Next lesson', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Explain your addition', exact: true })).toBeVisible();
      expect(opened).toBe(classSockets); expect(closed).toBe(classClosed);
      const switcher = () => page.getByRole('button', { name: /^Switch student,/ });
      const choose = async (id: string) => {
        await switcher().click();
        await page.getByRole('dialog').locator(`a[href="${routes.academyTeachStudentLive(slug, classId, id)}"]`).first().click();
        await expect(page).toHaveURL(new RegExp('/students/' + id + '/live$'));
      };
      await choose(data.studentMembershipId);
      const answer = page.getByTestId('observed-manual-workspace').locator('textarea');
      await expect(answer).toHaveValue('LIVE ONE 1');
      await first.locator('textarea').first().fill('LIVE ONE 2'); await expect(answer).toHaveValue('LIVE ONE 2');
      const watchingSockets = opened;
      if (role === 'lab_head') {
        await page.getByRole('button', { name: 'Tutoring', exact: true }).click();
        await page.getByTestId('inline-tutoring').getByRole('button').filter({ hasText: 'Live One' }).first().click();
        await expect(page.getByTestId('inline-tutoring')).toBeVisible();
        await switcher().click();
        await page.getByRole('dialog').getByRole('button', { name: /Live One/ }).click();
        await expect(page.getByTestId('inline-tutoring')).toHaveCount(0);
        await expect(answer).toBeVisible();
      }

      for (let i = 0; i < 3; i++) { await switcher().click(); await page.keyboard.press('Escape'); }
      expect(opened).toBe(watchingSockets); expect(closed).toBe(classClosed);
      // Re-selecting the current student closes a tutoring overlay and keeps live mode.
      await switcher().click();
      await page.getByRole('dialog').getByRole('button', { name: /Live One/ }).click();
      await first.locator('textarea').first().fill('LIVE ONE 3'); await expect(answer).toHaveValue('LIVE ONE 3');
      await choose(data.reviewStudentMembershipId); await expect(answer).toHaveValue('LIVE TWO 1');
      await second.locator('textarea').first().fill('LIVE TWO 2'); await expect(answer).toHaveValue('LIVE TWO 2');
      await choose(data.studentMembershipId); await expect(answer).toHaveValue('LIVE ONE 3');
      expect(opened).toBe(watchingSockets); expect(closed).toBe(classClosed);
      await switcher().click(); await page.getByRole('button', { name: 'Teach this class', exact: true }).click();
      await expect(page).toHaveURL(new RegExp('/classroom/' + data.writtenMaterialId + '$'));
      await expect(counts).toHaveText('2 online · 0 offline · 2 solving');
      expect(opened).toBe(watchingSockets); expect(closed).toBe(classClosed);
      if (role === 'lab_head') {
        await first.goto(routes.academyLearnMaterial(slug, data.materialId, 'PROGRAMMING_EXERCISE', { classId }));
        await expect(first.locator('.monaco-editor').first()).toBeVisible({ timeout: 90_000 });
        await visibleCode(first, '# CLASSROOM LIVE A\nprint(101)\n');
        await choose(data.studentMembershipId);
        await expect(page.getByTestId('observation-connection')).toContainText('Live', { timeout: 90_000 });
        await expect.poll(() => visibleCode(page), { timeout: 90_000 }).toContain('CLASSROOM LIVE A');
        const codingSockets = opened;
        await choose(data.reviewStudentMembershipId); await expect(answer).toHaveValue('LIVE TWO 2');
        await choose(data.studentMembershipId);
        await expect(page.getByTestId('observation-connection')).toContainText('Live');
        await visibleCode(first, '# CLASSROOM LIVE B\nprint(102)\n');
        await expect.poll(() => visibleCode(page)).toContain('CLASSROOM LIVE B');
        expect(opened).toBe(codingSockets); expect(closed).toBe(classClosed);
        await switcher().click(); await page.getByRole('button', { name: 'Teach this class', exact: true }).click();
        await expect(page).toHaveURL(new RegExp('/classroom/' + data.writtenMaterialId + '$'));
      }
      await page.screenshot({ path: info.outputPath('classroom-live-desktop.png') });
      await page.setViewportSize({ width: 390, height: 844 });
      await switcher().click(); await expect(page.getByRole('dialog')).toBeVisible();
      await page.screenshot({ path: info.outputPath('classroom-live-mobile.png') });
      await page.keyboard.press('Escape');
      if (role === 'lab_head') {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.context().setOffline(true);
        await expect(counts).toContainText('—');
        await page.context().setOffline(false);
        await expect(counts).toHaveText('2 online · 0 offline · 2 solving', { timeout: 45_000 });
        await choose(data.studentMembershipId);
        await expect(page.getByTestId('observation-connection')).toContainText('Live', { timeout: 45_000 });
        await visibleCode(first, '# CLASSROOM RECOVERED\nprint(103)\n');
        await expect.poll(() => visibleCode(page)).toContain('CLASSROOM RECOVERED');
        await switcher().click(); await page.getByRole('button', { name: 'Teach this class', exact: true }).click();
        await expect(page).toHaveURL(new RegExp('/classroom/' + data.writtenMaterialId + '$'));
      }
      await first.keyboard.press('Shift'); await second.keyboard.press('Shift');
      await expect(counts).toHaveText('2 online · 0 offline · 2 solving');
      const old = await counts.textContent();
      clearInterval(activity);
      await secondContext.close();
      await expect(counts).toHaveText('1 online · 1 offline · 1 solving', { timeout: 45_000 });
      expect(old).toBe('2 online · 0 offline · 2 solving');
      const socketsBeforeExit = opened;
      await page.getByRole('link', { name: 'Back to class', exact: true }).click();
      // The roster may open its own connection; every earlier class transport must close.
      await expect.poll(() => closed).toBeGreaterThanOrEqual(socketsBeforeExit);
    } finally { clearInterval(activity); await ownerContext.close(); await firstContext.close(); await secondContext.close(); }
  });
}
