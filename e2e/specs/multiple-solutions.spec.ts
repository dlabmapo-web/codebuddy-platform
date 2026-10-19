import { readContentWorkbook } from '../../packages/api/src/content/import/content-workbook-reader';
import { writeWorkbook } from '../../packages/api/src/common/workbook-writer';
import { execFileSync } from 'node:child_process';
import { expect, test, type Page, type Locator } from '@playwright/test';
import { signInAs } from '../support/auth';
import { routes } from '../../packages/web/src/lib/routes';

test.skip(process.env.E2E_MULTIPLE_SOLUTIONS !== '1', 'Opt-in development solution fixture');
const base = new URL(process.env.E2E_BASE_URL ?? 'http://localhost:3000');
if (!['localhost', '127.0.0.1'].includes(base.hostname)) throw new Error('Solutions tests require localhost');
const courseId = 'ee080000-0000-4000-8000-000000000001';
const lectureId = 'ee080000-0000-4000-8000-000000000020';
const materialId = 'ee080000-0000-4000-8000-000000000030';
const classId = 'e0000000-0000-4000-8000-000000000040';
const slug = 'development-academy';
const editPath = `${routes.academyCourse(slug, courseId)}/lectures/${lectureId}/exercises/${materialId}`;
const code1 = '# private-loop-solution\nprint("hello")\n';
const code2 = '# private-format-solution\nprint("{}".format("hello"))\n';
const answer = (page: Page, number: number) => page.getByRole('region', { name: new RegExp(`^(Answer|답안) ${number}$`) });
async function setCode(region: Locator, code: string) {
  const editor = region.locator('.monaco-editor');
  await expect(editor).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => region.evaluate((element, source) => {
    const monaco = (window as unknown as { monaco?: { editor: { getEditors(): Array<{ getDomNode(): HTMLElement | null; getModel(): { setValue(value: string): void; getValue(): string } | null }> } } }).monaco;
    const model = monaco?.editor.getEditors().find(editor => element.contains(editor.getDomNode()))?.getModel();
    if (!model) return false;
    model.setValue(source);
    return model.getValue() === source;
  }, code)).toBe(true);
}
async function save(page: Page) {
  await page.getByRole('button', { name: /^Save changes$|^변경사항 저장$|^변경 사항 저장$/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`/content/courses/${courseId}$`), { timeout: 45_000 });
}
test.describe.configure({ mode: 'serial' });
test.beforeAll(() => execFileSync('pnpm', ['--filter', '@cove/api', 'exec', 'tsx', 'scripts/seed-multiple-solutions-e2e.mts'], { stdio: 'pipe' }));

test('author adds, reorders, reopens and removes independent solutions', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await signInAs({ page, identifier: 'teamlead@cove.test', password: 'CoveDev123!', initialPath: editPath });
  // Wait for the client editor to mount before filling server-rendered inputs.
  await expect(answer(page, 1).locator('.monaco-editor')).toBeVisible({ timeout: 60_000 });
  await answer(page, 1).getByRole('textbox', { name: /Method name|풀이 이름/ }).fill('Loop');
  await expect(answer(page, 1).getByRole('textbox', { name: /Method name|풀이 이름/ })).toHaveValue('Loop');
  await setCode(answer(page, 1), code1);
  await page.getByRole('button', { name: /Add solution|정답 코드 추가/ }).click();
  await expect(page.getByRole('button', { name: /^Save changes$|^변경 사항 저장$/ }).first()).toBeDisabled();
  await answer(page, 2).getByRole('textbox', { name: /Method name|풀이 이름/ }).fill('Format');
  await setCode(answer(page, 2), code2);
  await answer(page, 2).getByRole('button', { name: /Move up|위로 이동/ }).click();
  await save(page);
  await page.goto(editPath);
  await expect(answer(page, 1).getByRole('textbox', { name: /Method name|풀이 이름/ })).toHaveValue('Format');
  await expect(answer(page, 2).getByRole('textbox', { name: /Method name|풀이 이름/ })).toHaveValue('Loop');
  await page.getByRole('button', { name: /Add solution|정답 코드 추가/ }).click();
  await answer(page, 3).getByRole('button', { name: /^Remove$|^삭제$/ }).click();
  await expect(answer(page, 3)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('solutions-author.png'), fullPage: true });
});

