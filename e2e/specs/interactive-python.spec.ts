import { expect, test, type Page } from '@playwright/test';

import { signInAs } from '../support/auth';

const STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL ?? 'student@cove.test';
const STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'CoveDev123!';
const ECHO_ID = 'e0000000-0000-4000-8000-000000000030';

async function signIn(page: Page): Promise<string> {
  const response = await page.goto('/auth/login');
  expect(response?.headers()['cross-origin-opener-policy']).toBe('same-origin');
  expect(response?.headers()['cross-origin-embedder-policy']).toBe('require-corp');
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true);

  return signInAs({
    page,
    identifier: STUDENT_EMAIL,
    password: STUDENT_PASSWORD,
  });
}

async function replaceEditorCode(page: Page, code: string) {
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 });
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
}

test('the interactive Python worker is isolated and accepts terminal input', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const academyId = await signIn(page);

  const workerResponse = await page.request.get('/pyodide-worker.js?v=6');
  expect(workerResponse.headers()['cross-origin-resource-policy']).toBe('same-origin');
  expect(workerResponse.headers()['cache-control']).toContain('immutable');

  await page.goto(
    `/studio/academies/${academyId}/learn/exercises/${ECHO_ID}`,
  );
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true);
  await expect(page.getByText(/browser cannot run interactive input/i)).toHaveCount(0);

  await replaceEditorCode(page, 'name = input()\nprint("Hello, " + name)');

  const run = page.getByRole('button', { name: /^run$|^실행$/i });
  await expect(run).toBeEnabled({ timeout: 90_000 });
  await run.click();

  const input = page.getByRole('textbox', { name: /program input|프로그램 입력/i });
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill('Safari');
  await input.press('Enter');

  await expect(page.getByRole('tabpanel')).toContainText('Hello, Safari', {
    timeout: 30_000,
  });
  await expect(run).toBeEnabled();
});

test('a failing run opens the error coach', async ({ page }) => {
  test.setTimeout(120_000);
  const academyId = await signIn(page);

  await page.goto(`/studio/academies/${academyId}/learn/exercises/${ECHO_ID}`);

  const run = page.getByRole('button', { name: /^run$|^실행$/i });
  const coachTab = page.getByRole('tab', {
    name: /error interpretation|오류 해석/i,
  });
  const coach = page.getByTestId('error-coach');
  const terminal = page.getByTestId('terminal');

  await expect(coachTab).toHaveCount(0);

  await replaceEditorCode(page, 'if True\nprint("hello" 2)');
  await expect(run).toBeEnabled({ timeout: 90_000 });
  await run.click();

  // Opens itself: the student does not have to find it.
  await expect(coach).toBeVisible({ timeout: 30_000 });
  await expect(coachTab).toHaveAttribute('aria-selected', 'true');

  // The lesson is the actual mistake, not the exception class.
  await expect(coach).toContainText(/colon|콜론/i);
  // Line and column, their own code, and a caret under the character.
  await expect(coach).toContainText(/\b1:8\b/);
  await expect(coach).toContainText('if True');
  await expect(coach).toContainText('^');
  // A correct example, and what to do next.
  await expect(coach).toContainText(/temperature/);
  await expect(coach).toContainText(/run it again|다시 실행/i);

  // The editor marks the line it stopped on, so "line 1" needs no counting.
  await expect(page.locator('.cove-error-line')).toHaveCount(1);
  await expect(page.locator('.cove-error-glyph')).toHaveCount(1);

  // The terminal keeps Python's own line, without the traceback wall.
  await expect(terminal).toContainText('SyntaxError');
  await expect(terminal).not.toContainText('Traceback (most recent call last)');

  // A run that succeeds takes all of it away.
  await replaceEditorCode(page, 'print("hi")');
  await run.click();
  await expect(terminal).toContainText('hi', { timeout: 30_000 });
  await expect(run).toBeEnabled();
  await expect(coachTab).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.locator('.cove-error-line')).toHaveCount(0);
});
