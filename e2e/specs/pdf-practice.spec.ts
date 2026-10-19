import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { signInAs } from '../support/auth';
import { routes } from '../../packages/web/src/lib/routes';

test.skip(process.env.E2E_PDF_PRACTICE !== '1', 'Opt-in development PDF practice fixture');
const base = new URL(process.env.E2E_BASE_URL ?? 'http://localhost:3000');
if (!['localhost', '127.0.0.1'].includes(base.hostname)) throw new Error('PDF practice tests require localhost');
const academyId = '20000000-0000-4000-8000-000000000001';
const courseId = 'ee070000-0000-4000-8000-000000000001';
const lectureId = 'ee070000-0000-4000-8000-000000000020';
const materialId = 'ee070000-0000-4000-8000-000000000030';
const classId = 'e0000000-0000-4000-8000-000000000040';
const root = '/academy/development-academy';
const editPath = `${root}/content/courses/${courseId}/lectures/${lectureId}/exercises/${materialId}`;
const exercisePath = routes.academyLearnExercise('development-academy', materialId, { classId });
const documentsApi = 'http://localhost:4000/api/documents';

async function replaceCode(page: Page, code: string) {
  await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 90_000 });
  await expect.poll(() => page.evaluate(source => {
    const monaco = (window as unknown as { monaco?: { editor: { getModels(): Array<{ setValue(value: string): void; getValue(): string }> } } }).monaco;
    const model = monaco?.editor.getModels()[0];
    if (!model) return false;
    model.setValue(source);
    return model.getValue() === source;
  }, code)).toBe(true);
}

test.describe.configure({ mode: 'serial' });

test.beforeEach(({ page }) => page.setDefaultTimeout(30_000));

test.beforeAll(() => {
  execFileSync('pnpm', ['--filter', '@cove/api', 'exec', 'tsx', 'scripts/seed-pdf-practice-e2e.mts'], { stdio: 'pipe' });
});

test('author links one PDF; student reads theory and practices without losing a running program', async ({ page, browser }, testInfo) => {
  test.setTimeout(300_000);
  let authorization = '';
  page.on('request', request => { if (request.headers().authorization) authorization = request.headers().authorization!; });
  await signInAs({ page, identifier: 'teamlead@cove.test', password: 'CoveDev123!' });
  await page.goto(editPath);
  console.info("PDF practice: author form opened");
  await page.getByRole('button', { name: /Add PDF material|PDF 자료 추가/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /Title|제목/ }).fill('Practice reference PDF');
  await dialog.getByRole('combobox').selectOption('BOTH');
  await dialog.getByLabel(/PDF file|PDF 파일/).setInputFiles(resolve('e2e/fixtures/lecture-material.pdf'));
  const saved = page.waitForResponse(response => response.url() === documentsApi && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: /Save PDF|PDF 저장/ }).click();
  const response = await saved;
  console.info("PDF practice: document saved", response.status());
  expect(response.status()).toBe(201);
  const pdf = await response.json() as { materialId: string };
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('combobox', { name: /Reference PDF|참고 PDF/ })).toHaveValue(pdf.materialId);
  const headers = { Authorization: authorization };
  expect((await page.request.post(documentsApi + '/visibility', { headers, data: { academyId, courseId, lectureId, materialId: pdf.materialId, isVisible: true } })).ok()).toBe(true);
  await page.getByRole('button', { name: /^Save changes$|^변경사항 저장$|^변경 사항 저장$/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`/content/courses/${courseId}$`), { timeout: 45_000 });
  await expect(page.getByRole('link', { name: /PDF practice exercise/ })).toContainText(/PDF \+ coding practice|PDF \+ 코딩 실습/);
  console.info("PDF practice: exercise saved");
  await page.goto(editPath);
  await expect(page.getByRole('combobox', { name: /Reference PDF|참고 PDF/ })).toHaveValue(pdf.materialId);

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const student = await context.newPage();
  const errors: string[] = [];
  student.on('pageerror', error => {
    // WebKit reports the dashboard's cancelled notification poll on navigation
    // as a page error (trace status -1). Keep PDF, editor and runtime errors fatal.
    if (/\/api\/rpc\/notifications\/list.*access control checks/.test(error.message)) return;
    errors.push(error.message);
  });
  let studentAuthorization = '';
  student.on('request', request => { if (request.headers().authorization) studentAuthorization = request.headers().authorization!; });
  try {
    await signInAs({ page: student, identifier: 'student@cove.test', password: 'CoveDev123!' });
    await student.goto(routes.academyLearnPdf('development-academy', pdf.materialId, { classId }));
    await expect(student.locator('.react-pdf__Page__canvas')).toBeVisible({ timeout: 60_000 });
    await expect(student.locator('.monaco-editor')).toHaveCount(0);
    await student.screenshot({ path: testInfo.outputPath('pdf-theory-desktop.png') });
    console.info("PDF practice: standalone reader passed");
    await student.goto(exercisePath);
    const closeOutline = student.getByRole("button", { name: /Close the course outline|목차 닫기/ });
    if (await closeOutline.isVisible()) await closeOutline.click();
    await expect(student.locator('.react-pdf__Page__canvas')).toBeVisible({ timeout: 60_000 });
    await expect(student.locator('.monaco-editor')).toBeVisible({ timeout: 90_000 });
    console.info("PDF practice: embedded reader and editor loaded");
    await replaceCode(student, 'value = input("Value: ")\nprint(value)');
    const run = student.getByRole('button', { name: /^Run$|^실행$/ });
    await expect(run).toBeEnabled({ timeout: 90_000 });
    await run.click();
    const input = student.getByRole('textbox', { name: /program input|프로그램 입력/i });
    await expect(input).toBeVisible();
    // DOM identity proves the editor was not remounted by PDF operations.
    await student.locator('.monaco-editor').evaluate(node => node.setAttribute('data-retained-editor', 'yes'));
    await student.getByRole('button', { name: /Next PDF page|다음 PDF 페이지/ }).click();
    await expect(student.locator('.react-pdf__Page__textContent')).toContainText('page two');
    await student.getByRole('tab', { name: /Problem statement|문제 설명/ }).click();
    await expect(student.frameLocator('[data-testid="problem-statement"] iframe').getByText('Print hello.', { exact: true })).toBeVisible();
    await student.getByRole('tab', { name: /Reference PDF|참고 PDF/ }).click();
    await expect(student.locator('.react-pdf__Page__textContent')).toContainText('page two');
    await expect(student.locator('[data-retained-editor=yes]')).toBeVisible();
    await expect(input).toBeVisible();
    console.info("PDF practice: reference tabs retained running input");
    await input.fill('hello'); await input.press('Enter');
    await expect(student.getByTestId('terminal')).toContainText('hello');
    await expect(run).toBeEnabled();
    await student.screenshot({ path: testInfo.outputPath('pdf-coding-desktop.png') });

    // A linked reference cannot be replaced by a guessed unrelated exercise context.
    const denied = await student.request.get(documentsApi, { headers: { Authorization: studentAuthorization }, params: { academyId, materialId: pdf.materialId, exerciseMaterialId: 'ee070000-0000-4000-8000-000000000099' } });
    expect(denied.status()).toBe(404);
    const referenced = { academyId, courseId, lectureId, materialId: pdf.materialId };
    const deletion = await page.request.delete(documentsApi, { headers, data: referenced });
    expect(deletion.status()).toBe(409);
    expect((await deletion.json()).code).toBe('PDF_REFERENCE_IN_USE');

    // Existing grading still accepts the same solution after PDF attachment.
    await replaceCode(student, 'print("hello")');
    await student.getByRole('button', { name: /^Submit$|^제출$/ }).click();
    await expect(student.getByText(/^Accepted$|^정답$/)).toBeVisible({ timeout: 60_000 });
    await student.setViewportSize({ width: 375, height: 812 });
    await student.getByRole('button', { name: /^Materials$|^자료$/ }).click();
    await expect(student.locator('.react-pdf__Page__canvas')).toBeVisible();
    await expect(student.locator('.react-pdf__Page__textContent')).toContainText('page two');
    await student.screenshot({ path: testInfo.outputPath('pdf-coding-mobile.png') });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});


