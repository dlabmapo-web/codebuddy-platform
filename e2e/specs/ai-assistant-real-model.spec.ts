import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { routes } from '../../packages/web/src/lib/routes';

/**
 * One student's whole path with the real model, on an invented problem and
 * invented people. Run by `test-ai-assistant.sh --real-model` only. It costs
 * well under one cent; Cove's own monthly limits are $1 here.
 */
const studio = 'http://127.0.0.1:3309';
const provider = 'http://127.0.0.1:4320';
const rpcBase = 'http://127.0.0.1:4319/api/rpc/';
const out = resolve(__dirname, '../../test-results/ai-assistant-real-model');
const SHORT = 'n = int(input())\ntotal = 0\nfor i in range(1, n):\n    total += i\nprint(total)';
const MULTIPLY = 'n = int(input())\ntotal = 1\nfor i in range(1, n + 1):\n    total *= i\nprint(total)';

type Fixture = { id: string; academy: { id: string; slug: string } };
type Room = { courseId: string; lectureId: string; materialId: string; classes: { id: string }[] };

async function fixture(request: APIRequestContext, data: object): Promise<Fixture> {
  const response = await request.post(`${provider}/fixtures`, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function enter(browser: Browser, who: Fixture, locale: string) {
  const context = await browser.newContext({ baseURL: studio, viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: 'i18next', value: locale, url: studio }]);
  const page = await context.newPage();
  const response = await page.request.get('/sso/start', { maxRedirects: 0, timeout: 180_000 });
  const target = new URL(response.headers().location!);
  target.searchParams.set('fixture', who.id);
  await page.goto(`${provider}/os/authorize?${target.searchParams}`);
  await expect(page).toHaveURL(/\/academy\//);
  return page;
}
async function rpc(page: Page, method: string, input: object) {
  const parts = (await page.context().cookies()).filter((cookie) => /auth-token(?:\.\d+)?$/.test(cookie.name)).sort((a, b) => a.name.localeCompare(b.name));
  const token = JSON.parse(Buffer.from(parts.map((cookie) => cookie.value).join('').replace(/^base64-/, ''), 'base64url').toString()).access_token as string;
  const response = await page.request.post(rpcBase + method, { headers: { Authorization: `Bearer ${token}` }, data: { json: input } });
  return { status: response.status(), body: (await response.json()).json };
}
async function submit(page: Page, code: string) {
  await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 90_000 });
  await expect.poll(() => page.evaluate((next) => {
    const { monaco } = window as unknown as { monaco?: { editor: { getModels(): { setValue(value: string): void }[] } } };
    const first = monaco?.editor.getModels()[0];
    first?.setValue(next);
    return Boolean(first);
  }, code), { timeout: 60_000 }).toBe(true);
  await page.getByRole('button', { name: /^(Submit|제출)$/ }).first().click();
}

test('the real model writes a library and analyses students, in English and Korean', async ({ browser, request }) => {
  test.setTimeout(900_000);
  await mkdir(out, { recursive: true });
  const author = await fixture(request, { role: 'lab_head', name: 'Owner Person' });
  const english = await fixture(request, { role: 'student', name: 'Student One', parentFixtureId: author.id });
  const korean = await fixture(request, { role: 'student', name: 'Student Two', parentFixtureId: author.id });
  const staff = await enter(browser, author, 'en');
  const one = await enter(browser, english, 'en');
  const two = await enter(browser, korean, 'ko');
  const seeded = await request.post(`${provider}/fixtures/${author.id}/classroom`, { data: { studentFixtureId: english.id, emptyWork: true } });
  expect(seeded.ok(), await seeded.text()).toBe(true);
  const room = await seeded.json() as Room;
  const classId = room.classes[0]!.id;
  const ai = await request.post(`${provider}/fixtures/${author.id}/ai`, { data: { enabled: true, materialId: room.materialId, enrollFixtureId: korean.id, classId } });
  expect(ai.ok(), await ai.text()).toBe(true);

  // 1. The library: written, run through Cove's grader, reviewed. Nobody presses anything.
  const target = { academyId: author.academy.id, courseId: room.courseId, materialId: room.materialId };
  await expect.poll(async () => (await rpc(staff, 'aiAssistant/getLibrary', target)).body.state, { timeout: 600_000, intervals: [10_000] })
    .toMatch(/^(READY|FAILED)$/);
  const library = (await rpc(staff, 'aiAssistant/getLibrary', target)).body;
  await writeFile(resolve(out, 'library.json'), JSON.stringify(library, null, 2));
  expect(library.state, `library ended ${library.state} with ${library.errorCode}`).toBe('READY');
  await staff.goto(`${routes.academyCourse(author.academy.slug, room.courseId)}/lectures/${room.lectureId}/exercises/${room.materialId}`);
  await staff.getByTestId('open-ai-library').click({ timeout: 120_000 });
  await expect(staff.getByTestId('ai-library')).toContainText('Ready.');
  await staff.screenshot({ path: resolve(out, '1-library.png'), fullPage: true });

  // 2. No AI hints for students: what the AI knows teaches the AI teacher only.
  const exercise = routes.academyLearnExercise(author.academy.slug, room.materialId, { classId });
  await one.goto(exercise);
  await expect(one.locator('.monaco-editor').first()).toBeVisible({ timeout: 120_000 });
  await expect(one.getByTestId('open-hints')).toHaveCount(0);

  // 3. An analysis, and once more simply.
  const answers: Record<string, string[]> = { en: [], ko: [] };
  const sections = (page: Page, testId: string) => page.getByTestId(testId).locator('dd').allTextContents();
  await submit(one, SHORT);
  await one.getByTestId('analyze').click({ timeout: 120_000 });
  await expect(one.getByTestId('ai-analysis').or(one.getByTestId('ai-fallback')).first()).toBeVisible({ timeout: 30_000 });
  if (await one.getByTestId('ai-analysis').isVisible()) {
    answers.en.push(...await sections(one, 'ai-analysis'));
    await one.getByTestId('explain-simpler').click();
    await expect(one.getByTestId('ai-simpler').or(one.getByTestId('ai-fallback')).first()).toBeVisible({ timeout: 30_000 });
    if (await one.getByTestId('ai-simpler').isVisible()) answers.en.push(...await sections(one, 'ai-simpler'));
  }
  await one.screenshot({ path: resolve(out, '3-analysis-en.png') });

  await two.goto(exercise);
  await submit(two, MULTIPLY);
  await two.getByTestId('analyze').click({ timeout: 120_000 });
  await expect(two.getByTestId('ai-analysis').or(two.getByTestId('ai-fallback')).first()).toBeVisible({ timeout: 30_000 });
  if (await two.getByTestId('ai-analysis').isVisible()) answers.ko.push(...await sections(two, 'ai-analysis'));
  await two.screenshot({ path: resolve(out, '4-analysis-ko.png') });
  await writeFile(resolve(out, 'answers.json'), JSON.stringify(answers, null, 2));

  // Most answers get through; a refused one shows a fixed message instead, never code.
  expect(answers.en.length + answers.ko.length).toBeGreaterThan(0);
  for (const text of [...answers.en, ...answers.ko]) {
    // No answer: neither the fix nor the expected sums of the hidden tests.
    expect(text).not.toMatch(/range\(1,\s*n\s*\+\s*1\)|\b820\b|n\s*\*\s*\(n\s*\+\s*1\)/);
  }
  for (const page of [staff, one, two]) await page.context().close();
});
