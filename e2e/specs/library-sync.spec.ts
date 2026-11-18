import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { routes } from "../../packages/web/src/lib/routes";

test("publishes a correction, preserves academy text and solved progress, and resolves the conflict", async ({
  browser,
  page,
}) => {
  const dir = process.env.COVE_LIBRARY_SYNC_BUILD_DIR;
  if (!dir) throw Error("Run the isolated library-sync harness");
  const f = JSON.parse(await readFile(resolve(dir, "browser.json"), "utf8"));
  await page.context().addCookies(f.auth.admin.cookies);
  await page.goto(routes.adminLibraryCourse(f.ids.master));
  // A published library question remains editable. Saving options is a draft
  // change; the Publish updates action below distributes the batch.
  const quiz = page.getByRole('button', { name: 'Quiz options', exact: true });
  if (!await quiz.isVisible()) await page.getByRole('button', { name: 'Expand all', exact: true }).click();
  await quiz.click();
  const editor = page.getByRole('dialog');
  await expect(editor.getByRole('button', { name: 'Add option', exact: true })).toBeEnabled();
  await expect(editor.getByText(/Published or submitted grading rules are locked/)).toHaveCount(0);
  await editor.getByRole('button', { name: 'Add option', exact: true }).click();
  await editor.getByRole('textbox', { name: 'Option 4', exact: true }).fill('32');
  await editor.getByRole('radio', { name: 'Correct option 4', exact: true }).check();
  await page.screenshot({ path: 'test-results/library-sync/06-library-quiz-added-option.png', fullPage: true });
  await editor.getByRole('button', { name: 'Save activity', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await quiz.click();
  await expect(page.getByRole('textbox', { name: 'Option 4', exact: true })).toHaveValue('32');
  await expect(page.getByRole('radio', { name: 'Correct option 4', exact: true })).toBeChecked();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('3 changed · 0 added · 0 removed, ready to publish', { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Publish updates", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: /published/i }),
  ).toBeVisible();
  await expect(page.getByText('Release history', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Academy copies', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Existing academy copies', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Release note, shown to academies')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/library-sync/00-admin-publish-updates.png', fullPage: true });
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3342",
    storageState: f.auth.manager,
  });
  const manager = await context.newPage();
  const hydrationErrors: string[] = [];
  manager.on('console', message => {
    if (/hydrated|hydration.mismatch|server rendered HTML/i.test(message.text())) hydrationErrors.push(message.text());
  });
  await manager.goto(routes.academyLearnCourse(f.slug, f.copyId));
  await manager.getByRole('button', { name: 'Notifications', exact: true }).click();
  await expect(manager.getByText('Admin changes need your review', { exact: true })).toBeVisible();
  await manager.screenshot({ path: 'test-results/library-sync/00-academy-notification.png', fullPage: true });
  await manager.getByRole('button', { name: 'View course', exact: true }).click();
  const review = manager.getByRole('link').filter({ hasText: 'Admin changes to review' }).filter({ hasText: 'Main explanation' });
  await expect(review).toBeVisible();
  await manager.screenshot({path:'test-results/library-sync/01-course-review-row.png',fullPage:true});
  await review.click();
  await expect(manager.getByText('Your academy’s current version', { exact: true })).toBeVisible();
  await expect(manager.getByText('Admin’s latest version', { exact: true })).toBeVisible();
  await manager.screenshot({path:'test-results/library-sync/02-material-comparison.png',fullPage:true});
  await expect(
    manager.getByRole("button", { name: "Keep academy version", exact: true }),
  ).toBeVisible();
  await manager
    .getByRole("button", { name: "Keep academy version", exact: true })
    .click();
  await expect(manager).toHaveURL(routes.academyLearnCourse(f.slug, f.copyId));
  await manager.screenshot({path:'test-results/library-sync/03-returned-to-course.png',fullPage:true});
  const testCaseReview = manager.getByRole('link').filter({hasText:'Admin changes to review'}).filter({hasText:'Test case'});
  await expect(testCaseReview).toBeVisible();
  await testCaseReview.click();
  const comparison = manager.locator('section[aria-label="Test case"]');
  await expect(comparison.locator('pre[aria-label="Input"]:visible')).toHaveText(['4','6']);
  await expect(comparison.locator('pre[aria-label="Expected output"]:visible')).toHaveText(['8','12']);
  await expect(comparison.getByRole('table')).toHaveCount(0);
  await manager.screenshot({path:'test-results/library-sync/04-test-case-input-output.png',fullPage:true});
  await manager.getByRole('button',{name:'Use admin version',exact:true}).click();
  await expect(manager).toHaveURL(routes.academyLearnCourse(f.slug, f.copyId));
  await manager.screenshot({path:'test-results/library-sync/05-all-reviewed-course.png',fullPage:true});
  // A refreshed server render confirms the saved decision, not just client state.
  await manager.reload();
  await expect(
    manager.getByText("Admin changes to review", { exact: true }),
  ).toHaveCount(0);

  // The manager stays on the course after resolving a batch. A later notice
  // must refresh this mounted builder, not leave its old no-conflicts cache.
  const cookie = f.auth.admin.cookies.find((c: { name: string }) => c.name === 'sb-127-auth-token');
  const accessToken = JSON.parse(Buffer.from(cookie.value.slice(7), 'base64url').toString()).access_token;
  const headers = { Authorization: `Bearer ${accessToken}`, 'X-Cove-Bff-Secret': 'local-library-sync-browser-only-never-production' };
  const read = await page.request.get(`http://127.0.0.1:4342/api/explanations?academyId=${f.ids.library}&materialId=${f.ids.explanation}&preview=true`, { headers });
  expect(read.ok()).toBe(true);
  const document = await read.json();
  const saved = await page.request.post('http://127.0.0.1:4342/api/explanations', { headers, data: {
    academyId: f.ids.library, courseId: f.ids.master, lectureId: f.ids.lecture, materialId: f.ids.explanation,
    expectedRevision: document.revision, title: document.title, body: '<p>Another published correction</p>', sideBody: document.sideBody ?? null, isVisible: true,
  } });
  expect(saved.ok()).toBe(true);
  const draftResponse = await page.request.post('http://127.0.0.1:4342/api/rpc/platformLibrarySync/draft', { headers, data: { json: { courseId: f.ids.master } } });
  expect(draftResponse.ok()).toBe(true);
  const draft = (await draftResponse.json()).json;
  const published = await page.request.post('http://127.0.0.1:4342/api/rpc/platformLibrarySync/publish', { headers, data: { json: { courseId: f.ids.master, note: '', expectedContentRevision: draft.contentRevision } } });
  expect(published.ok()).toBe(true);
  await manager.getByRole('button', { name: 'Notifications', exact: true }).click();
  await expect(manager.getByText('Admin changes need your review', { exact: true })).toBeVisible();
  await manager.getByRole('button', { name: 'View course', exact: true }).click();
  await expect(review).toBeVisible();
  await manager.screenshot({ path: 'test-results/library-sync/07-same-course-notification-review.png', fullPage: true });
  await review.click();
  await expect(manager.frameLocator('iframe').nth(1).locator('body')).toContainText('Another published correction');
  await manager.getByRole('button', { name: 'Use admin version', exact: true }).click();
  await expect(manager).toHaveURL(routes.academyLearnCourse(f.slug, f.copyId));
  await expect(review).toHaveCount(0);
  await manager.screenshot({ path: 'test-results/library-sync/08-same-course-accepted.png', fullPage: true });
  expect(hydrationErrors).toEqual([]);
  const studentContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3342",
    storageState: f.auth.student,
  });
  const student = await studentContext.newPage();
  await student.goto(
    routes.academyLearnCourse(f.slug, f.copyId, { classId: f.ids.classId }),
  );
  await student
    .getByRole("button", { name: "Expand or collapse Lecture", exact: true })
    .click();
  await expect(
    student.getByText("Solved problem", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    student.getByText("Solved", { exact: true }).first(),
  ).toBeVisible();
  await context.close();
  await studentContext.close();
});