test('teacher copies each private answer; student and stale visits cannot retrieve them', async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const studentContext = await browser.newContext(), teacherContext = await browser.newContext();
  const student = await studentContext.newPage(), teacher = await teacherContext.newPage();
  let studentAuthorization = '', requestCount = 0;
  const studentLeaks: string[] = [];
  student.on('request', request => { if (request.headers().authorization) studentAuthorization = request.headers().authorization!; });
  student.on('response', async response => {
    if (!response.url().includes('/api/')) return;
    const body = await response.text().catch(() => '');
    if (body.includes('private-loop-solution') || body.includes('private-format-solution')) studentLeaks.push(response.url());
  });
  teacher.on('request', request => { if (request.url().includes('getExerciseSolution')) requestCount++; });
  // Capture copy calls without depending on OS clipboard support in WebKit.
  await teacher.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copiedAnswer: string }).copiedAnswer = text; } } });
  });
  try {
    await signInAs({ page: student, identifier: 'student@cove.test', password: 'CoveDev123!', initialPath: routes.academyLearnExercise(slug, materialId, { classId }) });
    await expect(student.locator('.monaco-editor')).toBeVisible({ timeout: 60_000 });
    await signInAs({ page: teacher, identifier: 'teacher@cove.test', password: 'CoveDev123!', initialPath: routes.academyTeachStudentLive(slug, classId, '40000000-0000-4000-8000-000000000005') });
    const show = teacher.getByRole('button', { name: /^Show Answer$|^해설 보기$/i });
    await expect(show).toBeEnabled({ timeout: 60_000 });
    expect(requestCount).toBe(0);
    const loaded = teacher.waitForResponse(response => response.url().includes('getExerciseSolution'));
    await show.click();
    const response = await loaded;
    expect(response.ok()).toBe(true);
    const request = response.request();
    const data = await response.json();
    expect(JSON.stringify(data)).toContain('private-loop-solution');
    const dialog = teacher.getByRole('dialog');
    await expect(dialog).toContainText('Format');
    await expect(dialog).toContainText('Loop');
    for (const [number, code] of [[1, code2], [2, code1]] as const) {
      await dialog.getByRole('button', { name: new RegExp(`Copy answer ${number}|답안 ${number} 복사`) }).click();
      await expect.poll(() => teacher.evaluate(() => (window as unknown as { copiedAnswer: string }).copiedAnswer)).toBe(code);
    }
    await teacher.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Clipboard unavailable'); }; });
    await dialog.getByRole('button', { name: /Copy answer 1|답안 1 복사/ }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Copy answer 1|답안 1 복사/ })).toHaveText(/^Copy$|^복사$/);
    const denied = await student.request.fetch(request.url(), { method: request.method(), headers: { 'content-type': 'application/json', authorization: studentAuthorization }, data: request.postData() ?? undefined });
    expect(denied.ok()).toBe(false);
    expect(await denied.text()).not.toContain('private-');
    await teacher.setViewportSize({ width: 375, height: 812 });
    await expect(dialog.getByRole('button', { name: /^Close$|^닫기$/ })).toBeVisible();
    await teacher.screenshot({ path: testInfo.outputPath('solutions-teacher-mobile.png') });
    await teacher.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(show).toBeFocused();
    await teacher.route(request.url(), route => route.abort());
    await show.click();
    await expect(dialog.getByRole('button', { name: /Retry|다시 시도/ })).toBeVisible();
    await teacher.unroute(request.url());
    await dialog.getByRole('button', { name: /Retry|다시 시도/ }).click();
    await expect(dialog).toContainText('Format');
    expect(requestCount).toBe(3);
    await teacher.goto(routes.academyCourse(slug, courseId));
    await expect.poll(async () => {
      const result = await teacher.request.fetch(request.url(), { method: request.method(), headers: request.headers(), data: request.postData() ?? undefined });
      return result.ok();
    }, { timeout: 30_000 }).toBe(false);
    expect(studentLeaks).toEqual([]);
    await expect(student.locator('.monaco-editor')).not.toContainText('private-');
  } finally { await studentContext.close(); await teacherContext.close(); }
});

