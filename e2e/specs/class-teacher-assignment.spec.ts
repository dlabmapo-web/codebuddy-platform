import { expect, test, type Page } from '@playwright/test';

/**
 * Assigning the one teacher responsible for a class.
 *
 * Requires `pnpm --filter @cove/api db:seed` and `db:seed:e2e`, which create
 * both seeded teachers. Two are needed: with one, "replace" has nobody to
 * replace the incumbent with, and the interesting transition never runs.
 *
 * The suite builds its own classes rather than editing the seeded "E2E Cohort",
 * so however it ends, the student journey suite still has its access path.
 *
 * Serial: each test continues where the previous one left the two classes.
 */
test.describe.configure({ mode: 'serial' });

const PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'CoveDev123!';
const TEAM_LEAD_EMAIL = 'teamlead@cove.test';
const MANAGER_EMAIL = 'manager@cove.test';
const TEACHER_EMAIL = 'teacher@cove.test';
const SECOND_TEACHER_EMAIL = 'teacher2@cove.test';
const TEACHER_NAME = 'Cove Teacher';
const SECOND_TEACHER_NAME = 'Cove Second Teacher';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000/api/rpc';

/** Named for this run so a rerun never collides with a leftover class. */
const FIRST_CLASS = `Playwright Teaching A ${Date.now()}`;
const SECOND_CLASS = `Playwright Teaching B ${Date.now()}`;

let academyId = '';
let firstClassId = '';
let secondClassId = '';

async function signIn(page: Page, email: string) {
  await page.goto('/auth/login');
  await page.locator('input[name="identifier"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|로그인/i }).click();
  await page.waitForURL(/\/studio\/academies\//, { timeout: 30_000 });
  academyId =
    /\/studio\/academies\/([0-9a-f-]+)/.exec(page.url())?.[1] ?? academyId;
  expect(academyId).not.toBe('');
}

function classesUrl() {
  return `/studio/academies/${academyId}/classes`;
}

/**
 * The signed-in session's access token, read from the cookies the Supabase SSR
 * client writes. Large sessions are split across numbered chunks, so they are
 * rejoined in numeric order before the value is decoded.
 */
async function accessToken(page: Page): Promise<string> {
  const chunks = (await page.context().cookies())
    .filter((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => {
      const index = (name: string) => Number(/\.(\d+)$/.exec(name)?.[1] ?? 0);
      return index(a.name) - index(b.name);
    })
    .map((cookie) => cookie.value);
  expect(chunks.length).toBeGreaterThan(0);

  // Joined before decoding: a percent-escape can straddle a chunk boundary.
  let raw = decodeURIComponent(chunks.join(''));
  if (raw.startsWith('base64-')) {
    raw = Buffer.from(raw.slice('base64-'.length), 'base64').toString('utf8');
  }
  const token = (JSON.parse(raw) as { access_token?: string }).access_token;
  expect(token).toBeTruthy();
  return token!;
}

/**
 * Calls the API directly with the browser session's token, bypassing the UI
 * entirely. The point of these tests is that hiding a button is not the
 * boundary — the server is.
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

/** Creates a class through the UI and returns the id it landed on. */
async function createClass(page: Page, name: string): Promise<string> {
  await page.goto(classesUrl());
  await page.getByRole('button', { name: /new class|새 반/i }).click();
  await page.getByRole('textbox').first().fill(name);
  await page.getByRole('button', { name: /create and open|만들고 열기/i }).click();
  await page.waitForURL(/\/classes\/[0-9a-f-]+$/, { timeout: 30_000 });
  const id = /\/classes\/([0-9a-f-]+)/.exec(page.url())?.[1] ?? '';
  expect(id).not.toBe('');
  return id;
}

/** Picks a teacher in the assignment dialog and saves. */
async function assignTeacher(page: Page, name: string) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name }).click();
  await dialog
    .getByRole('button', { name: /assign teacher|replace teacher|강사 지정|강사 변경/i })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

function teacherPanel(page: Page) {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: /assigned teacher|담당 강사/i }) });
}

