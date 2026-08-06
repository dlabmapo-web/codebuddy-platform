import { expect, test, type Page } from '@playwright/test';

/**
 * Class management and the access boundary it creates.
 *
 * Requires `pnpm --filter @cove/api db:seed` and `db:seed:e2e`. The seeded
 * "E2E Cohort" class is what grants the student their catalog, so this suite
 * deliberately builds its own class rather than editing that fixture — leaving
 * the student journey suite untouched however this one ends.
 *
 * Serial: each test continues the class the previous one left behind.
 */
test.describe.configure({ mode: 'serial' });

const PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'CoveDev123!';
const TEAM_LEAD_EMAIL = 'teamlead@cove.test';
const MANAGER_EMAIL = 'manager@cove.test';
const STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL ?? 'student@cove.test';

/** Named for this run so a rerun never collides with a leftover class. */
const CLASS_NAME = `Playwright Cohort ${Date.now()}`;
const SANDBOX_COURSE = 'Manual Testing Sandbox';
const E2E_COURSE = 'E2E Python Basics';

let academyId = '';
let classId = '';

async function signIn(page: Page, email: string) {
  await page.goto('/auth/login');
  await page.locator('input[name="identifier"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|로그인/i }).click();
  await page.waitForURL(/\/studio\/academies\//, { timeout: 30_000 });
  academyId =
    /\/studio\/academies\/([0-9a-f-]+)/.exec(page.url())?.[1] ?? academyId;
  expect(academyId).not.toBe('');
}

function classesUrl() {
  return `/studio/academies/${academyId}/classes`;
}

test('a team lead creates a class and assigns more than one course', async ({
  page,
}) => {
  await signIn(page, TEAM_LEAD_EMAIL);
  await page.goto(classesUrl());

  await page.getByRole('button', { name: /new class|새 반/i }).click();
  await page.getByRole('textbox').first().fill(CLASS_NAME);
  await page.getByRole('button', { name: /create and open|만들고 열기/i }).click();

  // Creation lands on the class, which is where courses and students are set.
  await page.waitForURL(/\/classes\/[0-9a-f-]+$/, { timeout: 30_000 });
  classId = /\/classes\/([0-9a-f-]+)/.exec(page.url())?.[1] ?? '';
  expect(classId).not.toBe('');
  await expect(page.getByRole('heading', { name: CLASS_NAME })).toBeVisible();

  await page.getByRole('button', { name: /assign courses|코스 지정/i }).click();
  const selector = page.getByRole('combobox');
  await selector.click();
  await page.getByRole('option', { name: E2E_COURSE }).click();
  await page.getByRole('option', { name: SANDBOX_COURSE }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /save assignments|지정 저장/i }).click();

  await expect(page.getByRole('link', { name: E2E_COURSE })).toBeVisible();
  await expect(page.getByRole('link', { name: SANDBOX_COURSE })).toBeVisible();
});

test('a team lead reads the roster but cannot change it', async ({ page }) => {
  await signIn(page, TEAM_LEAD_EMAIL);
  await page.goto(`${classesUrl()}/${classId}`);

  // The panel is readable, and says whose call enrollment is.
  await expect(page.getByRole('heading', { name: /students|학생/i })).toBeVisible();
  await expect(page.getByText(/only a manager|관리자만/i)).toBeVisible();
  await expect(
    page.getByRole('button', { name: /add students|학생 추가/i }),
  ).toHaveCount(0);
});

test('a manager enrolls a student', async ({ page }) => {
  await signIn(page, MANAGER_EMAIL);
  await page.goto(`${classesUrl()}/${classId}`);

  await page.getByRole('button', { name: /add students|학생 추가/i }).click();
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: new RegExp(STUDENT_EMAIL, 'i') }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /add to class|반에 추가/i }).click();

  await expect(page.getByText(STUDENT_EMAIL)).toBeVisible();
});

