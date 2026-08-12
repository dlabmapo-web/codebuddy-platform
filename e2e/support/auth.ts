import type { BrowserContext, Page } from '@playwright/test';

type StoredState = Awaited<ReturnType<BrowserContext['storageState']>>;
type StoredSession = {
  state: StoredState;
  academyId: string;
  landingPath: string;
};

/**
 * Authentication is rate-limited in production, including the username-to-email
 * resolver used by this form. Playwright creates an isolated context per test,
 * so signing in from every beforeEach would exhaust that limit while testing a
 * single-user journey. Keep the isolation, but copy the real session established
 * by the first UI sign-in into later contexts in this worker.
 */
const sessions = new Map<string, StoredSession>();

export async function signInAs({
  page,
  identifier,
  password,
}: {
  page: Page;
  identifier: string;
  password: string;
}): Promise<string> {
  const key = `${identifier}\u0000${password}`;
  const cached = sessions.get(key);

  await page.context().clearCookies();
  if (cached) {
    await page.context().addCookies(cached.state.cookies);
    await page.goto(cached.landingPath);
    return cached.academyId;
  }

  await page.goto('/auth/login');
  await page.locator('input[name="identifier"]').fill(identifier);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /sign in|로그인/i }).click();
  await page.waitForURL(/\/studio\/academies\//, { timeout: 30_000 });

  const academyId = academyIdFrom(page);
  sessions.set(key, {
    academyId,
    landingPath: new URL(page.url()).pathname,
    state: await page.context().storageState(),
  });
  return academyId;
}

function academyIdFrom(page: Page): string {
  const academyId = /\/studio\/academies\/([0-9a-f-]+)/.exec(page.url())?.[1];
  if (!academyId) throw new Error(`Sign-in did not resolve an academy: ${page.url()}`);
  return academyId;
}
