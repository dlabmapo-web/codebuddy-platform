import { expect, test, type Page } from '@playwright/test';

/**
 * The fullscreen curriculum navigator's geometry.
 *
 * The rule under test is the one that is easy to get wrong and impossible to
 * see in a unit test: whenever the workspace shows the statement and the
 * editor at once, the panel must take width rather than float over them. A
 * panel covering the problem is a panel that hides the thing the reader opened
 * it to navigate — which is exactly what shipping this at the `lg` breakpoint
 * did to every window narrower than 1024px.
 *
 * Requires `pnpm --filter @cove/api db:seed` and `db:seed:e2e`.
 */

const STUDENT_USERNAME = process.env.E2E_STUDENT_USERNAME ?? 'cove-student';
const STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'CoveDev123!';
const COURSE_TITLE = 'E2E Python Basics';
const EXERCISE_TITLE = 'Echo the input';

async function openWorkspace(page: Page) {
  await page.goto('/auth/login');
  await page.locator('input[name="identifier"]').fill(STUDENT_USERNAME);
  await page.locator('input[type="password"]').fill(STUDENT_PASSWORD);
  await page.getByRole('button', { name: /sign in|로그인/i }).click();
  await page.waitForURL(/\/studio\/academies\//, { timeout: 30_000 });

  await page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { name: COURSE_TITLE }) })
    .first()
    .click();
  await page.waitForURL(/\/learn\/courses\/[0-9a-f-]+$/, { timeout: 30_000 });
  await page.getByText(EXERCISE_TITLE).first().click();
  await page.waitForURL(/\/learn\/exercises\//, { timeout: 30_000 });
}

const trigger = (page: Page) =>
  page.getByRole('button', { name: /course outline/i }).first();
const panel = (page: Page) =>
  page.locator('aside[data-collab-surface="curriculum"]');
const statement = (page: Page) =>
  page.locator('[data-collab-surface="statement"]');
const problem = (page: Page) => page.getByTestId('problem-statement');

async function expectStatementContentContained(page: Page) {
  const statementBox = (await statement(page).boundingBox())!;
  const problemBox = (await problem(page).boundingBox())!;
  const scroll = await statement(page).evaluate((node) => ({
    left: node.scrollLeft,
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
  }));

  expect(scroll.left).toBe(0);
  expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth);
  expect(problemBox.x).toBeGreaterThanOrEqual(statementBox.x);
  expect(problemBox.x + problemBox.width).toBeLessThanOrEqual(
    statementBox.x + statementBox.width + 1,
  );
}

test('starts closed, and opens as a column that takes width from the panes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkspace(page);

  // Fresh entries start closed: the workspace is what the student came for.
  await expect(panel(page)).toHaveCount(0);
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');

  const before = await statement(page).boundingBox();
  await trigger(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');

  const panelBox = (await panel(page).boundingBox())!;
  const after = (await statement(page).boundingBox())!;

  // A dedicated column, not a cover: the statement begins where the panel
  // ends, and it gave up exactly the width the panel took.
  expect(panelBox.x).toBe(0);
  expect(Math.round(after.x)).toBe(Math.round(panelBox.width));
  expect(after.width).toBeLessThan(before!.width);
  expect(after.width).toBeGreaterThan(0);
  await expectStatementContentContained(page);
});

/**
 * The width the bug was reported at. Two panes are on screen here, so the
 * panel must still be a column even though this is below `lg`.
 */
test('is still a column at two-pane widths below the desktop breakpoint', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await openWorkspace(page);
  await trigger(page).click();

  const panelBox = (await panel(page).boundingBox())!;
  const statementBox = (await statement(page).boundingBox())!;

  expect(
    await panel(page).evaluate((node) => getComputedStyle(node).position),
  ).toBe('static');
  expect(Math.round(statementBox.x)).toBe(Math.round(panelBox.width));
  await expectStatementContentContained(page);
});

/**
 * Below the split the workspace is a single pane behind tabs, so there is no
 * width to take. It overlays — and must stay non-modal, which is what lets the
 * reader keep using the workspace underneath instead of being trapped.
 */
test('overlays without trapping focus once the panes stack', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 900 });
  await openWorkspace(page);
  await trigger(page).click();

  const panelBox = (await panel(page).boundingBox())!;
  expect(
    await panel(page).evaluate((node) => getComputedStyle(node).position),
  ).toBe('absolute');
  // A margin the workspace stays visible through, rather than a full cover.
  expect(panelBox.width).toBeLessThan(760);
  await expect(panel(page)).not.toHaveAttribute('aria-modal', 'true');
});

test('closes on Escape and returns focus to the trigger', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkspace(page);
  await trigger(page).click();
  await expect(panel(page)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await expect(trigger(page)).toBeFocused();
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
});

test('moves from any row and reconciles browser Back through the same workspace', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkspace(page);
  const originalUrl = page.url();
  await trigger(page).click();

  // Selecting the row already displayed is a true no-op: the URL, open panel,
  // and workspace remain exactly where they are.
  await panel(page)
    .getByRole('button')
    .filter({ hasText: EXERCISE_TITLE })
    .click();
  await expect(page).toHaveURL(originalUrl);
  await expect(panel(page)).toBeVisible();

  await panel(page)
    .getByRole('button')
    .filter({ hasText: 'Doing arithmetic' })
    .click();
  await panel(page)
    .getByRole('button')
    .filter({ hasText: 'Adding numbers' })
    .click();
  await panel(page)
    .getByRole('button')
    .filter({ hasText: 'Sum two numbers' })
    .click();
  await expect(page.getByRole('heading', { name: 'Sum two numbers' })).toBeVisible();
  await expect(page).not.toHaveURL(originalUrl);
  await expect(panel(page)).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(originalUrl);
  await expect(page.getByRole('heading', { name: EXERCISE_TITLE })).toBeVisible();
  await expect(panel(page)).toBeVisible();
});
