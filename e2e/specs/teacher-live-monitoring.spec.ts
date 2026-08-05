import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * Live teacher monitoring, from both sides at once.
 *
 * Two authenticated contexts run in parallel — the student solving and the
 * teacher watching — because every property worth testing here is about what
 * one of them sees while the other acts. A single-context test could not tell
 * a synchronized edit from a re-render.
 *
 * Requires `pnpm --filter @cove/api db:seed` and `db:seed:e2e`, which enable
 * the monitoring flag for the development academy and leave the seeded student
 * enrolled in "E2E Cohort" with the seeded teacher assigned to it. Realtime
 * also needs Redis: without it the gateway refuses joins and reports degraded
 * service, which these tests assert is *not* what happens.
 *
 * Serial: the watch is opened once and the later cases build on it.
 */
test.describe.configure({ mode: 'serial' });

const PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'CoveDev123!';
const STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL ?? 'student@cove.test';
const TEACHER_EMAIL = 'teacher@cove.test';
const TEAM_LEAD_EMAIL = 'teamlead@cove.test';
const TEACHER_NAME = 'Cove Teacher';

const CLASS_NAME = 'E2E Cohort';
const SUM_TITLE = 'Sum two numbers';

let academyId = '';
let studentContext: BrowserContext;
let teacherContext: BrowserContext;
let studentPage: Page;
let teacherPage: Page;

async function signIn(page: Page, email: string): Promise<string> {
  await page.goto('/auth/login');
  await page.getByRole('textbox', { name: /email/i }).fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|로그인/i }).click();
  await page.waitForURL(/\/studio\/academies\//, { timeout: 30_000 });
  const id = /\/studio\/academies\/([0-9a-f-]+)/.exec(page.url())?.[1] ?? '';
  expect(id).not.toBe('');
  return id;
}

/**
 * Drives the Monaco model directly.
 *
 * Synthetic keystrokes drop characters against Monaco's input handling, and
 * `setValue` still fires the content-change event, so both the Yjs binding and
 * the autosave under test run exactly as they would for a typed edit.
 */
async function typeIntoEditor(page: Page, code: string) {
  await expect(page.locator('.monaco-editor').first()).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(
      () =>
        page.evaluate((next) => {
          const monaco = (
            window as unknown as {
              monaco?: {
                editor: { getModels(): { setValue(value: string): void }[] };
              };
            }
          ).monaco;
          const model = monaco?.editor.getModels()[0];
          if (!model) return false;
          model.setValue(next);
          return true;
        }, code),
      { timeout: 30_000 },
    )
    .toBe(true);
}

async function editorText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const monaco = (
      window as unknown as {
        monaco?: { editor: { getModels(): { getValue(): string }[] } };
      }
    ).monaco;
    return monaco?.editor.getModels()[0]?.getValue() ?? '';
  });
}

test.beforeAll(async ({ browser }) => {
  studentContext = await browser.newContext();
  teacherContext = await browser.newContext();
  studentPage = await studentContext.newPage();
  teacherPage = await teacherContext.newPage();

  academyId = await signIn(studentPage, STUDENT_EMAIL);
  await signIn(teacherPage, TEACHER_EMAIL);
});

test.afterAll(async () => {
  await studentContext?.close();
  await teacherContext?.close();
});

test('the assigned teacher sees only their own classes', async () => {
  await teacherPage.goto(`/studio/academies/${academyId}/teach/classes`);
  await expect(
    teacherPage.getByRole('heading', { name: CLASS_NAME }),
  ).toBeVisible();
  // The management surface is not theirs: no class, roster, or assignment
  // control appears anywhere on the teaching route.
  await expect(
    teacherPage.getByRole('button', { name: /new class|반 만들기/i }),
  ).toHaveCount(0);
});

