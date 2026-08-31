import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from '@playwright/test';

import { routes } from '../../packages/web/src/lib/routes';
import { signInAs } from '../support/auth';

/**
 * Solution status, from the assigned teacher's side.
 *
 * Requires `pnpm --filter @cove/api db:seed` and `db:seed:e2e`. The e2e seed
 * leaves the fixture student three failed attempts on "Reverse a string",
 * which is a problem nothing else in this suite submits to — so "failed three
 * times in a row" stays true however many other specs have run before it.
 *
 * Nothing here asserts an absolute attempt count for the shared problems: the
 * student journey adds to that history, and a test that counted it would fail
 * on the second run rather than on a real regression.
 *
 * Serial: the drill-downs build on the state the previous test left in the URL.
 */
test.describe.configure({ mode: 'serial' });

const PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'CoveDev123!';
const TEACHER_EMAIL = 'teacher@cove.test';
const SECOND_TEACHER_EMAIL = 'teacher2@cove.test';
const TEAM_LEAD_EMAIL = 'teamlead@cove.test';
const MANAGER_EMAIL = 'manager@cove.test';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000/api/rpc';

const CLASS_NAME = 'E2E Cohort';
const COURSE_TITLE = 'E2E Python Basics';
const LECTURE_TITLE = 'Adding numbers';
const PROGRESS_TITLE = 'Reverse a string';
const HIDDEN_LECTURE = 'Hidden lecture';
const HIDDEN_EXERCISE = 'Never visible to students';
/** Seeded into every hidden test case. Must never reach the browser. */
const HIDDEN_SENTINEL = 'E2E_HIDDEN_SENTINEL';

let academySlug = '';
let classId = '';
let teacherContext: BrowserContext;
let teacherPage: Page;

async function signIn(page: Page, email: string): Promise<string> {
  return signInAs({ page, identifier: email, password: PASSWORD });
}

