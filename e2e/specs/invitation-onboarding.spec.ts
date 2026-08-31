import { expect, test, type Page } from '@playwright/test';

import { routes } from '../../packages/web/src/lib/routes';
import { signInAs } from '../support/auth';

const PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'CoveDev123!';
const ADMIN = process.env.E2E_ADMIN_USERNAME ?? 'cove-admin';
/** Seeded by `db:seed` — an address that provably already has an account. */
const EXISTING_EMAIL = 'student@cove.test';

// The app renders Korean by default and English on request, and these assert
// meaning rather than language. Matching one locale would make the suite pass
// or fail on a cookie nobody set deliberately.
const CAPTCHA_UNAVAILABLE = /could not load|불러오지 못했습니다/;
const CAPTCHA_RETRY = /Try the check again|보안 확인 다시 시도/;
const CAPTCHA_PENDING = /Waiting for the security check|보안 확인이 끝나기를/;
const SIGN_IN_TO_ACCEPT = /Sign in to accept|로그인하고 수락/;
const CREATE_AN_ACCOUNT = /Create an account|계정 만들기/;
const CHOOSE_ACADEMY = /Choose your academy to continue|아카데미를 선택하세요/;
const EMAIL_TAKEN = /already has a Cove account|계정이 이미 있습니다/;

async function createAcademyWithInvitation(page: Page, suffix: string) {
  const slug = `invite-${suffix}`;
  const name = `Invite ${suffix}`;
  await signInAs({ page, identifier: ADMIN, password: PASSWORD, landing: /\/admin/ });
  await page.goto(routes.adminAcademyNew);
  await page.getByLabel('Academy name').fill(name);
  await page.getByLabel('Address').fill(slug);
  await page.getByLabel('Time zone').selectOption('Asia/Seoul');
  await page.getByLabel("First manager's email").fill(EXISTING_EMAIL);
  await page.getByRole('button', { name: 'Create academy' }).click();
  return { link: await page.getByLabel('Invitation link').inputValue(), slug, name };
}

async function archiveAcademy(page: Page, slug: string) {
  await signInAs({ page, identifier: ADMIN, password: PASSWORD, landing: /\/admin/ });
  await page.goto(routes.admin);
  await page.getByPlaceholder(/Search/i).fill(slug);
  await page.getByRole('link', { name: /Open/ }).first().click();
  await page.getByRole('button', { name: 'Archive' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Reason').fill('E2E fixture cleanup.');
  await dialog.getByRole('button', { name: 'Confirm' }).click();
}

/**
 * A blocked Cloudflare must not become a blocked account.
 *
 * Hermetic on purpose: the challenge host is refused at the network layer, so
 * this reproduces an ad blocker, a school proxy, or a filtered region without
 * depending on any of them. It is also the one shape of this failure that used
 * to be invisible — the widget neither loads nor errors, and the old component
 * waited on it forever behind a dead button with an empty box above it.
 */
test('a blocked security check explains itself and offers a way back', async ({
  page,
}) => {
  await page.route('**challenges.cloudflare.com/**', (route) => route.abort());
  await page.context().clearCookies();
  await page.goto(routes.login);

  const submit = page.getByRole('button', { name: /sign in|로그인/i });
  // It still refuses — the server is the one that enforces this, and letting
  // the form through would only trade a clear message for `captcha_failed`.
  await expect(submit).toBeDisabled();
  // But it says why it is refusing, instead of looking broken.
  await expect(page.getByText(CAPTCHA_PENDING)).toBeVisible();

  // And within the watchdog's ten seconds it stops waiting and says so.
  await expect(page.getByText(CAPTCHA_UNAVAILABLE)).toBeVisible({
    timeout: 20_000,
  });
  // The code travels with the message: a screenshot from a parent is then a
  // lookup rather than a guess.
  await expect(page.getByText(/\((load_timeout|script_blocked|\d{6})\)/))
    .toBeVisible();

  // The way back, without losing a page of typed credentials to a reload.
  const retry = page.getByRole('button', { name: CAPTCHA_RETRY });
  await expect(retry).toBeVisible();
  await expect(retry).toHaveAttribute('type', 'button');
  await retry.click();
  // Retrying re-arms the wait rather than silently doing nothing.
  await expect(page.getByText(CAPTCHA_PENDING)).toBeVisible();
});

/** The signup form names which of its preconditions is holding the button. */
test('signup says what it is waiting for', async ({ page }) => {
  await page.route('**challenges.cloudflare.com/**', (route) => route.abort());
  await page.context().clearCookies();
  await page.goto(routes.signup);

  // The academy comes first: it needs a decision from the person, where the
  // security check only needs time.
  await expect(page.getByText(CHOOSE_ACADEMY)).toBeVisible();
  await expect(page.getByRole('button', { name: /Create account|계정 만들기/i }))
    .toBeDisabled();
});

test('an invitation names itself and offers both doors to a signed-out visitor', async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const { link, slug, name } = await createAcademyWithInvitation(page, suffix);

  // Arrive with no session, the way the recipient of the email does.
  await page.context().clearCookies();
  await page.goto(link);

  // Not `/signup`. That redirect was the defect: it assumed the invitee had no
  // account, which is exactly wrong for a manager who already has one.
  await page.waitForURL(/\/invite$/);

  // The three facts that make either door usable — above all the address,
  // because acceptance is refused for every other one.
  await expect(page.getByText(name)).toBeVisible();
  await expect(page.getByText(EXISTING_EMAIL)).toBeVisible();

  await expect(page.getByRole('link', { name: SIGN_IN_TO_ACCEPT })).toBeVisible();
  const createAccount = page.getByRole('link', { name: CREATE_AN_ACCOUNT });
  await expect(createAccount).toBeVisible();

  // The signup door carries the academy, so the selector is not a guess.
  await createAccount.click();
  await page.waitForURL(/\/signup\?.*invited=1/);

  await archiveAcademy(page, slug);
});

/**
 * Requires a web server started with Cloudflare's always-pass site key, which
 * `playwright.config.ts` supplies to the server it starts itself. A dev server
 * already listening on the port is reused as-is and carries the real key, so
 * the challenge cannot resolve and this is skipped rather than failed.
 */
test('signing up with an address that already has an account says so', async ({
  page,
}) => {
  await page.context().clearCookies();
  await page.goto(routes.signup);

  await page.getByRole('combobox').click();
  await page.getByRole('option').first().click();
  await page.getByLabel('Name', { exact: true }).fill('Already Registered');
  await page.getByLabel('Username').fill(`dupe-${Date.now().toString(36)}`);
  await page.getByLabel('Email').fill(EXISTING_EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);

  const submit = page.getByRole('button', { name: /Create account|계정 만들기/i });
  const solved = await submit.isEnabled({ timeout: 20_000 }).catch(() => false);
  test.skip(!solved, 'Needs the always-pass Turnstile key; see the doc comment.');

  await submit.click();

  // The whole point. Not "Unable to create the account" — and, with email
  // confirmation off on this project, not a "check your email" that never
  // arrives either.
  await expect(page.getByText(EMAIL_TAKEN)).toBeVisible({ timeout: 20_000 });
});
