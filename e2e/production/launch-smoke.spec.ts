import { expect, test, type Page } from '@playwright/test';

const studioUrl = process.env.PRODUCTION_BASE_URL!;
const homeUrl = process.env.PRODUCTION_HOME_URL!;
const apiUrl = process.env.PRODUCTION_API_URL!;
const mvpUrl = process.env.PRODUCTION_MVP_URL!;
const academySlug = process.env.PRODUCTION_ACADEMY_SLUG!;

type ProductionRole = 'student' | 'teacher' | 'team_lead' | 'manager' | 'admin';

const credentials: Record<ProductionRole, { username: string; password: string }> = {
  student: {
    username: process.env.PRODUCTION_STUDENT_USERNAME!,
    password: process.env.PRODUCTION_STUDENT_PASSWORD!,
  },
  teacher: {
    username: process.env.PRODUCTION_TEACHER_USERNAME!,
    password: process.env.PRODUCTION_TEACHER_PASSWORD!,
  },
  team_lead: {
    username: process.env.PRODUCTION_TEAM_LEAD_USERNAME!,
    password: process.env.PRODUCTION_TEAM_LEAD_PASSWORD!,
  },
  manager: {
    username: process.env.PRODUCTION_MANAGER_USERNAME!,
    password: process.env.PRODUCTION_MANAGER_PASSWORD!,
  },
  admin: {
    username: process.env.PRODUCTION_ADMIN_USERNAME!,
    password: process.env.PRODUCTION_ADMIN_PASSWORD!,
  },
};

async function signIn(page: Page, role: ProductionRole) {
  await page.context().clearCookies();
  await page.goto(`${studioUrl}/login`);
  await page.locator('input[name="identifier"]').fill(credentials[role].username);
  await page.locator('input[type="password"]').fill(credentials[role].password);
  await page.getByRole('button', { name: /sign in|로그인/i }).click();

  const destination = role === 'admin'
    ? /\/admin(?:\/|$)/
    : role === 'student'
      ? new RegExp(`/academy/${academySlug}/learn/courses(?:/|$)`)
      : new RegExp(`/academy/${academySlug}(?:/|$)`);
  await page.waitForURL(destination, { timeout: 30_000 });
}

test('all public origins are available through HTTPS', async ({ request }) => {
  for (const url of [
    `${homeUrl}/`,
    `${studioUrl}/login`,
    `${apiUrl}/api/health/ready`,
    `${mvpUrl}/login`,
  ]) {
    const response = await request.get(url, { maxRedirects: 3 });
    expect(response.ok(), `${url} returned ${response.status()}`).toBe(true);
  }
});

test('Home sends visitors to Cove Studio and the preserved MVP', async ({ page }) => {
  await page.goto(homeUrl);
  await expect(page.locator(`a[href^="${studioUrl}"]`).first()).toBeVisible();
  await expect(page.locator(`a[href^="${mvpUrl}"]`).first()).toBeVisible();
});

for (const role of ['student', 'teacher', 'team_lead', 'manager', 'admin'] as const) {
  test(`${role} can sign in and reaches the canonical destination`, async ({ page }) => {
    await signIn(page, role);
    await expect(page.locator('body')).not.toContainText(/could not load|server error/i);
  });
}

test('student can open the migrated course catalog without a server error', async ({ page }) => {
  await signIn(page, 'student');
  await page.goto(`${studioUrl}/academy/${academySlug}/learn/courses`);
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/could not load|server error/i);
});

test('manager can open migrated curriculum without output validation failure', async ({ page }) => {
  await signIn(page, 'manager');
  await page.goto(`${studioUrl}/academy/${academySlug}/content/courses`);
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/could not load|output validation failed/i);
});

test('recovery entry does not leak account existence', async ({ page }) => {
  await page.goto(`${studioUrl}/forgot-password`);
  await page.locator('input[name="username"]').fill('production-smoke-does-not-exist');
  await page.getByRole('button', { name: /send reset link|재설정 링크 보내기/i }).click();
  await expect(page.getByRole('status')).toBeVisible();
  await expect(page.getByRole('status')).not.toContainText('@');
});
