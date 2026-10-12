import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { signInAs } from '../support/auth';
const academyId = '20000000-0000-4000-8000-000000000001';
const courseId = 'ee010000-0000-4000-8000-000000000001';
const lectureId = 'ee010000-0000-4000-8000-000000000020';
const classId = 'e0000000-0000-4000-8000-000000000040';
const api = process.env.E2E_PDF_API ?? 'http://localhost:4000/api/documents';
const fixture = resolve('e2e/fixtures/lecture-material.pdf');
const title = `PDF lesson ${Date.now()}`;
async function expectPaintedPdf(page: Page) {
  await expect
    .poll(() =>
      page.locator('.react-pdf__Page__canvas').evaluate((node) => {
        const canvas = node as HTMLCanvasElement;
        const pixels = canvas
          .getContext('2d')!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        return pixels.some(
          (alpha, index) =>
            index % 4 === 3 && alpha > 0 && pixels[index - 3] < 200,
        );
      }),
    )
    .toBe(true);
}
async function login(page: Page, identifier: string) {
  let authorization = '';
  page.on('request', (request) => {
    const header = request.headers().authorization;
    if (header?.startsWith('Bearer ')) authorization = header;
  });
  await signInAs({ page, identifier, password: 'CoveDev123!' });
  await page.goto(`/academy/development-academy/content/courses/${courseId}`);
  await expect.poll(() => authorization).not.toBe('');
  return authorization;
}
test.beforeAll(async () => {
  await promisify(execFile)(
    'pnpm',
    ['--filter', '@cove/api', 'exec', 'tsx', 'scripts/seed-pdf-e2e.mts'],
    { cwd: process.cwd() },
  );
});
test('author uploads a private PDF; student reads, navigates and downloads the original', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const author = await login(page, 'teamlead@cove.test');
  await page
    .getByRole('button', { name: /Add PDF|PDF 추가/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /Title|제목/ }).fill(title);
  await dialog.getByRole('combobox').selectOption('BOTH');
  await dialog.getByLabel(/PDF file|PDF 파일/).setInputFiles(fixture);
  const saved = page.waitForResponse(
    (response) =>
      response.url() === api && response.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: /Save PDF|PDF 저장/ }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  const { materialId } = (await response.json()) as { materialId: string };
  await expect(dialog).toBeHidden({ timeout: 45_000 });
  await expect(
    page.getByRole('button', { name: new RegExp(`^PDF · ${title}$`) }),
  ).toBeVisible();
  const headers = { Authorization: author };
  const target = { academyId, courseId, lectureId, materialId };
  const preview = await page.request.get(api, {
    params: { academyId, materialId, preview: 'true' },
    headers,
  });
  expect(preview.status()).toBe(200);
  expect(preview.headers()['cache-control']).toBe('private, no-store');
  const initial = await preview.json();
  expect(initial.pdf.pageCount).toBe(2);
  // Public storage delivery cannot bypass the private bucket.
  const publicUrl = initial.url
    .replace('/object/sign/', '/object/public/')
    .split('?')[0];
  expect((await page.request.get(publicUrl)).ok()).toBe(false);
  const learnerContext = await browser.newContext();
  const learner = await learnerContext.newPage();
  const learnerErrors: string[] = [];
  learner.on('pageerror', (error) => learnerErrors.push(error.message));
  let student = '';
  learner.on('request', (r) => {
    if (r.headers().authorization) student = r.headers().authorization!;
  });
  await signInAs({
    page: learner,
    identifier: 'student@cove.test',
    password: 'CoveDev123!',
  });
  const pdfPath = `/academy/development-academy/learn/documents/${materialId}?classId=${classId}`;
  await learner.goto(pdfPath);
  await expect(learner.locator('main[role=alert]')).toContainText(
    /not available|사용할 수 없습니다/,
  );
  const visible = await page.request.post(api + '/visibility', {
    headers,
    data: { ...target, isVisible: true },
  });
  expect(visible.ok()).toBe(true);
  await learner.reload();
  await expect(learner.locator('.react-pdf__Page__canvas')).toBeVisible({
    timeout: 45_000,
  });
  await expect(learner.locator('.react-pdf__Page__textContent')).toContainText(
    'Cove PDF lesson - page one',
  );
  await learner
    .getByRole('button', { name: /Next PDF page|다음 PDF 페이지/ })
    .click();
  await expect(learner.locator('.react-pdf__Page__textContent')).toContainText(
    'page two',
  );
  await learner
    .getByRole('spinbutton', { name: /Zoom percentage|확대 비율/ })
    .fill('150');
  await expect(
    learner.getByRole('spinbutton', { name: /Zoom percentage|확대 비율/ }),
  ).toHaveValue('150');
  await learner.getByRole('button', { name: /Fit page|페이지 맞춤/ }).click();
  await expect(learner.locator('.react-pdf__Page__textContent')).toBeVisible();
  await expectPaintedPdf(learner);
  await learner.screenshot({ path: '/tmp/cove-pdf-reader-desktop.png' });
  const downloadEvent = learner.waitForEvent('download');
  await learner
    .getByRole('button', { name: /Download PDF|PDF 다운로드/ })
    .click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('lecture-material.pdf');
  const downloaded = await readFile((await download.path())!);
  expect(createHash('sha256').update(downloaded).digest('hex')).toBe(
    createHash('sha256')
      .update(await readFile(fixture))
      .digest('hex'),
  );
  await learner
    .getByRole('button', { name: /Toggle fullscreen|전체 화면 전환/ })
    .click();
  await expect
    .poll(() =>
      learner.evaluate(
        () =>
          Boolean(document.fullscreenElement) ||
          Boolean(
            document
              .querySelector('[data-testid="pdf-reader"]')
              ?.classList.contains('fixed'),
          ),
      ),
    )
    .toBe(true);
  await learner
    .getByRole('button', { name: /Toggle fullscreen|전체 화면 전환/ })
    .click();
  await learner.setViewportSize({ width: 390, height: 844 });
  await expect(
    learner.getByRole('button', { name: /Download PDF|PDF 다운로드/ }),
  ).toBeVisible();
  expect(
    await learner.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expectPaintedPdf(learner);
  await learner.screenshot({ path: '/tmp/cove-pdf-reader-mobile.png' });
  await learner.setViewportSize({ width: 1280, height: 800 });
  await learner
    .getByRole('link', { name: /Previous lesson|이전 학습/ })
    .click();
  await expect(learner).toHaveURL(/learn\/exercises\/ee010000/);
  await expect(learner.locator('.monaco-editor')).toBeVisible({
    timeout: 30_000,
  });
  await learner.getByRole('button', { name: /^(Next|다음)$/ }).click();
  await expect(learner).toHaveURL(new RegExp(`documents/${materialId}`));
  // API checks cover refusal before signing, bad bytes, stale edits and failed replacement.
  const invalid = await page.request.post(api + '/upload', {
    params: { academyId, courseId, lectureId },
    headers: {
      ...headers,
      'Content-Type': 'application/octet-stream',
      'X-File-Name': 'fake.pdf',
    },
    data: Buffer.from('%PDF-1.4\ninvalid'),
  });
  expect(invalid.status()).toBe(422);
  const unchanged = await page.request.get(api, {
    params: { academyId, materialId, preview: 'true' },
    headers,
  });
  expect((await unchanged.json()).pdf.revision).toBe(initial.pdf.revision);
  // Replace through the author dialog; the lesson URL remains stable.
  await page
    .getByRole('button', { name: new RegExp(`^PDF · ${title}$`) })
    .click();
  const replacement = Buffer.from(
    (await readFile(fixture)).toString().replaceAll('Cove PDF', 'Next PDF'),
  );
  await page
    .getByRole('dialog')
    .getByLabel(/PDF file|PDF 파일/)
    .setInputFiles({
      name: 'replacement.pdf',
      mimeType: 'application/pdf',
      buffer: replacement,
    });
  const replacementSaved = page.waitForResponse(
    (r) => r.url() === api && r.request().method() === 'POST',
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Save PDF|PDF 저장/ })
    .click();
  expect((await (await replacementSaved).json()).materialId).toBe(materialId);
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 45_000 });
  await learner.reload();
  await expect(learner.locator('.react-pdf__Page__textContent')).toContainText(
    'Next PDF lesson - page one',
  );
  const stale = await page.request.post(api, {
    headers,
    data: {
      ...target,
      title,
      placement: 'MAIN',
      revision: initial.pdf.revision,
    },
  });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).code).toBe('PDF_EDIT_STALE');
  // A resource-only lecture remains visible, with separate Open and Download.
  const resourceTarget = {
    academyId,
    courseId,
    lectureId: 'ee010000-0000-4000-8000-000000000021',
  };
  const resourceUpload = await page.request.post(api + '/upload', {
    params: resourceTarget,
    headers: {
      ...headers,
      'Content-Type': 'application/octet-stream',
      'X-File-Name': 'resource.pdf',
    },
    data: await readFile(fixture),
  });
  expect(resourceUpload.ok()).toBe(true);
  const resourceAsset = await resourceUpload.json();
  const resourceSaved = await page.request.post(api, {
    headers,
    data: {
      ...resourceTarget,
      assetId: resourceAsset.assetId,
      title: 'Resource PDF',
      placement: 'SUPPLEMENTARY',
    },
  });
  expect(resourceSaved.ok()).toBe(true);
  const resourceId = (await resourceSaved.json()).materialId as string;
  await page.request.post(api + '/visibility', {
    headers,
    data: { ...resourceTarget, materialId: resourceId, isVisible: true },
  });
  const resource = await learner.request.get(api, {
    params: { academyId, materialId: resourceId },
    headers: { Authorization: student },
  });
  const resourceData = await resource.json();
  expect(
    resourceData.materials.some(
      (m: { materialId: string }) => m.materialId === resourceId,
    ),
  ).toBe(false);
  await learner.goto(
    `/academy/development-academy/learn/courses/${courseId}?classId=${classId}`,
  );
  await expect(
    learner.getByText('Resource Only Lecture', { exact: true }),
  ).toBeVisible();
  await learner
    .getByRole('button', {
      name: /(?:Expand or collapse|펼치기).*Resource Only Lecture/,
    })
    .click();
  const resourceRow = learner
    .locator('li')
    .filter({ hasText: 'Resource PDF' })
    .last();
  await expect(
    resourceRow.getByRole('link', { name: /^Open$|^열기$/ }),
  ).toBeVisible();
  const resourceDownloadEvent = learner.waitForEvent('download');
  await resourceRow
    .getByRole('button', { name: /^Download$|^다운로드$/ })
    .click();
  expect((await resourceDownloadEvent).suggestedFilename()).toBe(
    'resource.pdf',
  );
  await page.request.delete(api, {
    headers,
    data: { ...resourceTarget, materialId: resourceId },
  });
  const upload = await learner.request.post(api + '/upload', {
    params: { academyId, courseId, lectureId },
    headers: {
      Authorization: student,
      'Content-Type': 'application/octet-stream',
    },
    data: await readFile(fixture),
  });
  expect(upload.status()).toBe(403);
  await page.request.post(api + '/visibility', {
    headers,
    data: { ...target, isVisible: false },
  });
  expect(
    (
      await learner.request.get(api, {
        params: { academyId, materialId },
        headers: { Authorization: student },
      })
    ).status(),
  ).toBe(404);
  expect(errors).toEqual([]);
  expect(learnerErrors).toEqual([]);
  await learnerContext.close();
  await page.request.delete(api, { headers, data: target });
});
