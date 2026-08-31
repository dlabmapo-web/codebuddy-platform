import { expect, test, type Page } from '@playwright/test';

import { routes } from '../../packages/web/src/lib/routes';
import { signInAs } from '../support/auth';

test.describe.configure({ mode: 'serial' });

const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'CoveDev123!';
const ADMIN = process.env.E2E_ADMIN_USERNAME ?? 'cove-admin';
const STUDENT = process.env.E2E_STUDENT_USERNAME ?? 'cove-student';

/**
 * One academy, created by the first test and carried through the rest.
 *
 * Serial and shared rather than one academy per test, because an academy is
 * permanent: `ARCHIVED` is terminal and nothing deletes the row. A run that
 * created four would leave four behind. This creates one, walks it through its
 * whole life, and archives it at the end so it never reappears in the roll
 * call that later runs read.
 */
const suffix = Date.now().toString(36);
const academy = {
  name: `E2E Academy ${suffix}`,
  slug: `e2e-academy-${suffix}`,
  managerEmail: `e2e-manager-${suffix}@cove.test`,
};
let academyUrl = '';
let invitationLink = '';

async function signInAsOperator(page: Page) {
  await signInAs({
    page,
    identifier: ADMIN,
    password: PASSWORD,
    landing: /\/admin/,
  });
}

test('an operator signing in lands on the console, not the welcome page', async ({
  page,
}) => {
  await signInAsOperator(page);

  // The bug this guards: an operator belongs to no academy by design, so the
  // membership-only routing sent them to a screen telling them to ask a
  // manager for an invitation they do not need.
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Academies', level: 1 }))
    .toBeVisible();
  await expect(page.getByRole('link', { name: /New academy/ })).toBeVisible();
});

test('the console offers a way back to the operator’s own account', async ({
  page,
}) => {
  await signInAsOperator(page);
  await page.goto(routes.admin);

  // An operator with no academy has no sidebar and no academy switcher. Without
  // this link the console is somewhere they can reach and never leave.
  await page.getByRole('link', { name: /my page|마이 페이지/i }).click();
  await expect(page).toHaveURL(/\/account/);
  await page.getByRole('link', { name: /back|스튜디오/i }).first().click();
  await expect(page).toHaveURL(/\/admin$/);

  // And the sidebar carries the sign-out every other Cove surface has.
  await expect(page.getByRole('button', { name: /sign out|로그아웃/i }))
    .toBeVisible();
});

test('creating an academy invites its first manager', async ({ page }) => {
  await signInAsOperator(page);
  await page.goto(routes.adminAcademyNew);

  await page.getByLabel('Academy name').fill(academy.name);
  // The slug is proposed from the name and must be visible before submit,
  // because it is permanent in every URL anybody bookmarks.
  await expect(page.getByLabel('Address')).toHaveValue(academy.slug);
  await page.getByLabel('Time zone').selectOption('Asia/Seoul');
  await page.getByLabel("First manager's email").fill(academy.managerEmail);
  await page.getByRole('button', { name: 'Create academy' }).click();

  // The flow ends on what actually happened — an invitation is outstanding —
  // rather than on "here is your academy".
  await expect(page.getByRole('heading', { name: `${academy.name} is ready` }))
    .toBeVisible();
  await expect(page.getByText(academy.managerEmail)).toBeVisible();

  // The link is shown once, because only its hash is stored. Without it the
  // whole flow would be uncompletable anywhere email is not configured — which
  // is every development machine.
  const link = page.getByLabel('Invitation link');
  await expect(link).toBeVisible();
  invitationLink = await link.inputValue();
  expect(invitationLink).toContain('/invite/');

  await page.getByRole('link', { name: 'Open academy' }).click();
  await expect(page).toHaveURL(/\/admin\/academies\/[a-z0-9-]+$/);
  academyUrl = new URL(page.url()).pathname;
});

test('a new academy waits for its manager in the roll call', async ({ page }) => {
  await signInAsOperator(page);
  await page.goto(routes.admin);

  const row = page.getByRole('listitem').filter({ hasText: academy.name });
  await expect(row).toBeVisible();
  // The badge names the condition; the body says what it means.
  await expect(row.getByText('No manager yet')).toBeVisible();
  await expect(row.getByText(/The academy is ready/)).toBeVisible();
  // Nobody has joined, so the row says so rather than printing a count of nil.
  await expect(row.getByText('No members yet')).toBeVisible();
  await expect(row.getByRole('link', { name: /Resend invitation/ }))
    .toBeVisible();
});