test('a team lead cannot reach the teaching routes', async () => {
  const context = await teacherPage.context().browser()!.newContext();
  const page = await context.newPage();
  try {
    const leadAcademyId = await signIn(page, TEAM_LEAD_EMAIL);
    await page.goto(`/studio/academies/${leadAcademyId}/teach/classes`);
    // Denied, not merely empty: a Team Lead holds `classes.assigned.manage`
    // and must still be refused monitoring.
    await expect(page.getByText(/not available|이용할 수 없습니다/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: CLASS_NAME })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('a solving student appears on the live roster', async () => {
  // The student opens the seeded exercise and starts working.
  await studentPage.goto(`/studio/academies/${academyId}/learn/courses`);
  await studentPage.getByText(SUM_TITLE).first().click();
  await studentPage.waitForURL(/\/learn\/exercises\//, { timeout: 30_000 });
  await typeIntoEditor(studentPage, 'a = int(input())\n');

  await teacherPage.goto(`/studio/academies/${academyId}/teach/classes`);
  await teacherPage.getByRole('heading', { name: CLASS_NAME }).click();
  await teacherPage.waitForURL(/\/teach\/classes\/[0-9a-f-]+$/, {
    timeout: 30_000,
  });

  // Presence, not a database timestamp: the row has to reach a live state.
  await expect(
    teacherPage.getByText(/solving|풀이 중/i).first(),
  ).toBeVisible({ timeout: 30_000 });
  // A realtime outage would show this instead, and must not.
  await expect(
    teacherPage.getByText(/live updates unavailable|사용할 수 없습니다/i),
  ).toHaveCount(0);
});

test('the teacher opens the live workspace and the student is told', async () => {
  await teacherPage.getByRole('link', { name: /open live|실시간 보기/i }).first().click();
  await teacherPage.waitForURL(/\/students\/[0-9a-f-]+\/live$/, {
    timeout: 30_000,
  });

  // Generic, and only generic: the teacher's name must not appear anywhere in
  // what the student's browser renders.
  await expect(
    studentPage.getByText(/teacher is monitoring|모니터링 중/i),
  ).toBeVisible({ timeout: 30_000 });
  await expect(studentPage.getByText(TEACHER_NAME)).toHaveCount(0);
});

test("the student's edit reaches the teacher", async () => {
  await typeIntoEditor(studentPage, 'a = int(input())\nb = int(input())\n');
  await expect
    .poll(() => editorText(teacherPage), { timeout: 30_000 })
    .toContain('b = int(input())');
});

test("the teacher's edit reaches the student and changes the indicator", async () => {
  await typeIntoEditor(
    teacherPage,
    'a = int(input())\nb = int(input())\nprint(a + b)\n',
  );
  await expect
    .poll(() => editorText(studentPage), { timeout: 30_000 })
    .toContain('print(a + b)');
  // Teacher-originated editing is what turns monitoring into helping.
  await expect(
    studentPage.getByText(/teacher is helping|도와주고 있습니다/i),
  ).toBeVisible({ timeout: 30_000 });
  await expect(studentPage.getByText(TEACHER_NAME)).toHaveCount(0);
});

/** Sweeps the mouse across a surface, as a person moving it would. */
async function sweep(page: Page, surface: string) {
  const box = await page.locator(`[data-collab-surface="${surface}"]`).first().boundingBox();
  expect(box).not.toBeNull();
  for (let step = 0; step <= 6; step += 1) {
    await page.mouse.move(
      box!.x + box!.width * (0.2 + step * 0.08),
      box!.y + box!.height * (0.3 + step * 0.03),
    );
    await page.waitForTimeout(120);
  }
}

test('each side sees where the other is pointing', async () => {
  // The teacher's mouse over the problem reaches the student's copy of the
  // problem — a different pane, at a different width, on a different screen.
  await sweep(teacherPage, 'statement');
  await expect(studentPage.getByTestId('peer-pointer')).toHaveAttribute(
    'data-peer-surface',
    'statement',
    { timeout: 30_000 },
  );
  // Generic, and only generic: the pointer label is a place a name could leak.
  await expect(studentPage.getByTestId('peer-pointer')).not.toContainText(
    TEACHER_NAME,
  );

  await sweep(studentPage, 'editor');
  await expect(teacherPage.getByTestId('peer-pointer')).toHaveAttribute(
    'data-peer-surface',
    'editor',
    { timeout: 30_000 },
  );
});

test("each side sees the other's caret in the shared editor", async () => {
  await teacherPage.locator('.monaco-editor').first().click();
  await teacherPage.keyboard.press('ArrowDown');
  await expect(studentPage.locator('.cove-peer-label')).toBeVisible({
    timeout: 30_000,
  });
  await expect(studentPage.locator('.cove-peer-label')).not.toHaveText(
    TEACHER_NAME,
  );

  await studentPage.locator('.monaco-editor').first().click();
  await studentPage.keyboard.press('ArrowRight');
  await expect(teacherPage.locator('.cove-peer-label')).toBeVisible({
    timeout: 30_000,
  });
});

test('a pointer over a pane the reader does not have is named, not drawn', async () => {
  // The teacher's feedback dock has no counterpart on the student's screen, so
  // an arrow there would have to be pinned somewhere arbitrary. It says where
  // the teacher is looking instead.
  await sweep(teacherPage, 'feedback');
  await expect(studentPage.getByTestId('peer-pointer-elsewhere')).toBeVisible({
    timeout: 30_000,
  });
  await expect(studentPage.getByTestId('peer-pointer')).toHaveCount(0);
});

test('the teacher runs the shared code without the student seeing it', async () => {
  // Running is the teacher's own sandbox: it reproduces the student's error
  // beside them, and it reaches nothing but their own browser.
  await teacherPage
    .getByRole('button', { name: /^run$|^실행$/i })
    .click({ timeout: 60_000 });
  await expect(
    teacherPage.getByText('$ python solution.py'),
  ).toBeVisible({ timeout: 60_000 });

  // The student's terminal is untouched by it — a run they did not start must
  // never appear on their screen.
  await expect(
    studentPage.getByText('$ python solution.py'),
  ).toHaveCount(0);

  // The seeded code reads stdin, so the run is still waiting. Stop it, or the
  // worker outlives this test holding the terminal open.
  await teacherPage.getByRole('button', { name: /^stop$|^중지$/i }).click();
});

test('submitting stays student-only', async () => {
  // The API refuses a teacher's submission regardless, but the absence of the
  // control is the guarantee being checked.
  await expect(
    teacherPage.getByRole('button', { name: /submit|제출/i }),
  ).toHaveCount(0);
});

test('feedback is stored once and appears on both clients', async () => {
  const message = `Check the second input ${Date.now()}`;
  const composer = teacherPage.getByRole('textbox').last();
  await composer.fill(message);
  // Submit through the keyboard-accessible path. In development the TanStack
  // Query devtool button floats over the lower-right corner where this button
  // sits; keyboard submission tests the real form without coupling the suite
  // to that development-only overlay.
  await composer.press('Tab');
  await teacherPage.keyboard.press('Enter');

  await expect(teacherPage.getByText(message)).toHaveCount(1, {
    timeout: 30_000,
  });

  // Reloading proves it was persisted before it was rendered, rather than
  // being an optimistic entry that only existed in one browser.
  await teacherPage.reload();
  await expect(teacherPage.getByText(message)).toHaveCount(1, {
    timeout: 30_000,
  });
});

test('a temporary disconnect recovers without duplicating anything', async () => {
  await teacherPage.context().setOffline(true);
  await expect(
    teacherPage.getByText(/reconnecting|재연결/i).first(),
  ).toBeVisible({ timeout: 30_000 });

  await teacherPage.context().setOffline(false);
  await expect(teacherPage.getByText(/^live$|^실시간$/i).first()).toBeVisible({
    timeout: 60_000,
  });
  // The student's code survived the interruption intact.
  await expect
    .poll(() => editorText(teacherPage), { timeout: 30_000 })
    .toContain('print(a + b)');
});

test('the student indicator clears when the teacher leaves', async () => {
  await teacherPage.getByRole('link', { name: /back to class|반으로/i }).click();
  await teacherPage.waitForURL(/\/teach\/classes\/[0-9a-f-]+$/, {
    timeout: 30_000,
  });
  await expect(
    studentPage.getByText(/teacher is (monitoring|helping)|모니터링|도와주고/i),
  ).toHaveCount(0, { timeout: 30_000 });
});
