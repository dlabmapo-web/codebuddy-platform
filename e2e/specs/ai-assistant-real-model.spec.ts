import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { routes } from '../../packages/web/src/lib/routes';

/**
 * The students' whole path with the real model, on an invented problem and
 * invented people. Run by `test-ai-assistant.sh --real-model` only. It costs
 * about two cents; Cove's own monthly limits are $1 here.
 */
const studio = 'http://127.0.0.1:3309';
const provider = 'http://127.0.0.1:4320';
const rpcBase = 'http://127.0.0.1:4319/api/rpc/';
const out = resolve(__dirname, '../../test-results/ai-assistant-real-model');
const SHORT = 'n = int(input())\ntotal = 0\nfor i in range(1, n):\n    total += i\nprint(total)';
const MULTIPLY = 'n = int(input())\ntotal = 1\nfor i in range(1, n + 1):\n    total *= i\nprint(total)';
/** A mistake the written library may well not know: the running total is printed every time. */
const INSIDE = 'n = int(input())\ntotal = 0\nfor i in range(1, n + 1):\n    total += i\n    print(total)';
/** The fix, the formula, or a hidden test's expected value (40 → 820). */
const GIVES_AWAY = /range\(1,\s*n\s*\+\s*1\)|\b820\b|n\s*\*\s*\(n\s*\+\s*1\)/;

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
async function write(page: Page, code: string) {
  await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 90_000 });
  await expect.poll(() => page.evaluate((next) => {
    const { monaco } = window as unknown as { monaco?: { editor: { getModels(): { setValue(value: string): void }[] } } };
    const first = monaco?.editor.getModels()[0];
    first?.setValue(next);
    return Boolean(first);
  }, code), { timeout: 60_000 }).toBe(true);
}
async function submit(page: Page, code: string) {
  await write(page, code);
  await page.getByRole('button', { name: /^(Submit|제출)$/ }).first().click();
}
/** Presses AI help and waits for an answer or a fixed message. */
async function askAi(page: Page) {
  // Earlier answers stay in the thread: wait for one more, not for any.
  const cards = page.getByTestId('ai-analysis');
  const before = await cards.count();
  await page.getByTestId('ai-help').click({ timeout: 120_000 });
  await expect(cards.nth(before).or(page.getByTestId('ai-fallback')).or(page.getByTestId('ai-examples-passed')).first()).toBeVisible({ timeout: 90_000 });
}

test('the real model learns a problem, helps after Run, Test run and Submit in English and Korean, and learns a new mistake', async ({ browser, request }) => {
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

  const answers: Record<string, string[]> = { run: [], submit: [], simpler: [], testRunKo: [], submitKo: [], newMistake: [] };
  // The newest answer's sections, as written: highlight marks included.
  const sections = (page: Page, testId: string) => page.getByTestId(testId).last().locator('dd').evaluateAll((items) => items.map((item) => item.innerHTML
    .replace(/<mark[^>]*>/g, '**').replace(/<\/mark>/g, '**').replace(/<code[^>]*>/g, '`').replace(/<\/code>/g, '`').replace(/<[^>]+>/g, '')));
  const keep = async (page: Page, key: string, testId = 'ai-analysis') => {
    if (await page.getByTestId(testId).last().isVisible().catch(() => false)) answers[key]!.push(...await sections(page, testId));
    else answers[key]!.push(`(fixed message) ${await page.getByTestId('ai-fallback').textContent().catch(() => '')}`);
  };

  // 3. Run with Example 1's input: the free note, then AI help from the
  // server's check of the examples only (the campus courses design, §6).
  await write(one, SHORT);
  await one.getByRole('button', { name: 'Run', exact: true }).click();
  const input = one.getByRole('textbox', { name: 'Program input', exact: true });
  await input.fill('5');
  await input.press('Enter');
  await expect(one.getByTestId('run-example')).toContainText('Expected 15, you printed 10', { timeout: 90_000 });
  await askAi(one);
  await keep(one, 'run');
  await one.screenshot({ path: resolve(out, '3-run-ai-help-en.png') });

  // 4. Submit: every test, then once more simply.
  await submit(one, SHORT);
  await askAi(one);
  await keep(one, 'submit');
  if (await one.getByTestId('explain-simpler').isVisible()) {
    await one.getByTestId('explain-simpler').click();
    await expect(one.getByTestId('ai-simpler').or(one.getByTestId('ai-fallback')).first()).toBeVisible({ timeout: 60_000 });
    await keep(one, 'simpler', 'ai-simpler');
  }
  await one.screenshot({ path: resolve(out, '4-submit-ai-help-en.png') });

  // 5. Korean: Test run, then AI help from the examples.
  await two.goto(exercise);
  await write(two, MULTIPLY);
  await two.getByRole('button', { name: /^(Test run|테스트 실행)$/ }).click();
  await askAi(two);
  await keep(two, 'testRunKo');
  await two.screenshot({ path: resolve(out, '5-test-run-ai-help-ko.png') });
  await submit(two, MULTIPLY);
  await askAi(two);
  await keep(two, 'submitKo');

  // 6. A mistake the library may not know: an answer that matched none is
  // learned from within about a minute (the campus courses design, §7).
  await write(one, INSIDE);
  await one.getByRole('button', { name: 'Test run', exact: true }).click();
  await askAi(one);
  await keep(one, 'newMistake');
  await one.screenshot({ path: resolve(out, '6-new-mistake-en.png') });
  const unmatched = (await rpc(staff, 'aiAssistant/getLibrary', target)).body.mistakes.unmatched as number;
  const growth: Record<string, unknown> = { unmatchedAnswers: unmatched };
  if (unmatched > 0) {
    await expect.poll(async () => ((await (await request.get(`${provider}/testing/ai-model`)).json()).requests as { kind: string }[])
      .some((item) => item.kind === 'grow'), { timeout: 240_000, intervals: [5_000] }).toBe(true);
    // Proven by the grader and reviewed, or skipped: the model decides what is new.
    await expect.poll(async () => (await rpc(staff, 'aiAssistant/getLibrary', target)).body.state, { timeout: 300_000, intervals: [5_000] }).toBe('READY');
    const grown = ((await rpc(staff, 'aiAssistant/getLibrary', target)).body.items as { origin: string; state: string; label: string; textEn: string; rejectReason: string | null }[])
      .filter((item) => item.origin === 'GROWN');
    growth.grown = grown;
    await staff.reload();
    await staff.getByTestId('open-ai-library').click({ timeout: 120_000 });
    await staff.screenshot({ path: resolve(out, '7-library-after-growth.png'), fullPage: true });
  }
  await writeFile(resolve(out, 'growth.json'), JSON.stringify(growth, null, 2));
  await writeFile(resolve(out, 'answers.json'), JSON.stringify(answers, null, 2));

  // A refused answer shows a fixed message instead; no answer ever gives the fix away.
  const all = Object.values(answers).flat();
  expect(all.filter((text) => !text.startsWith('(fixed message)')).length).toBeGreaterThan(0);
  for (const text of all) expect(text).not.toMatch(GIVES_AWAY);
  // After Run and Test run only the examples ran: kept for a reader to judge.
  await writeFile(resolve(out, 'examples-only-mentions-hidden.json'), JSON.stringify(
    [...answers.run, ...answers.testRunKo, ...answers.newMistake].filter((text) => /hidden|숨겨진|숨은/i.test(text)), null, 2));
  for (const page of [staff, one, two]) await page.context().close();
});
