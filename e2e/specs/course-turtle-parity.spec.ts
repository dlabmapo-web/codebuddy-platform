import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { signInAs } from '../support/auth';

const academyId = '20000000-0000-4000-8000-000000000001';
const courseId = 'ee430000-0000-4000-8000-000000000001';
const materialId = 'ee430000-0000-4000-8000-000000000031';
const hiddenId = 'ee430000-0000-4000-8000-000000000032';
const nextId = 'ee430000-0000-4000-8000-000000000033';
const classId = 'e0000000-0000-4000-8000-000000000040';
const root = '/academy/development-academy/learn';
const api = process.env.E2E_TURTLE_API ?? 'http://localhost:4048/api/manual';
test.skip(process.env.E2E_GUI_ENABLED !== '1', 'Requires an isolated real GUI runtime');

async function login(page: Page, identifier: string, path: string) {
  let token = '';
  page.on('request', request => { const auth = request.headers().authorization; if (auth?.startsWith('Bearer ')) token = auth; });
  await signInAs({ page, identifier, password: 'CoveDev123!', initialPath: path, landing: /\/(?:academy\/|welcome$)/ });
  await expect.poll(() => token).not.toBe('');
  return { Authorization: token };
}
async function code(page: Page, value: string) {
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 45000 });
  await expect.poll(() => page.evaluate(next => {
    const models = (window as unknown as { monaco?: { editor: { getModels(): Array<{ setValue(text: string): void; isDisposed(): boolean }> } } }).monaco?.editor.getModels();
    const model = models?.find(model => !model.isDisposed());
    if (!model) return false; model.setValue(next); return true;
  }, value)).toBe(true);
}
async function painted(page: Page) {
  await expect.poll(() => page.locator('[data-testid=turtle-display] canvas').evaluate(canvas => {
    const c = canvas as HTMLCanvasElement;
    if (!c.width || !c.height) return 0;
    const pixels = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let red = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 170 && pixels[i + 1] < 120 && pixels[i + 2] < 120) red++;
    return red;
  }), { timeout: 30000 }).toBeGreaterThan(40);
}
async function run(page: Page, source?: string) {
  if (source) await code(page, source);
  const pending = page.waitForResponse(response => response.url() === api + '/sessions' && response.request().method() === 'POST');
  const began = Date.now();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const response = await pending;
  expect(response.status(), await response.text()).toBe(201);
  return { ...await response.json(), began } as { id: string; began: number };
}
const line = "import turtle\nturtle.tracer(0)\nturtle.pencolor('red')\nturtle.pensize(4)\nturtle.forward(120)\nprint('STATIC_COMPLETE', flush=True)\n";

test.beforeAll(() => {
  execFileSync('pnpm', ['--filter', '@cove/api', 'exec', 'tsx', 'scripts/seed-course-turtle-parity.mts'], { stdio: 'pipe' });
});

