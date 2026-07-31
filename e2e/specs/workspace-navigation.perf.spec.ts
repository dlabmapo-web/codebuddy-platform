import { expect, test, type Page } from '@playwright/test';

/**
 * Previous/Next must not pay a server round trip or restart the Python runtime.
 *
 * v1 was functional but slow in production for exactly this reason, so the
 * budget is asserted rather than eyeballed.
 */

const STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL ?? 'student@cove.test';
const STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'CoveDev123!';
const COURSE_TITLE = 'E2E Python Basics';
const ECHO_TITLE = 'Echo the input';
const SUM_TITLE = 'Sum two numbers';

/**
 * An in-place swap off a prefetched neighbour measures ~60ms locally. The
 * budget sits well above that but far below the ~1,000ms a `router.push`
 * costs, so a regression back to routing fails here instead of shipping.
 */
const NAVIGATION_BUDGET_MS = 300;

let academyId = '';

async function signIn(page: Page) {
  await page.goto('/auth/login');
  await page.getByRole('textbox', { name: /email/i }).fill(STUDENT_EMAIL);
  await page.locator('input[type="password"]').fill(STUDENT_PASSWORD);
  await page.getByRole('button', { name: /sign in|로그인/i }).click();
  await page.waitForURL(/\/studio\/academies\//, { timeout: 30_000 });
  academyId = /\/studio\/academies\/([0-9a-f-]+)/.exec(page.url())?.[1] ?? '';
}

async function openEcho(page: Page) {
  await page.goto(`/studio/academies/${academyId}/learn/courses`);
  await page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { name: COURSE_TITLE }) })
    .click();
  await page.getByPlaceholder(/search problems|문제 검색/i).fill(ECHO_TITLE);
  await page.getByText(ECHO_TITLE).click();
  await page.waitForURL(/\/learn\/exercises\//);
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 });
  // Wait for the runtime to be ready so the measurement starts from a warm
  // workspace, which is the state a student actually navigates from.
  await expect(page.getByRole('button', { name: /^run$|^실행$/i })).toBeEnabled({
    timeout: 90_000,
  });
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await openEcho(page);
});

test('next lands within the interaction budget', async ({ page }) => {
  const started = Date.now();
  await page.getByRole('button', { name: /next problem|다음 문제/i }).click();
  await expect(page.getByRole('heading', { name: SUM_TITLE })).toBeVisible();
  const elapsed = Date.now() - started;

  console.log(`next-problem: ${elapsed}ms`);
  expect(elapsed).toBeLessThan(NAVIGATION_BUDGET_MS);
});

test('navigation keeps the editor and Python runtime alive', async ({ page }) => {
  // A remount tears down the Pyodide worker and reloads the runtime, the single
  // most expensive thing a navigation can do here. Tagging the editor's DOM
  // node detects it: React discards that node on unmount, so a surviving tag
  // proves the component instance survived. Marking `window` would not — a
  // client-side navigation preserves `window` either way.
  await page.evaluate(() => {
    document.querySelector('.monaco-editor')?.setAttribute('data-e2e-generation', '1');
  });

  await page.getByRole('button', { name: /next problem|다음 문제/i }).click();
  await expect(page.getByRole('heading', { name: SUM_TITLE })).toBeVisible();

  await expect(page.locator('.monaco-editor[data-e2e-generation="1"]')).toHaveCount(
    1,
  );

  // Run must be usable immediately, without waiting for Pyodide again.
  await expect(page.getByRole('button', { name: /^run$|^실행$/i })).toBeEnabled({
    timeout: 3_000,
  });
});

test('navigation issues no duplicate workspace fetches', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('getExerciseWorkspace') || url.includes('/rpc/learn')) {
      calls.push(url);
    }
  });

  await page.getByRole('button', { name: /next problem|다음 문제/i }).click();
  await expect(page.getByRole('heading', { name: SUM_TITLE })).toBeVisible();

  console.log(`workspace fetches during navigation: ${calls.length}`);
  // At most one: the prefetched neighbour should already be in hand.
  expect(calls.length).toBeLessThanOrEqual(1);
});

test('the terminal divider resizes the terminal', async ({ page }) => {
  // Regression guard: the vertical pane shipped with its container ref never
  // attached, so the divider silently did nothing on every drag.
  const divider = page.getByRole('separator').last();
  await expect(divider).toBeVisible();

  const panel = page.getByText(/^terminal$|^터미널$/i).locator('xpath=ancestor::div[1]/..');
  const before = (await panel.boundingBox())?.height ?? 0;
  expect(before).toBeGreaterThan(0);

  const box = (await divider.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // Drag upward: the terminal grows as its top edge rises.
  await page.mouse.move(box.x + box.width / 2, box.y - 120, { steps: 12 });
  await page.mouse.up();

  const after = (await panel.boundingBox())?.height ?? 0;
  console.log(`terminal height: ${Math.round(before)} -> ${Math.round(after)}`);
  expect(after).toBeGreaterThan(before + 80);
});
