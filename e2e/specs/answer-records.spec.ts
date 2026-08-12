import { expect, test, type Page } from '@playwright/test';

import { signInAs } from '../support/auth';

/**
 * The answer records acceptance run, against seeded content.
 *
 * Requires `pnpm --filter @cove/api db:seed` and `db:seed:e2e`. Both are
 * idempotent, and this suite is written to be rerunnable: it never asserts an
 * absolute submission count, because a rerun adds to the same student's
 * history. What it asserts is relative — the two attempts it just made are the
 * newest two, in order.
 */

const STUDENT_USERNAME = process.env.E2E_STUDENT_USERNAME ?? 'cove-student';
const STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'CoveDev123!';

const COURSE_TITLE = 'E2E Python Basics';
const ECHO_TITLE = 'Echo the input';
const LECTURE_ONE_DESCRIPTION = 'Read a line of input and print it back out.';
/** Seeded into every hidden test case. Must never reach the browser. */
const HIDDEN_SENTINEL = 'E2E_HIDDEN_SENTINEL';

let academyId = '';

async function signIn(page: Page) {
  academyId = await signInAs({
    page,
    identifier: STUDENT_USERNAME,
    password: STUDENT_PASSWORD,
  });
}

function recordsUrl() {
  return `/studio/academies/${academyId}/learn/records`;
}

/**
 * Replaces the editor contents. Monaco's textarea is not fillable and
 * synthetic keystrokes drop characters, so this drives the model directly —
 * `setValue` still fires the React `onChange` a real edit would.
 */
async function typeIntoEditor(page: Page, code: string) {
  const editor = page.locator('.monaco-editor').first();
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      () =>
        page.evaluate((next) => {
          const monaco = (window as unknown as {
            monaco?: { editor: { getModels(): { setValue(value: string): void }[] } };
          }).monaco;
          const model = monaco?.editor.getModels()[0];
          if (!model) return false;
          model.setValue(next);
          return true;
        }, code),
      { timeout: 30_000 },
    )
    .toBe(true);
  await expect(editor).toContainText(code.split('\n')[0]!, { timeout: 10_000 });
}

async function openEcho(page: Page): Promise<string> {
  await page.goto(`/studio/academies/${academyId}/learn/courses`);
  await page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { name: COURSE_TITLE }) })
    .click();
  await page.waitForURL(/\/learn\/courses\/[0-9a-f-]+$/);
  await page.getByPlaceholder(/search problems|문제 검색/i).fill(ECHO_TITLE);
  await page.getByText(ECHO_TITLE).click();
  await page.waitForURL(/\/learn\/exercises\//);
  return page.url();
}

async function submitCurrentCode(page: Page) {
  await page.getByRole('button', { name: /^submit$|^제출$/i }).click();
  // Either verdict settles the submission; the row appears for both.
  await expect(
    page.getByText(/^Accepted$|^정답$|^Not accepted$|^오답$/).first(),
  ).toBeVisible({ timeout: 90_000 });
}

