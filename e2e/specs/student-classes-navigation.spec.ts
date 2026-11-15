import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { routes } from '../../packages/web/src/lib/routes';

const provider = 'http://127.0.0.1:4320';
type Fixture = { id: string; academy: { id: string; slug: string } };
async function fixture(request: APIRequestContext, role: string, parentFixtureId?: string): Promise<Fixture> {
  const result = await request.post(provider + '/fixtures', { data: { role, parentFixtureId } });
  expect(result.ok()).toBe(true); return result.json();
}
async function enter(page: Page, who: Fixture) {
  const response = await page.request.get('/sso/start', { maxRedirects: 0 });
  const target = new URL(response.headers().location!); target.searchParams.set('fixture', who.id);
  await page.goto(provider + '/os/authorize?' + target.searchParams);
  await expect(page).toHaveURL(new RegExp('/academy/' + who.academy.slug + '/(?:classes|learn/classes)$'));
}

for (const locale of ['en', 'ko'] as const) {
  test(`student class-to-course navigation and screenshots (${locale})`, async ({ page, browser, request }, info) => {
    await page.context().addCookies([{ name: 'i18next', value: locale, url: 'http://127.0.0.1:3309' }]);
    const ownerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3309' });
    try {
      const ownerPage = await ownerContext.newPage();
      const owner = await fixture(request, 'lab_head'); await enter(ownerPage, owner);
      await ownerPage.goto(routes.academyLearnCourses(owner.academy.slug));
      await expect(ownerPage).toHaveURL(routes.academyLearnCourses(owner.academy.slug));
      const student = await fixture(request, 'student', owner.id); await enter(page, student);
      const setup = await request.post(`${provider}/fixtures/${owner.id}/classroom`, { data: { studentFixtureId: student.id, includePdf: true, includeExplanation: true } });
      expect(setup.ok()).toBe(true);
      const data = await setup.json() as { classes: Array<{ id: string; name: string }>; courseId: string; materialId: string; writtenMaterialId: string; shortMaterialId: string; quizMaterialId: string; pdfMaterialId: string; videoMaterialId: string };
      const slug = student.academy.slug, classId = data.classes[0].id;
      let catalogs = 0, drafts = 0;
      page.on('request', req => {
        if (req.url().includes('/learn/listCourses')) catalogs++;
        if (req.url().includes('/learn/listDrafts')) drafts++;
      });
      // A fresh document checks hydration; replayed redirect payloads may legitimately refresh.
      await page.goto(routes.academyLearnClasses(slug));
      await expect(page).toHaveURL(routes.academyLearnClasses(slug));
      await expect(page.getByRole('heading', { name: locale === 'ko' ? '내 반' : 'My classes', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: locale === 'ko' ? '코스' : 'Courses', exact: true })).toHaveCount(0);
      const classLink = page.getByRole('link').filter({ has: page.getByRole('heading', { name: data.classes[0].name, exact: true }) });
      await expect(classLink).toBeVisible();
      await expect(page.getByRole('link').filter({ hasText: 'Add two numbers' })).toBeVisible();
      expect(catalogs).toBe(0); expect(drafts).toBe(0);
      await page.screenshot({ path: info.outputPath('my-classes-desktop.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: info.outputPath('my-classes-mobile.png'), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await classLink.click();
      await expect(page).toHaveURL(routes.academyLearnClass(slug, classId));
      const course = page.getByRole('link').filter({ has: page.getByRole('heading', { name: 'SSO Python classroom', exact: true }) });
      await expect(course).toHaveAttribute('href', routes.academyLearnCourse(slug, data.courseId, { classId }));
      await page.screenshot({ path: info.outputPath('class-courses-desktop.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: info.outputPath('class-courses-mobile.png'), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await course.focus(); await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'SSO Python classroom', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: data.classes[0].name, exact: true })).toHaveAttribute('href', routes.academyLearnClass(slug, classId));
      await page.getByRole('button').filter({ hasText: 'Addition lesson' }).click();
      const problem = page.getByRole('link').filter({ hasText: 'Add two numbers' }).first();
      await expect(problem).toHaveAttribute('href', new RegExp('classId=' + classId));
      await page.screenshot({ path: info.outputPath('course-outline-desktop.png'), fullPage: true });
      await problem.click();
      await expect(page).toHaveURL(new RegExp('/exercises/' + data.materialId + '.*classId=' + classId));
      await expect(page.locator('a[href*="/learn/courses/"][href*="classId=' + classId + '"]').first()).toBeVisible();
      await page.locator('a[href*="/learn/courses/"][href*="classId=' + classId + '"]').first().click();
      await expect(page.getByRole('link', { name: data.classes[0].name, exact: true })).toBeVisible();
      await page.getByRole('link', { name: data.classes[0].name, exact: true }).click();
      await expect(page).toHaveURL(routes.academyLearnClass(slug, classId));

      for (const [id, type] of [[data.writtenMaterialId, 'WRITTEN_RESPONSE'], [data.shortMaterialId, 'WRITTEN_RESPONSE'], [data.quizMaterialId, 'MULTIPLE_CHOICE'], [data.pdfMaterialId, 'PDF_DOCUMENT'], [data.videoMaterialId, 'VIDEO_LESSON']] as const) {
        await page.goto(routes.academyLearnMaterial(slug, id, type, { classId }));
        const parent = page.locator('a[href*="/learn/courses/"][href*="classId=' + classId + '"]').first();
        await expect(parent).toBeVisible();
      }

      // A shared-course bookmark still asks which enrolled class owns the session.
      await page.goto(routes.academyLearnCourse(slug, data.courseId));
      const otherClass = data.classes[1];
      await page.locator(`a[href*="/learn/courses/"][href*="classId=${otherClass.id}"]`).click();
      await expect(page.getByRole('link', { name: otherClass.name, exact: true })).toHaveAttribute('href', routes.academyLearnClass(slug, otherClass.id));
      await page.reload();
      await expect(page.getByRole('link', { name: otherClass.name, exact: true })).toBeVisible();
      await page.goto(routes.academyLearnCourses(slug));
      await expect(page).toHaveURL(routes.academyLearnClasses(slug));
      expect(catalogs).toBe(0);
      await page.getByRole('link').filter({ hasText: 'Add two numbers' }).click();
      await expect(page).toHaveURL(new RegExp('/exercises/' + data.materialId + '$'));
      await page.locator(`a[href*="/learn/exercises/"][href*="classId=${classId}"]`).click();
      await expect(page).toHaveURL(new RegExp('/exercises/' + data.materialId + '.*classId=' + classId));

      await page.goto(routes.academy(slug));
      await expect(page).toHaveURL(routes.academyLearnClasses(slug));

    } finally { await ownerContext.close(); }
  });
}