test('a team lead assigns an active teacher to an unassigned class', async ({
  page,
}) => {
  await signIn(page, TEAM_LEAD_EMAIL);
  firstClassId = await createClass(page, FIRST_CLASS);

  // A new class runs unassigned, which is a legitimate state and must read as
  // an invitation rather than as a fault.
  const panel = teacherPanel(page);
  await expect(panel.getByText(/no teacher is assigned yet|담당 강사가 없습니다/i))
    .toBeVisible();

  await panel.getByRole('button', { name: /assign teacher|강사 지정/i }).click();
  await assignTeacher(page, new RegExp(TEACHER_EMAIL, 'i'));

  await expect(panel.getByText(TEACHER_NAME)).toBeVisible();
  await expect(panel.getByText(TEACHER_EMAIL)).toBeVisible();
  await expect(panel.getByText(/unavailable|권한 없음/i)).toHaveCount(0);

  // The list column carries the same answer, without loading the roster.
  await page.goto(classesUrl());
  const row = page.getByRole('row').filter({ hasText: FIRST_CLASS });
  await expect(row.getByText(TEACHER_NAME)).toBeVisible();
});

test('the same teacher takes a second class', async ({ page }) => {
  await signIn(page, TEAM_LEAD_EMAIL);
  secondClassId = await createClass(page, SECOND_CLASS);

  const panel = teacherPanel(page);
  await panel.getByRole('button', { name: /assign teacher|강사 지정/i }).click();
  await assignTeacher(page, new RegExp(TEACHER_EMAIL, 'i'));
  await expect(panel.getByText(TEACHER_NAME)).toBeVisible();

  // One teacher, many classes: the first class keeps them too.
  await page.goto(`${classesUrl()}/${firstClassId}`);
  await expect(teacherPanel(page).getByText(TEACHER_NAME)).toBeVisible();
});

