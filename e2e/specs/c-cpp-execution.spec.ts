import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const requireApi = createRequire(resolve('packages/api/package.json'));
const { Pool } = requireApi('pg');
const database = new URL(process.env.DATABASE_URL ?? 'http://invalid');
if (database.hostname !== '127.0.0.1' || database.pathname !== '/cove_native_test' || !process.env.COVE_CPP_FIXTURE_DIR)
  throw Error('Disposable local C/C++ fixture required');
const db = new Pool({ connectionString: database.href, max: 1 });
const fixture = () => JSON.parse(readFileSync(resolve(process.env.COVE_CPP_FIXTURE_DIR!, 'browser.json'), 'utf8'));
test.afterAll(async () => { await db.end(); });

async function setCode(page: Page, code: string) {
  await expect(page.locator('.monaco-editor').first()).toBeVisible();
  await expect.poll(() => page.evaluate(next => {
    const model = (window as any).monaco?.editor.getModels()[0];
    if (!model) return false;
    model.setValue(next);
    return true;
  }, code)).toBe(true);
}
async function language(page: Page) {
  return page.evaluate(() => (window as any).monaco?.editor.getModels()[0]?.getLanguageId());
}
async function latest(materialId: string) {
  return (await db.query('SELECT id,status,score,compile_failed,compile_diagnostics,graded_at FROM submissions WHERE material_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1', [materialId])).rows[0];
}
async function submit(page: Page, materialId: string, code: string) {
  const before = (await latest(materialId))?.id;
  await setCode(page, code);
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect.poll(async () => {
    const row = await latest(materialId);
    return Boolean(row && row.id !== before && row.graded_at);
  }, { timeout: 45_000 }).toBe(true);
  await expect(page.locator('#workspace-result-panel')).toBeVisible();
  return latest(materialId);
}

for (const name of ['C', 'CPP'] as const) {
  test(`${name}: real Run, Test, Submit, compile failure, crash and teacher review`, async ({ browser }) => {
    test.setTimeout(240_000);
    const f = fixture(), materialId = f.ids[name];
    const context = await browser.newContext({ storageState: f.auth.student });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const pyodide: string[] = [];
    page.on('request', request => { if (/pyodide.*\.(wasm|js)/.test(request.url())) pyodide.push(request.url()); });
    await page.goto(`/academy/${f.slug}/learn/exercises/${materialId}?classId=${f.ids.class}`);
    await expect.poll(() => language(page)).toBe(name === 'C' ? 'c' : 'cpp');
    // Batch input is prefilled; Run must use the value the learner changes it to.
    const input = page.getByRole('textbox', { name: 'Program input', exact: true });
    await expect(input).toHaveValue('2 3\n');
    await input.fill('40 2\n');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.locator('#workspace-terminal-panel')).toContainText('The program finished.');
    await expect(page.locator('#workspace-terminal-panel')).toContainText('42');
    await page.getByRole('button', { name: 'Test run', exact: true }).click();
    await expect(page.locator('#workspace-terminal-panel')).toContainText('Sample 1 passed.');
    const correct = await submit(page, materialId, f.sources[name]);
    expect(correct.score).toBe(100);
    await expect(page.getByTestId('result-passed')).toContainText('2 / 2');

    const failure = await submit(page, materialId, 'int main( {\n');
    expect(failure.compile_failed).toBe(true);
    expect(failure.compile_diagnostics).toMatch(/error:/);
    await expect(page.locator('#workspace-result-panel')).toContainText('Compile error');
    await expect(page.locator('#workspace-result-panel')).toContainText('error:');

    const crash = await submit(page, materialId, 'int main(void) { return 3; }\n');
    await expect(page.locator('#workspace-result-panel')).toContainText('exit code 3');
    const cases = (await db.query('SELECT is_sample,exit_code,outcome FROM submission_cases WHERE submission_id=$1 ORDER BY position', [crash.id])).rows;
    expect(cases).toEqual([
      { is_sample: true, exit_code: 3, outcome: 'RUNTIME_ERROR' },
      { is_sample: false, exit_code: 3, outcome: 'RUNTIME_ERROR' },
    ]);
    // Read the actual browser payload: hidden termination must not be projected.
    const resultResponse = await page.request.post('http://127.0.0.1:4317/api/rpc/learn/getSubmission', {
      headers: { Authorization: 'Bearer ' + JSON.parse(Buffer.from(f.auth.student.cookies.find((c: any) => c.name === 'sb-127-auth-token').value.slice(7), 'base64url').toString()).access_token },
      data: { json: { academyId: f.ids.academy, submissionId: crash.id } },
    });
    expect(resultResponse.ok()).toBe(true);
    const payload = (await resultResponse.json()).json;
    expect(payload.cases.find((c: any) => !c.isSample).exitCode).toBeNull();

    const teacherContext = await browser.newContext({ storageState: f.auth.teacher });
    const teacher = await teacherContext.newPage();
    const review = (id: string) => `/academy/${f.slug}/teach/classes/${f.ids.class}/students/${f.ids.studentMembership}/submissions/${id}`;
    await teacher.goto(review(failure.id));
    await expect(teacher.getByRole('heading', { name: 'Compile error', exact: true })).toBeVisible();
    await expect(teacher.locator('main')).toContainText('error:');
    await expect.poll(() => language(teacher)).toBe(name === 'C' ? 'c' : 'cpp');
    await teacher.goto(review(crash.id));
    await expect(teacher.locator('main')).toContainText('exit code 3');
    await teacher.goto(`/academy/${f.slug}/teach/classes/${f.ids.class}/progress?view=students&student=${f.ids.studentMembership}&reviewMaterial=${materialId}&attempt=${failure.id}`);
    await expect(teacher.getByTestId('student-history-workspace')).toBeVisible();
    await teacher.getByRole('tab', { name: 'Saved submission result', exact: true }).click();
    await expect(teacher.locator('pre:visible').filter({ hasText: 'Compile error' })).toContainText('error:');
    await expect.poll(() => language(teacher)).toBe(name === 'C' ? 'c' : 'cpp');
    await teacher.screenshot({ path: test.info().outputPath(name + '-compile-history.png'), fullPage: true });
    await teacher.goto(`/academy/${f.slug}/teach/classes/${f.ids.class}/students/${f.ids.studentMembership}/live`);
    await expect(teacher.locator('body')).toContainText('Local student');
    await expect(teacher.getByRole('button', { name: 'Run', exact: true })).toHaveCount(0);
    expect(pyodide).toEqual([]);
    expect(errors).toEqual([]);
    await teacherContext.close();
    await context.close();
  });
}

