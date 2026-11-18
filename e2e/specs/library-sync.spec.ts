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
