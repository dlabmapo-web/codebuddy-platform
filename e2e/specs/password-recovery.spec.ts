import { expect, test, type Page } from '@playwright/test';

import { signInAs } from '../support/auth';

/**
 * The password recovery route, and Kakao's absence from the sign-in screens.
 *
 * What this file cannot do is open the email. The suite runs against the
 * development Supabase project, which delivers to a real mailbox rather than a
 * local sink, so the four steps that require reading a recovery message —
 * following a real link, resetting through it, proving it cannot be reused,
 * and proving an automated GET does not spend it — are staging checks against
 * a project with SMTP capture, listed in §10.3 of
 * docs/superpowers/specs/2026-08-21-password-recovery-and-kakao-availability-design.md.
 *
 * Everything reachable without a mailbox is here, including the property the
 * whole design rests on: the response to a username that exists and a username
 * that does not must be indistinguishable.
 */

test.describe.configure({ mode: 'serial' });

const PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'CoveDev123!';
const STUDENT = process.env.E2E_STUDENT_USERNAME ?? 'cove-student';

const acceptedPanel = /If an account exists for this username|이 아이디로 만든 계정이 있다면/;
const submitLabel = /Send reset link|재설정 링크 보내기/;

async function requestRecovery(page: Page, username: string): Promise<string> {
  await page.goto('/auth/forgot');
  await page.locator('input[name="username"]').fill(username);
  const submit = page.getByRole('button', { name: submitLabel });
  await expect(submit).toBeEnabled();
  await submit.click();

  const panel = page.getByRole('status');
  await expect(panel).toBeVisible();
  return (await panel.innerText()).trim();
}

test('a known and an unknown username produce the same answer', async ({ page }) => {
  const known = await requestRecovery(page, STUDENT);
  const unknown = await requestRecovery(page, 'no-such-person-42');

  expect(known).toMatch(acceptedPanel);
  expect(known).toBe(unknown);
  // Nothing that could identify the account is echoed back.
  expect(known).not.toContain('@');
  expect(known).not.toContain(STUDENT);
});

test('a malformed username is rejected without asking the server', async ({ page }) => {
  await page.goto('/auth/forgot');
  await page.locator('input[name="username"]').fill('min');
  const submit = page.getByRole('button', { name: submitLabel });
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('the resend control holds for its cooldown', async ({ page }) => {
  await requestRecovery(page, STUDENT);

  const resend = page.getByRole('button', { name: /Send again|다시 보내기/ });
  await expect(resend).toBeDisabled();
});

test('a recovery link with no usable token is refused and starts nothing', async ({
  page,
}) => {
  for (const query of [
    '',
    '?type=recovery',
    '?token_hash=made-up&type=signup',
    '?token_hash=made-up&next=https://evil.test',
  ]) {
    await page.goto(`/auth/recovery/confirm${query}`);

    await expect(
      page.getByRole('heading', { name: /cannot be used|사용할 수 없는/ }),
    ).toBeVisible();
    const cookies = await page.context().cookies();
    expect(cookies.some(({ name }) => name === 'cove_password_recovery')).toBe(false);
  }
});

test('opening a recovery link does not spend its token', async ({ page }) => {
  const response = await page.goto(
    '/auth/recovery/confirm?token_hash=a-token-shaped-value&type=recovery',
  );

  // The interstitial is rendered, and nothing has been exchanged: no Supabase
  // session, no capability. A mail scanner gets exactly this and no more.
  await expect(page.getByRole('button', { name: /Continue|계속하기/ })).toBeVisible();
  const cookies = await page.context().cookies();
  expect(cookies.some(({ name }) => name === 'cove_password_recovery')).toBe(false);
  expect(cookies.some(({ name }) => name.startsWith('sb-'))).toBe(false);

  // Not cacheable, and carrying no referrer. The exact production string is
  // `private, no-cache, no-store, max-age=0, must-revalidate`; `next dev`,
  // which this suite runs against, sends `no-cache, must-revalidate` for every
  // page. Confirming `no-store` at the deployed edge is an operational check.
  expect(response?.headers()['cache-control']).toMatch(/no-cache|no-store/);
  expect(response?.headers()['referrer-policy']).toBe('no-referrer');
});

test('an ordinary signed-in session cannot reach the reset form', async ({ page }) => {
  await signInAs({ page, identifier: STUDENT, password: PASSWORD });
  await page.goto('/auth/reset-password');

  await expect(
    page.getByRole('heading', { name: /cannot be used|사용할 수 없는/ }),
  ).toBeVisible();
  await expect(page.locator('input[name="newPassword"]')).toHaveCount(0);
});

test('Kakao is absent from sign in and sign up while its flag is off', async ({
  page,
}) => {
  test.skip(
    process.env.NEXT_PUBLIC_KAKAO_AUTH_ENABLED === 'true',
    'Kakao is enabled in this environment.',
  );

  for (const path of ['/auth/login', '/auth/signup']) {
    await page.goto(path);
    await expect(page.getByRole('button', { name: /Google/ })).toBeVisible();

    await expect(page.getByText(/Kakao|카카오/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Kakao/i })).toHaveCount(0);
  }
});
