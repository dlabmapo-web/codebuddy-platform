import { expect, test, type Page } from '@playwright/test';

/**
 * The student journey against seeded content.
 *
 * Requires `pnpm --filter @cove/api db:seed` and `db:seed:e2e` to have run.
 * Both are idempotent.
 */

/**
 * Signs in by username, which is what the login form asks for. The other
 * suites sign in with an email, so between them both branches of the resolver
 * stay covered.
 */
const STUDENT_USERNAME = process.env.E2E_STUDENT_USERNAME ?? 'cove-student';
const STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'CoveDev123!';

const COURSE_TITLE = 'E2E Python Basics';
const ECHO_TITLE = 'Echo the input';
const SUM_TITLE = 'Sum two numbers';
const HIDDEN_EXERCISE_TITLE = 'Never visible to students';
const HIDDEN_LECTURE_TITLE = 'Draft lecture';
/** Seeded into every hidden test case. Must never reach the browser. */
const HIDDEN_SENTINEL = 'E2E_HIDDEN_SENTINEL';

/**
 * The academy the signed-in student belongs to.
 *
 * `/` still belongs to v1 and redirects into the v1 app, so v2 URLs are built
 * from the academy id captured at sign-in rather than by navigating to root.
 */
let academyId = '';

async function signIn(page: Page) {
  await page.goto('/auth/login');
  await page.locator('input[name="identifier"]').fill(STUDENT_USERNAME);
  await page.locator('input[type="password"]').fill(STUDENT_PASSWORD);
  await page.getByRole('button', { name: /sign in|로그인/i }).click();
  await page.waitForURL(/\/studio\/academies\//, { timeout: 30_000 });

  const match = /\/studio\/academies\/([0-9a-f-]+)/.exec(page.url());
  academyId = match?.[1] ?? '';
  expect(academyId).not.toBe('');
}

function catalogUrl() {
  return `/studio/academies/${academyId}/learn/courses`;
}

/**
 * The course card, not the continue-solving entry: once a draft exists both
 * links contain the course title, so the card is matched by its heading.
 */
function courseCard(page: Page) {
  return page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { name: COURSE_TITLE }) });
}

