import { expect, test, type Page } from '@playwright/test';

import { routes } from '../../packages/web/src/lib/routes';
import { signInAs } from '../support/auth';

/**
 * Progressive hint reveal in the student workspace.
 *
 * The rule under test is how much help arrives at once: one activation reveals
 * one authored hint, in the order they were written, and nothing the student
 * has not asked for is on screen.
 *
 * The hints live in a dialog rather than in the statement. That is a pointer
 * decision as much as a layout one: the statement is the box a shared cursor
 * is measured against during live monitoring, and a teacher who sees every
 * hint would otherwise be reading a taller statement than the student — which
 * put the two arrows on different lines. What stays in the statement is one
 * control of fixed height, the same for both roles.
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

let academySlug = '';

async function signIn(page: Page): Promise<string> {
  return signInAs({
    page,
    identifier: STUDENT_USERNAME,
    password: STUDENT_PASSWORD,
  });
}

/**
 * Walks the outline to an exercise, as a student would.
 *
 * Starts from the course list explicitly rather than from wherever signing in
 * happens to land. A student now arrives on their academy overview, which has
 * no course link for this filter to find — the helper timed out there long
 * before it reached anything this file is about.
 */
async function openExercise(page: Page, title: string) {
  await page.goto(routes.academyLearnCourses(academySlug));
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
const openHints = (page: Page) => page.getByTestId('open-hints');
const reveal = (page: Page) => page.getByTestId('reveal-hint');
const dialog = (page: Page) => page.getByRole('dialog');

/**
 * The statement's height once it has stopped moving.
 *
 * The description renders in an iframe that measures itself and resizes as
 * fonts and images settle, so a height read straight after load is not the
 * height a moment later. Comparing one of those to a settled one measures the
 * iframe, not the thing under test.
 */
async function settledStatementHeight(page: Page): Promise<number> {
  let previous = -1;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const box = await statement(page).boundingBox();
    const height = box?.height ?? -1;
    if (height > 0 && height === previous) return height;
    previous = height;
    await page.waitForTimeout(150);
  }
  return previous;
}

test.beforeEach(async ({ page }) => {
  academySlug = await signIn(page);
});

test('one activation reveals one hint, in authored order', async ({ page }) => {
  await openExercise(page, HINTED_TITLE);

  // Nothing is on screen before it is asked for, in the statement or anywhere.
  for (const hint of HINTS) {
    await expect(page.getByText(hint)).toHaveCount(0);
  }

  await openHints(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(reveal(page)).toContainText(/3/);

  await reveal(page).click();
  await expect(dialog(page)).toContainText(HINTS[0]!);
  await expect(dialog(page)).not.toContainText(HINTS[1]!);
  await expect(reveal(page)).toContainText(/2/);
  await expect(page.getByTestId('hint-announcement')).toContainText(HINTS[0]!);

  await reveal(page).click();
  await expect(dialog(page)).toContainText(HINTS[1]!);
  await expect(reveal(page)).toContainText(/1/);

  await reveal(page).click();
  // Every hint stays on screen; only the exhausted offer goes away.
  for (const hint of HINTS) {
    await expect(dialog(page)).toContainText(hint);
  }
  await expect(reveal(page)).toHaveCount(0);
  // The card itself, not an ancestor: `..` from the text node also matches the
  // dialog, which is a strict-mode violation rather than a wrong answer.
  await expect(dialog(page).getByRole('listitem').last()).toBeFocused();

  // Ordered-list semantics stay intact; the connector is a pseudo-element,
  // not a decorative span inserted among list items.
  expect(
    await dialog(page)
      .locator('ol')
      .evaluate((list) =>
        [...list.children].every((child) => child.tagName === 'LI'),
      ),
  ).toBe(true);
});

test('closing the dialog keeps what was revealed and returns focus', async ({
  page,
}) => {
  await openExercise(page, HINTED_TITLE);
  await openHints(page).click();
  await reveal(page).click();
  await expect(dialog(page)).toContainText(HINTS[0]!);

  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  // Dismissed, not discarded: the student is back where they were, and the
  // hint they spent is still theirs.
  await expect(openHints(page)).toBeFocused();
  await expect(statement(page)).not.toContainText(HINTS[0]!);

  await openHints(page).click();
  await expect(dialog(page)).toContainText(HINTS[0]!);
  await expect(reveal(page)).toContainText(/2/);
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

  // The control follows all authored content rather than interrupting the
  // description, formats, or examples.
  const control = await openHints(page).boundingBox();
  const description = await statement(page)
    .locator('iframe')
    .first()
    .boundingBox();
  expect(control!.y).toBeGreaterThan(description!.y + description!.height);
  const example = await statement(page)
    .getByText(/example 1|예제 1/i)
    .boundingBox();
  expect(control!.y).toBeGreaterThan(example!.y + example!.height);

  // A control, not a column: it takes a fraction of the pane it sits in.
  const pane = await statement(page).boundingBox();
  expect(control!.width).toBeLessThan(pane!.width * 0.75);
});

test('the statement is the same height however many hints are open', async ({
  page,
}) => {
  // The property the shared pointer depends on. A teacher sees every hint and
  // a student only what they have opened; if that changed the statement's
  // height, the same coordinate would land on different lines on the two
  // screens — which is exactly the bug that moved hints out of here.
  await openExercise(page, HINTED_TITLE);
  const before = await settledStatementHeight(page);

  await openHints(page).click();
  await reveal(page).click();
  await reveal(page).click();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);

  const after = await settledStatementHeight(page);
  expect(after).toBeCloseTo(before, 0);
});

test('an exercise without hints shows no control and no gap', async ({
  page,
}) => {
  await openExercise(page, UNHINTED_TITLE);
  await expect(statement(page)).toBeVisible();

  await expect(openHints(page)).toHaveCount(0);
  await expect(page.getByText(/need help\?|도움이 필요/i)).toHaveCount(0);
});

test('moving to another exercise starts it unrevealed', async ({ page }) => {
  await openExercise(page, HINTED_TITLE);
  await openHints(page).click();
  await reveal(page).click();
  await page.keyboard.press('Escape');

  // Echo ends module 1 and Sum opens module 2, so this is a real transition
  // rather than a re-render of the same exercise.
  await page.getByRole('button', { name: /^next$|^다음$/i }).click();
  await expect(page.getByRole('heading', { name: UNHINTED_TITLE })).toBeVisible();

  await page.getByRole('button', { name: /^previous$|^이전$/i }).click();
  await expect(page.getByRole('heading', { name: HINTED_TITLE })).toBeVisible();
  await openHints(page).click();
  await expect(dialog(page)).not.toContainText(HINTS[0]!);
  await expect(reveal(page)).toContainText(/3/);
});

test('running and submitting keep revealed hints', async ({ page }) => {
  await openExercise(page, HINTED_TITLE);
  await openHints(page).click();
  await reveal(page).click();
  await reveal(page).click();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /^submit$|^제출$/i }).click();

  // Whatever the verdict is, help the student already asked for is not part
  // of what a submission resets.
  await openHints(page).click();
  await expect(dialog(page)).toContainText(HINTS[0]!);
  await expect(dialog(page)).toContainText(HINTS[1]!);
  await expect(reveal(page)).toContainText(/1/);
});
