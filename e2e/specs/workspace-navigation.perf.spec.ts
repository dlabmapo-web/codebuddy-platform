import { expect, test, type Page } from '@playwright/test';

import { routes } from '../../packages/web/src/lib/routes';
import { signInAs } from '../support/auth';

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

let academySlug = '';

async function signIn(page: Page) {
  academySlug = await signInAs({
    page,
    identifier: STUDENT_EMAIL,
    password: STUDENT_PASSWORD,
  });
}

async function openEcho(page: Page) {
  await page.goto(routes.academyLearnCourses(academySlug));
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
  await expect(
    page.getByRole('button', { name: /^run$|^실행$/i }),
  ).toBeEnabled({ timeout: 90_000 });
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await openEcho(page);
});

test('next lands within the interaction budget', async ({ page }) => {
  const started = Date.now();
  await page.getByRole('button', { name: /^next$|^다음$/i }).click();
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

  await page.getByRole('button', { name: /^next$|^다음$/i }).click();
  await expect(page.getByRole('heading', { name: SUM_TITLE })).toBeVisible();

  await expect(page.locator('.monaco-editor[data-e2e-generation="1"]')).toHaveCount(
    1,
  );

  // Run must be usable immediately, without waiting for Pyodide again.
  await expect(
    page.getByRole('button', { name: /^run$|^실행$/i }),
  ).toBeEnabled({ timeout: 3_000 });
});

test('navigation issues no duplicate workspace fetches', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('getExerciseWorkspace') || url.includes('/rpc/learn')) {
      calls.push(url);
    }
  });

  await page.getByRole('button', { name: /^next$|^다음$/i }).click();
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

  const panel = page.getByRole('tabpanel').locator('..');
  const before = (await panel.boundingBox())?.height ?? 0;
  expect(before).toBeGreaterThan(0);

  const box = (await divider.boundingBox())!;
  // The visible rule stays quiet, but the mouse target must be large enough
  // to acquire without pixel hunting.
  expect(box.height).toBeGreaterThanOrEqual(10);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // Drag upward: the terminal grows as its top edge rises.
  await page.mouse.move(box.x + box.width / 2, box.y - 120, { steps: 12 });
  await page.mouse.up();

  const afterUp = (await panel.boundingBox())?.height ?? 0;
  expect(afterUp).toBeGreaterThan(before + 80);
  const panelAfterUp = (await panel.boundingBox())!;
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  // A long problem statement must not make the editor pane use an off-screen
  // bottom edge. That feedback loop let the output grow past the viewport and
  // made every later upward drag appear stuck at its maximum.
  expect(panelAfterUp.y + panelAfterUp.height).toBeLessThanOrEqual(
    viewportHeight + 1,
  );

  const movedBox = (await divider.boundingBox())!;
  await page.mouse.move(
    movedBox.x + movedBox.width / 2,
    movedBox.y + movedBox.height / 2,
  );
  await page.mouse.down();
  // Drag back down as a separate gesture: shrinking must be as reliable as
  // growing, including after pointer capture has been released once.
  await page.mouse.move(
    movedBox.x + movedBox.width / 2,
    movedBox.y + movedBox.height / 2 + 100,
    { steps: 10 },
  );
  await page.mouse.up();

  const afterDown = (await panel.boundingBox())?.height ?? 0;
  console.log(
    `terminal height: ${Math.round(before)} -> ${Math.round(afterUp)} -> ${Math.round(afterDown)}`,
  );
  expect(afterDown).toBeLessThan(afterUp - 70);
});
