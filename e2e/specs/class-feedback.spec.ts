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
  await expect(page).toHaveURL(new RegExp('/academy/' + fixture.academy.slug + '/(?:classes|teach/classes|learn/classes)$'));
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
      const owner = await ownerContext.newPage();
      const ownerFixture = await fixture(request, 'lab_head');
      await enter(owner, ownerFixture);
      const studentFixture = await fixture(request, 'student', ownerFixture.id);
      const learner = await learnerContext.newPage();
      await enter(learner, studentFixture);
      // Prove inheritance with a single primary role, without implied Teacher extras.
      let staff: Fixture;
      if (role === 'tutor') {
        staff = await fixture(request, role, ownerFixture.id);
        await enter(page, staff);
      } else {
        const response = await request.post(provider + '/fixtures', { data: { legacy: true, role: role === 'lab_head' ? 'MANAGER' : 'TEAM_LEAD', parentFixtureId: ownerFixture.id } });
        const legacy = await response.json() as Fixture & { username: string };
        staff = legacy;
        await page.goto('/login');
        const password = page.getByLabel(/^(Password|비밀번호)$/i, { exact: true });
        await expect(async () => {
          if (await password.getAttribute('type') !== 'text') await page.getByRole('button', { name: /^(Show password|비밀번호 표시)$/, exact: true }).click();
          await expect(password).toHaveAttribute('type', 'text');
        }).toPass({ timeout: 15_000 });
        await page.getByRole('button', { name: /^(Hide password|비밀번호 숨기기)$/, exact: true }).click();
        await page.getByRole('textbox', { name: /ID|아이디|username/i }).fill(legacy.username);
        await password.fill('LocalLegacyTest123!');
        await page.getByRole('button', { name: /^(Log in|로그인|Sign in)$/i }).click();
        await expect(page).toHaveURL(new RegExp('/academy/' + staff.academy.slug + '/'));
      }
      const setup = await request.post(`${provider}/fixtures/${ownerFixture.id}/classroom`, { data: { studentFixtureId: studentFixture.id, teacherFixtureId: role === 'tutor' ? staff.id : undefined, includePdf: role === 'lab_head', includeExplanation: role === 'lab_head' } });
      expect(setup.ok(), await setup.text()).toBe(true);
      const classroomData = await setup.json() as { classes: Array<{ id: string }>; courseId: string; materialId: string };
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
      const enterClassroom = locale === 'ko' ? '강의실 입장' : 'Enter Classroom';
      const lessonLabel = locale === 'ko' ? '수업 자료' : 'Lessons';
      const nextLabel = locale === 'ko' ? '다음 자료' : 'Next lesson';
      const backLabel = locale === 'ko' ? '반으로 돌아가기' : 'Back to class';
      let classroomClientReads = 0;
      page.on('request', req => { if (/\/(getClassroom|getCourseOutline)$/.test(new URL(req.url()).pathname)) classroomClientReads++; });
      const materialInput = { academyId: staff.academy.id, materialId: classroomData.materialId };
      const studentBefore = (await rpc(learner, 'learn/getExerciseBootstrap', { ...materialInput, classId: classroom.id })).body.workspace;
      expect((await rpc(page, 'learn/savePracticeDraft', { ...materialInput, code: 'print("Private teaching demonstration")', baseUpdatedAt: null })).status).toBe(200);
      await page.getByRole('link', { name: enterClassroom, exact: true }).click();
      await expect(page).toHaveURL(new RegExp('/classroom$'));
      await expect(page.getByRole('heading', { name: 'Add two numbers', exact: true })).toBeVisible({ timeout: 90_000 });
      await expect(page.getByRole('complementary', { name: lessonLabel })).toBeVisible();
      await expect(page.getByTestId('classroom-live-counts')).toContainText(locale === 'ko' ? '풀이 중 0명' : '0 solving');
      const tutoringLabel = locale === 'ko' ? '튜터링' : 'Tutoring';
      await expect(page.getByRole('button', { name: tutoringLabel, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: locale === 'ko' ? '학생 학습 기록' : 'Student history', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: locale === 'ko' ? '문제 편집' : 'Edit problem', exact: true })).toHaveCount(role === 'tutor' ? 0 : 1);
      const showAnswer = locale === 'ko' ? '해설 보기' : 'Show answer';
      await page.getByRole('button', { name: showAnswer, exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('dialog')).toContainText('print(sum(map(int, input().split())))');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: tutoringLabel, exact: true }).click();
      await expect(page.getByTestId('inline-tutoring')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('inline-tutoring')).toHaveCount(0);
      await page.screenshot({ path: info.outputPath('classroom-desktop.png') });
      await page.getByRole('button', { name: nextLabel, exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Explain your addition', exact: true })).toBeVisible({ timeout: 90_000 });
      const picker = page.locator('[data-classroom-material]');
      await expect(picker).toHaveCount(role === 'lab_head' ? 7 : 4);
      await picker.filter({ hasText: 'Name the language' }).click();
      await expect(page.getByRole('heading', { name: 'Name the language', exact: true })).toBeVisible({ timeout: 90_000 });
      await page.locator('textarea').first().fill('An unsent demonstration answer');
      page.once('dialog', dialog => dialog.dismiss());
      await picker.filter({ hasText: 'Choose the operator' }).click();
      await expect(page.getByRole('heading', { name: 'Name the language', exact: true })).toBeVisible();
      page.once('dialog', dialog => dialog.accept());
      await picker.filter({ hasText: 'Choose the operator' }).click();
      await expect(page.getByRole('heading', { name: 'Choose the operator', exact: true })).toBeVisible({ timeout: 90_000 });
      if (role !== 'lab_head') await expect(page.getByRole('button', { name: nextLabel, exact: true })).toBeDisabled();
      else {
        for (const title of ['Lesson reference PDF', 'Lesson video', 'How addition works']) {
          await picker.filter({ hasText: title }).click();
          await expect(page.getByRole('heading', { name: title, exact: true }).first()).toBeVisible({ timeout: 90_000 });
        }
        await expect(page.getByRole('button', { name: nextLabel, exact: true })).toBeDisabled();
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByRole('button', { name: nextLabel, exact: true })).toBeInViewport();
      await page.screenshot({ path: info.outputPath('classroom-mobile.png') });
      expect(classroomClientReads).toBe(0);
      const studentAfter = (await rpc(learner, 'learn/getExerciseBootstrap', { ...materialInput, classId: classroom.id })).body.workspace;
      expect({ draft: studentAfter.draft, status: studentAfter.status, latest: studentAfter.latestSubmission }).toEqual({ draft: studentBefore.draft, status: studentBefore.status, latest: studentBefore.latestSubmission });
      const ownWorkspace = (await rpc(page, 'learn/getExerciseBootstrap', materialInput)).body;
      expect(ownWorkspace.access.mode).toBe('staff-practice');
      expect(ownWorkspace.workspace.draft.code).toBe('print("Private teaching demonstration")');

      await page.getByRole('button', { name: backLabel, exact: true }).last().click();
      await expect(page).toHaveURL(new RegExp(live + '$'));
      await page.setViewportSize({ width: 1440, height: 1000 });

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
      await expect(page).toHaveURL(new RegExp('/classes/' + classroom.id + '\\?from=teaching$'), { timeout: 90_000 });
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
      const empty = await rpc(page, 'academyClasses/create', { academyId: staff.academy.id, name: 'Empty teaching class' });
      expect(empty.status).toBe(200);
      await page.goto(routes.academyClassroom(staff.academy.slug, empty.body.id));
      await expect(page.getByRole('heading', { name: locale === 'ko' ? '강의 화면' : 'Teaching view', exact: true })).toBeVisible();
      await expect(page.locator('[data-classroom-material]')).toHaveCount(0);
      await page.getByRole('button', { name: backLabel, exact: true }).last().click();
      await expect(page).toHaveURL(new RegExp('/teach/classes/' + empty.body.id + '$'));
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
