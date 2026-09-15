import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { routes } from '../../packages/web/src/lib/routes';
import { signInAs } from '../support/auth';

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
/** Seeded with CRLF starter code — see `prisma/seed/e2e-content`. */
const CRLF_TITLE = 'Windows line endings';

let academySlug = '';
let studentContext: BrowserContext;
let teacherContext: BrowserContext;
let studentPage: Page;
let teacherPage: Page;

async function signIn(page: Page, email: string): Promise<string> {
  return signInAs({ page, identifier: email, password: PASSWORD });
}

/**
 * Drives the Monaco model directly.
 *
 * Synthetic keystrokes drop characters against Monaco's input handling, and
 * `setValue` still fires the content-change event, so both the Yjs binding and
 * the autosave under test run exactly as they would for a typed edit.
 */
async function typeIntoEditor(page: Page, code: string) {
  if (page.url().includes('/teach/')) {
    const toggle = page.getByRole('button', { name: /^Read-only$|읽기 전용/i });
    if (await toggle.count()) await toggle.click();
    await expect(page.getByRole('button', { name: /Help \/ Edit code|코드 편집/i })).toHaveAttribute('aria-pressed', 'true');
  }
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

  academySlug = await signIn(studentPage, STUDENT_EMAIL);
  await signIn(teacherPage, TEACHER_EMAIL);
});

test.afterAll(async () => {
  await studentContext?.close();
  await teacherContext?.close();
});

