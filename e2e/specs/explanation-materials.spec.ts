import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
const provider = 'http://127.0.0.1:4320', api = 'http://127.0.0.1:4319/api';
type Fixture = { id: string; academy: { id: string; slug: string } };
async function fixture(request: APIRequestContext, role: string, parentFixtureId?: string): Promise<Fixture> {
  const response = await request.post(provider + '/fixtures', { data: { role, parentFixtureId } });
  expect(response.ok(), await response.text()).toBe(true); return response.json();
}
async function enter(page: Page, fixture: Fixture) {
  const response = await page.request.get('/sso/start', { maxRedirects: 0 });
  const target = new URL(response.headers().location!); target.searchParams.set('fixture', fixture.id);
  await page.goto(provider + '/os/authorize?' + target.searchParams);
  await expect(page).toHaveURL(new RegExp('/academy/' + fixture.academy.slug + '(?:/|$)'));
}
async function token(page: Page) {
  const parts = (await page.context().cookies()).filter(cookie => /auth-token(?:\.\d+)?$/.test(cookie.name)).sort((a,b) => a.name.localeCompare(b.name));
  return JSON.parse(Buffer.from(parts.map(cookie => cookie.value).join('').replace(/^base64-/, ''), 'base64url').toString()).access_token as string;
}
test('author creates an illustrated explanation; student reads without coding tools', async ({ page, browser, request }, info) => {
  const author = await fixture(request, 'lab_head');
  const learner = await fixture(request, 'student', author.id);
  await enter(page, author);
  const studentContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3309' });
  const student = await studentContext.newPage(); await enter(student, learner);
  const seeded = await request.post(`${provider}/fixtures/${author.id}/classroom`, { data: { studentFixtureId: learner.id, emptyWork: true } });
  expect(seeded.ok(), await seeded.text()).toBe(true);
  const room = await seeded.json(); const academyId = author.academy.id;
  await page.goto(`/academy/${author.academy.slug}/content/courses/${room.courseId}`);
  await page.getByRole('button', { name: /^New material$|^새 자료$/ }).first().click();
  await page.getByRole('dialog').getByText(/^Explanation$|^설명 자료$/).click();
  await page.getByRole('button', { name: /^Next$|^다음$/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: /Create an explanation|설명 자료 만들기/ })).toBeVisible();
  await dialog.getByRole('textbox', { name: /^Title$|^제목$/ }).fill('Understanding loops');
  const editor = dialog.locator('.tiptap');
  await editor.fill('A loop repeats a group of instructions.\nTry reading the pattern before writing your code.');
  await dialog.locator('input[type=file]').setInputFiles({ name: 'loop-diagram.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT4kAAAAASUVORK5CYII=', 'base64') });
  await expect(editor.locator('img')).toBeVisible();
  const diagram = '<svg xmlns="http://www.w3.org/2000/svg" width="680" height="190" viewBox="0 0 680 190"><rect width="680" height="190" rx="16" fill="#EDF4FF"/><text x="28" y="36" font-family="sans-serif" font-size="16" font-weight="bold" fill="#1B64DA">THE REPEAT PATTERN</text><rect x="28" y="65" width="170" height="65" rx="10" fill="white"/><rect x="253" y="65" width="170" height="65" rx="10" fill="white"/><rect x="478" y="65" width="170" height="65" rx="10" fill="white"/><g fill="#16181D" font-family="sans-serif" font-size="16"><text x="58" y="104">Check condition</text><text x="282" y="104">Run instructions</text><text x="517" y="104">Repeat</text></g><path d="M205 98h40m-8-6 8 6-8 6M430 98h40m-8-6 8 6-8 6" stroke="#1B64DA" fill="none" stroke-width="2"/><text x="28" y="164" font-family="sans-serif" font-size="13" fill="#5A6270">Keep repeating while the condition is true.</text></svg>';
  await dialog.locator('input[type=file]').setInputFiles({ name: 'repeat-pattern.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(diagram) });
  await expect(editor.locator('img')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('author-writing.png'), fullPage: true });
  await dialog.getByRole('tab', { name: /Student preview|학생 화면 미리보기/ }).click();
  await expect(dialog.locator('article')).toContainText('Understanding loops');
  await page.screenshot({ path: info.outputPath('author-preview.png'), fullPage: true });
  const saved = page.waitForResponse(response => response.url() === api + '/explanations' && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: /Save explanation|설명 자료 저장/ }).click();
  const savedResponse = await saved;
  expect(savedResponse.ok(), await savedResponse.text()).toBe(true);
  const { materialId } = await savedResponse.json();
  await expect(dialog).toBeHidden();
  const headers = { Authorization: 'Bearer ' + await token(page) };
  const target = { academyId, courseId: room.courseId, lectureId: room.lectureId, materialId };
  const hidden = await request.get(api + '/explanations', { params: { academyId, materialId, classId: room.classes[0].id }, headers: { Authorization: 'Bearer ' + await token(student) } });
  expect(hidden.status()).toBe(404);
  // Publish through the real API, then verify the author can reopen the complete body.
  const published = await request.post(api + '/explanations/visibility', { data: { ...target, isVisible: true }, headers });
  expect(published.ok(), await published.text()).toBe(true);
  await page.goto(`/academy/${author.academy.slug}/learn/explanations/${materialId}?preview=true`);
  await page.getByRole('button', { name: /^Edit explanation$|^설명 자료 수정$/ }).click();
  await expect(page.getByRole('dialog').locator('.tiptap')).toContainText('A loop repeats');
  await expect(page.getByRole('dialog').locator('.tiptap img')).toHaveCount(2);
  await page.getByRole('dialog').getByRole('button', { name: /^Cancel$|^취소$/ }).click();
  const runtimeRequests: string[] = [];
  const contentReads: string[] = [];
  student.on('request', req => { if (req.url().includes('/api/explanations')) contentReads.push(req.url()); });
  student.on('request', req => { if (/gui-sessions|practice-submissions|submissions|grading|judge|runtime/.test(req.url())) runtimeRequests.push(req.url()); });
  await student.goto(`/academy/${author.academy.slug}/learn/explanations/${materialId}?classId=${room.classes[0].id}`);
  await expect(student.locator('article h1')).toHaveText('Understanding loops');
  const frame = student.frameLocator('article iframe');
  await expect(frame.locator('body')).toContainText('A loop repeats');
  await expect(frame.locator('img')).toHaveCount(2);
  await expect.poll(() => frame.locator('img').last().evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(student.locator('.monaco-editor, .xterm, [contenteditable=true]')).toHaveCount(0);
  await expect(student.getByRole('button', { name: /^(Run|Test|Submit|실행|제출)$/ })).toHaveCount(0);
  expect(runtimeRequests).toEqual([]);
  expect(contentReads).toEqual([]); // Main content/images arrived with the server render.
  await expect(student.getByRole('link', { name: /^Previous$|^이전$/ })).toHaveAttribute('href', new RegExp('/quizzes/' + room.quizMaterialId));
  const observation = await request.post(api + '/rpc/monitoring/getObservedMaterial', { headers, data: { json: { academyId, classId: room.classes[0].id, membershipId: room.studentMembershipId, materialId } } });
  expect(observation.ok(), await observation.text()).toBe(true);
  const observed = (await observation.json()).json;
  expect(observed.type).toBe('EXPLANATION'); expect(observed.description).toContain('A loop repeats');
  expect(Object.keys(observed.explanationImages)).toHaveLength(2);
  await student.screenshot({ path: info.outputPath('student-desktop.png'), fullPage: true });
  await student.setViewportSize({ width: 390, height: 844 });
  await expect(student.locator('article h1')).toBeVisible();
  await expect(student.locator('button[aria-controls=explanation-course-outline]')).toHaveAttribute('aria-expanded', 'false');
  expect(await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await student.screenshot({ path: info.outputPath('student-mobile.png'), fullPage: true });
  await studentContext.addCookies([{ name: 'cove-theme', value: 'dark', domain: '127.0.0.1', path: '/' }]);
  await student.reload();
  await expect(student.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(student.locator('article h1')).toBeVisible();
  await expect.poll(() => student.frameLocator('article iframe').locator('img').last().evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(student.locator('button[aria-controls=explanation-course-outline]')).toHaveAttribute('aria-expanded', 'false');
  await student.screenshot({ path: info.outputPath('student-mobile-dark.png'), fullPage: true });
  await studentContext.close();
});
