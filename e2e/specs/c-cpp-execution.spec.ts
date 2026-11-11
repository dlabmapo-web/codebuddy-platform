import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { routes } from '../../packages/web/src/lib/routes';

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
async function starterCode(materialId: string): Promise<string> {
  return (await db.query('SELECT starter_code FROM programming_exercises WHERE material_id=$1', [materialId])).rows[0].starter_code;
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
    await page.goto(routes.academyLearnExercise(f.slug, materialId, { classId: f.ids.class }));
    await expect.poll(() => language(page)).toBe(name === 'C' ? 'c' : 'cpp');
    // The problem's own program, whatever an earlier test saved as this
    // student's code (the line-by-line Run test uses the same C problem).
    await setCode(page, await starterCode(materialId));
    // As in Python: Run starts the program; when it waits for input the
    // terminal takes a line, and Enter carries on. No separate input box.
    await expect(page.getByRole('textbox', { name: 'Program input', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Program input', exact: true });
    await input.fill('40 2');
    await input.press('Enter');
    await expect(page.locator('#workspace-terminal-panel')).toContainText('The program finished.', { timeout: 45_000 });
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
    const review = (id: string) => routes.academyTeachSubmission(f.slug, f.ids.class, f.ids.studentMembership, id);
    await teacher.goto(review(failure.id));
    await expect(teacher.getByRole('heading', { name: 'Compile error', exact: true })).toBeVisible();
    await expect(teacher.locator('main')).toContainText('error:');
    await expect.poll(() => language(teacher)).toBe(name === 'C' ? 'c' : 'cpp');
    await teacher.goto(review(crash.id));
    await expect(teacher.locator('main')).toContainText('exit code 3');
    await teacher.goto(`${routes.academyTeachProgress(f.slug, f.ids.class)}?view=students&student=${f.ids.studentMembership}&reviewMaterial=${materialId}&attempt=${failure.id}`);
    // A bookmark of the old in-dashboard review opens the student-work page.
    await teacher.waitForURL((url) => url.pathname.endsWith(`/students/${f.ids.studentMembership}/work/${materialId}`));
    await teacher.getByRole('tab', { name: 'Saved submission result', exact: true }).click();
    await expect(teacher.getByRole('tab', { name: 'Saved submission result', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(teacher.locator('pre:visible').filter({ hasText: 'Compile error' })).toContainText('error:');
    await expect.poll(() => language(teacher)).toBe(name === 'C' ? 'c' : 'cpp');
    await teacher.screenshot({ path: test.info().outputPath(name + '-compile-history.png'), fullPage: true });
    await teacher.goto(routes.academyTeachStudentLive(f.slug, f.ids.class, f.ids.studentMembership));
    await expect(teacher.locator('body')).toContainText('Local student');
    await expect(teacher.getByRole('button', { name: 'Run', exact: true })).toHaveCount(0);
    expect(pyodide).toEqual([]);
    expect(errors).toEqual([]);
    await teacherContext.close();
    await context.close();
  });
}

test('a student\'s C Run reads line after line like a terminal, and takes a pasted block with Ctrl+D', async ({ browser }) => {
  const f = fixture();
  const context = await browser.newContext({ storageState: f.auth.student });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const starts: string[] = [];
  page.on('request', request => { if (request.url().includes('startRunCheck')) starts.push(request.postData() ?? ''); });
  await page.goto(routes.academyLearnExercise(f.slug, f.ids.C, { classId: f.ids.class }));
  // Prompts with no newline and no fflush, as students write them.
  await setCode(page, [
    '#include <stdio.h>',
    'int main(void) {',
    '  int n, x, total = 0, words = 0; char w[64];',
    '  printf("How many? "); if (scanf("%d", &n) != 1) return 1;',
    '  for (int i = 1; i <= n; i++) { printf("Number %d: ", i); scanf("%d", &x); total += x; }',
    '  printf("Total %d\\nWords, then Ctrl+D:\\n", total);',
    '  while (scanf("%63s", w) == 1) words++;',
    '  printf("Words %d\\n", words);',
    '  return 0;',
    '}',
  ].join('\n'));
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const terminal = page.locator('#workspace-terminal-panel');
  const input = page.getByRole('textbox', { name: 'Program input', exact: true });
  // Each prompt is on screen before its line is typed, as in a terminal.
  for (const [prompt, line] of [['How many? ', '3'], ['Number 1: ', '10'], ['Number 2: ', '20'], ['Number 3: ', '12']]) {
    await expect(terminal).toContainText(prompt, { timeout: 45_000 });
    await input.fill(line);
    await input.press('Enter');
  }
  await expect(terminal).toContainText('Words, then Ctrl+D:', { timeout: 45_000 });
  // A copied block: its complete line goes at once, the rest waits in the
  // field, and Ctrl+D sends it with the end of input in one step.
  await input.evaluate((field, text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    field.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, 'alpha beta\ngamma');
  await expect(input).toHaveValue('gamma', { timeout: 45_000 });
  await input.press('Control+d');
  await expect(terminal).toContainText('The program finished.', { timeout: 45_000 });
  const transcript = await terminal.innerText();
  // One transcript that carried on, not one restarted for every line.
  expect(transcript.match(/How many\?/g)).toHaveLength(1);
  for (const text of ['How many? 3', 'Number 1: 10', 'Number 3: 12', 'Total 42', 'Words 3']) expect(transcript).toContain(text);
  // The start, four lines, the pasted line, and the last line with Ctrl+D:
  // each a request of its own, every later one naming the step it continues.
  expect(starts).toHaveLength(7);
  expect(starts.filter(body => body.includes('"continues"'))).toHaveLength(6);
  expect(new Set(starts.map(body => /"clientRequestId":"([^"]+)"/.exec(body)?.[1])).size).toBe(7);
  expect(errors).toEqual([]);
  await context.close();
});

test('C++ submits all ten cases through the native worker', async ({ browser }) => {
  const f = fixture();
  const context = await browser.newContext({ storageState: f.auth.student });
  const page = await context.newPage();
  await page.goto(routes.academyLearnExercise(f.slug, f.ids.CPP10, { classId: f.ids.class }));
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

test('a course is Python or C/C++, and a C/C++ problem chooses C or C++', async ({ browser }) => {
  const f = fixture();
  const context = await browser.newContext({ storageState: f.auth.manager });
  const page = await context.newPage();
  // A new problem in a C/C++ course starts in C, and its author can make it C++.
  await page.goto(`${routes.academyCourse(f.slug, f.ids.courseCpp)}/lectures/${f.ids.lectureCpp}/exercises/new`);
  await expect.poll(() => language(page)).toBe('c');
  await page.getByRole('button', { name: 'C++', exact: true }).click();
  await expect.poll(() => language(page)).toBe('cpp');
  await expect.poll(() => page.evaluate(() => (window as any).monaco?.editor.getModels()[0]?.getValue())).toContain('#include <iostream>');
  await page.screenshot({ path: test.info().outputPath('cpp-authoring.png'), fullPage: true });

  // Creating a course offers Python or C / C++, with no academy switch.
  await page.goto(routes.academyCourses(f.slug));
  await page.getByRole('button', { name: 'New course' }).click();
  await page.getByLabel('Course title').fill('Pointers in C');
  const choices = page.getByRole('radio');
  await expect(choices).toHaveCount(2);
  await expect(page.getByRole('radio', { name: /Python/ })).toBeChecked();
  // The radio is visually hidden inside its card: a person clicks the card.
  await page.locator('label').filter({ hasText: 'C / C++' }).click();
  await expect(page.getByRole('radio', { name: /C \/ C\+\+/ })).toBeChecked();
  await page.screenshot({ path: test.info().outputPath('course-language.png'), fullPage: true });
  await page.getByRole('button', { name: 'Create and open' }).click();
  await expect.poll(async () =>
    (await db.query('SELECT language::text FROM courses WHERE academy_id=$1 AND title=$2', [f.ids.academy, 'Pointers in C'])).rows[0]?.language,
  ).toBe('C_CPP');
  await context.close();
});

test('staff practice runs and tests C and C++ on the server, as the staff member\'s own', async ({ browser }) => {
  const f = fixture();
  const context = await browser.newContext({ storageState: f.auth.manager });
  const page = await context.newPage();
  // A manager opens a problem in staff practice: no class, their own copy.
  await page.goto(routes.academyLearnExercise(f.slug, f.ids.CPP));
  await expect(page.getByText('Your practice does not affect student grades or points.')).toBeVisible();
  await expect.poll(() => language(page)).toBe('cpp');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Program input', exact: true });
  await input.fill('40 2');
  await input.press('Enter');
  await expect(page.locator('#workspace-terminal-panel')).toContainText('The program finished.', { timeout: 45_000 });
  await expect(page.locator('#workspace-terminal-panel')).toContainText('42');
  await page.getByRole('button', { name: 'Test run', exact: true }).click();
  await expect(page.locator('#workspace-terminal-panel')).toContainText('Sample 1 passed.', { timeout: 45_000 });
  // Practice checks are never submissions.
  expect((await db.query('SELECT count(*)::int AS n FROM submissions WHERE material_id=$1 AND user_id=$2', [f.ids.CPP, f.ids.manager])).rows[0].n).toBe(0);
  await page.screenshot({ path: test.info().outputPath('cpp-staff-practice.png'), fullPage: true });
  await context.close();
});

test('the teacher\'s pointer reaches the student on a C/C++ problem', async ({ browser }) => {
  const f = fixture();
  // Unequal screens, as in monitoring-pointer-parity.spec.ts: the arrow must
  // land on the same content, not at the same fraction of a pane.
  const studentContext = await browser.newContext({ storageState: f.auth.student, viewport: { width: 1280, height: 640 } });
  const teacherContext = await browser.newContext({ storageState: f.auth.teacher, viewport: { width: 1600, height: 900 } });
  const student = await studentContext.newPage();
  const teacher = await teacherContext.newPage();
  await student.goto(routes.academyLearnExercise(f.slug, f.ids.C, { classId: f.ids.class }));
  await expect(student.locator('[data-collab-surface="statement"]')).toBeVisible();
  await teacher.goto(routes.academyTeachStudentLive(f.slug, f.ids.class, f.ids.studentMembership));
  await expect(teacher.locator('[data-collab-surface="statement"]')).toBeVisible();
  // The shared coordinate space exists only once both share the document.
  for (const page of [student, teacher])
    await expect(page.locator('[data-collab-canvas="statement"]')).toHaveCount(1);
  const material = (page: Page) => page.locator('[data-collab-canvas="statement"]').getAttribute('data-collab-material');
  expect(await material(student)).toBe(await material(teacher));
  // The description is in a sandboxed frame; the examples are in the page.
  const target = (page: Page) => page.getByTestId('problem-statement').getByText('Example 1', { exact: true }).first();
  const aim = (await target(teacher).boundingBox())!;
  const peer = student.getByTestId('peer-pointer');
  await expect.poll(async () => {
    // Re-moved every poll: the arrow fades after three seconds of stillness.
    await teacher.mouse.move(aim.x + aim.width / 2, aim.y + aim.height / 2);
    return peer.count();
  }, { timeout: 30_000, intervals: [250] }).toBeGreaterThan(0);
  const arrow = (await peer.boundingBox())!;
  const there = (await target(student).boundingBox())!;
  expect(arrow.x).toBeGreaterThanOrEqual(there.x - 4);
  expect(arrow.x).toBeLessThanOrEqual(there.x + there.width + 4);
  expect(arrow.y).toBeGreaterThanOrEqual(there.y - 4);
  expect(arrow.y).toBeLessThanOrEqual(there.y + there.height + 4);
  await teacherContext.close();
  await studentContext.close();
});

/**
 * Submit-click-to-visible-result, apart from page loading, for a cold compile
 * and for resubmitting the same code (the compiled program is reused). Each
 * measured submission flips the visible result between a wrong program
 * (0 / N) and the right one (N / N), so the clock stops on the new result and
 * never on the previous one. A functional smoke on one machine, not capacity.
 */
test('Submit timings: cold compile and cached resubmission, apart from page load', async ({ browser }) => {
  test.setTimeout(240_000);
  const f = fixture();
  const salt = `${Date.now()}`;
  const programs = {
    C: {
      material: f.ids.C, cases: 2,
      right: `#include <stdio.h>\nint main(void) { int a, b; if (scanf("%d %d", &a, &b) != 2) return 1; printf("%d\\n", a + b); return 0; } // ${salt}\n`,
      wrong: `#include <stdio.h>\nint main(void) { int a, b; if (scanf("%d %d", &a, &b) != 2) return 1; printf("%d\\n", a + b + 1); return 0; } // ${salt}\n`,
    },
    'C++ <iostream>': {
      material: f.ids.CPP10, cases: 10,
      right: `#include <iostream>\nint main() { long long a, b; if (!(std::cin >> a >> b)) return 1; std::cout << a + b << "\\n"; } // ${salt}\n`,
      wrong: `#include <iostream>\nint main() { long long a, b; if (!(std::cin >> a >> b)) return 1; std::cout << a + b + 1 << "\\n"; } // ${salt}\n`,
    },
  };
  const report: Record<string, unknown> = {
    conditions: { host: process.platform + '/' + process.arch, cpus: (await import('node:os')).cpus().length, runner: process.env.GITHUB_ACTIONS ? 'github-actions' : 'local', note: 'one student, idle disposable fixture; not classroom capacity' },
  };
  for (const [label, p] of Object.entries(programs)) {
    const context = await browser.newContext({ storageState: f.auth.student });
    const page = await context.newPage();
    const loadStarted = Date.now();
    await page.goto(routes.academyLearnExercise(f.slug, p.material, { classId: f.ids.class }));
    await expect(page.locator('.monaco-editor').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit', exact: true })).toBeEnabled();
    const pageLoadMs = Date.now() - loadStarted;
    const measure = async (code: string, passed: number, kind: 'cold' | 'cached') => {
      const before = (await latest(p.material))?.id;
      await setCode(page, code);
      const clicked = Date.now();
      await page.getByRole('button', { name: 'Submit', exact: true }).click();
      // While grading the header says "Judge running" and the count climbs
      // from 0, so the clock stops only on the final verdict with its count.
      // Alternating wrong and right programs makes that verdict new each time.
      await expect(page.getByTestId('result-hero')).toContainText(passed === p.cases ? 'Accepted' : 'Not accepted', { timeout: 60_000 });
      await expect(page.getByTestId('result-passed')).toContainText(`${passed} / ${p.cases}`, { timeout: 1_000 });
      const clickToVisibleMs = Date.now() - clicked;
      const row = (await db.query('SELECT id, created_at, started_at, graded_at FROM submissions WHERE material_id=$1 ORDER BY created_at DESC, id DESC LIMIT 1', [p.material])).rows[0];
      expect(row.id).not.toBe(before);
      expect(row.graded_at).not.toBeNull();
      const at = (value: Date) => new Date(value).getTime();
      // Admission to commit, split into the queue and the grading itself.
      return { kind, passed, clickToVisibleMs, serverMs: at(row.graded_at) - at(row.created_at),
        queueMs: at(row.started_at) - at(row.created_at), gradingMs: at(row.graded_at) - at(row.started_at) };
    };
    const runs = [
      await measure(p.wrong, 0, 'cold'),
      await measure(p.right, p.cases, 'cold'),
      await measure(p.wrong, 0, 'cached'),
      await measure(p.right, p.cases, 'cached'),
    ];
    report[label] = { cases: p.cases, pageLoadMs, runs };
    await context.close();
  }
  console.log('SUBMIT_TIMINGS ' + JSON.stringify(report));
  mkdirSync(resolve('test-results/c-cpp-browser'), { recursive: true });
  writeFileSync(resolve('test-results/c-cpp-browser/timings.json'), JSON.stringify(report, null, 2));
});
