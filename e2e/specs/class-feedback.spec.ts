import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { routes } from '../../packages/web/src/lib/routes';

const provider = 'http://127.0.0.1:4320';
type Fixture = { id: string; academy: { id: string; slug: string } };
async function fixture(request: APIRequestContext, role: string, parentFixtureId?: string): Promise<Fixture> {
  const response = await request.post(provider + '/fixtures', { data: { role, parentFixtureId } });
  expect(response.ok()).toBe(true);
  return response.json();
}
async function enter(page: Page, fixture: Fixture) {
  const response = await page.request.get('/sso/start', { maxRedirects: 0, timeout: 90_000 });
  const target = new URL(response.headers().location!);
  target.searchParams.set('fixture', fixture.id);
  await page.goto(provider + '/os/authorize?' + target.searchParams);
  await expect(page).toHaveURL(new RegExp('/academy/' + fixture.academy.slug + '/(?:classes|teach/classes|learn/courses)$'));
}
async function rpc(page: Page, method: string, input: object) {
  const parts = (await page.context().cookies()).filter(cookie => /auth-token(?:\.\d+)?$/.test(cookie.name)).sort((a, b) => a.name.localeCompare(b.name));
  const token = JSON.parse(Buffer.from(parts.map(cookie => cookie.value).join('').replace(/^base64-/, ''), 'base64url').toString()).access_token as string;
  const response = await page.request.post('http://127.0.0.1:4319/api/rpc/' + method, { headers: { Authorization: 'Bearer ' + token }, data: { json: input } });
  return { status: response.status(), body: (await response.json()).json };
}