test('removing a stored solution persists and the final remaining solution cannot be removed', async ({ page }) => {
  await signInAs({ page, identifier: 'teamlead@cove.test', password: 'CoveDev123!', initialPath: editPath });
  page.once('dialog', dialog => dialog.accept());
  await answer(page, 2).getByRole('button', { name: /^Remove$|^삭제$/ }).click();
  await save(page);
  await page.goto(editPath);
  await expect(answer(page, 2)).toHaveCount(0);
  await expect(answer(page, 1).getByRole('textbox', { name: /Method name|풀이 이름/ })).toHaveValue('Format');
  await expect(answer(page, 1).getByRole('button', { name: /^Remove$|^삭제$/ })).toBeDisabled();
});

test('workbook v3 exports, previews and commits complete solutions and reports invalid entries', async ({ page }) => {
  test.setTimeout(120_000);
  let authorization = '';
  page.on('request', request => { if (request.headers().authorization) authorization = request.headers().authorization!; });
  await signInAs({ page, identifier: 'teamlead@cove.test', password: 'CoveDev123!', initialPath: editPath });
  await expect(answer(page, 1)).toBeVisible();
  await expect.poll(() => authorization).not.toBe('');
  const academyId = '20000000-0000-4000-8000-000000000001';
  const headers = { authorization };
  const url = `http://localhost:4000/api/content-imports?academyId=${academyId}&courseId=${courseId}&filename=solutions.xlsx`;
  const exported = await page.request.get(`http://localhost:4000/api/content-imports/template?academyId=${academyId}&courseId=${courseId}&kind=current&locale=en`, { headers });
  expect(exported.ok()).toBe(true);
  const workbook = readContentWorkbook(await exported.body());
  expect(workbook.templateVersion).toBe(3);
  workbook.sheets.set('Instructions', [['template_version', '3']]);
  const solutions = workbook.sheets.get('Solutions')!;
  expect(solutions[1].slice(2)).toEqual(['Format', code2]);
  solutions.push([solutions[1][0], '2', 'Imported loop', code1]);
  const bytes = writeWorkbook({ sheets: [...workbook.sheets].map(([name, rows]) => ({ name, rows })) });
  const uploaded = await page.request.post(url, { headers: { ...headers, 'content-type': 'application/octet-stream' }, data: bytes });
  expect(uploaded.ok()).toBe(true);
  const preview = await uploaded.json();
  expect(preview.counts.errors).toBe(0);
  expect(preview.counts.conflicts).toBe(0);
  const problem = preview.plan.modules.flatMap((module: { lectures: { problems: unknown[] }[] }) => module.lectures.flatMap(lecture => lecture.problems))[0];
  expect(problem.solutionChanges).toMatchObject({ added: 1, removed: 0, changed: 0 });
  const committed = await page.request.post('http://localhost:4000/api/rpc/academyContentImports/commit', { headers, data: { json: { academyId, courseId, sessionId: preview.sessionId, contentRevision: preview.contentRevision, acknowledgeWarnings: true } } });
  expect(committed.ok()).toBe(true);
  await page.goto(editPath);
  await expect(answer(page, 2).getByRole('textbox', { name: /Method name|풀이 이름/ })).toHaveValue('Imported loop');
  // Invalid code produces a reviewable error, never a server error or a silent removal.
  solutions[2][3] = '  ';
  const invalid = await page.request.post(url, { headers: { ...headers, 'content-type': 'application/octet-stream' }, data: writeWorkbook({ sheets: [...workbook.sheets].map(([name, rows]) => ({ name, rows })) }) });
  expect(invalid.ok()).toBe(true);
  expect((await invalid.json()).counts.errors).toBeGreaterThan(0);
});
