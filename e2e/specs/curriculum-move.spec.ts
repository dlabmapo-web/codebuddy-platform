import { expect, test, type Locator, type Page } from '@playwright/test';

import { routes } from '../../packages/web/src/lib/routes';
import { signInAs } from '../support/auth';

/**
 * Moving lectures and problems anywhere in a course, from the builder.
 *
 * Requires `pnpm --filter @cove/api db:seed` and `db:seed:e2e`. Lecture moves
 * run on a course this suite creates, so nothing seeded is reordered. The
 * problem move runs on the seeded sandbox course and is undone from the toast,
 * which is itself under test, leaving the sandbox as it was found.
 *
 * Serial: the later tests continue the course the first one builds.
 */
test.describe.configure({ mode: 'serial' });

const PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'CoveDev123!';
const TEAM_LEAD = 'teamlead@cove.test';
const SANDBOX_COURSE = 'Manual Testing Sandbox';
const COURSE_TITLE = `Playwright Moves ${Date.now()}`;

let academySlug = '';
let courseUrl = '';

async function openBuilder(page: Page) {
  academySlug = await signInAs({ page, identifier: TEAM_LEAD, password: PASSWORD });
  if (courseUrl) await page.goto(courseUrl);
}

const rowMenu = (page: Page, title: string) =>
  page.getByRole('button', {
    name: new RegExp(`(Actions for .*“${escape(title)}”|‘${escape(title)}’ 작업 메뉴)`),
  });

async function openMoveDialog(page: Page, title: string): Promise<Locator> {
  await rowMenu(page, title).click();
  await page.getByRole('menuitem', { name: /Move to…|위치 옮기기…/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

/** A module card, found by its header title. */
const moduleCard = (page: Page, title: string) =>
  page.locator('article').filter({ has: page.getByText(title, { exact: true }) });

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('builds a course with two chapters to move between', async ({ page }) => {
  await openBuilder(page);
  await page.goto(routes.academyCourses(academySlug));
  await page.getByRole('button', { name: /New course|새 코스/ }).click();
  await page.getByRole('textbox').first().fill(COURSE_TITLE);
  await page.getByRole('button', { name: /Create and open|만들고 열기/ }).click();
  await page.waitForURL(/\/courses\/[0-9a-f-]+$/, { timeout: 30_000 });
  courseUrl = page.url();

  for (const chapter of ['Chapter A', 'Chapter B']) {
    await page.getByPlaceholder(/New module title|새 모듈 제목/).fill(chapter);
    await page.getByRole('button', { name: /^(Add module|모듈 추가)$/ }).click();
    await expect(page.getByText(chapter, { exact: true })).toBeVisible();
  }
  for (const lecture of ['Lecture 1', 'Lecture 2']) {
    await moduleCard(page, 'Chapter A')
      .getByRole('button', { name: /^(Add lecture|강의 추가)$/ })
      .click();
    await page.getByPlaceholder(/Lecture title|강의 제목/).fill(lecture);
    await page.getByRole('button', { name: /^(Add lecture|강의 추가)$/ }).first().click();
    await expect(page.getByText(lecture, { exact: true })).toBeVisible();
  }
});

test('moves a lecture to another chapter, then undoes it', async ({ page }) => {
  await openBuilder(page);

  const dialog = await openMoveDialog(page, 'Lecture 2');
  // Opens on the current place and commits to nothing.
  await expect(dialog.getByRole('radio', { name: /Chapter A/ })).toBeChecked();
  await expect(dialog.getByRole('button', { name: /^(Move|옮기기)$/ })).toBeDisabled();

  await dialog.getByRole('radio', { name: /Chapter B/ }).check();
  await expect(dialog.getByText(/Lecture 2.*Chapter B/)).toBeVisible();
  await dialog.getByRole('button', { name: /^(Move|옮기기)$/ }).click();
  await expect(dialog).toBeHidden();

  await expect(moduleCard(page, 'Chapter B').getByText('Lecture 2', { exact: true })).toBeVisible();
  await expect(moduleCard(page, 'Chapter A').getByText('Lecture 2', { exact: true })).toHaveCount(0);

  const toast = page.getByRole('status');
  await expect(toast).toContainText('Lecture 2');
  await toast.getByRole('button', { name: /^(Undo|되돌리기)$/ }).click();
  await expect(toast).toContainText(/Move undone|되돌렸습니다/);
  await expect(moduleCard(page, 'Chapter A').getByText('Lecture 2', { exact: true })).toBeVisible();
});

test('moves a lecture using only the keyboard', async ({ page }) => {
  await openBuilder(page);

  await rowMenu(page, 'Lecture 1').focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: /Move to…|위치 옮기기…/ }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await dialog.getByRole('radio', { name: /Chapter A/ }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByRole('radio', { name: /Chapter B/ })).toBeChecked();
  await page.keyboard.press('Enter');

  await expect(dialog).toBeHidden();
  await expect(moduleCard(page, 'Chapter B').getByText('Lecture 1', { exact: true })).toBeVisible();
});

test('moves a problem to another lecture and back', async ({ page }) => {
  academySlug = await signInAs({ page, identifier: TEAM_LEAD, password: PASSWORD });
  await page.goto(routes.academyCourses(academySlug));
  await page.getByRole('link', { name: SANDBOX_COURSE }).first().click();
  await page.waitForURL(/\/courses\/[0-9a-f-]+$/, { timeout: 30_000 });

  const firstProblemMenu = page
    .getByRole('button', { name: /(Actions for Problem|문제 ‘)/ })
    .first();
  const label = (await firstProblemMenu.getAttribute('aria-label')) ?? '';
  const title = /[“‘](.+)[”’]/.exec(label)?.[1] ?? '';
  expect(title).not.toBe('');

  const dialog = await openMoveDialog(page, title);
  // Another lecture: the first destination that is not the current one. Its
  // chapter may be collapsed, so search for it instead of expanding by hand.
  const destinations = dialog.getByRole('radio');
  const count = await destinations.count();
  let target: Locator | null = null;
  for (let index = 0; index < count; index += 1) {
    const candidate = destinations.nth(index);
    if ((await candidate.getAttribute('name')) !== 'move-destination') continue;
    if (!(await candidate.isChecked())) {
      target = candidate;
      break;
    }
  }
  test.skip(target === null, 'The sandbox course has a single lecture.');
  await target!.check();
  await dialog.getByRole('button', { name: /^(Move|옮기기)$/ }).click();
  await expect(dialog).toBeHidden();

  const toast = page.getByRole('status');
  await expect(toast).toContainText(title);
  await toast.getByRole('button', { name: /^(Undo|되돌리기)$/ }).click();
  await expect(toast).toContainText(/Move undone|되돌렸습니다/);
});
