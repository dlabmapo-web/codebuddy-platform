import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { routes } from '../../packages/web/src/lib/routes';

/**
 * The learning assistant end to end on localhost: the real application and
 * grader, with a local stand-in for the model. One story in order, because
 * each step uses what the last one left.
 */
const studio = 'http://127.0.0.1:3309';
const provider = 'http://127.0.0.1:4320';
const rpcBase = 'http://127.0.0.1:4319/api/rpc/';
const shots = resolve(__dirname, '../../test-results/ai-assistant-shots');

const SHORT = 'n = int(input())\ntotal = 0\nfor i in range(1, n):\n    total += i\nprint(total)';
const NAME_ERROR = 'n = int(input())\nfor i in range(1, n + 1):\n    total += i\nprint(total)';
const EXTRA_TEXT = 'n = int(input())\nprint("Sum:", n * (n + 1) // 2)';
const HIDDEN_ONLY = 'n = int(input())\nprint({5: 15, 3: 6}.get(n, 0))';
const CORRECT = 'n = int(input())\nprint(n * (n + 1) // 2)';

type Fixture = { id: string; academy: { id: string; slug: string }; username?: string };
type Room = { courseId: string; lectureId: string; materialId: string; studentMembershipId: string; classes: { id: string }[] };
type ModelLog = { requests: { kind: string; store: boolean; instructions: string; input: string }[] };

test.describe.configure({ mode: 'serial' });
let author: Fixture, learner: Fixture, other: Fixture, room: Room;
let staff: Page, student: Page, tutorPage: Page;

