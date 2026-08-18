import { expect, test } from '@playwright/test';

import { signInAs } from '../support/auth';

const PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'CoveDev123!';
const ADMIN = process.env.E2E_ADMIN_USERNAME ?? 'cove-admin';
const STUDENT = process.env.E2E_STUDENT_USERNAME ?? 'cove-student';

/**
 * Seeing an invitation link must not strand the next person to sign in.
 *
 * The cookie is set by *visiting* a link, and sign-in routes to the acceptance
 * page for whoever signs in next on that browser. An operator checking a link
 * they just handed out is the ordinary way to land in that state.
 */
test('a stray invitation cookie never traps the next sign-in', async ({ page }) => {
  const suffix = Date.now().toString(36);
  const slug = `escape-${suffix}`;

  // An operator creates an academy and opens the invitation link to check it.
  await signInAs({
    page,
    identifier: ADMIN,
    password: PASSWORD,
    landing: /\/platform/,
  });
  await page.goto('/platform/academies/new');
  await page.getByLabel('Academy name').fill(`Escape ${suffix}`);
  await page.getByLabel('Address').fill(slug);
  await page.getByLabel('Time zone').selectOption('Asia/Seoul');
  await page.getByLabel("First manager's email").fill(`${slug}@cove.test`);
  await page.getByRole('button', { name: 'Create academy' }).click();
  const link = await page.getByLabel('Invitation link').inputValue();
  await page.goto(link);

  // A student signs in on the same browser. The invitation is not theirs.
  await page.goto('/auth/login');
  await page.locator('input[name="identifier"]').fill(STUDENT);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|로그인/i }).click();
  await page.waitForURL(/\/auth\/invitation/);

  // The way out, and it must land them where they actually belong.
  await page.getByRole('button', { name: /Not now/ }).click();
  await page.waitForURL(/\/studio\/academies\//);

  // And the cookie is gone, so the next sign-in is not trapped either.
  await page.goto('/auth/login');
  await page.locator('input[name="identifier"]').fill(STUDENT);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|로그인/i }).click();
  await page.waitForURL(/\/studio\/academies\//);
  expect(page.url()).not.toContain('/auth/invitation');

  // Leave nothing behind in the roll call.
  await signInAs({
    page,
    identifier: ADMIN,
    password: PASSWORD,
    landing: /\/platform/,
  });
  await page.goto('/platform');
  await page.getByPlaceholder(/Search/i).fill(slug);
  await page.getByRole('link', { name: /Open/ }).first().click();
  await page.getByRole('button', { name: 'Archive' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Reason').fill('E2E fixture cleanup.');
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await page.getByText('This academy is archived. It cannot be reopened.').waitFor();
});
