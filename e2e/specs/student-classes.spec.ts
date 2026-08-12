import { expect, test, type Page } from '@playwright/test';

import { signInAs } from '../support/auth';

/**
 * My Classes, and the delivery relationship it explains.
 *
 * Requires `pnpm --filter @cove/api db:seed` and `db:seed:e2e`. The seeded
 * "E2E Cohort" is the student's first class and comes with a teacher already
 * assigned. This suite builds a second enrolled class — deliberately left
 * unassigned — plus an active class the student never joins. The pair proves
 * both the teacher fallback and the enrollment boundary without disturbing the
 * fixture the other suites depend on.
 *
 * Serial: each test continues the class the previous one left behind.
 */
test.describe.configure({ mode: 'serial' });

const PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'CoveDev123!';
const TEAM_LEAD_EMAIL = 'teamlead@cove.test';
const MANAGER_EMAIL = 'manager@cove.test';
const STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL ?? 'student@cove.test';
/** The roster's row menu is labelled by display name, not by address. */
const STUDENT_NAME = 'Cove Student';

const SEEDED_CLASS = 'E2E Cohort';
/** Named for this run so a rerun never collides with a leftover class. */
const SECOND_CLASS = `Playwright Class ${Date.now()}`;
const UNREGISTERED_CLASS = `Playwright Unregistered ${Date.now()}`;
const E2E_COURSE = 'E2E Python Basics';

let academyId = '';
let secondClassId = '';
let unregisteredClassId = '';

async function signIn(page: Page, email: string) {
  academyId = await signInAs({ page, identifier: email, password: PASSWORD });
}

function classesUrl() {
  return `/studio/academies/${academyId}/learn/classes`;
}

/** A class card, matched by the heading that names it. */
function classCard(page: Page, name: string) {
  return page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { name }) });
}

test('a manager sets up a second class for the same student', async ({
  page,
}) => {
  await signIn(page, MANAGER_EMAIL);
  await page.goto(`/studio/academies/${academyId}/classes`);

  await page.getByRole('button', { name: /new class|새 반/i }).click();
  await page.getByRole('textbox').first().fill(SECOND_CLASS);
  await page.getByRole('button', { name: /create and open|만들고 열기/i }).click();
  await page.waitForURL(/\/classes\/[0-9a-f-]+$/, { timeout: 30_000 });
  secondClassId = /\/classes\/([0-9a-f-]+)/.exec(page.url())?.[1] ?? '';
  expect(secondClassId).not.toBe('');

  // The same course the seeded class already grants. Two classes granting one
  // course is a duplicate path, not a duplicate course, and the catalog below
  // has to keep saying so.
  await page.getByRole('button', { name: /assign courses|코스 지정/i }).click();
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: E2E_COURSE }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /save assignments|지정 저장/i }).click();
  await expect(page.getByRole('link', { name: E2E_COURSE })).toBeVisible();

  await page.getByRole('button', { name: /add students|학생 추가/i }).click();
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: new RegExp(STUDENT_EMAIL, 'i') }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /add to class|반에 추가/i }).click();
  await expect(page.getByText(STUDENT_EMAIL, { exact: true })).toBeVisible();

  // Active and in the same academy, but with no enrollment for the student.
  // This is the negative control for the student list and direct detail URL.
  await page.goto(`/studio/academies/${academyId}/classes`);
  await page.getByRole('button', { name: /new class|새 반/i }).click();
  await page.getByRole('textbox').first().fill(UNREGISTERED_CLASS);
  await page.getByRole('button', { name: /create and open|만들고 열기/i }).click();
  await page.waitForURL(/\/classes\/[0-9a-f-]+$/, { timeout: 30_000 });
  unregisteredClassId = /\/classes\/([0-9a-f-]+)/.exec(page.url())?.[1] ?? '';
  expect(unregisteredClassId).not.toBe('');
});