/** The Problem-column links, newest first, as the table renders them. */
function recordRows(page: Page) {
  return page.getByRole('row').filter({ hasText: ECHO_TITLE });
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('two attempts at one problem appear newest first with a summary', async ({
  page,
}) => {
  test.setTimeout(240_000);

  await page.goto(await openEcho(page));
  await typeIntoEditor(page, 'print("wrong")');
  await submitCurrentCode(page);

  await typeIntoEditor(page, 'print(input())');
  await submitCurrentCode(page);

  await page.goto(recordsUrl());
  await expect(page.getByRole('heading', { name: /answer records|제출 기록/i }))
    .toBeVisible();

  // Newest first: the accepted attempt was made second, so it leads.
  const rows = recordRows(page);
  await expect(rows.first()).toContainText(/Accepted|정답/);
  await expect(rows.nth(1)).toContainText(/Not accepted|오답/);

  // The summary describes the whole history, so only its shape is asserted:
  // reruns add attempts, and at least one problem is now solved.
  const solved = page.getByText(/problems solved|해결한 문제/i);
  await expect(solved).toBeVisible();
});

test('the summary counts a solved problem and an accepted rate', async ({
  page,
}) => {
  await page.goto(recordsUrl());

  for (const label of [
    /total submissions|전체 제출/i,
    /problems solved|해결한 문제/i,
    /accepted rate|정답률/i,
  ]) {
    await expect(page.getByText(label)).toBeVisible();
  }
  // Whole percent, never a fraction.
  await expect(page.getByText(/^\d{1,3}%$/)).toBeVisible();
});

test('a result facet narrows server results and survives a reload', async ({
  page,
}) => {
  await page.goto(recordsUrl());

  // The filter and sortable column header share the visible label. The toolbar
  // trigger is first in document order and opens a listbox rather than a menu.
  await page.getByRole('button', { name: /^result$|^결과$/i }).first().click();
  await page.getByRole('option', { name: /accepted|정답/i }).first().click();
  await page.keyboard.press('Escape');

  await expect(page).toHaveURL(/result=ACCEPTED/);
  await expect(page.getByText(/Not accepted|오답/)).toHaveCount(0);

  await page.reload();
  await expect(page).toHaveURL(/result=ACCEPTED/);
  await expect(page.getByText(/Not accepted|오답/)).toHaveCount(0);
});

test('sorting and paging are written into the URL', async ({ page }) => {
  await page.goto(recordsUrl());

  await page.getByRole('button', { name: /^score$|^점수$/i }).click();
  await page.getByRole('menuitem', { name: /ascending|오름차순/i }).click();
  await expect(page).toHaveURL(/sort=score&direction=asc/);

  // Paging only exists once the history is long enough; when it is not, the
  // control is disabled and the URL correctly stays on page 1.
  const next = page.getByRole('button', { name: /^next$|^다음$/i });
  if (await next.isEnabled()) {
    await next.click();
    await expect(page).toHaveURL(/page=2/);
    await page.getByRole('button', { name: /^first page|^첫 페이지/i }).click();
    await expect(page).not.toHaveURL(/page=2/);
  }
});

test('review opens the attempt in a fully editable workspace and returns', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto(`${recordsUrl()}?sort=score&direction=asc`);
  const url = page.url();

  await recordRows(page)
    .first()
    .getByRole('link', { name: /^review|^다시 보기/i })
    .click();
  await page.waitForURL(/\/learn\/exercises\/.*submission=/);

  // The submitted code and its verdict, in the ordinary workspace.
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: ECHO_TITLE })).toBeVisible();
  for (const control of [
    /^submit$|^제출$/i,
    /^reset$|^초기화$/i,
    /^run$|^실행$/i,
  ]) {
    await expect(page.getByRole('button', { name: control }).first()).toBeVisible();
  }

  // Reviewing an old attempt discloses no more than the attempt already did.
  expect(await page.content()).not.toContain(HIDDEN_SENTINEL);

  await page
    .getByRole('link', { name: /back to answer records|제출 기록으로/i })
    .first()
    .click();
  await expect(page).toHaveURL(url);
});

test('a pre-existing draft survives opening and leaving an attempt', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const exerciseUrl = await openEcho(page);
  const marker = `# draft-${Date.now()}`;
  await typeIntoEditor(page, marker);
  await expect(page.getByText(/^Saved$|^저장됨$/)).toBeVisible({
    timeout: 30_000,
  });

  await page.goto(recordsUrl());
  await page.getByRole('link', { name: /^review|^다시 보기/i }).first().click();
  await page.waitForURL(/submission=/);
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 });
  // The submitted code, not the draft.
  await expect(page.locator('.monaco-editor')).not.toContainText(marker);

  // Leave without editing: the saved draft must be exactly where it was.
  await page.goto(exerciseUrl);
  await expect(page.locator('.monaco-editor')).toContainText(marker, {
    timeout: 30_000,
  });
});

