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
  landing = /\/studio\/academies\//,
}: {
  page: Page;
  identifier: string;
  password: string;
  /**
   * Where this account is expected to arrive. Overridable because not every
   * account lands in an academy: a platform operator belongs to none by
   * design and is routed to the console instead, so the default pattern would
   * wait out its timeout on a page that is already correct.
   */
  landing?: RegExp;
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
  await page.waitForURL(landing, { timeout: 30_000 });

  // Empty for an account with no academy. Callers that need one pass a landing
  // pattern that guarantees it.
  const academyId = academyIdFrom(page);
  sessions.set(key, {
    academyId,
    landingPath: new URL(page.url()).pathname,
    state: await page.context().storageState(),
  });
  return academyId;
}

function academyIdFrom(page: Page): string {
  return /\/studio\/academies\/([0-9a-f-]+)/.exec(page.url())?.[1] ?? '';
}
