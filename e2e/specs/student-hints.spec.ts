import { expect, test, type Page } from '@playwright/test';

/**
 * Progressive hint reveal in the student workspace.
 *
 * The rule under test is where help lives and how much of it arrives at once:
 * one activation reveals one authored hint, inside the problem statement,
 * after the statement content it supports. Shipping this in the fullscreen
 * header is what made the feature look missing — at narrower widths the label
 * collapsed and the only trace of it was a lightbulb among unrelated workspace
 * actions.
 *
 * Runs in both engines and at both widths, because the interaction is a
 * wrapping flex row inside a percentage-sized split pane.
 *
 * Requires `pnpm --filter @cove/api db:seed` and `db:seed:e2e`.
 */

const STUDENT_USERNAME = process.env.E2E_STUDENT_USERNAME ?? 'cove-student';
const STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'CoveDev123!';
const COURSE_TITLE = 'E2E Python Basics';
/** The only seeded exercise with hints, in the order the service returns. */
const HINTED_TITLE = 'Echo the input';
const HINTS = [
  'Read one line with input().',
  'Store what you read in a variable.',
  'Print the variable back out.',
];
/** Seeded with no hints at all, which is its own branch of the design. */
const UNHINTED_TITLE = 'Sum two numbers';

async function signIn(page: Page) {
  await page.goto('/auth/login');
  await page.locator('input[name="identifier"]').fill(STUDENT_USERNAME);
  await page.locator('input[type="password"]').fill(STUDENT_PASSWORD);
  await page.getByRole('button', { name: /sign in|로그인/i }).click();
  await page.waitForURL(/\/studio\/academies\//, { timeout: 30_000 });
}

/** Walks the outline to an exercise, as a student would. */
async function openExercise(page: Page, title: string) {
  await page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { name: COURSE_TITLE }) })
    .first()
    .click();
  await page.waitForURL(/\/learn\/courses\/[0-9a-f-]+$/, { timeout: 30_000 });
  // Only the first module starts expanded; searching reveals every match.
  await page.getByPlaceholder(/search problems|문제 검색/i).fill(title);
  await page.getByText(title).click();
  await page.waitForURL(/\/learn\/exercises\//, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

const statement = (page: Page) => page.getByTestId('problem-statement');
const reveal = (page: Page) => page.getByTestId('reveal-hint');
const toggleHints = (page: Page) => page.getByTestId('toggle-hints');

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('one activation reveals one hint, in authored order', async ({ page }) => {
  await openExercise(page, HINTED_TITLE);

  await expect(reveal(page)).toContainText(/3/);
  const initialStatement = await statement(page).boundingBox();
  const revealControl = await reveal(page).boundingBox();
  expect(revealControl!.width).toBeLessThan(initialStatement!.width * 0.75);
  for (const hint of HINTS) {
    await expect(statement(page)).not.toContainText(hint);
  }

  await reveal(page).click();
  await expect(statement(page)).toContainText(HINTS[0]!);
  await expect(statement(page)).not.toContainText(HINTS[1]!);
  await expect(reveal(page)).toContainText(/2/);
  await expect(page.getByTestId('hint-announcement')).toContainText(HINTS[0]!);
  const visibilityControl = await toggleHints(page).boundingBox();
  expect(visibilityControl!.width).toBeLessThan(initialStatement!.width * 0.75);

  // Closing is only visual: reopening restores the same progress and makes
  // the next progressive reveal available again.
  await toggleHints(page).click();
  await expect(toggleHints(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(toggleHints(page)).toBeFocused();
  await expect(statement(page)).not.toContainText(HINTS[0]!);
  await expect(reveal(page)).toHaveCount(0);

  await toggleHints(page).click();
  await expect(toggleHints(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(toggleHints(page)).toBeFocused();
  await expect(statement(page)).toContainText(HINTS[0]!);
  await expect(reveal(page)).toContainText(/2/);

  await reveal(page).click();
  await expect(statement(page)).toContainText(HINTS[1]!);
  await expect(reveal(page)).toContainText(/1/);

  await reveal(page).click();
  // Every hint stays on screen; only the exhausted offer goes away.
  for (const hint of HINTS) {
    await expect(statement(page)).toContainText(hint);
  }
  await expect(reveal(page)).toHaveCount(0);
  await expect(
    statement(page).getByText(HINTS[2]!).locator('xpath=..'),
  ).toBeFocused();

  // Ordered-list semantics stay intact; the connector is a pseudo-element,
  // not a decorative span inserted among list items.
  expect(
    await statement(page)
      .locator('ol')
      .evaluate((list) =>
        [...list.children].every((child) => child.tagName === 'LI'),
      ),
  ).toBe(true);
});

test('help sits below the statement content and leaves the header alone', async ({
  page,
}) => {
  await openExercise(page, HINTED_TITLE);

  // The action this replaces. A second entry point in the toolbar would put
  // the same job in two places at once.
  await expect(
    page.locator('header').getByRole('button', { name: /hint|힌트/i }),
  ).toHaveCount(0);

  await reveal(page).click();
  await expect(statement(page)).toContainText(HINTS[0]!);

  // The hint follows all authored content rather than interrupting the
  // description, formats, or examples.
  const hint = await statement(page).getByText(HINTS[0]!).boundingBox();
  const description = await statement(page)
    .locator('iframe')
    .first()
    .boundingBox();
  expect(hint!.y).toBeGreaterThan(description!.y + description!.height);
  const example = await statement(page)
    .getByText(/example 1|예제 1/i)
    .boundingBox();
  expect(hint!.y).toBeGreaterThan(example!.y + example!.height);

  // Inline, not an overlay: the editor is still on screen and still typeable.
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 });
});

test('an exercise without hints shows no control and no gap', async ({
  page,
}) => {
  await openExercise(page, UNHINTED_TITLE);
  await expect(statement(page)).toBeVisible();

  await expect(reveal(page)).toHaveCount(0);
  await expect(page.getByText(/need help\?|도움이 필요/i)).toHaveCount(0);
});

test('moving to another exercise starts it unrevealed', async ({ page }) => {
  await openExercise(page, HINTED_TITLE);
  await reveal(page).click();
  await expect(statement(page)).toContainText(HINTS[0]!);

  // Echo ends module 1 and Sum opens module 2, so this is a real transition
  // rather than a re-render of the same exercise.
  await page.getByRole('button', { name: /^next$|^다음$/i }).click();
  await expect(page.getByRole('heading', { name: UNHINTED_TITLE })).toBeVisible();

  await page.getByRole('button', { name: /^previous$|^이전$/i }).click();
  await expect(page.getByRole('heading', { name: HINTED_TITLE })).toBeVisible();
  await expect(statement(page)).not.toContainText(HINTS[0]!);
  await expect(reveal(page)).toContainText(/3/);
});

test('running and submitting keep revealed hints on screen', async ({ page }) => {
  await openExercise(page, HINTED_TITLE);
  await reveal(page).click();
  await reveal(page).click();

  await page.getByRole('button', { name: /^submit$|^제출$/i }).click();

  // Whatever the verdict is, help the student already asked for is not part
  // of what a submission resets.
  await expect(statement(page)).toContainText(HINTS[0]!);
  await expect(statement(page)).toContainText(HINTS[1]!);
  await expect(reveal(page)).toContainText(/1/);
});