test('submitting from a reviewed attempt creates a new record', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto(recordsUrl());
  const total = page.getByTestId('records-summary-total');
  const before = Number(await total.textContent());

  await recordRows(page)
    .first()
    .getByRole('link', { name: /^review|^다시 보기/i })
    .click();
  await page.waitForURL(/submission=/);
  await typeIntoEditor(page, 'print(input())');
  await submitCurrentCode(page);

  await page.goto(recordsUrl());
  // The original attempt is immutable, so the whole history grew. Counting
  // only page-one Echo rows is wrong once the new row pushes an old one to page 2.
  await expect(total).toHaveText(String(before + 1));
});

test('solve time is recorded and is not the program runtime', async ({
  page,
}) => {
  await page.goto(recordsUrl());

  // This history has a fixed student-facing column set. Other DataTable
  // consumers keep their visibility menu through the component default.
  await expect(page.getByRole('button', { name: /^columns$|^열$/i })).toHaveCount(0);

  // Either a duration or the "not recorded" em dash — never a runtime in ms.
  const solveTime = page.getByRole('cell').filter({ hasText: /^\d+[hms]/ });
  if ((await solveTime.count()) > 0) {
    await expect(solveTime.first()).not.toContainText(/ms/);
  }
  await expect(page.getByRole('columnheader', { name: /runtime|실행 시간/i }))
    .toHaveCount(0);
});

test('another student’s submission cannot be opened by editing the URL', async ({
  page,
}) => {
  await page.goto(recordsUrl());
  const review = page.getByRole('link', { name: /^review|^다시 보기/i }).first();
  const href = await review.getAttribute('href');
  const materialId = /exercises\/([0-9a-f-]+)/.exec(href ?? '')?.[1] ?? '';
  expect(materialId).not.toBe('');

  // A well-formed id that is nobody's submission behaves exactly like one
  // belonging to another student: the workspace opens, the attempt does not.
  await page.goto(
    `/studio/academies/${academyId}/learn/exercises/${materialId}` +
      '?submission=00000000-0000-4000-8000-0000000000ff',
  );
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText(/could not be loaded|불러오지 못했습니다/i).first(),
  ).toBeVisible();
});

test('a crafted returnTo cannot redirect off the site', async ({ page }) => {
  await page.goto(recordsUrl());
  const href = await page
    .getByRole('link', { name: /^review|^다시 보기/i })
    .first()
    .getAttribute('href');
  const materialId = /exercises\/([0-9a-f-]+)/.exec(href ?? '')?.[1] ?? '';

  await page.goto(
    `/studio/academies/${academyId}/learn/exercises/${materialId}` +
      `?returnTo=${encodeURIComponent('https://evil.example/steal')}`,
  );
  await page
    .getByRole('link', { name: /back to answer records|제출 기록으로/i })
    .first()
    .click();
  // Back lands on this academy's own records root, never off-site.
  await expect(page).toHaveURL(new RegExp(`${academyId}/learn/records`));
});

test('the course outline shows lecture descriptions and progress', async ({
  page,
}) => {
  await page.goto(`/studio/academies/${academyId}/learn/courses`);
  await page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { name: COURSE_TITLE }) })
    .click();
  await page.waitForURL(/\/learn\/courses\/[0-9a-f-]+$/);

  await expect(page.getByText(LECTURE_ONE_DESCRIPTION)).toBeVisible();
  // A count beside the bar, never a bar alone.
  await expect(page.getByText(/\d+ of \d+ solved|\d+ \/ \d+/).first())
    .toBeVisible();
  await expect(page.getByRole('progressbar').first()).toBeVisible();
});

test('the Learning group lists Answer records for a student', async ({
  page,
}) => {
  const sidebar = page
    .getByRole('navigation')
    .or(page.locator('[data-slot="sidebar"]'));
  await expect(
    sidebar.getByRole('link', { name: /answer records|제출 기록/i }),
  ).toBeVisible();
});