async function fixture(request: APIRequestContext, data: object): Promise<Fixture> {
  const response = await request.post(`${provider}/fixtures`, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function setAi(request: APIRequestContext, data: object) {
  const response = await request.post(`${provider}/fixtures/${author.id}/ai`, { data });
  expect(response.ok(), await response.text()).toBe(true);
}
async function model(request: APIRequestContext): Promise<ModelLog> {
  return (await request.get(`${provider}/testing/ai-model`)).json();
}
const setModel = (request: APIRequestContext, mode: string) => request.post(`${provider}/testing/ai-model`, { data: { mode } });
async function enter(browser: Browser, who: Fixture, locale = 'en') {
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
  const started = page.waitForResponse((response) => /\/learn\/(?:submit|createSubmission)/i.test(response.url()) && response.request().method() === 'POST', { timeout: 60_000 }).catch(() => null);
  await page.getByRole('button', { name: /^(Submit|제출)$/ }).first().click();
  await started;
}
const shot = (page: Page, name: string) => page.screenshot({ path: resolve(shots, `${name}.png`) });
const exercise = () => routes.academyLearnExercise(author.academy.slug, room.materialId, { classId: room.classes[0]!.id });

test.beforeAll(async ({ browser, playwright }) => {
  test.setTimeout(600_000);
  await mkdir(shots, { recursive: true });
  const request = await playwright.request.newContext();
  author = await fixture(request, { role: 'lab_head', name: 'Owner Person' });
  learner = await fixture(request, { role: 'student', name: 'Minji Learner', parentFixtureId: author.id });
  other = await fixture(request, { role: 'student', name: 'Other Learner', parentFixtureId: author.id });
  const tutor = await fixture(request, { role: 'tutor', name: 'Tutor Person', parentFixtureId: author.id });
  staff = await enter(browser, author);
  student = await enter(browser, learner);
  tutorPage = await enter(browser, tutor);
  const seeded = await request.post(`${provider}/fixtures/${author.id}/classroom`, { data: { studentFixtureId: learner.id, teacherFixtureId: tutor.id, emptyWork: true } });
  expect(seeded.ok(), await seeded.text()).toBe(true);
  room = await seeded.json();
  await setModel(request, 'ok');
  await request.dispose();
});

test('without the academy switch: the error coach works, and no AI', async ({ request }) => {
  await setAi(request, { enabled: false, materialId: room.materialId });
  await student.goto(exercise());
  await submit(student, NAME_ERROR);
  // The coach Cove already had, now after Submit: no AI, the student's own line.
  await expect(student.getByTestId('error-coach')).toContainText('Python does not recognise this name', { timeout: 120_000 });
  await expect(student.getByTestId('ai-help')).toHaveCount(0);
  await shot(student, '01-coach-after-submit');
  // A rule, too, needs no AI, and shows at once.
  await submit(student, EXTRA_TEXT);
  await expect(student.getByTestId('rule-explanation')).toContainText('printed something else', { timeout: 120_000 });
  await expect(student.getByTestId('ai-help')).toHaveCount(0);
  await shot(student, '02-rule-no-ai');
  expect((await model(request)).requests).toEqual([]);
});

test('AI writes the library, and the real grader drops what is wrong', async ({ request }) => {
  await setAi(request, { enabled: true });
  await staff.goto(`${routes.academyCourse(author.academy.slug, room.courseId)}/lectures/${room.lectureId}/exercises/${room.materialId}`);
  await staff.getByTestId('open-ai-library').click({ timeout: 120_000 });
  const panel = staff.getByTestId('ai-library');
  await expect(panel).toBeVisible();
  // Nobody presses anything: the job finds the problem by itself.
  await expect.poll(async () => (await rpc(staff, 'aiAssistant/getLibrary', {
    academyId: author.academy.id, courseId: room.courseId, materialId: room.materialId,
  })).body.state, { timeout: 420_000, intervals: [5_000] }).toBe('READY');
  await staff.reload();
  await staff.getByTestId('open-ai-library').click({ timeout: 60_000 });
  await expect(panel.getByRole('status')).toContainText('Ready.');
  const items = panel.getByTestId('ai-library-item');
  // 5 hints minus the one with code; 6 mistakes minus a program that passes and a planted lie.
  await expect(items).toHaveCount(8);
  await expect(panel).toContainText('stops before N');
  await panel.getByText(/^Dropped items \(3\)$/).click();
  await expect(panel).toContainText('Its wrong program passes the tests');
  await expect(panel).toContainText('Second check: Not true for this program.');
  await expect(panel.getByText('really correct')).toHaveCount(0);
  await shot(staff, '03-teacher-library');

  const { requests } = await model(request);
  expect(requests.map((item) => item.kind)).toEqual(['library', 'review']);
  for (const item of requests) {
    expect(item.store).toBe(false);
    // Hidden tests never leave Cove.
    expect(item.input).not.toContain('820');
    expect(item.input).not.toMatch(/Minji|Owner Person/);
  }
  expect(requests[0]!.input).toContain('TEACHER SOLUTION');
  expect(requests[1]!.input).not.toContain('TEACHER SOLUTION');
});

test('the hint bank teaches the AI teacher, and students never see it', async ({ request }) => {
  const before = (await model(request)).requests.length;
  await student.goto(exercise());
  await expect(student.locator('.monaco-editor').first()).toBeVisible({ timeout: 90_000 });
  // The teacher wrote no hints, and the AI's are not shown.
  await expect(student.getByTestId('open-hints')).toHaveCount(0);
  await expect(student.locator('body')).not.toContainText('First write down which numbers should be added.');
  expect((await model(request)).requests.length).toBe(before);
});

test('after Run and Test run: the server checks the examples, and the AI explains from them (the campus courses design, §6)', async ({ request }) => {
  const before = (await model(request)).requests.length;
  const terminal = student.locator('#workspace-terminal-panel');
  const help = student.getByTestId('ai-help');
  await write(student, SHORT);
  // Run with Example 1's input: the browser compares, for free, and turns AI help on.
  await student.getByRole('button', { name: 'Run', exact: true }).click();
  const input = student.getByRole('textbox', { name: 'Program input', exact: true });
  await input.fill('5');
  await input.press('Enter');
  await expect(student.getByTestId('run-example')).toContainText('This is Example 1. Expected 15, you printed 10.', { timeout: 60_000 });
  expect((await model(request)).requests.length).toBe(before);
  await shot(student, '04a-run-example');
  const cards = student.getByTestId('ai-analysis');
  const earlier = await cards.count();
  await help.click();
  // Every answer stays in the thread; the newest is last.
  const card = cards.last();
  await expect(card).toContainText('Example 1 wants 15, but your program prints 10.', { timeout: 60_000 });
  await expect(cards).toHaveCount(earlier + 1);
  await expect(card).toContainText('after Run');
  await shot(student, '04b-run-ai-help');
  const [fromRun] = (await model(request)).requests.slice(before);
  expect(fromRun!.kind).toBe('analysis');
  expect(fromRun!.input).toContain('only the examples were run');
  // Only the examples: no hidden test, no hidden count, no solution.
  expect(fromRun!.input).not.toMatch(/820|HIDDEN TESTS|Hidden tests: \d|TEACHER SOLUTION/);
  expect(fromRun!.instructions).toContain('Cove ran only the examples.');

  // Test run on the same code: the check and its answer are reused, free.
  await student.getByRole('button', { name: 'Test run', exact: true }).click();
  await expect(terminal).toContainText('Test 2', { timeout: 60_000 });
  await help.click();
  await expect(cards.last()).toContainText('Example 1 wants 15', { timeout: 60_000 });
  // The same answer, served again: no second card.
  await expect(cards).toHaveCount(earlier + 1);
  expect((await model(request)).requests.length).toBe(before + 1);

  // Their own input: nobody here knows the answer, so AI help stays off.
  await student.getByRole('button', { name: 'Run', exact: true }).click();
  await input.fill('7');
  await input.press('Enter');
  await expect(terminal).toContainText('21', { timeout: 60_000 });
  await expect(help).toBeDisabled();
  await expect(help).toHaveAttribute('title', "Use an example's input, or press Test run.");

  // Right code: Test run passes, and AI help is off again.
  await write(student, CORRECT);
  await student.getByRole('button', { name: 'Test run', exact: true }).click();
  await expect(terminal).toContainText('Test 2 matches the expected output.', { timeout: 60_000 });
  await expect(help).toBeDisabled();
  // The question is over once the code passes; its answer stays to read.
  await expect(cards).toHaveCount(earlier + 1);
  await expect(student.getByTestId('explain-simpler')).toHaveCount(0);
  expect((await model(request)).requests.length).toBe(before + 1);
});

test('the AI teacher analyses the code, explains more simply, then the teacher', async ({ request }) => {
  const before = (await model(request)).requests.length;
  await submit(student, SHORT);
  await expect(student.getByTestId('ai-invite')).toContainText('Press ✨ AI help', { timeout: 120_000 });
  await shot(student, '04-analyze-offer');
  await student.getByTestId('ai-help').click();
  const card = student.getByTestId('ai-analysis').last();
  await expect(card).toContainText('You passed 0 of 4 tests: for input 5 your program printed 10, not 15.');
  await expect(card).toContainText('stops before n, so the last number is never added.');
  await expect(card.getByTestId('analysis-line')).toContainText('Line 3');
  await expect(card.getByTestId('analysis-line')).toContainText('for i in range(1, n):');
  await expect(student.getByText('2 analyses left for this problem today')).toBeVisible();
  await shot(student, '05-analysis');

  await student.getByTestId('explain-simpler').click();
  await expect(student.getByTestId('ai-simpler').last()).toContainText('Your program forgot the last number.');
  await expect(student.getByTestId('explain-simpler')).toHaveCount(0);
  await shot(student, '06-simpler');

  const asked = (await model(request)).requests.slice(before);
  expect(asked.map((item) => item.kind)).toEqual(['analysis', 'analysis']);
  const [analysed, simpler] = asked;
  expect(analysed!.input).toContain('TESTS: passed 0 of 4. Examples: 0 of 2 passed. Hidden tests: 0 of 2 passed.');
  expect(analysed!.input).toContain('HIDDEN TESTS (their data is secret): 2 failed: 2 printed a number that is too small.');
  // The library knew this mistake by the tests it fails.
  expect(analysed!.input).toMatch(/MATCHED MISTAKE[^\n]*:\n- F1 stops before N/);
  expect(analysed!.input).toContain("TEACHER'S PATH (the intended way, step by step):\n1. First write down which numbers should be added.");
  expect(simpler!.instructions).toContain('did not understand it');
  for (const item of asked) {
    expect(item.store).toBe(false);
    expect(item.input).toContain('3| for i in range(1, n):');
    // Never a hidden test, a solution, a name or an id.
    expect(item.input + item.instructions).not.toMatch(/820|780|Minji|TEACHER SOLUTION|while n > 0/);
    expect(item.input + item.instructions).not.toContain(room.materialId);
    expect(item.input + item.instructions).not.toContain(learner.id);
  }

  await card.getByRole('button', { name: 'Report' }).click();
  await expect(card).toContainText('Reported. Thank you.');
  // The third analysis of the day on this problem is the last.
  await submit(student, SHORT);
  const given = await student.getByTestId('ai-analysis').count();
  await student.getByTestId('ai-help').click({ timeout: 120_000 });
  await expect(student.getByTestId('ai-analysis')).toHaveCount(given + 1);
  await expect(student.getByTestId('ai-state')).toContainText("used today's AI analyses");
  await expect(student.getByTestId('explain-simpler')).toHaveCount(0);
  await submit(student, SHORT);
  await student.getByTestId('ai-help').click({ timeout: 120_000 });
  await expect(student.getByTestId('ai-state')).toContainText("used today's AI analyses");
  // Nothing new to read; every earlier answer is still there.
  await expect(student.getByTestId('ai-analysis')).toHaveCount(given + 1);
  await student.getByTestId('ask-teacher').click();
  await expect(student.getByTestId('student-help-request')).toContainText(/Requested|requested|waiting/i);
  await shot(student, '07-limit-and-teacher');
  expect((await model(request)).requests.length).toBe(before + 3);
});

test('only the student who submitted can read or ask; their teacher reads the analysis', async () => {
  const history = await rpc(student, 'learn/listSubmissions', { academyId: author.academy.id, materialId: room.materialId });
  const ids = (history.body.submissions as { submissionId: string }[]).map((item) => item.submissionId);
  let id = '';
  for (const candidate of ids) {
    if ((await rpc(student, 'learn/getAiHelp', { academyId: author.academy.id, submissionId: candidate })).body.replies.length === 2) id = candidate;
  }
  expect(id).not.toBe('');
  for (const page of [staff, tutorPage]) {
    expect((await rpc(page, 'learn/getAiHelp', { academyId: author.academy.id, submissionId: id })).status).toBeGreaterThanOrEqual(400);
    expect((await rpc(page, 'learn/requestAiHelp', { academyId: author.academy.id, submissionId: id, locale: 'en', requestId: crypto.randomUUID() })).status).toBeGreaterThanOrEqual(400);
  }
  // A student may read neither the library nor the operator's numbers.
  expect((await rpc(student, 'aiAssistant/getLibrary', { academyId: author.academy.id, courseId: room.courseId, materialId: room.materialId })).status).toBeGreaterThanOrEqual(400);
  // The campus's AI numbers are its manager's: not a student's, not a tutor's.
  expect((await rpc(student, 'aiAssistant/academyUsage', { academyId: author.academy.id })).status).toBeGreaterThanOrEqual(400);
  expect((await rpc(tutorPage, 'aiAssistant/academyUsage', { academyId: author.academy.id })).status).toBeGreaterThanOrEqual(400);
  expect((await rpc(staff, 'aiAssistant/academyUsage', { academyId: author.academy.id })).status).toBe(200);

  await tutorPage.goto(routes.academyTeachSubmission(author.academy.slug, room.classes[0]!.id, room.studentMembershipId, id));
  // The review opens on the AI teacher's tab, on this attempt, the newest answer open.
  await expect(tutorPage.getByTestId('review-tab-ai')).toHaveAttribute('aria-selected', 'true', { timeout: 120_000 });
  const replies = tutorPage.getByTestId('review-ai-replies');
  await expect(replies).toContainText('You passed 0 of 4 tests');
  await expect(replies).toContainText('Explained more simply');
  await expect(replies).toContainText('Reported by the student');
  // And what it said after Run, with the code it checked.
  await tutorPage.getByTestId('review-ai-list-code').click();
  const fromCode = tutorPage.getByTestId('review-ai-code-replies');
  await expect(fromCode).toContainText('after Run');
  await expect(fromCode).toContainText('Example 1 wants 15');
  await expect(fromCode).toContainText('The code it checked');
  // The tests are a tab away.
  await tutorPage.getByTestId('review-tab-tests').click();
  await expect(tutorPage.getByRole('tabpanel')).toContainText('Case 1');
  await shot(tutorPage, '08-teacher-review');
});

test("a teacher's edit changes what the AI teacher is told; a hidden mistake is not used", async () => {
  await staff.reload();
  await staff.getByTestId('open-ai-library').click({ timeout: 90_000 });
  const panel = staff.getByTestId('ai-library');
  await expect(panel).toContainText('failed submissions · 1 student');
  const mistake = panel.getByTestId('ai-library-item').filter({ hasText: 'stops before N' });
  await mistake.getByRole('button', { name: 'Edit', exact: true }).click();
  await mistake.getByRole('textbox', { name: 'Korean' }).fill('선생님 수정: n까지 더해야 해요. 반복은 어디까지 가나요?');
  await mistake.getByRole('textbox', { name: 'English' }).fill('Teacher edit: n must be added too. Where does your loop go?');
  await mistake.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(panel.getByTestId('ai-library-item').filter({ hasText: 'Teacher edit' })).toContainText('Edited by staff');
  await panel.getByTestId('ai-library-item').filter({ hasText: 'starts at two' }).getByRole('button', { name: 'Hide', exact: true }).click();
  await expect(panel.getByTestId('ai-library-item').filter({ hasText: 'starts at two' })).toContainText('Hidden');
  await shot(staff, '09-teacher-edit');
});

test('Korean, a hidden-only failure, code in an answer, a broken model and a pass', async ({ browser, request }) => {
  // Another student, in Korean, so their limits are their own.
  const page = await enter(browser, other, 'ko');
  await setAi(request, { enabled: true, enrollFixtureId: other.id, classId: room.classes[0]!.id });
  await page.goto(exercise());
  await submit(page, HIDDEN_ONLY);
  let before = (await model(request)).requests.length;
  await page.getByTestId('ai-help').click({ timeout: 120_000 });
  await expect(page.getByTestId('ai-analysis').last()).toContainText('숨겨진 테스트에서 너무 작은 수를 출력했어요.');
  const [hidden] = (await model(request)).requests.slice(before);
  expect(hidden!.instructions).toContain('해요체');
  expect(hidden!.input).toContain('Examples: 2 of 2 passed. Hidden tests: 0 of 2 passed.');
  expect(hidden!.input).toContain('HIDDEN TESTS (their data is secret): 2 failed: 2 printed a number that is too small.');
  expect(hidden!.input).not.toMatch(/820|"40"|FAILED EXAMPLES/);
  await shot(page, '10-korean-hidden');

  // The teacher's edit is what the AI teacher now reads; the hidden mistake is gone.
  await setModel(request, 'code');
  await submit(page, SHORT);
  before = (await model(request)).requests.length;
  await page.getByTestId('ai-help').click({ timeout: 120_000 });
  // An answer with new code in it is never shown.
  await expect(page.getByTestId('ai-fallback')).toBeVisible();
  const [edited] = (await model(request)).requests.slice(before);
  expect(edited!.input).toMatch(/MATCHED MISTAKE[^\n]*:\n- F1 stops before N: 선생님 수정/);
  expect(edited!.input).not.toContain('starts at two');
  await expect(page.locator('body')).not.toContainText('range(1, n + 1)');

  // A broken model: a fixed text, the teacher, and everything else still works.
  await setModel(request, 'fail');
  await submit(page, SHORT);
  before = (await model(request)).requests.length;
  await page.getByTestId('ai-help').click({ timeout: 120_000 });
  await expect(page.getByTestId('ai-fallback')).toBeVisible();
  await expect(page.getByTestId('ask-teacher')).toBeVisible();
  // One click is at most one call.
  expect((await model(request)).requests.length).toBe(before + 1);
  await shot(page, '11-model-down');
  await setModel(request, 'ok');

  await submit(page, CORRECT);
  await expect(page.getByTestId('result-passed')).toContainText('4 / 4', { timeout: 120_000 });
  await expect(page.getByTestId('learner-help')).toHaveCount(0);
  await page.context().close();
});

test('switching the academy off removes AI and keeps the rest', async ({ request }) => {
  await setAi(request, { enabled: false });
  await student.goto(exercise());
  await submit(student, EXTRA_TEXT);
  await expect(student.getByTestId('rule-explanation')).toBeVisible({ timeout: 120_000 });
  await expect(student.getByTestId('ai-help')).toHaveCount(0);
  await setAi(request, { enabled: true });
});

test('the campus manager sees the campus’s counts and cost, and nobody’s words', async () => {
  // Settings → AI teacher, only where the campus has the AI teacher on.
  await staff.goto(routes.academy(author.academy.slug));
  await staff.getByRole('link', { name: 'AI teacher', exact: true }).click();
  await expect(staff).toHaveURL(new RegExp(`${routes.academyAiTeacher(author.academy.slug)}$`));
  const main = staff.getByRole('main');
  await expect(main).toContainText('How this campus uses the AI teacher', { timeout: 120_000 });
  await expect(main).toContainText('Student help');
  await expect(main).toContainText(/a problem each day/);
  await expect(main).toContainText('No daily limit across problems');
  await expect(main).toContainText(/Monthly limit, all campuses\s*\$1\.00/);
  await expect(main).toContainText('Courses with the AI teacher');
  await expect(main).not.toContainText('Minji');
  await expect(main).not.toContainText('left out the last number');
  await shot(staff, '12-campus-ai-teacher');
});