test('the first-manager invitation can be resent to a corrected address', async ({
  page,
}) => {
  await signInAsOperator(page);
  await page.goto(academyUrl);

  const corrected = `e2e-corrected-${suffix}@cove.test`;
  const panel = page.getByRole('heading', { name: 'First manager' })
    .locator('xpath=ancestor::section');
  await expect(panel.getByText(academy.managerEmail)).toBeVisible();

  await panel.getByLabel('Send to').fill(corrected);
  await panel.getByRole('button', { name: 'Send invitation' }).click();
  await expect(panel.getByText(`Invitation sent to ${corrected}`)).toBeVisible();
});

test('the invitation link opens a real acceptance page', async ({ page }) => {
  // Signed out: the recipient is not the operator who created the invitation,
  // and the link has to stand on its own.
  await page.context().clearCookies();
  await page.goto(invitationLink);

  // Either it invites them to sign in, or it shows the invitation itself. What
  // it must never be is a dead link or a crash.
  await expect(page.locator('body')).toContainText(
    /invitation|invited|sign in|초대|로그인/i,
  );
  expect(page.url()).not.toContain('/404');
});

test('suspending an academy requires a reason and reports the new state', async ({
  page,
}) => {
  await signInAsOperator(page);
  await page.goto(academyUrl);

  await page.getByRole('button', { name: 'Suspend', exact: true }).click();
  const confirm = page.getByRole('dialog');
  await expect(
    confirm.getByRole('heading', { name: `Suspend ${academy.name}?` }),
  ).toBeVisible();

  // The reason is not optional: §6.3 of the authorization design asks for a
  // documented one on privileged intervention, and the button stays disabled
  // until there is one.
  await expect(confirm.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  await confirm.getByLabel('Reason').fill('E2E run: exercising suspension.');
  await confirm.getByRole('button', { name: 'Confirm' }).click();

  await expect(page.getByText('This academy is suspended. Nobody can sign in.'))
    .toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible();
});

test('a suspended academy is restored to running', async ({ page }) => {
  await signInAsOperator(page);
  await page.goto(academyUrl);

  await page.getByRole('button', { name: 'Restore' }).click();
  const confirm = page.getByRole('dialog');
  await confirm.getByLabel('Reason').fill('E2E run: exercising restore.');
  await confirm.getByRole('button', { name: 'Confirm' }).click();

  await expect(page.getByText('This academy is running.')).toBeVisible();
});

test('archiving is terminal and leaves no way back', async ({ page }) => {
  await signInAsOperator(page);
  await page.goto(academyUrl);

  await page.getByRole('button', { name: 'Archive' }).click();
  const confirm = page.getByRole('dialog');
  await confirm.getByLabel('Reason').fill('E2E run: cleaning up the fixture.');
  await confirm.getByRole('button', { name: 'Confirm' }).click();

  await expect(
    page.getByText('This academy is archived. It cannot be reopened.'),
  ).toBeVisible();
  // No transition out of ARCHIVED exists, so the console offers none.
  await expect(page.getByRole('button', { name: 'Restore' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Suspend', exact: true }))
    .toHaveCount(0);

  // And it drops out of the roll call: an archived academy is finished, not
  // something anybody needs to act on.
  await page.goto(routes.admin);
  await expect(
    page.getByRole('listitem').filter({ hasText: academy.name }),
  ).toHaveCount(0);

  // It stays in the table, which is every academy — and the state facet can
  // still find it there.
  await page.getByPlaceholder(/Search/i).fill(academy.slug);
  await expect(page.getByRole('cell', { name: /Archived/ })).toBeVisible();
});

test('the console is invisible to everyone who is not an operator', async ({
  page,
}) => {
  await signInAs({ page, identifier: STUDENT, password: PASSWORD });

  // 404, not 403: a non-admin should not learn the surface exists.
  const response = await page.goto(routes.admin);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Academies', level: 1 }))
    .toHaveCount(0);
});