/**
 * Replaces the editor contents.
 *
 * Monaco's textarea is not fillable and synthetic keystrokes drop characters
 * against its input handling, so this drives the model directly. `setValue`
 * still fires `onDidChangeModelContent`, so the React `onChange` — and with it
 * the autosave under test — runs exactly as it would for a real edit.
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

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('a student lands on their catalog, not the academy overview', async ({
  page,
}) => {
  // The overview is a management surface and would be empty for a student.
  await expect(page).toHaveURL(/\/learn\/courses$/);
  await expect(page.getByRole('heading', { name: COURSE_TITLE })).toBeVisible();
});

test('the sidebar shows Learning and hides management groups', async ({
  page,
}) => {
  const sidebar = page.getByRole('navigation').or(page.locator('[data-slot="sidebar"]'));
  await expect(sidebar.getByRole('link', { name: /my courses|내 코스/i })).toBeVisible();

  // A STUDENT holds neither `academy.members.manage` nor `curriculum.review`,
  // so the existing gates must hide both groups with no student-specific code.
  await expect(sidebar.getByRole('link', { name: /^members$|^멤버$/i })).toHaveCount(0);
  await expect(sidebar.getByRole('link', { name: /^invitations$|^초대$/i })).toHaveCount(0);
});

test('the outline hides unpublished lectures and exercises', async ({ page }) => {
  await courseCard(page).click();
  await page.waitForURL(/\/learn\/courses\/[0-9a-f-]+$/);

  await expect(page.getByText(ECHO_TITLE)).toBeVisible();
  await expect(page.getByText(HIDDEN_EXERCISE_TITLE)).toHaveCount(0);
  await expect(page.getByText(HIDDEN_LECTURE_TITLE)).toHaveCount(0);
});

test('no hidden test case reaches the browser', async ({ page }) => {
  // The invariant from §7.3 of the design, checked end to end rather than at
  // the service boundary: page HTML, RSC payload, and every API response.
  const bodies: string[] = [];
  page.on('response', async (response) => {
    if (!response.url().includes('/api/')) return;
    bodies.push(await response.text().catch(() => ''));
  });

  await courseCard(page).click();
  await page.getByText(ECHO_TITLE).click();
  await page.waitForURL(/\/learn\/exercises\//);
  await expect(page.getByRole('heading', { name: ECHO_TITLE })).toBeVisible();

  expect(await page.content()).not.toContain(HIDDEN_SENTINEL);
  expect(bodies.join('\n')).not.toContain(HIDDEN_SENTINEL);
});

test('the workspace shows samples, a hidden count, and starter code', async ({
  page,
}) => {
  await page.goto(await exerciseUrl(page, SUM_TITLE));

  await expect(page.getByText(/1 hidden test|비공개 테스트/i)).toBeVisible();
  await expect(page.getByText('Expected output', { exact: false })).toBeVisible();
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 });
});

test('an example copies its input without duplicating the run control', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(await exerciseUrl(page, SUM_TITLE));

  await page.getByRole('button', { name: /^copy$|^복사$/i }).first().click();
  await expect(
    page.getByRole('button', { name: /^copied$|^복사됨$/i }).first(),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('1\n2\n');
});

test('reset restores the starter code after naming what will be lost', async ({
  page,
}) => {
  await page.goto(await exerciseUrl(page, SUM_TITLE));
  await typeIntoEditor(page, 'print("changed")');

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toMatch(/starting code|시작 코드/i);
    await dialog.accept();
  });
  await page.getByRole('button', { name: /^reset$|^초기화$/i }).click();

  await expect.poll(() => page.evaluate(() => {
    const monaco = (window as unknown as {
      monaco?: { editor: { getModels(): { getValue(): string }[] } };
    }).monaco;
    return monaco?.editor.getModels()[0]?.getValue().replace(/\r\n/g, '\n');
  })).toBe('a = int(input())\nb = int(input())\n');
});

test('running a sample compares output locally', async ({ page }) => {
  await page.goto(await exerciseUrl(page, ECHO_TITLE));
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 });

  // Pyodide is ~13 MB on a cold cache, so the Run control stays disabled until
  // the worker reports ready.
  const testButton = page.getByRole('button', {
    name: /^Test 1$|^테스트 1$/,
  });
  await expect(testButton).toBeEnabled({ timeout: 90_000 });

  await typeIntoEditor(page, 'print(input())');
  await testButton.click();

  await expect(page.getByText(/matches the expected output|일치합니다/i))
    .toBeVisible({ timeout: 60_000 });
});

test('submit streams a trusted verdict without revealing hidden cases', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const bodies: string[] = [];
  page.on('response', async (response) => {
    if (!response.url().includes('/api/')) return;
    bodies.push(await response.text().catch(() => ''));
  });

  await page.goto(await exerciseUrl(page, ECHO_TITLE));
  await typeIntoEditor(page, 'print(input())');
  await page.getByRole('button', { name: /^submit$|^제출$/i }).click();

  await expect(page.getByText(/^Accepted$|^정답$/)).toBeVisible({
    timeout: 90_000,
  });
  await expect(page.getByTestId('result-passed')).toContainText('2 / 2');
  await expect(page.getByTestId('result-score')).toContainText('100 / 100');
  expect(await page.content()).not.toContain(HIDDEN_SENTINEL);
  expect(bodies.join('\n')).not.toContain(HIDDEN_SENTINEL);
});

test('a draft survives a reload and appears in continue-solving', async ({
  page,
}) => {
  const url = await exerciseUrl(page, ECHO_TITLE);
  await page.goto(url);
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 });

  const marker = `# draft-${Date.now()}`;
  await typeIntoEditor(page, marker);

  // The indicator only reaches "Saved" once the server round trip completes,
  // which is what makes the reload below a real test of persistence.
  await expect(page.getByText(/^Saved$|^저장됨$/)).toBeVisible({ timeout: 30_000 });

  await page.reload();
  await expect(page.locator('.monaco-editor')).toContainText(marker, {
    timeout: 30_000,
  });

  await page.goto(catalogUrl());
  await expect(page.getByText(/continue solving|이어서 풀기/i)).toBeVisible();
  await expect(
    page.getByRole('link', { name: new RegExp(ECHO_TITLE, 'i') }).first(),
  ).toBeVisible();
});

test('previous and next move between exercises across lectures', async ({
  page,
}) => {
  await page.goto(await exerciseUrl(page, ECHO_TITLE));
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 });

  // Echo ends module 1; Sum opens module 2. Neighbours must cross that gap.
  await page.getByRole('button', { name: /^next$|^다음$/i }).click();
  await expect(page.getByRole('heading', { name: SUM_TITLE })).toBeVisible();

  await page.getByRole('button', { name: /^previous$|^이전$/i }).click();
  await expect(page.getByRole('heading', { name: ECHO_TITLE })).toBeVisible();
});

/** Resolves an exercise URL by walking the outline, as a student would. */
async function exerciseUrl(page: Page, title: string): Promise<string> {
  await page.goto(catalogUrl());
  await courseCard(page).click();
  await page.waitForURL(/\/learn\/courses\/[0-9a-f-]+$/);
  // Only the first module starts expanded. Searching reveals every match
  // regardless of collapse state, which is also what a student would do.
  await page.getByPlaceholder(/search problems|문제 검색/i).fill(title);
  await page.getByText(title).click();
  await page.waitForURL(/\/learn\/exercises\//);
  return page.url();
}