test('converted course activity: static/error frames, files, layouts, focus, callbacks, navigation and manual assessment', async ({ page, browser }, info) => {
  test.setTimeout(480000);
  const errors: string[] = [];
  const sockets: string[] = [];
  await page.addInitScript(() => {
    const displaySockets: WebSocket[] = [];
    Object.assign(window, { courseDisplaySockets: displaySockets });
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      if (this.url.includes('/display') && !displaySockets.includes(this)) displaySockets.push(this);
      return send.call(this, data);
    };
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('websocket', socket => { if (socket.url().includes('/display')) sockets.push(socket.url()); });
  const headers = await login(page, 'student@cove.test', `${root}/exercises/${materialId}?classId=${classId}`);
  await expect(page).toHaveURL(new RegExp(`/turtle/${materialId}`));
  await expect(page.getByRole('button', { name: /toggle.*course|course.*outline/i })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('Excluded from score', { exact: false })).toBeVisible();
  await expect(page.locator('footer')).toContainText('1 / 2');
  const before = await page.request.get(api, { headers, params: { academyId, materialId, classId } });
  expect((await before.json()).attempts).toHaveLength(0);
  const first = await run(page, line);
  await expect(page.getByTestId('turtle-terminal')).toContainText('STATIC_COMPLETE');
  await painted(page);
  console.log(`${info.project.name} instant click-to-drawing: ${Date.now() - first.began}ms`);
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
  const count = sockets.length;
  const size = await page.locator('[data-testid=turtle-display] canvas').evaluate(node => ({ width: (node as HTMLCanvasElement).width, height: (node as HTMLCanvasElement).height }));
  await page.getByRole('button', { name: 'Drawing layout', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Drawing on right' }).click();
  await painted(page);
  expect(sockets).toHaveLength(count);
  // Foreground view must work even when native fullscreen rejects.
  await page.evaluate(() => { Element.prototype.requestFullscreen = () => Promise.reject(new Error('Unsupported in test')); });
  await page.getByRole('button', { name: 'Expand drawing' }).click();
  const expanded = page.getByRole('dialog', { name: 'Drawing', exact: true });
  await expect(expanded).toBeVisible();
  await expect(expanded.getByRole('button', { name: 'Close drawing' })).toBeFocused();
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    expect(await expanded.evaluate(node => node.contains(document.activeElement))).toBe(true);
  }
  await page.getByTestId('turtle-display').click();
  await page.keyboard.press('Escape'); // releases keyboard first
  await expect(expanded).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(expanded).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Expand drawing' })).toBeFocused();
  await page.getByRole('button', { name: 'Expand drawing' }).click();
  await page.getByRole('button', { name: 'Close drawing' }).click();
  expect(sockets).toHaveLength(count);
  expect(await page.locator('[data-testid=turtle-display] canvas').evaluate(node => ({ width: (node as HTMLCanvasElement).width, height: (node as HTMLCanvasElement).height }))).toEqual(size);
  await page.screenshot({ path: info.outputPath('drawing-right.png') });

  // Empty files must be saved even before their first character is typed.
  await page.getByRole('button', { name: 'File', exact: true }).click();
  let modal = page.getByRole('dialog', { name: 'Add Python file' });
  await modal.getByLabel('Python file name').fill('../bad.py');
  await modal.getByRole('button', { name: 'Create file' }).click();
  await expect(modal.getByRole('alert')).toContainText('safe .py');
  await modal.getByLabel('Python file name').fill('helper.py');
  await modal.getByRole('button', { name: 'Create file' }).click();
  await expect(modal).toBeHidden();
  await expect.poll(async () => (await (await page.request.get(api, { headers, params: { academyId, materialId, classId } })).json()).draft.files).toHaveProperty(['helper.py'], '');
  await page.reload();
  await page.getByRole('button', { name: 'helper.py', exact: true }).click();
  await code(page, "def draw():\n    import turtle\n    turtle.pencolor('red')\n    turtle.pensize(4)\n    turtle.forward(90)\n");
  await page.getByRole('button', { name: 'main.py', exact: true }).click();
  await run(page, "from helper import draw\ndraw()\nprint('HELPER_IMPORTED', flush=True)\n");
  await painted(page);
  await expect(page.getByTestId('turtle-terminal')).toContainText('HELPER_IMPORTED');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  modal = page.getByRole('dialog', { name: 'Add Python file' });
  await modal.getByLabel('Python file name').fill('helper.py');
  await modal.getByRole('button', { name: 'Create file' }).click();
  await expect(modal.getByRole('alert')).toContainText('already exists');
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();

  const failure = await run(page, line + "raise ValueError('EXPECTED_PARTIAL_ERROR')\n");
  await expect(page.getByTestId('turtle-terminal')).toContainText('EXPECTED_PARTIAL_ERROR');
  await painted(page);
  await expect.poll(async () => (await (await page.request.get(`${api}/sessions/${failure.id}`, { headers })).json()).state).toBe('ERROR');
  await page.screenshot({ path: info.outputPath('partial-error.png') });
  const recovered = await run(page, line.replace('STATIC_COMPLETE', 'CORRECTED_COMPLETE'));
  await painted(page);
  await expect(page.getByTestId('turtle-terminal')).toContainText('CORRECTED_COMPLETE');
  await expect(page.getByTestId('turtle-terminal')).not.toContainText('EXPECTED_PARTIAL_ERROR');
  console.log(`${info.project.name} corrected click-to-drawing: ${Date.now() - recovered.began}ms`);

  const game = await run(page, "import turtle\ns=turtle.Screen()\na=turtle.Turtle(); a.pencolor('red'); a.pensize(4); a.forward(80)\nb=turtle.Turtle(); b.hideturtle(); b.write('Callbacks')\ndef move():\n    a.forward(20)\n    print('KEY_CALLBACK', flush=True)\ns.onkey(move, 'Right'); s.listen()\ns.ontimer(lambda: print('TIMER_CALLBACK', flush=True), 100)\nprint('NAME', input('name: '), flush=True)\nturtle.done()\n");
  await painted(page);
  await expect(page.getByTestId('turtle-terminal')).toContainText('name:');
  await page.getByLabel('Terminal input', { exact: true }).fill('Cove');
  await page.getByLabel('Terminal input', { exact: true }).press('Enter');
  await expect(page.getByTestId('turtle-terminal')).toContainText('NAME Cove');
  await expect(page.getByTestId('turtle-terminal')).toContainText('TIMER_CALLBACK');
  await page.getByRole('button', { name: 'Expand drawing' }).click();
  await page.getByTestId('turtle-display').click();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('turtle-terminal')).toContainText('KEY_CALLBACK');
  await page.keyboard.press('Escape');
  await page.evaluate(() => (window as unknown as { courseDisplaySockets: WebSocket[] }).courseDisplaySockets.at(-1)?.close());
  await expect(page.getByRole('status').filter({ hasText: 'Disconnected' }).first()).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Ready' }).first()).toBeVisible();
  await painted(page);
  await page.getByRole('button', { name: 'Stop', exact: true }).last().click();
  await expect.poll(async () => (await page.request.get(`${api}/sessions/${game.id}`, { headers })).status()).toBe(404);
  await page.getByRole('button', { name: 'Close drawing' }).click();
  await expect(page.getByRole('img', { name: 'Last drawing frame' })).toBeVisible();
  const after = await page.request.get(api, { headers, params: { academyId, materialId, classId } });
  expect((await after.json()).attempts).toHaveLength(0); // Run never grades.

  // Start/Stop during preparation cannot admit a late viewer.
  await code(page, line + 'turtle.update()\nturtle.done()');
  const pending = page.waitForResponse(response => response.url() === api + '/sessions' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  const cancelled = await (await pending).json();
  await expect.poll(async () => (await page.request.get(`${api}/sessions/${cancelled.id}`, { headers })).status()).toBe(404);
  await expect(page.getByTestId('turtle-display')).toHaveCount(0);

  // Navigation explicitly releases the run and leaves standard Python alone.
  const navigating = await run(page, line + 'turtle.update()\nturtle.done()');
  await painted(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Drawing', exact: true }).click();
  await painted(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Expand drawing' }).click();
  await expect(page.getByRole('button', { name: 'Close drawing' })).toBeInViewport();
  await page.screenshot({ path: info.outputPath('mobile-expanded.png') });
  await page.getByRole('button', { name: 'Close drawing' }).click();
  await page.getByRole('tab', { name: 'Terminal', exact: true }).click();
  await expect(page.getByTestId('turtle-terminal')).toContainText('STATIC_COMPLETE');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/exercises/${nextId}`));
  await expect.poll(async () => (await page.request.get(`${api}/sessions/${navigating.id}`, { headers })).status()).toBe(404);
  expect(errors).toEqual([]);
});

test('hidden staff preview has a finite complete outline; students cannot request it', async ({ page, browser }) => {
  const headers = await login(page, 'teamlead@cove.test', `${root}/turtle/${hiddenId}?preview=true`);
  await expect(page.getByRole('heading', { name: 'Hidden Turtle preview' })).toBeVisible();
  await expect(page.locator('footer')).toContainText('2 / 3');
  await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
  const outline = await page.request.post(api.replace('/manual', '/rpc/learn/getCourseOutline'), { headers, data: { json: { academyId, courseId, preview: true } } });
  expect(outline.ok(), await outline.text()).toBe(true);
  expect(await outline.text()).toContain(hiddenId);
  const context = await browser.newContext(); const student = await context.newPage();
  const studentHeaders = await login(student, 'student@cove.test', `${root}/turtle/${materialId}?classId=${classId}`);
  const denied = await student.request.post(api.replace('/manual', '/rpc/learn/getCourseOutline'), { headers: studentHeaders, data: { json: { academyId, courseId, preview: true } } });
  expect(denied.status()).toBe(403);
  const ordinary = await student.request.post(api.replace('/manual', '/rpc/learn/getCourseOutline'), { headers: studentHeaders, data: { json: { academyId, courseId } } });
  expect(ordinary.ok()).toBe(true); expect(await ordinary.text()).not.toContain(hiddenId);
  await context.close();
});

test('submitted Turtle files remain immutable and a teacher rerun/review stays separate from Run', async ({ page, browser }) => {
  test.setTimeout(240000);
  const studentHeaders = await login(page, 'student@cove.test', `${root}/turtle/${materialId}?classId=${classId}`);
  await code(page, line.replace('STATIC_COMPLETE', 'SUBMITTED_DRAWING'));
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.getByText('Awaiting teacher review', { exact: true })).toBeVisible();
  const read = async () => (await (await page.request.get(api, { headers: studentHeaders, params: { academyId, materialId, classId } })).json());
  const submitted = (await read()).attempts[0];
  expect(submitted.includeInScore).toBe(false);
  expect(submitted.files['main.py']).toContain('SUBMITTED_DRAWING');
  expect(submitted.reviews).toEqual([]);
  await code(page, "print('NEW_UNSUBMITTED_DRAFT')");
  await expect.poll(async () => (await read()).draft.files['main.py']).toContain('NEW_UNSUBMITTED_DRAFT');
  expect((await read()).attempts[0].files).toEqual(submitted.files);
  const context = await browser.newContext(); const teacher = await context.newPage();
  const teacherHeaders = await login(teacher, 'teacher@cove.test', `/academy/development-academy/teach/classes/${classId}/manual/${materialId}`);
  await expect(teacher.getByText('Immutable submitted work', { exact: false })).toBeVisible();
  await teacher.getByRole('button', { name: 'Run submitted code' }).click();
  await painted(teacher);
  await expect(teacher.getByTestId('turtle-terminal')).toContainText('SUBMITTED_DRAWING');
  await teacher.getByRole('button', { name: 'Expand drawing' }).click();
  await expect(teacher.getByRole('dialog', { name: 'Drawing', exact: true })).toBeVisible();
  await teacher.getByRole('button', { name: 'Close drawing' }).click();
  await teacher.getByLabel('Score', { exact: true }).fill('87.5');
  await teacher.getByRole('checkbox', { name: /^Completed/ }).check();
  await teacher.getByLabel('Feedback', { exact: true }).fill('The drawing is retained and the submitted files are immutable.');
  await teacher.getByRole('button', { name: 'Publish review' }).click();
  await expect.poll(async () => (await read()).attempts[0].reviews.length).toBe(1);
  const reviewed = (await read()).attempts[0];
  expect(reviewed.reviews[0]).toMatchObject({ completed: true, scoreHundredths: 8750 });
  expect(reviewed.files).toEqual(submitted.files);
  const stale = await teacher.request.post(api + '/review', { headers: teacherHeaders, data: { academyId, materialId, submissionId: submitted.id, expectedVersion: 0, scoreHundredths: 0, completed: false, feedback: 'stale' } });
  expect(stale.status()).toBe(409);
  await context.close();
  // Excluded assessment does not enter the graded course denominator.
  const outline = await page.request.post(api.replace('/manual', '/rpc/learn/getCourseOutline'), { headers: studentHeaders, data: { json: { academyId, courseId, classId } } });
  expect((await outline.json()).json.progress.total).toBe(1);

  // A separate, explicitly scored mission uses teacher assessment, not stdout.
  const authorContext = await browser.newContext(); const author = await authorContext.newPage();
  const authorHeaders = await login(author, 'teamlead@cove.test', `${root}/turtle/${hiddenId}?preview=true`);
  const published = await author.request.post(api + '/visibility', { headers: authorHeaders, data: { academyId, materialId: hiddenId, isVisible: true } });
  expect(published.ok()).toBe(true); await authorContext.close();
  await page.goto(`${root}/turtle/${hiddenId}?classId=${classId}`);
  await expect(page.getByText('Included in score', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.getByText('Awaiting teacher review', { exact: true })).toBeVisible();
  const gradingContext = await browser.newContext(); const grader = await gradingContext.newPage();
  await login(grader, 'teacher@cove.test', `/academy/development-academy/teach/classes/${classId}/manual/${hiddenId}`);
  await grader.getByLabel('Score', { exact: true }).fill('90');
  await grader.getByRole('checkbox', { name: /^Completed/ }).check();
  await grader.getByLabel('Feedback', { exact: true }).fill('Scored Turtle mission reviewed by a teacher.');
  await grader.getByRole('button', { name: 'Publish review' }).click();
  await expect.poll(async () => {
    const result = await page.request.post(api.replace('/manual', '/rpc/learn/getCourseOutline'), { headers: studentHeaders, data: { json: { academyId, courseId, classId } } });
    return (await result.json()).json;
  }).toMatchObject({ progress: { total: 2, solved: 1 }, manualAssessment: { scoreHundredths: 9000, reviewed: 1 } });
  await gradingContext.close();
});

test('converted material keeps its historical programming attempt readable', async ({ page }) => {
  const submission = 'ee430000-0000-4000-8000-000000000090';
  await login(page, 'student@cove.test', `${root}/exercises/${materialId}?classId=${classId}&submission=${submission}`);
  await expect(page).toHaveURL(new RegExp(`/exercises/${materialId}.*submission=${submission}`));
  await expect(page.getByTestId('result-score')).toContainText('75');
  await expect(page.getByRole('heading', { name: 'Converted Turtle introduction' })).toBeVisible();
});