test('the student sees the newly assigned course', async ({ page }) => {
  await signIn(page, STUDENT_EMAIL);
  await page.goto(`/studio/academies/${academyId}/learn/courses`);

  // Reached only through the class created above; the student journey fixture
  // never assigns the sandbox course.
  await expect(
    page.getByRole('heading', { name: SANDBOX_COURSE }),
  ).toBeVisible();
});

test('archiving the class revokes its access path, restoring returns it', async ({
  page,
  browser,
}) => {
  await signIn(page, MANAGER_EMAIL);
  await page.goto(`${classesUrl()}/${classId}`);
  await page.getByRole('button', { name: /^archive$|^보관$/i }).click();
  await page.getByRole('button', { name: /archive class|반 보관/i }).click();
  await expect(page.getByText(/this class is archived|보관 상태/i)).toBeVisible();

  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  await signIn(studentPage, STUDENT_EMAIL);
  await studentPage.goto(`/studio/academies/${academyId}/learn/courses`);
  await expect(
    studentPage.getByRole('heading', { name: SANDBOX_COURSE }),
  ).toHaveCount(0);

  await page.getByRole('button', { name: /^restore$|^복원$/i }).click();
  await expect(page.getByText(/this class is archived|보관 상태/i)).toHaveCount(0);

  await studentPage.reload();
  await expect(
    studentPage.getByRole('heading', { name: SANDBOX_COURSE }),
  ).toBeVisible();
  await studentContext.close();
});

test('removing the course revokes access, reassigning restores the same work', async ({
  page,
  browser,
}) => {
  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  await signIn(studentPage, STUDENT_EMAIL);
  const catalog = `/studio/academies/${academyId}/learn/courses`;

  await signIn(page, MANAGER_EMAIL);
  await page.goto(`${classesUrl()}/${classId}`);
  await page
    .getByRole('button', { name: new RegExp(`remove.*${SANDBOX_COURSE}`, 'i') })
    .click();
  await page.getByRole('button', { name: /remove course|코스 제외/i }).click();
  await expect(page.getByRole('link', { name: SANDBOX_COURSE })).toHaveCount(0);

  await studentPage.goto(catalog);
  await expect(
    studentPage.getByRole('heading', { name: SANDBOX_COURSE }),
  ).toHaveCount(0);

  // Reassigning brings the same course back rather than a fresh copy: the
  // student's saved work is keyed to the material, never to the assignment.
  await page.getByRole('button', { name: /assign courses|코스 지정/i }).click();
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: SANDBOX_COURSE }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /save assignments|지정 저장/i }).click();
  await expect(page.getByRole('link', { name: SANDBOX_COURSE })).toBeVisible();

  await studentPage.goto(catalog);
  await expect(
    studentPage.getByRole('heading', { name: SANDBOX_COURSE }),
  ).toBeVisible();
  await studentContext.close();
});

test('a direct URL cannot bypass the assignment check', async ({
  page,
  browser,
}) => {
  await signIn(page, MANAGER_EMAIL);
  await page.goto(`${classesUrl()}/${classId}`);

  // Capture the course's own URL while it is still assigned, then remove it.
  const href = await page
    .getByRole('link', { name: SANDBOX_COURSE })
    .getAttribute('href');
  const courseId = /courses\/([0-9a-f-]+)/.exec(href ?? '')?.[1] ?? '';
  expect(courseId).not.toBe('');

  await page
    .getByRole('button', { name: new RegExp(`remove.*${SANDBOX_COURSE}`, 'i') })
    .click();
  await page.getByRole('button', { name: /remove course|코스 제외/i }).click();
  await expect(page.getByRole('link', { name: SANDBOX_COURSE })).toHaveCount(0);

  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  await signIn(studentPage, STUDENT_EMAIL);
  await studentPage.goto(
    `/studio/academies/${academyId}/learn/courses/${courseId}`,
  );

  // The response must not name the course it is refusing.
  await expect(studentPage.locator('body')).not.toContainText(SANDBOX_COURSE);
  await studentContext.close();
});
