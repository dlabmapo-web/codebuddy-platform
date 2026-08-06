import { expect, test, type Page } from '@playwright/test';

const STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL ?? 'student@cove.test';
const STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'CoveDev123!';
const ECHO_ID = 'e0000000-0000-4000-8000-000000000030';

async function signIn(page: Page): Promise<string> {
  const response = await page.goto('/auth/login');
  expect(response?.headers()['cross-origin-opener-policy']).toBe('same-origin');
  expect(response?.headers()['cross-origin-embedder-policy']).toBe('require-corp');
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true);

  await page.getByRole('textbox', { name: /email/i }).fill(STUDENT_EMAIL);
  await page.locator('input[type="password"]').fill(STUDENT_PASSWORD);
  await page.getByRole('button', { name: /sign in|로그인/i }).click();
  await page.waitForURL(/\/studio\/academies\//, { timeout: 30_000 });

  const academyId = /\/studio\/academies\/([0-9a-f-]+)/.exec(page.url())?.[1];
  expect(academyId).toBeTruthy();
  return academyId!;
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

  const workerResponse = await page.request.get('/pyodide-worker.js?v=5');
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
