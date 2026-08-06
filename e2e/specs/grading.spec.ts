import { expect, test, type Page } from '@playwright/test';

/**
 * Grading behaviours from §15 of the design that the happy-path submit test in
 * `student-journey.spec.ts` does not reach: the failure paths, the untrusted
 * code path, and the loop actually closing.
 *
 * Runs against the real judge — Redis, BullMQ, and Pyodide in a worker thread.
 */

const STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL ?? 'student@cove.test';
const STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'CoveDev123!';

const COURSE_TITLE = 'E2E Python Basics';
const HIDDEN_SENTINEL = 'E2E_HIDDEN_SENTINEL';

/*
 * Fixture ids from `packages/api/prisma/seed/e2e-content.ts`, not titles.
 *
 * The development database is shared with hand-authored content, and a title
 * is not unique in it — three other exercises are also called "Sum two
 * numbers". Selecting by title silently graded one of those instead, against
 * different test cases.
 */
const ECHO_ID = 'e0000000-0000-4000-8000-000000000030';
const SUM_ID = 'e0000000-0000-4000-8000-000000000031';

/**
 * Submit to verdict, for a problem that grades in well under a second.
 *
 * Generous against the ~1.5s a pushed verdict actually takes, but far below the
 * client's 15s fallback poll. The SSE route once 404'd and every verdict
 * arrived on that fallback instead — grading was fast while students waited
 * fifteen seconds, and a suite that only asserted "a verdict eventually
 * appears" passed throughout.
 */
const VERDICT_BUDGET_MS = 8_000;

let academyId = '';

async function signIn(page: Page) {
  await page.goto('/auth/login');
  await page.locator('input[name="identifier"]').fill(STUDENT_EMAIL);
  await page.locator('input[type="password"]').fill(STUDENT_PASSWORD);
  await page.getByRole('button', { name: /sign in|로그인/i }).click();
  await page.waitForURL(/\/studio\/academies\//, { timeout: 30_000 });
  academyId = /\/studio\/academies\/([0-9a-f-]+)/.exec(page.url())?.[1] ?? '';
}

function catalogUrl() {
  return `/studio/academies/${academyId}/learn/courses`;
}

function courseCard(page: Page) {
  return page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { name: COURSE_TITLE }) });
}

function exerciseUrl(materialId: string) {
  return `/studio/academies/${academyId}/learn/exercises/${materialId}`;
}

async function typeIntoEditor(page: Page, code: string) {
  const editor = page.locator('.monaco-editor').first();
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      () =>
        page.evaluate((next) => {
          const monaco = (window as unknown as {
            monaco?: { editor: { getModels(): { setValue(v: string): void }[] } };
          }).monaco;
          const model = monaco?.editor.getModels()[0];
          if (!model) return false;
          model.setValue(next);
          return true;
        }, code),
      { timeout: 30_000 },
    )
    .toBe(true);
}

async function openExercise(page: Page, materialId: string) {
  await page.goto(exerciseUrl(materialId));
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 });
}

const submitButton = (page: Page) =>
  page.getByRole('button', { name: /^submit$|^제출$/i });

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('a wrong answer on a hidden case reveals no diff for it', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const bodies: string[] = [];
  page.on('response', async (response) => {
    if (!response.url().includes('/api/')) return;
    bodies.push(await response.text().catch(() => ''));
  });

  await openExercise(page, ECHO_ID);
  // Passes the sample (input "hello") but fails the hidden case, which echoes
  // a different value. Exactly the probe a student would use to reverse the
  // hidden expectation, so the response must give them nothing.
  await typeIntoEditor(page, 'input()\nprint("hello")');
  await submitButton(page).click();

  await expect(page.getByText(/^Not accepted$|^오답$/)).toBeVisible({
    timeout: 90_000,
  });
  const resultPanel = page.locator('#workspace-result-panel');
  await expect(resultPanel.getByTestId('result-passed')).toContainText('1 / 2');
  await expect(resultPanel.getByTestId('result-score')).toContainText('50 / 100');
  await expect(resultPanel.getByText(/compare the expected format/i)).toHaveCount(0);

  expect(await page.content()).not.toContain(HIDDEN_SENTINEL);
  expect(bodies.join('\n')).not.toContain(HIDDEN_SENTINEL);
});

test('a visible wrong answer opens a guided expected-versus-actual diagnostic', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openExercise(page, SUM_ID);
  await typeIntoEditor(page, 'print(0)');
  await submitButton(page).click();

  const resultPanel = page.locator('#workspace-result-panel');
  await expect(
    resultPanel.getByRole('heading', { name: /Check your output/i }),
  ).toBeVisible({ timeout: 90_000 });
  await expect(resultPanel.getByText(/^Expected$/)).toBeVisible();
  await expect(resultPanel.getByText(/^Actual$/)).toBeVisible();
  await expect(resultPanel.getByText(/Compare the expected format/i)).toBeVisible();
});