test('teacher sees the linked PDF while code monitoring stays on the exercise', async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const studentContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const teacherContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const student = await studentContext.newPage(), teacher = await teacherContext.newPage();
  student.setDefaultTimeout(30_000); teacher.setDefaultTimeout(30_000);
  try {
    await signInAs({ page: student, identifier: 'student@cove.test', password: 'CoveDev123!', initialPath: exercisePath });
    await expect(student.locator('.react-pdf__Page__canvas')).toBeVisible({ timeout: 60_000 });
    await signInAs({ page: teacher, identifier: 'teacher@cove.test', password: 'CoveDev123!',
      initialPath: routes.academyTeachStudentLive('development-academy', classId, '40000000-0000-4000-8000-000000000005') });
    await expect(teacher.locator('.react-pdf__Page__canvas')).toBeVisible({ timeout: 60_000 });
    await expect(teacher.locator('.monaco-editor')).toBeVisible();
    await expect(teacher.getByText(/PDF pages are local|PDF 페이지 선택은/)).toBeVisible();
    await teacher.getByRole('button', { name: /Next PDF page|다음 PDF 페이지/ }).click();
    await expect(teacher.locator('.react-pdf__Page__textContent')).toContainText('page two');
    await expect(student.locator('.react-pdf__Page__textContent')).toContainText('page one');
    await expect(teacher.locator('[data-collab-surface="statement"]')).toHaveCount(0);
    await teacher.screenshot({ path: testInfo.outputPath('pdf-coding-teacher.png') });
  } finally { await studentContext.close(); await teacherContext.close(); }
});

test('the PDF practice entry requires a reference and retains a PDF when the exercise is cancelled', async ({ page }) => {
  test.setTimeout(120_000);
  const builder = routes.academyCourse('development-academy', courseId);
  await signInAs({ page, identifier: 'teamlead@cove.test', password: 'CoveDev123!', initialPath: builder });
  await page.getByRole('link', { name: /^PDF \+ coding practice$|^PDF \+ 코딩 실습$/ }).first().click();
  await expect(page.getByText(/Select a reference PDF to create|참고 PDF를 선택해 주세요/)).toBeVisible();
  await expect(page.getByRole('combobox', { name: /Reference PDF|참고 PDF/ })).toHaveValue('');
  await page.getByRole('button', { name: /Add PDF material|PDF 자료 추가/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /Title|제목/ }).fill('Retained PDF from cancelled practice');
  await expect(dialog.getByRole('combobox')).toHaveValue('SUPPLEMENTARY');
  await dialog.getByLabel(/PDF file|PDF 파일/).setInputFiles(resolve('e2e/fixtures/lecture-material.pdf'));
  await dialog.getByRole('button', { name: /Save PDF|PDF 저장/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/even if you cancel this exercise|실습 작성을 취소해도/)).toBeVisible();
  page.once('dialog', async prompt => { await prompt.accept(); });
  await page.goto(builder);
  await expect(page.getByRole('button', { name: /^PDF · Retained PDF from cancelled practice$/ })).toBeVisible();
});
