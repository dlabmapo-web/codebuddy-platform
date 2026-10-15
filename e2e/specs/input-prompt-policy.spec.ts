import { execFileSync } from 'node:child_process';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { routes } from '../../packages/web/src/lib/routes';
import { signInAs } from '../support/auth';

if (process.env.E2E_INPUT_PROMPTS === '1') {
  const base = new URL(process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_WEB_PORT ?? 3000}`);
  if (!['localhost', '127.0.0.1'].includes(base.hostname)) throw new Error('Input-prompt E2E tests require localhost');
}
test.skip(process.env.E2E_INPUT_PROMPTS !== '1', 'Opt-in local input-prompt fixtures');
test.describe.configure({ mode: 'serial' });
const slug = 'development-academy';
const courseId = 'ee040000-0000-4000-8000-000000000001';
const lectureId = 'ee040000-0000-4000-8000-000000000020';
const classId = 'e0000000-0000-4000-8000-000000000040';
const standardId = 'ee040000-0000-4000-8000-000000000030';
const weightedId = 'ee040000-0000-4000-8000-000000000031';
const code = 'hour = input("Hour: ")\nminute = input("Minute: ")\nprint(f"Time: {hour}:{minute}")';
const editPath = (id: string) => `${routes.academyCourse(slug, courseId)}/lectures/${lectureId}/exercises/${id}`;
function fixture(action = 'seed') {
  execFileSync('pnpm', ['--filter', '@cove/api', 'exec', 'tsx', 'scripts/seed-input-prompts-e2e.mts', action], { stdio: 'pipe' });
}
test.beforeAll(() => fixture());
test.beforeEach(({ page }) => page.setDefaultTimeout(30_000));

async function author(page: Page, materialId: string) {
  await signInAs({ page, identifier: 'teamlead@cove.test', password: 'CoveDev123!', initialPath: editPath(materialId) });
  const checkbox = page.getByRole('checkbox', { name: /Ignore input prompts during grading/i });
  await expect(checkbox).toBeVisible({ timeout: 60_000 });
  return checkbox;
}
async function save(page: Page) {
  const button = page.getByRole('button', { name: /^Save changes$/i });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page).toHaveURL(routes.academyCourse(slug, courseId), { timeout: 60_000 });
}
async function student(browser: Browser, materialId: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  await signInAs({ page, identifier: 'student@cove.test', password: 'CoveDev123!', initialPath: routes.academyLearnExercise(slug, materialId, { classId }) });
  return { page, context };
}
async function replaceCode(page: Page, source = code) {
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => page.evaluate((next) => {
    const monaco = (window as unknown as { monaco?: { editor: { getModels(): { setValue(value: string): void }[] } } }).monaco;
    const model = monaco?.editor.getModels()[0];
    if (!model) return false;
    model.setValue(next);
    return true;
  }, source)).toBe(true);
}
async function submit(page: Page, accepted: boolean) {
  await page.getByRole('button', { name: /^Submit$/i }).click();
  await expect(page.getByTestId('result-hero').getByText(accepted ? /^Accepted$/ : /^Not accepted$/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('result-score')).toContainText(accepted ? '100 / 100' : '0 / 100');
}

for (const [name, materialId] of [['Standard', standardId], ['Weighted', weightedId]] as const) {
  test(`${name}: author saves prompt exclusion and samples/Submit still reject extra output`, async ({ page, browser }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const checkbox = await author(page, materialId);
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    if (name === 'Weighted') {
      await page.getByRole('radio', { name: /Standard/ }).click();
      await expect(checkbox).toBeChecked();
      await page.getByRole('radio', { name: /Weighted/ }).click();
      await expect(checkbox).toBeChecked();
    }
    await save(page);
    await page.goto(editPath(materialId));
    await expect(page.getByRole('checkbox', { name: /Ignore input prompts during grading/i })).toBeChecked();
    const learner = await student(browser, materialId);
    try {
      await expect(learner.page.getByText('Input prompts are excluded during grading.', { exact: true })).toBeVisible();
      await replaceCode(learner.page);
      const run = learner.page.getByRole('button', { name: /^Run$/i });
      await expect(run).toBeEnabled({ timeout: 90_000 });
      await learner.page.getByRole('button', { name: /^Test run$/i }).click();
      const terminal = learner.page.locator('#workspace-terminal-panel');
      await expect(terminal).toContainText(/passed|matches/i, { timeout: 60_000 });
      await expect(terminal).toContainText('Time: 4:30');
      await expect(terminal).not.toContainText('Hour:');
      await submit(learner.page, true);
      await replaceCode(learner.page, `${code}\nprint("extra")`);
      await learner.page.getByRole('button', { name: /^Test run$/i }).click();
      await expect(terminal).toContainText('Sample 1 did not match.', { timeout: 60_000 });
      await submit(learner.page, false);
      if (name === 'Standard') {
        await replaceCode(learner.page);
        await run.click();
        const input = learner.page.getByRole('textbox', { name: /program input/i });
        await expect(input).toBeVisible();
        await expect(learner.page.getByTestId('terminal')).toContainText('Hour:');
        await input.fill('4'); await input.press('Enter');
        await expect(learner.page.getByTestId('terminal')).toContainText('Minute:');
        await expect(input).toBeVisible();
        await input.fill('30'); await input.press('Enter');
        await expect(learner.page.getByTestId('terminal')).toContainText('Time: 4:30');
        await expect(run).toBeEnabled();
      }
    } finally { await learner.context.close(); }
  });
}

test('turning the option off counts input prompts again', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const checkbox = await author(page, standardId);
  await checkbox.uncheck();
  await save(page);
  const learner = await student(browser, standardId);
  try {
    await expect(learner.page.getByText('Input prompts are excluded during grading.', { exact: true })).toHaveCount(0);
    await replaceCode(learner.page);
    await submit(learner.page, false);
  } finally { await learner.context.close(); }
});

test('browser sample fallback leaves prompt-inclusive output unchecked', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const checkbox = await author(page, standardId);
  await checkbox.check();
  await save(page);
  fixture('samples-off');
  const learner = await student(browser, standardId);
  try {
    await replaceCode(learner.page);
    await expect(learner.page.getByRole('button', { name: /^Run$/i })).toBeEnabled({ timeout: 90_000 });
    await learner.page.getByRole('button', { name: /^Test run$/i }).click();
    const terminal = learner.page.locator('#workspace-terminal-panel');
    await expect(terminal).toContainText(/result is decided when you submit/i, { timeout: 60_000 });
    await expect(terminal).toContainText('Hour:');
    await expect(terminal).not.toContainText(/does not match|matches the expected/i);
  } finally { await learner.context.close(); fixture('samples-on'); }
});