/** The signed-in session's access token, for calls that bypass the UI. */
async function accessToken(page: Page): Promise<string> {
  const chunks = (await page.context().cookies())
    .filter((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => {
      const index = (name: string) => Number(/\.(\d+)$/.exec(name)?.[1] ?? 0);
      return index(a.name) - index(b.name);
    })
    .map((cookie) => cookie.value);
  expect(chunks.length).toBeGreaterThan(0);

  let raw = decodeURIComponent(chunks.join(''));
  if (raw.startsWith('base64-')) {
    raw = Buffer.from(raw.slice('base64-'.length), 'base64').toString('utf8');
  }
  const token = (JSON.parse(raw) as { access_token?: string }).access_token;
  expect(token).toBeTruthy();
  return token!;
}

/**
 * Calls the API directly with the browser session's token.
 *
 * The point of the denial tests is that hiding a link is not the boundary —
 * the server is — so they have to ask the server without a page in the way.
 */
async function rpc(
  page: Page,
  path: string,
  input: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await page.request.post(`${API_URL}/${path}`, {
    headers: {
      Authorization: `Bearer ${await accessToken(page)}`,
      'Content-Type': 'application/json',
    },
    data: { json: input },
  });
  const payload = (await response.json()) as { json?: Record<string, unknown> };
  return { status: response.status(), body: payload.json ?? {} };
}

function progressUrl(search = ''): string {
  const base = routes.academyTeachProgress(academySlug, classId);
  return search ? `${base}?${search}` : base;
}

/** Opens the class through the teaching list, the way a teacher arrives. */
async function openClass(page: Page) {
  await page.goto(routes.academyTeachClasses(academySlug));
  await page.getByRole('heading', { name: CLASS_NAME }).click();
  await page.waitForURL(/\/teach\/classes\/[0-9a-f-]+$/, { timeout: 30_000 });
  classId = /\/teach\/classes\/([0-9a-f-]+)/.exec(page.url())?.[1] ?? '';
  expect(classId).not.toBe('');
}

test.beforeAll(async ({ browser }) => {
  // The dev server compiles a route on its first request, and the two new
  // ones here are the heaviest in this suite. Warming them once keeps every
  // later navigation inside the ordinary per-test timeout.
  test.setTimeout(240_000);
  teacherContext = await browser.newContext();
  teacherPage = await teacherContext.newPage();
  academySlug = await signIn(teacherPage, TEACHER_EMAIL);
  await openClass(teacherPage);
  await teacherPage.goto(progressUrl(), { timeout: 180_000 });
  await expect(teacherPage.getByTestId('progress-students')).toBeVisible({
    timeout: 120_000,
  });
});

test.afterAll(async () => {
  await teacherContext.close();
});

test('the class links its two destinations and Solution status opens on the roster', async () => {
  const page = teacherPage;
  await page.goto(routes.academyTeachClass(academySlug, classId));
  await page.getByRole('link', { name: /solution status|풀이 현황/i }).click();
  await page.waitForURL(/\/progress$/, { timeout: 30_000 });

  // The three class facts, server-rendered rather than filled in later.
  await expect(page.getByTestId('progress-students')).not.toHaveText('—');
  await expect(page.getByTestId('progress-completion')).toBeVisible();
  await expect(page.getByTestId('progress-attention')).toBeVisible();

  // The ordering is stated, not implied: it is a reading order, not a rank.
  await expect(
    page.getByText(/reading order, not a ranking|순위가 아니라 읽는 순서/i),
  ).toBeVisible();

  // And the way back to what is happening now.
  await expect(
    page.getByRole('link', { name: /live roster|실시간 현황/i }),
  ).toBeVisible();
});

test('filtering by attention narrows the roster and stays in the URL', async () => {
  const page = teacherPage;
  await page.goto(progressUrl());
  await page
    .getByRole('button', { name: /needs a look|확인 필요/i })
    .first()
    .click();
  await page
    .getByRole('option', { name: /repeated failures|연속 오답/i })
    .click();
  await page.keyboard.press('Escape');

  await expect(page).toHaveURL(/attention=repeated_failures/);
  // The seeded student has three failures in a row on the fixture problem.
  await expect(
    page.getByRole('row').filter({ hasText: /repeated failures|연속 오답/i }).first(),
  ).toBeVisible();

  // A shared link opens on its own rows rather than on an unfiltered table.
  await page.goto(progressUrl('attention=repeated_failures'));
  await expect(
    page.getByRole('row').filter({ hasText: /repeated failures|연속 오답/i }).first(),
  ).toBeVisible();
});

test('opening a student explains the attention in plain language', async () => {
  const page = teacherPage;
  await page.goto(progressUrl('attention=repeated_failures'));
  await page.getByRole('button', { name: /^open$|^열기$/i }).first().click();

  await expect(page).toHaveURL(/student=[0-9a-f-]+/);
  const detail = page.locator('section').filter({
    has: page.locator('#student-detail-heading'),
  });
  await expect(detail).toBeVisible();

  // The number is in the sentence: a teacher can say this to a student.
  await expect(
    detail.getByText(/failed 3 times in a row|연속 3회 오답/i).first(),
  ).toBeVisible();
  // The long sitting is read in minutes, never as "1800".
  await expect(detail.getByText(/40m|40분/).first()).toBeVisible();
  await expect(detail.getByText('1800')).toHaveCount(0);
});

test('an attempt opens a read-only review and Back restores the exact state', async () => {
  const page = teacherPage;
  // The review route is the last one the dev server compiles, and it loads
  // Monaco on top of that.
  test.slow();
  const shared = progressUrl('attention=repeated_failures');
  await page.goto(shared);
  await page.getByRole('button', { name: /^open$|^열기$/i }).first().click();

  const row = page.getByRole('row').filter({ hasText: PROGRESS_TITLE }).first();
  await row.getByRole('button', { name: /show attempts|제출 기록 보기/i }).click();
  await page.getByRole('link', { name: /review|코드 보기/i }).first().click();

  await page.waitForURL(/\/submissions\/[0-9a-f-]+/, { timeout: 120_000 });
  await expect(
    page.getByText(/read-only|읽기 전용/i).first(),
  ).toBeVisible();
  await expect(page.getByTestId('review-verdict')).toHaveText(
    /not accepted|오답/i,
  );
  // The submitted code is here, and nothing that could change it.
  await expect(page.locator('.monaco-editor').first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole('button', { name: /^run$|^submit$|^실행$|^제출$/i }),
  ).toHaveCount(0);

  // Hidden cases contribute a count and nothing a student could probe with.
  await expect(page.getByText(/hidden cases passed|숨김 테스트/i).first()).toBeVisible();
  expect(await page.content()).not.toContain(HIDDEN_SENTINEL);

  await page.getByRole('link', { name: /back to solution status|풀이 현황으로/i }).click();
  await page.waitForURL(/\/progress\?/, { timeout: 30_000 });
  // The same filter and the same open student, not a reset page.
  await expect(page).toHaveURL(/attention=repeated_failures/);
  await expect(page).toHaveURL(/student=[0-9a-f-]+/);
});

test('by problem walks course to lecture to problem to student', async () => {
  const page = teacherPage;
  await page.goto(progressUrl());
  await page.getByRole('link', { name: /by problem|문제별/i }).click();
  await expect(page).toHaveURL(/view=problems/);

  await page.getByRole('button', { name: new RegExp(COURSE_TITLE, 'i') }).click();
  await expect(page).toHaveURL(/course=[0-9a-f-]+/);

  const lecture = page
    .getByRole('button', { name: new RegExp(LECTURE_TITLE, 'i') })
    .first();
  await expect(lecture).toHaveAttribute('aria-expanded', 'false');
  await lecture.click();
  await expect(lecture).toHaveAttribute('aria-expanded', 'true');
  await expect(page).toHaveURL(/lecture=[0-9a-f-]+/);

  // Only the opened lecture's problems are requested; the outline stays put.
  const problemRow = page
    .getByRole('row')
    .filter({ hasText: PROGRESS_TITLE })
    .first();
  await expect(problemRow).toBeVisible();
  await problemRow.getByRole('button', { name: /open problem|문제 열기/i }).click();
  await expect(page).toHaveURL(/problem=[0-9a-f-]+/);

  // The same attempt history the other lens opens, from the same contract.
  const students = page.locator('section').filter({
    has: page.locator('#problem-students-heading'),
  });
  await expect(students).toBeVisible();
  await students
    .getByRole('button', { name: /show attempts|제출 기록 보기/i })
    .first()
    .click();
  await expect(
    students.getByRole('link', { name: /review|코드 보기/i }).first(),
  ).toBeVisible();
});

test('hidden curriculum and hidden test data never reach the browser', async () => {
  const page = teacherPage;
  await page.goto(progressUrl('view=problems'));
  await page.getByRole('button', { name: new RegExp(COURSE_TITLE, 'i') }).click();
  await expect(
    page.getByRole('button', { name: new RegExp(LECTURE_TITLE, 'i') }).first(),
  ).toBeVisible();

  const markup = await page.content();
  expect(markup).not.toContain(HIDDEN_LECTURE);
  expect(markup).not.toContain(HIDDEN_EXERCISE);
  expect(markup).not.toContain(HIDDEN_SENTINEL);
});

test('a keyboard-only teacher can complete the drill-down on a narrow screen', async () => {
  const page = teacherPage;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(progressUrl());

  // No essential column hides behind a sideways page scroll.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  expect(overflow).toBe(true);

  const open = page.getByRole('button', { name: /^open$|^열기$/i }).first();
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/student=[0-9a-f-]+/);
  // Focus lands inside the region that just opened.
  await expect(page.locator('#student-detail-heading')).toBeFocused();
});