test('C++ submits all ten cases through the native worker', async ({ browser }) => {
  const f = fixture();
  const context = await browser.newContext({ storageState: f.auth.student });
  const page = await context.newPage();
  await page.goto(`/academy/${f.slug}/learn/exercises/${f.ids.CPP10}?classId=${f.ids.class}`);
  const result = await submit(page, f.ids.CPP10, f.sources.CPP);
  expect(result.score).toBe(100);
  await expect(page.getByTestId('result-passed')).toContainText('10 / 10');
  expect((await db.query('SELECT count(*)::int AS count FROM submission_cases WHERE submission_id=$1 AND outcome=$2', [result.id, 'PASSED'])).rows[0].count).toBe(10);
  await context.close();
});

test('repeated C++ checks keep every polling response valid', async ({ request }) => {
  const f = fixture();
  const session = JSON.parse(Buffer.from(f.auth.student.cookies.find((c: any) => c.name === 'sb-127-auth-token').value.slice(7), 'base64url').toString());
  const headers = { Authorization: 'Bearer ' + session.access_token };
  const invalidResponses: string[] = [];
  for (let index = 0; index < 20; index++) {
    const accepted = await request.post('http://127.0.0.1:4317/api/rpc/learn/startSampleCheck', {
      headers, data: { json: { academyId: f.ids.academy, classId: f.ids.class, materialId: f.ids.CPP, workspaceRevision: 1, position: 1, code: f.sources.CPP, clientRequestId: crypto.randomUUID() } },
    });
    expect(accepted.ok(), await accepted.text()).toBe(true);
    const { checkId } = (await accepted.json()).json;
    await expect.poll(async () => {
      const response = await request.post('http://127.0.0.1:4317/api/rpc/learn/getSampleCheck', { headers, data: { json: { academyId: f.ids.academy, checkId } } });
      if (!response.ok()) {
        invalidResponses.push(`${response.status()}: ${await response.text()}`);
        return false;
      }
      const view = (await response.json()).json;
      if (view.status === 'QUEUED' || view.status === 'RUNNING') return false;
      expect(view.status).toBe('COMPLETED');
      expect(view.result.outcome).toBe('PASSED');
      return true;
    }, { timeout: 15_000, intervals: [10, 20, 50] }).toBe(true);
  }
  expect(invalidResponses).toEqual([]);
});

test('authoring offers C and C++ in the enabled academy', async ({ browser }) => {
  const f = fixture();
  const context = await browser.newContext({ storageState: f.auth.manager });
  const page = await context.newPage();
  await page.goto(`/academy/${f.slug}/content/courses/${f.ids.course}/lectures/${f.ids.lecture}/exercises/new`);
  const picker = page.locator('select').filter({ has: page.locator('option[value="CPP"]') });
  await expect(picker).toBeVisible();
  await picker.selectOption('C');
  await expect(picker).toHaveValue('C');
  await picker.selectOption('CPP');
  await expect(picker).toHaveValue('CPP');
  await page.screenshot({ path: test.info().outputPath('cpp-authoring.png'), fullPage: true });
  await context.close();
});
