import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { routes } from '../../packages/web/src/lib/routes';
import { signInAs } from '../support/auth';

/**
 * A student's submission verdict, on the watching teacher's screen.
 *
 * The student submits; the teacher's live view shows the same verdict the
 * student sees — score, passed count, and the case list — read through the
 * authorized review, never through the socket. The hidden case of the seeded
 * exercise carries a sentinel string, and it must not appear anywhere on the
 * teacher's page.
 *
 * Requires `pnpm --filter @cove/api db:seed` and `db:seed:e2e`, and a running
 * judge worker so the submission is graded.
 */
test.describe.configure({ mode: 'serial' });

const PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'CoveDev123!';
const STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL ?? 'student@cove.test';
const STUDENT_USERNAME = process.env.E2E_STUDENT_USERNAME ?? 'cove-student';
const TEACHER_EMAIL = 'teacher@cove.test';
const CLASS_NAME = 'E2E Cohort';
const EXERCISE_TITLE = 'Echo the input';
const HIDDEN_SENTINEL = 'E2E_HIDDEN_SENTINEL';

let academySlug = '';
let studentContext: BrowserContext;
let teacherContext: BrowserContext;
let lateTeacherContext: BrowserContext;
let studentPage: Page;
let teacherPage: Page;

async function openLiveWatch(page: Page) {
  await page.goto(routes.academyTeachClasses(academySlug));
  await page.getByRole('heading', { name: CLASS_NAME }).click();
  await page.waitForURL(/\/teach\/classes\/[0-9a-f-]+$/, { timeout: 30_000 });
  // By username, not display name: more than one account in the class can be
  // called "Cove Student", and the roster orders them by activity.
  const row = page.getByRole('row').filter({ has: page.getByText(`@${STUDENT_USERNAME}`, { exact: true }) });
  const openLive = row.getByRole('link', { name: /^(?:open live|실시간 보기)$/i });
  await expect(openLive).toBeVisible({ timeout: 30_000 });
  await openLive.click();
  await page.waitForURL(/\/students\/[0-9a-f-]+\/live$/, { timeout: 30_000 });
  await expect(page.locator('[data-collab-surface="statement"]')).toBeVisible({ timeout: 30_000 });
}

const resultTab = (page: Page) =>
  page.getByRole('tab', { name: /^(?:Submission result|제출 결과)$/ });

test.beforeAll(async ({ browser }) => {
  studentContext = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  teacherContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  lateTeacherContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  studentPage = await studentContext.newPage();
  teacherPage = await teacherContext.newPage();

  academySlug = await signInAs({ page: studentPage, identifier: STUDENT_EMAIL, password: PASSWORD });
  await signInAs({ page: teacherPage, identifier: TEACHER_EMAIL, password: PASSWORD });
});

test.afterAll(async () => {
  await studentContext?.close();
  await teacherContext?.close();
  await lateTeacherContext?.close();
});

test('the teacher watches the student on the exercise', async () => {
  // Through the course, which every enrolled student has; the continue-solving
  // shortcut only exists for a student who has already practised.
  await studentPage.goto(routes.academyLearnCourses(academySlug));
  await studentPage
    .getByRole('link')
    .filter({ has: studentPage.getByRole('heading', { name: 'E2E Python Basics' }) })
    .first()
    .click();
  await studentPage.waitForURL(/\/learn\/courses\/[0-9a-f-]+$/, { timeout: 30_000 });
  await studentPage.getByText(EXERCISE_TITLE).first().click();
  await studentPage.waitForURL(/\/learn\/exercises\//, { timeout: 30_000 });
  const classChoice = studentPage.getByRole('link', { name: new RegExp(CLASS_NAME) });
  if (await classChoice.waitFor({ timeout: 5_000 }).then(() => true, () => false)) {
    await classChoice.click();
  }
  await expect(studentPage.locator('[data-collab-surface="statement"]')).toBeVisible({ timeout: 30_000 });

  await openLiveWatch(teacherPage);
  await expect(resultTab(teacherPage)).toBeVisible();
});

test('a submission reaches the teacher as the verdict the student sees', async () => {
  // Start from the teacher's own terminal: a submission must still bring the
  // result tab forward on its own.
  await teacherPage.getByRole('tab', { name: /^(?:내 실행|your run)/i }).click();
  await expect(resultTab(teacherPage)).toHaveAttribute('aria-selected', 'false');

  await studentPage.getByRole('button', { name: /^(?:Submit|제출)$/ }).click();
  await expect(resultTab(teacherPage)).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
  // The element's text includes its label, so wait for an actual score.
  const studentScore = studentPage.getByTestId('result-score');
  await expect(studentScore).toHaveText(/\d+ \/ 100/, { timeout: 90_000 });

  await expect(teacherPage.getByTestId('live-result')).toBeVisible({ timeout: 30_000 });
  await expect(resultTab(teacherPage)).toHaveAttribute('aria-selected', 'true');
  await expect(teacherPage.getByTestId('result-score')).toHaveText(
    (await studentScore.textContent()) ?? '',
    { timeout: 30_000 },
  );
  await expect(teacherPage.getByTestId('result-passed')).toHaveText(
    (await studentPage.getByTestId('result-passed').textContent()) ?? '',
  );
  await expect(teacherPage.getByTestId('live-result-verdict')).toHaveText(/\S/);
});

test('the hidden case never reaches the teacher', async () => {
  const html = await teacherPage.content();
  expect(html).not.toContain(HIDDEN_SENTINEL);
});

test('a teacher who arrives afterwards sees the latest verdict', async () => {
  const latePage = await lateTeacherContext.newPage();
  await signInAs({ page: latePage, identifier: TEACHER_EMAIL, password: PASSWORD });
  await openLiveWatch(latePage);

  await resultTab(latePage).click();
  await expect(latePage.getByTestId('live-result')).toBeVisible({ timeout: 30_000 });
  await expect(latePage.getByTestId('result-score')).toHaveText(
    (await teacherPage.getByTestId('result-score').textContent()) ?? '',
  );
  expect(await latePage.content()).not.toContain(HIDDEN_SENTINEL);
});

test('the full review opens from the result tab', async () => {
  const link = teacherPage.getByRole('link', { name: /^(?:Open full review|전체 검토 열기)/ });
  await expect(link).toHaveAttribute('href', /\/submissions\/[0-9a-f-]+$/);
  await expect(link).toHaveAttribute('target', '_blank');
});