test('another teacher cannot open the class or guess its detail URLs', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page, SECOND_TEACHER_EMAIL);
    await page.goto(progressUrl());
    // Not-found rather than an empty page: denial and absence read alike, so
    // the route cannot be used to discover which classes exist.
    await expect(
      page.getByText(/not found|404|찾을 수 없습니다/i).first(),
    ).toBeVisible();

    // And the server says the same thing when asked without a page.
    const denied = await rpc(page, 'teacherProgress/listStudents', {
      academySlug,
      classId,
    });
    expect(denied.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(denied.body)).toContain(
      'TEACHER_PROGRESS_ACCESS_DENIED',
    );
  } finally {
    await context.close();
  }
});

test('a team lead does not gain the teacher workspace', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const leadAcademySlug = await signIn(page, TEAM_LEAD_EMAIL);
    // `classes.assigned.manage` alone is not the rule; being the teacher is.
    const denied = await rpc(page, 'teacherProgress/listStudents', {
      academySlug: leadAcademySlug,
      classId,
    });
    expect(denied.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(denied.body)).toContain(
      'TEACHER_PROGRESS_ACCESS_DENIED',
    );
  } finally {
    await context.close();
  }
});

test('reassigning the class revokes the teacher on their next request', async ({
  browser,
}) => {
  const managerContext = await browser.newContext();
  const managerPage = await managerContext.newPage();

  let restored = false;
  let assignmentChanged = false;
  let originalMembershipId: string | null | undefined;
  try {
    await teacherPage.goto(progressUrl());
    await expect(teacherPage.getByTestId('progress-students')).toBeVisible();

    await signIn(managerPage, MANAGER_EMAIL);
    const before = await rpc(managerPage, 'academyClasses/get', {
      academySlug,
      classId,
    });
    const original = before.body as {
      assignedTeacher?: { membershipId?: string } | null;
      updatedAt?: string;
    };
    originalMembershipId = original.assignedTeacher?.membershipId ?? null;
    expect(original.updatedAt).toBeTruthy();

    const teachers = await rpc(managerPage, 'academyClasses/listEligibleTeachers', {
      academySlug,
      classId,
    });
    const replacement = (
      teachers.body as {
        teachers?: { membershipId: string; email: string | null }[];
      }
    ).teachers?.find((item) => item.email === SECOND_TEACHER_EMAIL);
    expect(replacement).toBeTruthy();

    const reassigned = await rpc(managerPage, 'academyClasses/setTeacher', {
      academySlug,
      classId,
      teacherMembershipId: replacement!.membershipId,
      expectedUpdatedAt: original.updatedAt,
    });
    expect(reassigned.status).toBe(200);
    assignmentChanged = true;

    // The already-open teacher is refused on the very next read.
    const revoked = await rpc(teacherPage, 'teacherProgress/listStudents', {
      academySlug,
      classId,
    });
    expect(revoked.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(revoked.body)).toContain(
      'TEACHER_PROGRESS_ACCESS_DENIED',
    );

    // Put the fixture back before anything else reads it.
    const current = await rpc(managerPage, 'academyClasses/get', {
      academySlug,
      classId,
    });
    const restore = await rpc(managerPage, 'academyClasses/setTeacher', {
      academySlug,
      classId,
      teacherMembershipId: originalMembershipId,
      expectedUpdatedAt: (current.body as { updatedAt?: string }).updatedAt,
    });
    expect(restore.status).toBe(200);
    restored = true;

    await expect
      .poll(
        async () =>
          (await rpc(teacherPage, 'teacherProgress/listStudents', {
            academySlug,
            classId,
          })).status,
        { timeout: 15_000 },
      )
      .toBe(200);
  } finally {
    if (assignmentChanged && !restored && originalMembershipId !== undefined) {
      try {
        const current = await rpc(managerPage, 'academyClasses/get', {
          academySlug,
          classId,
        });
        const restore = await rpc(managerPage, 'academyClasses/setTeacher', {
          academySlug,
          classId,
          teacherMembershipId: originalMembershipId,
          expectedUpdatedAt: (current.body as { updatedAt?: string }).updatedAt,
        });
        restored = restore.status === 200;
      } catch {
        // The assertion below reports the cleanup failure after both browser
        // contexts have been closed.
      }
    }
    await managerContext.close();
    if (assignmentChanged) {
      expect(restored, 'the seeded class must be left assigned').toBe(true);
    }
  }
});