test('a student lands on My Courses and finds both classes beside it', async ({
  page,
}) => {
  await signIn(page, STUDENT_EMAIL);

  // Adding the second nav entry must not move where a student arrives.
  await page.goto(`/studio/academies/${academyId}`);
  await expect(page).toHaveURL(new RegExp(`${academyId}/learn/courses$`));

  await page
    .getByRole('link', { name: /my classes|내 반/i })
    .first()
    .click();
  await page.waitForURL(/\/learn\/classes$/, { timeout: 30_000 });

  await expect(classCard(page, SEEDED_CLASS)).toBeVisible();
  await expect(classCard(page, SECOND_CLASS)).toBeVisible();
  await expect(classCard(page, UNREGISTERED_CLASS)).toHaveCount(0);

  // The seeded class has an active teacher; the one built above has none, and
  // says so rather than leaving a gap.
  await expect(
    classCard(page, SECOND_CLASS).getByText(/teacher not assigned|미배정/i),
  ).toBeVisible();

  await page.goto(`${classesUrl()}/${unregisteredClassId}`);
  await expect(page.locator('body')).not.toContainText(UNREGISTERED_CLASS);
});

test('a class detail names its courses and links to the existing course route', async ({
  page,
}) => {
  await signIn(page, STUDENT_EMAIL);
  await page.goto(classesUrl());
  await classCard(page, SECOND_CLASS).click();
  await page.waitForURL(/\/learn\/classes\/[0-9a-f-]+$/, { timeout: 30_000 });

  await expect(page.getByRole('heading', { name: SECOND_CLASS })).toBeVisible();
  const course = page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { name: E2E_COURSE }) });
  await expect(course).toBeVisible();

  // The course route is academy-level on purpose: access means access through
  // any eligible class, so no class-scoped curriculum URL is introduced.
  const href = await course.getAttribute('href');
  expect(href).toMatch(/\/learn\/courses\/[0-9a-f-]+$/);

  await course.click();
  await expect(page.getByRole('heading', { name: E2E_COURSE })).toBeVisible();
});

test('My Courses still shows one card when two classes grant the course', async ({
  page,
}) => {
  await signIn(page, STUDENT_EMAIL);
  await page.goto(`/studio/academies/${academyId}/learn/courses`);

  await expect(page.getByRole('heading', { name: E2E_COURSE })).toHaveCount(1);
});

test('removing the enrollment removes the class and its remembered URL', async ({
  page,
  browser,
}) => {
  await signIn(page, MANAGER_EMAIL);
  await page.goto(`/studio/academies/${academyId}/classes/${secondClassId}`);
  await page
    .getByRole('button', { name: new RegExp(`actions for ${STUDENT_NAME}|${STUDENT_NAME}.*작업`, 'i') })
    .click();
  await page
    .getByRole('menuitem', { name: /remove from class|반에서 제외/i })
    .click();
  await page.getByRole('button', { name: /remove student|학생 제외/i }).click();
  await expect(page.getByText(STUDENT_EMAIL, { exact: true })).toHaveCount(0);

  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  await signIn(studentPage, STUDENT_EMAIL);

  await studentPage.goto(classesUrl());
  await expect(classCard(studentPage, SECOND_CLASS)).toHaveCount(0);
  await expect(classCard(studentPage, SEEDED_CLASS)).toBeVisible();

  // A removed seat and a class that never existed must be indistinguishable,
  // and neither may leave the class name on screen.
  await studentPage.goto(`${classesUrl()}/${secondClassId}`);
  await expect(studentPage.locator('body')).not.toContainText(SECOND_CLASS);
  await studentContext.close();
});

test('staff previewing curriculum get neither the link nor the pages', async ({
  page,
}) => {
  await signIn(page, TEAM_LEAD_EMAIL);
  await page.goto(`/studio/academies/${academyId}/learn/courses`);

  // A Team Lead holds `curriculum.read` and can walk the courses they wrote.
  // That is not a class to belong to.
  await expect(page.getByRole('link', { name: /my classes|내 반/i })).toHaveCount(0);

  await page.goto(classesUrl());
  await expect(
    page.getByText(/could not be loaded|불러오지 못했습니다/i),
  ).toBeVisible();

  await page.goto(`${classesUrl()}/${secondClassId}`);
  await expect(page.locator('body')).not.toContainText(SECOND_CLASS);
});