for (const [role, locale] of [['lab_head', 'en'], ['instructor', 'ko'], ['tutor', 'en']] as const) {
  test(`${role}: class entry, editing permissions and timetable (${locale})`, async ({ page, browser, request }, info) => {
    await page.context().addCookies([{ name: 'i18next', value: locale, url: 'http://127.0.0.1:3309' }]);
    const ownerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3309' });
    const learnerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3309' });
    try {
      const owner = role === 'lab_head' ? page : await ownerContext.newPage();
      const ownerFixture = await fixture(request, 'lab_head');
      await enter(owner, ownerFixture);
      const studentFixture = await fixture(request, 'student', ownerFixture.id);
      const learner = await learnerContext.newPage();
      await enter(learner, studentFixture);
      const staff = role === 'lab_head' ? ownerFixture : await fixture(request, role, ownerFixture.id);
      if (role !== 'lab_head') await enter(page, staff);
      const setup = await request.post(`${provider}/fixtures/${ownerFixture.id}/classroom`, { data: { studentFixtureId: studentFixture.id, teacherFixtureId: staff.id } });
      expect(setup.ok(), await setup.text()).toBe(true);
      const classroomData = await setup.json() as { classes: Array<{ id: string }>; courseId: string };
      const classroom = classroomData.classes[0]!;
      const input = { academyId: staff.academy.id, classId: classroom.id };
      const entryLabel = locale === 'ko' ? '내 반 들어가기' : 'Enter My Classes';
      const managementLabel = locale === 'ko' ? '반 관리' : 'Class Management';
      const editLabel = locale === 'ko' ? '반 정보 수정' : 'Edit Class Information';
      const live = routes.academyTeachClass(staff.academy.slug, classroom.id);
      const manage = routes.academyClass(staff.academy.slug, classroom.id);
      let hydrationRosterReads = 0;
      page.on('request', req => { if (req.url().includes('/monitoring/getClassRoster')) hydrationRosterReads++; });
      await page.goto(routes.academyTeachClasses(staff.academy.slug));
      await expect(page.getByRole('heading', { name: entryLabel, exact: true })).toBeVisible();
      await page.getByRole('link').filter({ has: page.getByRole('heading', { name: 'Assigned Python class', exact: true }) }).click();
      await expect(page.getByRole('heading', { name: 'Assigned Python class', exact: true })).toBeVisible();
      expect(hydrationRosterReads).toBe(0);
      await expect(page.getByRole('link', { name: entryLabel, exact: true })).toHaveCount(2);
      if (role !== 'tutor') await expect(page.getByRole('link', { name: editLabel, exact: true })).toHaveClass(/bg-brand/);
      const assignedCourse = page.getByRole('link', { name: /SSO Python classroom/ });
      await expect(assignedCourse).toHaveAttribute('href', routes.academyLearnCourse(staff.academy.slug, classroomData.courseId));
      await page.screenshot({ path: info.outputPath('live-class-desktop.png') });
      await page.context().addCookies([{ name: 'cove-theme', value: 'dark', url: 'http://127.0.0.1:3309' }]);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await expect(assignedCourse).toBeVisible();
      await page.screenshot({ path: info.outputPath('live-class-mobile-dark.png') });
      await assignedCourse.click();
      await page.waitForURL(new RegExp('/learn/courses/' + classroomData.courseId + '$'), { timeout: 90_000 });
      await expect(page.getByText('SSO Python classroom', { exact: true }).first()).toBeVisible({ timeout: 90_000 });
      await page.goBack();
      await expect(page.getByRole('heading', { name: 'Assigned Python class', exact: true })).toBeVisible();
      await page.context().addCookies([{ name: 'cove-theme', value: 'light', url: 'http://127.0.0.1:3309' }]);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.reload();
      if (role === 'tutor') {
        await expect(page.getByRole('link', { name: editLabel, exact: true })).toHaveCount(0);
        expect((await rpc(page, 'academyClasses/setSchedule', { ...input, slots: [], expectedUpdatedAt: new Date().toISOString() })).status).toBe(403);
        expect((await rpc(page, 'academyClasses/update', { ...input, name: 'Denied', description: '', expectedUpdatedAt: new Date().toISOString() })).status).toBe(403);
        return;
      }
      await expect(page.getByRole('link', { name: managementLabel, exact: true })).toBeVisible();
      await page.getByRole('link', { name: editLabel, exact: true }).click();
      await expect(page).toHaveURL(new RegExp('/classes/' + classroom.id + '\\?from=teaching$'));
      await page.getByRole('button', { name: /^(Edit|수정)$/ }).click();
      const dialog = page.getByRole('dialog');
      const name = `${locale} edited class`;
      await dialog.getByRole('textbox').nth(0).fill(name);
      await dialog.getByRole('textbox').nth(1).fill('Updated through class entry');
      await dialog.getByRole('button', { name: /save|저장/i }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
      const schedule = page.locator('section').filter({ has: page.getByRole('heading', { name: /^(Class times|수업 시간)/ }) });
      await schedule.getByRole('button', { name: /add a time|시간 추가/i }).click();
      await schedule.getByRole('button', { name: /^(Monday|월요일)$/ }).click();
      await schedule.getByRole('button', { name: /^(Wednesday|수요일)$/ }).click();
      await schedule.getByRole('button', { name: /^(Starts at|시작 시각):/ }).click();
      await page.getByRole('listbox', { name: /^(Starts at|시작 시각)$/ }).first().getByRole('option', { name: '17', exact: true }).click();
      await page.keyboard.press('Escape');
      await schedule.getByRole('button', { name: /^(Ends at|종료 시각):/ }).click();
      await page.getByRole('listbox', { name: /^(Ends at|종료 시각)$/ }).first().getByRole('option', { name: '19', exact: true }).click();
      await page.getByRole('listbox', { name: /^(Ends at|종료 시각)$/ }).nth(1).getByRole('option', { name: '30', exact: true }).click();
      await page.keyboard.press('Escape');
      await schedule.getByRole('button', { name: /save times|시간 저장/i }).click();
      await expect(schedule.getByRole('button', { name: /edit times|시간 수정/i })).toBeVisible();
      let detail = (await rpc(page, 'academyClasses/get', input)).body;
      expect(detail.schedule.map(({ weekday, startMinute, endMinute }: { weekday: number; startMinute: number; endMinute: number }) => ({ weekday, startMinute, endMinute }))).toEqual([
        { weekday: 1, startMinute: 1020, endMinute: 1170 }, { weekday: 3, startMinute: 1020, endMinute: 1170 },
      ]);
      await page.getByRole('link', { name: /^(Return to Class|수업으로 돌아가기)$/ }).click();
      await expect(page).toHaveURL(new RegExp(live + '$'));
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
      await page.goBack();
      await page.goBack();
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
      // Stored overnight values must stay on the next day when picking minutes.
      expect((await rpc(page, 'academyClasses/setSchedule', { ...input, slots: [{ weekday: 5, startMinute: 1380, endMinute: 1500 }], expectedUpdatedAt: detail.updatedAt })).status).toBe(200);
      await page.goto(manage);
      await schedule.getByRole('button', { name: /edit times|시간 수정/i }).click();
      await schedule.getByRole('button', { name: /^(Ends at|종료 시각): 01:00$/ }).click();
      await page.getByRole('listbox', { name: /^(Ends at|종료 시각)$/ }).nth(1).getByRole('option', { name: '30', exact: true }).click();
      await page.keyboard.press('Escape');
      await schedule.getByRole('button', { name: /save times|시간 저장/i }).click();
      await expect(schedule.getByRole('button', { name: /edit times|시간 수정/i })).toBeVisible();
      detail = (await rpc(page, 'academyClasses/get', input)).body;
      expect(detail.schedule[0].endMinute).toBe(1530);
      await schedule.getByRole('button', { name: /edit times|시간 수정/i }).click();
      await schedule.getByRole('button', { name: /remove this time|이 시간 삭제/i }).click();
      await schedule.getByRole('button', { name: /save times|시간 저장/i }).click();
      await expect(schedule.getByRole('button', { name: /add a time|시간 추가/i })).toBeVisible();
      await page.goto(routes.academyLearnCourses(staff.academy.slug));
      const importButton = page.getByRole('link', { name: locale === 'ko' ? '라이브러리에서 가져오기' : 'Import from Library', exact: true });
      await expect(importButton).toHaveClass(/bg-brand/);
      await expect(page.getByRole('button', { name: /^(New course|새 코스)$/i })).toHaveClass(/bg-brand/);
      await page.screenshot({ path: info.outputPath('courses-desktop.png') });
      await page.context().addCookies([{ name: 'cove-theme', value: 'dark', url: 'http://127.0.0.1:3309' }]);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await expect(importButton).toBeVisible();
      await page.screenshot({ path: info.outputPath('courses-mobile-dark.png') });
      await learner.goto(routes.academyLearnClasses(staff.academy.slug));
      await expect(learner.getByRole('heading', { name: /^(My classes|내 반)$/i })).toBeVisible();
    } finally {
      await ownerContext.close();
      await learnerContext.close();
    }
  });
}