test('an infinite loop is cut off as a time limit, not a hang', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openExercise(page, SUM_ID);
  // A busy loop never yields, so this only terminates if the interrupt is
  // driven from outside the runtime's own event loop.
  await typeIntoEditor(page, 'while True:\n    pass');
  await submitButton(page).click();

  await expect(
    page
      .getByTestId('result-hero')
      .getByText(/^Time limit exceeded$|^시간 초과$/),
  ).toBeVisible({ timeout: 90_000 });
  await expect(
    page.getByRole('listitem', { name: /Time limit exceeded/i }).first(),
  ).toBeVisible();

  // The API must still be serving: a runaway program cannot take request
  // handling down with it.
  const health = await page.request.get('/studio/academies/' + academyId + '/learn/courses');
  expect(health.ok()).toBe(true);
});

test('a runtime error is reported as such, not as a wrong answer', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openExercise(page, SUM_ID);
  await typeIntoEditor(page, 'raise ValueError("boom")');
  await submitButton(page).click();

  await expect(page.getByText(/^Not accepted$/)).toBeVisible({ timeout: 90_000 });
  // Pointing a student at a logic bug when they have a crash wastes their time.
  await expect(
    page.getByRole('listitem', { name: /Runtime error/i }).first(),
  ).toBeVisible();
});

test('a second submit while one is in flight is rejected', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);

  // Both tabs are opened and warmed before anything is submitted. Loading a
  // page takes longer than grading a correct answer, so opening the second tab
  // after submitting would lose the race every time and prove nothing.
  const secondTab = await context.newPage();
  await openExercise(page, SUM_ID);
  await openExercise(secondTab, SUM_ID);

  // A slow program keeps the first submission in flight long enough for the
  // second to reach the constraint.
  await typeIntoEditor(page, 'while True:\n    pass');
  await submitButton(page).click();

  await typeIntoEditor(secondTab, 'print(1)');
  await submitButton(secondTab).click();

  await expect(
    secondTab.getByText(/already being graded|이미 채점 중/i),
  ).toBeVisible({ timeout: 30_000 });
  await secondTab.close();

  await expect(
    page
      .getByTestId('result-hero')
      .getByText(
        /^Accepted$|^Not accepted$|^Time limit exceeded$|^정답$|^오답$|^시간 초과$/,
      ),
  ).toBeVisible({ timeout: 90_000 });
});

test('passing a problem marks it solved in the outline and catalog', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openExercise(page, ECHO_ID);
  await typeIntoEditor(page, 'print(input())');
  await submitButton(page).click();
  await expect(page.getByText(/^Accepted$/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('result-score')).toContainText('100 / 100');

  // The loop closing is the whole point of grading: a verdict has to move the
  // student's visible progress, not just render a panel.
  await page.goto(catalogUrl());
  await courseCard(page).click();
  const row = page
    .locator('li')
    .filter({ has: page.getByRole('link', { name: /Echo the input/i }) })
    .first();
  await expect(row.getByText(/^Solved$|^완료$/)).toBeVisible({ timeout: 30_000 });
  await expect(row.getByText(/^100 \/ 100$/)).toBeVisible();
});

test('a verdict is pushed, not waited for', async ({ page }) => {
  test.setTimeout(120_000);
  const streams: number[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/stream')) streams.push(response.status());
  });

  await openExercise(page, ECHO_ID);
  await typeIntoEditor(page, 'print(input())');

  const startedAt = Date.now();
  await submitButton(page).click();
  await expect(page.getByText(/^Accepted$|^Not accepted$/)).toBeVisible({
    timeout: 60_000,
  });
  const elapsed = Date.now() - startedAt;

  console.log(`submit -> verdict: ${elapsed}ms`);
  // A 404 here is invisible to the user beyond the delay, so the status is
  // asserted directly rather than inferred from timing alone.
  expect(streams).toContain(200);
  expect(elapsed).toBeLessThan(VERDICT_BUDGET_MS);
});

test('typing issues no network request', async ({ page }) => {
  // §15.10. The local-first draft design claims typing is free; nothing
  // verified it until now.
  await openExercise(page, SUM_ID);

  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) requests.push(request.url());
  });

  await typeIntoEditor(page, '# keystroke one');
  await typeIntoEditor(page, '# keystroke two');
  await typeIntoEditor(page, '# keystroke three');
  // Well inside the 5s idle debounce.
  await page.waitForTimeout(1_500);

  expect(requests).toEqual([]);
});