test('a manager replaces the first class teacher without touching the second', async ({
  page,
}) => {
  await signIn(page, MANAGER_EMAIL);
  await page.goto(`${classesUrl()}/${firstClassId}`);

  const panel = teacherPanel(page);
  await panel.getByRole('button', { name: /replace teacher|강사 변경/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: new RegExp(SECOND_TEACHER_EMAIL, 'i') })
    .click();

  // Replacement ends somebody's access, and names them before the save.
  const replacementWarning = dialog.getByText(
    /loses class-monitoring access|모니터링 권한을 잃습니다/i,
  );
  await expect(replacementWarning).toContainText(TEACHER_NAME);
  await dialog.getByRole('button', { name: /replace teacher|강사 변경/i }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await expect(panel.getByText(SECOND_TEACHER_NAME)).toBeVisible();
  // The displaced teacher is gone from this class entirely, which is what
  // ends their access under the effective-assignment predicate.
  await expect(panel.getByText(TEACHER_EMAIL)).toHaveCount(0);

  await page.goto(`${classesUrl()}/${secondClassId}`);
  await expect(teacherPanel(page).getByText(TEACHER_NAME)).toBeVisible();
});

test('a teacher cannot manage assignments through the UI or the API', async ({
  page,
}) => {
  await signIn(page, TEACHER_EMAIL);

  // Class management is not theirs to open, so the page refuses to name it.
  await page.goto(`${classesUrl()}/${firstClassId}`);
  await expect(page.locator('body')).not.toContainText(FIRST_CLASS);

  // And the button being absent is not the boundary — the server is.
  const denied = await rpc(page, 'academyClasses/setTeacher', {
    academyId,
    classId: firstClassId,
    teacherMembershipId: null,
    expectedUpdatedAt: new Date().toISOString(),
  });
  expect(denied.status).toBeGreaterThanOrEqual(400);
  expect(denied.body.code).toBe('PERMISSION_DENIED');

  const listed = await rpc(page, 'academyClasses/listEligibleTeachers', {
    academyId,
    classId: firstClassId,
  });
  expect(listed.body.code).toBe('PERMISSION_DENIED');
});

test('an ineligible membership cannot be assigned', async ({ page }) => {
  await signIn(page, MANAGER_EMAIL);
  await page.goto(`${classesUrl()}/${firstClassId}`);

  const detail = await rpc(page, 'academyClasses/get', {
    academyId,
    classId: firstClassId,
  });
  const revision = detail.body.updatedAt as string;

  // A real, same-academy membership that is simply not a teacher.
  const students = await rpc(page, 'academyClasses/listEligibleStudents', {
    academyId,
    classId: firstClassId,
  });
  const studentMembershipId = (
    students.body.students as { membershipId: string }[]
  )[0]?.membershipId;
  expect(studentMembershipId).toBeTruthy();

  const wrongRole = await rpc(page, 'academyClasses/setTeacher', {
    academyId,
    classId: firstClassId,
    teacherMembershipId: studentMembershipId,
    expectedUpdatedAt: revision,
  });
  expect(wrongRole.body.code).toBe('CLASS_TEACHER_INELIGIBLE');

  // A membership this academy has never seen answers identically, so the
  // caller cannot use the error to probe for one that exists elsewhere.
  const unknown = await rpc(page, 'academyClasses/setTeacher', {
    academyId,
    classId: firstClassId,
    teacherMembershipId: '11111111-1111-4111-8111-111111111111',
    expectedUpdatedAt: revision,
  });
  expect(unknown.body.code).toBe('CLASS_TEACHER_INELIGIBLE');
  expect(unknown.body.message).toBe(wrongRole.body.message);
});

test('two stale dialogs cannot silently overwrite each other', async ({
  page,
}) => {
  await signIn(page, MANAGER_EMAIL);
  await page.goto(`${classesUrl()}/${firstClassId}`);

  const detail = await rpc(page, 'academyClasses/get', {
    academyId,
    classId: firstClassId,
  });
  // The revision both dialogs loaded before either of them saved.
  const stale = detail.body.updatedAt as string;

  const teachers = await rpc(page, 'academyClasses/listEligibleTeachers', {
    academyId,
    classId: firstClassId,
  });
  const candidates = teachers.body.teachers as {
    membershipId: string;
    email: string;
  }[];
  const first = candidates.find((teacher) => teacher.email === TEACHER_EMAIL);
  const second = candidates.find(
    (teacher) => teacher.email === SECOND_TEACHER_EMAIL,
  );
  expect(first && second).toBeTruthy();

  const winner = await rpc(page, 'academyClasses/setTeacher', {
    academyId,
    classId: firstClassId,
    teacherMembershipId: first!.membershipId,
    expectedUpdatedAt: stale,
  });
  expect(winner.status).toBe(200);

  const loser = await rpc(page, 'academyClasses/setTeacher', {
    academyId,
    classId: firstClassId,
    teacherMembershipId: second!.membershipId,
    expectedUpdatedAt: stale,
  });
  expect(loser.body.code).toBe('CLASS_EDIT_CONFLICT');

  // The first decision stands. The second is refused, never merged.
  const after = await rpc(page, 'academyClasses/get', {
    academyId,
    classId: firstClassId,
  });
  expect(
    (after.body.assignedTeacher as { membershipId: string }).membershipId,
  ).toBe(first!.membershipId);
});

test('a manager removes the teacher and the class stays active', async ({
  page,
}) => {
  await signIn(page, MANAGER_EMAIL);
  await page.goto(`${classesUrl()}/${firstClassId}`);

  const panel = teacherPanel(page);
  await panel.getByRole('button', { name: /remove assignment|지정 해제/i }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /remove assignment|지정 해제/i })
    .click();

  await expect(panel.getByText(/no teacher is assigned yet|담당 강사가 없습니다/i))
    .toBeVisible();
  // Unassigned is a working state, not a broken one: nothing else moved.
  await expect(page.getByText(/this class is archived|보관 상태/i)).toHaveCount(0);

  await page.goto(classesUrl());
  const row = page.getByRole('row').filter({ hasText: FIRST_CLASS });
  await expect(row.getByText(/not assigned|미지정/i)).toBeVisible();
});