test('the assigned teacher sees only their own classes', async () => {
  await teacherPage.goto(routes.academyTeachClasses(academySlug));
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
    const leadAcademySlug = await signIn(page, TEAM_LEAD_EMAIL);
    await page.goto(routes.academyTeachClasses(leadAcademySlug));
    // Denied, not merely empty: a Team Lead holds `classes.assigned.manage`
    // and must still be refused monitoring.
    await expect(page.getByText(/not available|이용할 수 없습니다/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: CLASS_NAME })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('a student appears live when the teacher opened the roster first', async () => {
  // Open the teacher's socket room while the student is outside an exercise.
  // This is the ordering that snapshots alone cannot cover: the row has to
  // change from a presence delta without a teacher navigation or reload.
  await studentPage.goto(routes.academyLearnCourses(academySlug));
  await teacherPage.goto(routes.academyTeachClasses(academySlug));
  await teacherPage.getByRole('heading', { name: CLASS_NAME }).click();
  await teacherPage.waitForURL(/\/teach\/classes\/[0-9a-f-]+$/, {
    timeout: 30_000,
  });

  await studentPage.getByText(SUM_TITLE).first().click();
  await studentPage.waitForURL(/\/learn\/exercises\//, { timeout: 30_000 });
  await typeIntoEditor(studentPage, 'a = int(input())\n');

  const studentRow = teacherPage
    .getByRole('row')
    .filter({ has: teacherPage.getByText('Cove Student', { exact: true }) });
  // Scope this to the row. The summary card and filter also say "Solving" and
  // allowed the old snapshot-only test to pass while the student stayed
  // visibly offline.
  await expect(studentRow.getByText(/^solving$|^풀이 중$/i)).toBeVisible({
    timeout: 30_000,
  });
  // A realtime outage would show this instead, and must not.
  await expect(
    teacherPage.getByText(/live updates unavailable|사용할 수 없습니다/i),
  ).toHaveCount(0);
  await expect(
    studentRow.getByRole('link', { name: /^(?:open live|실시간 보기)$/i }),
  ).toBeVisible({ timeout: 30_000 });
});

test('the teacher opens the live workspace and the student is told', async () => {
  await teacherPage.getByRole('link', { name: /^(?:open live|실시간 보기)$/i }).first().click();
  await teacherPage.waitForURL(/\/students\/[0-9a-f-]+\/live$/, {
    timeout: 30_000,
  });

  // Match the student's workspace: Back, then the problem-list trigger, then
  // the identity/context the teacher is watching.
  const outlineTrigger = teacherPage
    .getByRole('button', { name: /course outline|코스 목차/i })
    .first();
  await expect(outlineTrigger).toHaveAttribute('aria-expanded', 'true');
  const triggerBox = (await outlineTrigger.boundingBox())!;
  const studentBox = (await teacherPage
    .getByText('Cove Student', { exact: true })
    .first()
    .boundingBox())!;
  expect(triggerBox.x).toBeLessThan(studentBox.x);

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

/** The model's own line ending, which is what its offsets are counted in. */
async function editorEol(page: Page): Promise<string> {
  return page.evaluate(() => {
    const monaco = (
      window as unknown as {
        monaco?: { editor: { getModels(): { getEOL(): string }[] } };
      }
    ).monaco;
    return monaco?.editor.getModels()[0]?.getEOL() ?? '';
  });
}

async function lineOf(page: Page, lineNumber: number): Promise<string> {
  return page.evaluate((line) => {
    const monaco = (
      window as unknown as {
        monaco?: {
          editor: { getModels(): { getLineContent(line: number): string }[] };
        };
      }
    ).monaco;
    return monaco?.editor.getModels()[0]?.getLineContent(line) ?? '';
  }, lineNumber);
}

/**
 * Inserts at an exact position, as a caret there would.
 *
 * Deliberately positional rather than a whole-model write: the fault under
 * test was entirely in the arithmetic between a position and the offset that
 * describes it, and a `setValue` would never exercise it.
 */
async function insertAt(
  page: Page,
  at: { lineNumber: number; column: number },
  text: string,
) {
  await page.evaluate(
    ({ at, text }) => {
      const monaco = (
        window as unknown as {
          monaco?: {
            editor: {
              getModels(): {
                applyEdits(
                  edits: {
                    range: {
                      startLineNumber: number;
                      startColumn: number;
                      endLineNumber: number;
                      endColumn: number;
                    };
                    text: string;
                  }[],
                ): void;
              }[];
            };
          };
        }
      ).monaco;
      monaco?.editor.getModels()[0]?.applyEdits([
        {
          range: {
            startLineNumber: at.lineNumber,
            startColumn: at.column,
            endLineNumber: at.lineNumber,
            endColumn: at.column,
          },
          text,
        },
      ]);
    },
    { at, text },
  );
}

/**
 * Line endings arriving into a session that is already live.
 *
 * The handoff case — a problem whose stored starter code has always had CRLF —
 * is covered at the end of this file, where a watch can be opened from nothing.
 * This one covers what happens when such text reaches an editor that is
 * already bound, which a paste or an older client can still do.
 *
 * The caret assertions elsewhere in this file cannot catch either. Awareness
 * sends a line and a column, which are the same number whatever the line
 * ending is, so they passed throughout. Only comparing the text does.
 */
test('text arriving with foreign line endings keeps both editors in step', async () => {
  // The precondition, and the whole of what the fault needed: a buffer whose
  // line endings are not the editor's own. Several exercises migrated from v1
  // store exactly this.
  const crlf = [
    "beat1 = '덩덕'",
    "beat2 = '쿵덕'",
    'hello',
    '',
    '',
    '',
    '# merge',
  ].join('\r\n');
  await typeIntoEditor(studentPage, crlf);

  // Both models are pinned, and the document they share holds neither a
  // carriage return nor a disagreement.
  await expect.poll(() => editorEol(studentPage), { timeout: 30_000 }).toBe('\n');
  await expect.poll(() => editorEol(teacherPage), { timeout: 30_000 }).toBe('\n');
  await expect
    .poll(() => editorText(teacherPage), { timeout: 30_000 })
    .toBe(await editorText(studentPage));

  // Line 4, column 1. Three line breaks above it, which is exactly how far out
  // the teacher's copy used to land.
  await insertAt(studentPage, { lineNumber: 4, column: 1 }, 'hi');

  await expect.poll(() => lineOf(teacherPage, 4), { timeout: 30_000 }).toBe('hi');
  expect(await lineOf(teacherPage, 7)).toBe('# merge');
  expect(await editorText(teacherPage)).toBe(await editorText(studentPage));

  // And the same the other way: a teacher's correction must land where they
  // put it, not early and inside a token the student was in the middle of.
  await insertAt(teacherPage, { lineNumber: 3, column: 6 }, '!');

  await expect
    .poll(() => lineOf(studentPage, 3), { timeout: 30_000 })
    .toBe('hello!');
  expect(await editorText(studentPage)).toBe(await editorText(teacherPage));
});

/** Sweeps the mouse across a surface, as a person moving it would. */
async function sweep(page: Page, surface: string) {
  if (surface === 'editor') {
    const text = page.locator('.monaco-editor .view-line span span').filter({ hasText: /\S/ }).first();
    const box = await text.boundingBox();
    expect(box).not.toBeNull();
    for (let step = 0; step < 7; step += 1) {
      await page.mouse.move(box!.x + Math.min(box!.width - 1, 2 + step), box!.y + box!.height / 2);
      await page.waitForTimeout(120);
    }
    return;
  }
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

/** Moves inside the sandboxed authored-content document, not over its frame. */
async function sweepStatementIframe(page: Page) {
  const frame = page
    .locator('[data-collab-surface="statement"] iframe')
    .first();
  await expect(frame).toBeVisible({ timeout: 30_000 });
  const box = await frame.boundingBox();
  expect(box).not.toBeNull();
  for (let step = 0; step <= 6; step += 1) {
    await page.mouse.move(
      box!.x + box!.width * (0.18 + step * 0.09),
      box!.y + Math.min(box!.height - 4, 8 + step * 2),
    );
    await page.waitForTimeout(120);
  }
}

test('each side sees where the other is pointing', async ({}, testInfo) => {
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

  if (testInfo.project.name === 'chromium') {
    // Authored problem HTML is a separate document. Movement inside it must be
    // translated back into the surrounding statement surface for the teacher.
    // Playwright WebKit does not route synthetic mouse input into sandboxed
    // srcDoc frames, so WebKit covers the parent surfaces and caret path while
    // Chromium exercises the real iframe boundary.
    await sweepStatementIframe(studentPage);
    await expect(teacherPage.getByTestId('peer-pointer')).toHaveAttribute(
      'data-peer-surface',
      'statement',
      { timeout: 30_000 },
    );
  }
});

async function codePoint(page: Page, lineNumber: number, column: number) {
  return page.evaluate(({ lineNumber, column }) => {
    const monaco = (window as unknown as { monaco: { editor: { getEditors(): {
      getDomNode(): HTMLElement; getScrolledVisiblePosition(position: { lineNumber: number; column: number }): { left: number; top: number; height: number };
    }[] } } }).monaco;
    const editor = monaco.editor.getEditors()[0]!;
    const position = editor.getScrolledVisiblePosition({ lineNumber, column });
    const box = editor.getDomNode().getBoundingClientRect();
    return { x: box.left + position.left, y: box.top + position.top, height: position.height };
  }, { lineNumber, column });
}

test('code arrows use the same code boundary at unequal viewport sizes', async () => {
  const original = await editorText(studentPage);
  const studentViewport = studentPage.viewportSize()!;
  const teacherViewport = teacherPage.viewportSize()!;
  try {
    await studentPage.setViewportSize({ width: 1500, height: 900 });
    await teacherPage.setViewportSize({ width: 1100, height: 720 });
    await typeIntoEditor(studentPage, '# pointer fixture\nprint("🎉 한국어")\n');
    await expect.poll(() => editorText(teacherPage)).toBe(await editorText(studentPage));
    for (const [sender, receiver] of [[studentPage, teacherPage], [teacherPage, studentPage]]) {
      const point = await codePoint(sender!, 2, 3);
      await sender!.mouse.move(point.x + 1, point.y + point.height / 2);
      await expect(receiver!.getByTestId('peer-pointer')).toHaveAttribute('data-peer-surface', 'editor');
      await expect.poll(async () => {
        const expected = await codePoint(receiver!, 2, 3);
        const arrow = await receiver!.getByTestId('peer-pointer').boundingBox();
        return arrow ? Math.max(Math.abs(arrow.x + 4.5 - expected.x), Math.abs(arrow.y + 2.5 - expected.y)) : Infinity;
      }).toBeLessThanOrEqual(2);
    }
  } finally {
    await typeIntoEditor(studentPage, original);
    await studentPage.setViewportSize(studentViewport);
    await teacherPage.setViewportSize(teacherViewport);
  }
});

test("each side sees the other's caret in the shared editor", async () => {
  await teacherPage.locator('.monaco-editor').first().click();
  await teacherPage.keyboard.press('ArrowUp');
  await expect(studentPage.locator('.cove-peer-label')).toBeVisible({
    timeout: 30_000,
  });
  await expect(studentPage.locator('.cove-peer-label')).not.toHaveText(
    TEACHER_NAME,
  );
  // `main` hides the teacher marker from the student after three seconds of
  // caret inactivity. The monitoring indicator remains; only the annotation
  // over the student's code expires.
  await expect(studentPage.locator('.cove-peer-cursor')).toHaveCount(0, {
    timeout: 15_000,
  });

  // Activity restores it immediately and restarts the deadline.
  await expect
    .poll(
      async () => {
        await teacherPage.evaluate(() => {
          const editor = (
            window as unknown as {
              monaco?: {
                editor: {
                  getEditors(): {
                    focus(): void;
                    getPosition(): { column: number } | null;
                    setPosition(position: {
                      lineNumber: number;
                      column: number;
                    }): void;
                  }[];
                };
              };
            }
          ).monaco?.editor.getEditors()[0];
          const nextColumn = editor?.getPosition()?.column === 1 ? 2 : 1;
          editor?.setPosition({ lineNumber: 1, column: nextColumn });
          editor?.focus();
        });
        return studentPage.locator('.cove-peer-label').count();
      },
      { timeout: 30_000 },
    )
    .toBe(1);

  // Put the student at an exact coordinate, then type immediately. The click
  // and keystroke are intentionally closer than the cursor throttle interval:
  // the trailing event must still deliver the final column, not strand the
  // teacher at the leading position.
  await studentPage.evaluate(() => {
    const monaco = (
      window as unknown as {
        monaco?: {
          editor: {
            getEditors(): {
              focus(): void;
              setPosition(position: {
                lineNumber: number;
                column: number;
              }): void;
            }[];
          };
        };
      }
    ).monaco;
    const editor = monaco?.editor.getEditors()[0];
    editor?.setPosition({ lineNumber: 2, column: 5 });
    editor?.focus();
  });
  await studentPage.keyboard.type('x');

  const studentCaret = teacherPage.locator('.cove-peer-cursor');
  await expect(studentCaret).toHaveAttribute('data-peer-line', '2', {
    timeout: 30_000,
  });
  await expect(studentCaret).toHaveAttribute('data-peer-column', '6');
  const studentLabel = studentCaret.locator('.cove-peer-label');
  await expect(studentCaret).toHaveClass(/cove-peer-cursor--student/);
  await expect(studentLabel).toBeVisible();
  await expect(studentLabel).toHaveCSS('background-color', 'rgb(27, 100, 218)');
  await expect(teacherPage.getByText(/editing with/i)).toHaveCount(0);

  // A paused student may be reading or thinking. Their named caret stays on
  // the exact code position until the collaboration lifecycle clears it.
  await teacherPage.waitForTimeout(3_500);
  await expect(studentLabel).toBeVisible();
});

/**
 * The marker lifetimes, in the browser.
 *
 * Both arrows travel the same path and are drawn by the same component, but
 * their receiver-owned lifetimes differ. These cases can only be seen with
 * both screens open.
 *
 * They run after the caret case on purpose: the last of them checks that
 * pointer lifecycle does not disturb the peer's caret, and there has to be a
 * caret on screen for that to mean anything.
 */
test("the teacher's arrow fades from the student's screen when it stops", async () => {
  // A first movement after a long idle interval wakes an expired marker. The
  // poll repeats real movement so this assertion does not depend on one burst
  // of synthetic Pointer Events reaching two independent browser contexts.
  await expect
    .poll(
      async () => {
        await sweep(teacherPage, 'terminal');
        return studentPage
          .getByTestId('peer-pointer')
          .getAttribute('data-peer-surface');
      },
      { timeout: 30_000 },
    )
    .toBe('terminal');

  // Nobody touches the teacher's mouse for longer than the three-second
  // budget. The student stops being told that somebody is following along.
  await expect(studentPage.getByTestId('peer-pointer')).toHaveCount(0, {
    timeout: 15_000,
  });

  // And it is gone rather than broken: moving again brings it straight back.
  await sweep(teacherPage, 'statement');
  await expect(studentPage.getByTestId('peer-pointer')).toHaveAttribute(
    'data-peer-surface',
    'statement',
    { timeout: 30_000 },
  );
});

test("the student's arrow remains on the teacher's screen", async () => {
  await sweep(studentPage, 'editor');
  await expect(teacherPage.getByTestId('peer-pointer')).toHaveAttribute(
    'data-peer-surface',
    'editor',
    { timeout: 30_000 },
  );

  await teacherPage.waitForTimeout(3_500);
  await expect(teacherPage.getByTestId('peer-pointer')).toHaveAttribute(
    'data-peer-surface',
    'editor',
  );
});

test("unsupported movement keeps the student's arrow until collaboration ends", async () => {
  await sweep(studentPage, 'editor');
  await expect(teacherPage.getByTestId('peer-pointer')).toHaveAttribute(
    'data-peer-surface',
    'editor',
    { timeout: 30_000 },
  );

  // Movement from an unsupported page target has no corresponding surface in
  // the teacher's layout, so it preserves the last representable position.
  await studentPage.evaluate(() => {
    document.body.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 5,
        clientY: 5,
      }),
    );
  });
  await teacherPage.waitForTimeout(3_500);
  await expect(teacherPage.getByTestId('peer-pointer')).toHaveAttribute(
    'data-peer-surface',
    'editor',
  );

  // The student's caret is untouched by it: a caret marks a place in the
  // document, and the document is still open.
  await expect(teacherPage.locator('.cove-peer-cursor')).toHaveAttribute(
    'data-peer-line',
    '2',
  );
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

/**
 * The student's terminal, on the teacher's screen.
 *
 * These are the cases a single browser cannot express: the transcript the
 * teacher reads has to be the transcript the student is looking at — the same
 * banner, the same submitted input, the same verdict, in the same order — while
 * the teacher's own terminal stays entirely theirs.
 *
 * They run in WebKit as well as Chromium. Safari's worker, isolation, and event
 * behaviour differ enough that a mirror working in one proves nothing about the
 * other, and interactive Python is exactly where that has bitten before.
 */

const HIDDEN_SENTINEL = 'E2E_HIDDEN_SENTINEL';

const mirror = () => teacherPage.getByTestId('mirrored-terminal');
const studentTerminal = () => studentPage.getByTestId('terminal');
const stdin = (page: Page) =>
  page.getByRole('textbox', { name: /program input|프로그램 입력/i });

/** Selects one of the teacher's two output tabs by its stable id. */
async function selectOutputTab(tab: 'you' | 'student') {
  await teacherPage.locator(`#live-${tab}-tab`).click();
}

async function runSampleOne() {
  const button = studentPage.getByRole('button', { name: /^test 1$|^테스트 1$/i });
  await expect(button).toBeEnabled({ timeout: 120_000 });
  await button.click();
}

test("a sample run is mirrored with its banner, input, output, and verdict", async () => {
  test.setTimeout(180_000);
  // Earlier collaboration cases deliberately type into the shared model. A
  // terminal assertion owns its program instead of inheriting that mutation.
  await typeIntoEditor(
    studentPage,
    'a = int(input())\nb = int(input())\nprint(a + b)\n',
  );
  // Start from the teacher's own tab, so the switch below is something that
  // happened rather than something that was already true.
  await selectOutputTab('you');
  await expect(mirror()).toHaveCount(0);

  await runSampleOne();

  // Opening the student's tab is part of their run starting.
  await expect(mirror()).toBeVisible({ timeout: 120_000 });
  await expect(mirror()).toContainText('$ python solution.py · Test 1', {
    timeout: 120_000,
  });
  // The sample's input lines are consumed by `input()` and echoed on both
  // screens; the sum is what the program printed.
  await expect(mirror()).toContainText('3', { timeout: 60_000 });
  await expect(mirror()).toContainText(/matches the expected output|일치/i, {
    timeout: 60_000,
  });
  await expect(studentTerminal()).toContainText('$ python solution.py · Test 1');

  // Same order as the student's screen: the banner opens the run, the sample's
  // input lines follow it, and the verdict comes after the output it judges.
  const mirrored = await mirror().innerText();
  expect(mirrored.trimStart().startsWith('$ python solution.py · Test 1')).toBe(
    true,
  );
  expect(mirrored).toContain('1\n2\n');
  expect(mirrored.indexOf('1\n2\n')).toBeLessThan(mirrored.indexOf('3\n'));
  expect(mirrored.indexOf('3\n')).toBeLessThan(
    mirrored.search(/matches the expected output|일치/i),
  );

  // Grading data the student cannot see has no field in this protocol and no
  // path to this pane.
  await expect(mirror()).not.toContainText(HIDDEN_SENTINEL);
  await expect(teacherPage.locator('body')).not.toContainText(HIDDEN_SENTINEL);
});

test('a waiting student program is mirrored as a passive indicator', async () => {
  test.setTimeout(180_000);
  const run = studentPage.getByRole('button', { name: /^run$|^실행$/i });
  await expect(run).toBeEnabled({ timeout: 120_000 });
  await run.click();

  await expect(mirror()).toContainText('$ python solution.py', {
    timeout: 120_000,
  });
  await expect(teacherPage.getByTestId('mirrored-waiting')).toBeVisible({
    timeout: 120_000,
  });
  // Read-only by construction: the mirror has no control to answer with, so a
  // teacher cannot feed a student's process even by accident.
  await expect(
    teacherPage.getByRole('tabpanel').getByRole('textbox'),
  ).toHaveCount(0);

  // Only submitted input travels. What the student is still typing does not.
  await stdin(studentPage).fill('7');
  await expect(mirror()).not.toContainText('7');
  await stdin(studentPage).press('Enter');
  await expect(mirror()).toContainText('7', { timeout: 60_000 });

  await expect(stdin(studentPage)).toBeVisible({ timeout: 60_000 });
  await stdin(studentPage).fill('5');
  await stdin(studentPage).press('Enter');

  // Output continues after the answer, and the waiting state ends on both
  // screens rather than only on the one that owns the process.
  await expect(mirror()).toContainText('12', { timeout: 60_000 });
  await expect(studentTerminal()).toContainText('12');
  await expect(teacherPage.getByTestId('mirrored-waiting')).toHaveCount(0, {
    timeout: 60_000,
  });
});

test("the teacher's private run leaves the student's transcript alone", async () => {
  test.setTimeout(180_000);
  await selectOutputTab('you');
  await teacherPage
    .getByRole('button', { name: /^run$|^실행$/i })
    .click({ timeout: 120_000 });
  await expect(teacherPage.getByTestId('terminal')).toContainText(
    '$ python solution.py',
    { timeout: 120_000 },
  );
  // The seeded code reads stdin, so this run is still waiting. Stop it, or the
  // worker outlives this test holding the terminal open.
  await teacherPage.getByRole('button', { name: /^stop$|^중지$/i }).click();

  // Nothing about it reached the student, and nothing about it replaced the
  // transcript the student produced.
  await expect(studentTerminal()).toContainText('12');
  await selectOutputTab('student');
  await expect(mirror()).toContainText('12');
});

test('a new student run resets the mirror and selects it again', async () => {
  test.setTimeout(180_000);
  // A teacher who deliberately went back to their own terminal is brought
  // forward again by the student starting something new.
  await selectOutputTab('you');
  await expect(mirror()).toHaveCount(0);

  await runSampleOne();

  await expect(mirror()).toBeVisible({ timeout: 120_000 });
  await expect(mirror()).toContainText(/matches the expected output|일치/i, {
    timeout: 120_000,
  });
  // Replaced, not appended: one banner, and none of the previous run's output.
  const mirrored = await mirror().innerText();
  expect(mirrored.match(/\$ python solution\.py/g)).toHaveLength(1);
  expect(mirrored).not.toContain('12');
});

test('the mirror survives a teacher reconnection', async () => {
  test.setTimeout(180_000);
  await teacherPage.context().setOffline(true);
  await expect(
    teacherPage.getByText(/reconnecting|재연결/i).first(),
  ).toBeVisible({ timeout: 60_000 });
  await teacherPage.context().setOffline(false);
  await expect(teacherPage.getByText(/^live$|^실시간$/i).first()).toBeVisible({
    timeout: 120_000,
  });

  // The watch is re-established, the server asks the student for their current
  // terminal, and the next run lands without a permanent hole in the sequence.
  await runSampleOne();
  await expect(mirror()).toBeVisible({ timeout: 120_000 });
  await expect(mirror()).toContainText('$ python solution.py · Test 1', {
    timeout: 120_000,
  });
  await expect(mirror()).toContainText(/matches the expected output|일치/i, {
    timeout: 120_000,
  });
});

test('a student reconnect continues the same interactive terminal', async () => {
  test.setTimeout(180_000);
  const run = studentPage.getByRole('button', { name: /^run$|^실행$/i });
  await expect(run).toBeEnabled({ timeout: 120_000 });
  await run.click();
  await expect(teacherPage.getByTestId('mirrored-waiting')).toBeVisible({
    timeout: 120_000,
  });

  // Preserve the local Pyodide process while forcing the monitoring transport
  // to reconnect. The publisher must reassert the current snapshot before the
  // next input/output delta; otherwise a fresh gateway socket rejects it as an
  // append for a run it has never seen begin.
  await studentPage.context().setOffline(true);
  await studentPage.waitForTimeout(3_000);
  await studentPage.context().setOffline(false);

  await expect(stdin(studentPage)).toBeVisible({ timeout: 60_000 });
  await stdin(studentPage).fill('314159');
  await stdin(studentPage).press('Enter');
  await expect(stdin(studentPage)).toBeVisible({ timeout: 60_000 });
  await stdin(studentPage).fill('271828');
  await stdin(studentPage).press('Enter');

  await expect(mirror()).toContainText('585987', { timeout: 120_000 });
  await expect(studentTerminal()).toContainText('585987');
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

test('curriculum preview is read-only and returns to the synchronized live watch', async () => {
  const outlineTrigger = teacherPage
    .getByRole('button', { name: /course outline|코스 목차/i })
    .first();
  const outline = teacherPage.locator(
    'aside[data-collab-surface="curriculum"]',
  );
  await expect(outline).toBeVisible();
  await expect(outlineTrigger).toHaveAttribute('aria-expanded', 'true');

  await outline
    .getByRole('button')
    .filter({ hasText: 'Getting started' })
    .click();
  await outline
    .getByRole('button')
    .filter({ hasText: 'Reading input' })
    .click();
  await outline
    .getByRole('button')
    .filter({ hasText: 'Echo the input' })
    .click();

  await expect(
    teacherPage.getByText(/previewing|미리보기/i).first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    teacherPage.getByRole('heading', { name: /feedback|피드백/i }),
  ).toHaveCount(0);
  await expect(
    teacherPage.getByRole('button', { name: /^run$|^실행$/i }),
  ).toHaveCount(0);

  await teacherPage
    .getByRole('button', { name: /return to live|실시간.*돌아/i })
    .click();
  await expect(
    teacherPage.getByText(/previewing|미리보기/i),
  ).toHaveCount(0, { timeout: 30_000 });
  await expect
    .poll(() => editorText(teacherPage), { timeout: 30_000 })
    .toContain('print(a + b)');
  await expect(
    teacherPage.getByRole('heading', { name: /feedback|피드백/i }),
  ).toBeVisible();
});

test('student markers clear when the student leaves the problem page', async () => {
  // Re-establish both markers immediately before navigating so this proves
  // lifecycle cleanup rather than inheriting absence from an earlier case.
  await sweep(studentPage, 'editor');
  await studentPage.locator('.monaco-editor').first().click();
  await studentPage.keyboard.press('ArrowLeft');
  await expect(teacherPage.getByTestId('peer-pointer')).toBeVisible({
    timeout: 30_000,
  });
  await expect(teacherPage.locator('.cove-peer-cursor')).toHaveCount(1, {
    timeout: 30_000,
  });

  await studentPage.goto(routes.academyLearnCourses(academySlug));

  await expect(teacherPage.getByTestId('peer-pointer')).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(teacherPage.locator('.cove-peer-cursor')).toHaveCount(0, {
    timeout: 30_000,
  });
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

/**
 * The reported production fault, at the moment a watch is handed over.
 *
 * The student typed on line 4 and the teacher saw it on line 7, because the
 * two editors disagreed about what a line ending is: Monaco counts offsets in
 * its model's, Yjs counts indices in the string's, and a document carrying
 * CRLF puts them one character apart for every line above the edit.
 *
 * Nothing here injects a line ending. `Windows line endings` is seeded with
 * CRLF starter code, as several exercises migrated from v1 are, and the watch
 * below is opened from nothing — so this is the production path end to end:
 * stored text, a fresh draft, a first bind, and then a keystroke.
 */
test('a problem stored with CRLF hands over without drifting', async () => {
  // Both sides start from outside a watch: the previous case left the teacher
  // on the class page and the student on their catalog.
  await studentPage.goto(routes.academyLearnCourses(academySlug));
  await studentPage.getByText(CRLF_TITLE).first().click();
  await studentPage.waitForURL(/\/learn\/exercises\//, { timeout: 30_000 });
  await expect(studentPage.locator('.monaco-editor').first()).toBeVisible({
    timeout: 30_000,
  });

  // The student's own editor is canonical before anybody joins. Without this
  // the model counts CRLF offsets and nothing downstream can agree with it.
  await expect.poll(() => editorEol(studentPage), { timeout: 30_000 }).toBe('\n');
  expect(await editorText(studentPage)).not.toContain('\r');

  // Preserve the exact authored iframe and the visible paragraph through handoff.
  const statementFrame = studentPage.locator('[data-collab-surface="statement"] iframe').first();
  const originalFrame = await statementFrame.elementHandle();
  await expect(studentPage.frameLocator('[data-collab-surface="statement"] iframe').locator('p')).toHaveCount(40);
  await statementFrame.evaluate((frame) => {
    const iframe = frame as HTMLIFrameElement;
    const paragraph = iframe.contentDocument!.querySelectorAll('p')[20]!;
    const pane = iframe.closest('[data-collab-surface="statement"]')!;
    pane.scrollTop += iframe.getBoundingClientRect().top + paragraph.getBoundingClientRect().top
      - pane.getBoundingClientRect().top - 8;
  });
  const readingParagraph = studentPage.frameLocator('[data-collab-surface="statement"] iframe').locator('p').nth(20);
  const beforeReading = await readingParagraph.boundingBox();
  expect(beforeReading).not.toBeNull();

  const studentRow = teacherPage
    .getByRole('row')
    .filter({ has: teacherPage.getByText('Cove Student', { exact: true }) });
  await expect(
    studentRow.getByRole('link', { name: /^(?:open live|실시간 보기)$/i }),
  ).toBeVisible({ timeout: 30_000 });
  await studentRow
    .getByRole('link', { name: /^(?:open live|실시간 보기)$/i })
    .first()
    .click();
  await teacherPage.waitForURL(/\/students\/[0-9a-f-]+\/live$/, {
    timeout: 30_000,
  });

  await expect.poll(() => originalFrame!.evaluate((frame) => frame.isConnected)).toBe(true);
  await expect.poll(async () => Math.abs((await readingParagraph.boundingBox())!.y - beforeReading!.y),
    { timeout: 10_000 }).toBeLessThanOrEqual(2);

  // The handoff itself: the teacher's editor is built from the shared
  // document, and both are pinned.
  await expect.poll(() => editorEol(teacherPage), { timeout: 30_000 }).toBe('\n');
  await expect
    .poll(() => editorText(teacherPage), { timeout: 30_000 })
    .toBe(await editorText(studentPage));
  expect(await lineOf(studentPage, 7)).toBe('# merge');

  // Line 4, column 1. Three line breaks above it, which is exactly how far out
  // the teacher's copy used to land.
  await insertAt(studentPage, { lineNumber: 4, column: 1 }, 'hi');

  await expect.poll(() => lineOf(teacherPage, 4), { timeout: 30_000 }).toBe('hi');
  expect(await lineOf(teacherPage, 7)).toBe('# merge');
  expect(await editorText(teacherPage)).toBe(await editorText(studentPage));

  // And the same the other way: a teacher's correction must land where they
  // put it, not early and inside a token the student was in the middle of.
  await insertAt(teacherPage, { lineNumber: 3, column: 6 }, '!');
  await expect
    .poll(() => lineOf(studentPage, 3), { timeout: 30_000 })
    .toBe('hello!');
  expect(await editorText(studentPage)).toBe(await editorText(teacherPage));
});

/**
 * Moving between problems while somebody is watching.
 *
 * The workspace is kept alive across exercises on purpose, so the editor
 * outlives the problem in it. While a watch is open that editor is also bound
 * to a shared document, and the destination's code arriving in it is an
 * ordinary local edit as far as the binding can tell — which is how one
 * problem's buffer was published into another's.
 */
test('a watched student moving to another problem does not carry code across', async () => {
  const carried = await editorText(studentPage);
  expect(carried).toContain('hi');

  await studentPage.getByRole('button', { name: /^previous$|^이전$/i }).click();
  await expect(
    studentPage.getByRole('heading', { name: SUM_TITLE }),
  ).toBeVisible({ timeout: 30_000 });

  // The destination opens on its own draft. Nothing from the problem just left
  // may be in it, and the outgoing buffer must not have been written here on
  // the way through.
  await expect
    .poll(() => editorText(studentPage), { timeout: 30_000 })
    .not.toContain('# merge');
  expect(await editorText(studentPage)).not.toContain('beat1');

  // The teacher follows, and lands on the problem the student is actually on.
  await teacherPage
    .getByRole('button', { name: /return to live|실시간.*돌아/i })
    .click()
    .catch(() => undefined);
  await expect
    .poll(() => editorText(teacherPage), { timeout: 30_000 })
    .not.toContain('# merge');

  // And back again: the CRLF problem still holds its own work.
  await studentPage.getByRole('button', { name: /^next$|^다음$/i }).click();
  await expect(
    studentPage.getByRole('heading', { name: CRLF_TITLE }),
  ).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => editorText(studentPage), { timeout: 30_000 })
    .toContain('# merge');
  expect(await editorText(studentPage)).not.toContain('\r');
});
