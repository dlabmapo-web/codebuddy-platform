import { expect, test, type Page } from '@playwright/test';

import { routes } from '../../packages/web/src/lib/routes';
import { signInAs } from '../support/auth';

test.describe.configure({ mode: 'serial' });

const PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'CoveDev123!';
const MANAGER = process.env.E2E_MANAGER_EMAIL ?? 'manager@cove.test';
const STUDENT = process.env.E2E_STUDENT_USERNAME ?? 'cove-student';
/** Seeded as Manager, with Teacher and Team lead granted beside it. */
const MULTI_ROLE = 'cove-multi';
const STUDENT_MEMBERSHIP = '40000000-0000-4000-8000-000000000005';

async function signInAsManager(page: Page) {
  return signInAs({ page, identifier: MANAGER, password: PASSWORD });
}

test('the Members table shows each person\'s sign-in name as their ID', async ({
  page,
}) => {
  const academySlug = await signInAsManager(page);
  await page.goto(routes.academyPeople(academySlug));

  await expect(page.getByRole('columnheader', { name: 'ID' })).toBeVisible();
  await page.getByPlaceholder('Name, ID, or email').fill(STUDENT);
  await expect(page.getByRole('cell', { name: STUDENT, exact: true })).toBeVisible();
});

test('a manager finds a student on the Students page and opens their profile', async ({
  page,
}) => {
  const academySlug = await signInAsManager(page);
  await page.goto(routes.academyStudents(academySlug));

  await expect(page.getByRole('heading', { name: 'Students' })).toBeVisible();
  await page.getByPlaceholder('Name, ID, or student number').fill(STUDENT);
  const row = page.getByRole('row').filter({ hasText: STUDENT });
  await expect(row).toHaveCount(1);

  await row.getByRole('link', { name: /Open .*'s profile/ }).click();
  await expect(page).toHaveURL(
    new RegExp(`/people/${STUDENT_MEMBERSHIP}$`),
  );
});

test('the Staff page finds a multi-role manager under the Teacher filter', async ({
  page,
}) => {
  const academySlug = await signInAsManager(page);
  await page.goto(routes.academyStaff(academySlug));
  await expect(page.getByRole('heading', { name: 'Staff' })).toBeVisible();

  await page.getByRole('button', { name: 'Role' }).click();
  await page.getByRole('option', { name: /Teacher/ }).click();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/role=TEACHER/);

  const row = page.getByRole('row').filter({ hasText: MULTI_ROLE });
  await expect(row).toHaveCount(1);
  // Every role the person holds, not the highest and a count.
  for (const role of ['Manager', 'Team lead', 'Teacher']) {
    await expect(row.getByText(role, { exact: true })).toBeVisible();
  }
  await expect(
    page.getByText('People with several roles are counted under each role filter.'),
  ).toBeVisible();
});

test('a manager types a student\'s new password and the student signs in with it', async ({
  browser,
  page,
}) => {
  const academySlug = await signInAsManager(page);
  const typed = `CoveKid${Date.now() % 10_000}`;

  async function setPassword(value: string) {
    await page.goto(routes.academyPerson(academySlug, STUDENT_MEMBERSHIP));
    const panel = page
      .getByRole('heading', { name: 'Password' })
      .locator('xpath=ancestor::section');
    await panel.getByRole('button', { name: 'Set new password' }).click();

    const input = panel.getByLabel('New password');
    // The mistake the form exists to catch: a keyboard left in 한글 mode.
    await input.fill('ㅡㅑㅜㅓㅑ1234');
    await expect(panel.getByText(/Check that the keyboard is in English mode/))
      .toBeVisible();
    await expect(panel.getByRole('button', { name: 'Save' })).toBeDisabled();

    await input.fill(value);
    await panel.getByRole('button', { name: 'Save' }).click();
    await expect(panel.getByText(value, { exact: true })).toBeVisible();
  }

  await setPassword(typed);
  try {
    const context = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
    });
    const studentPage = await context.newPage();
    await signInAs({ page: studentPage, identifier: STUDENT, password: typed });
    await context.close();
  } finally {
    // Put the fixture back for every spec that signs in as the student.
    await setPassword(PASSWORD);
  }
});
