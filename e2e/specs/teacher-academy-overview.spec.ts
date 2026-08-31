import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from '@playwright/test';

import { routes } from '../../packages/web/src/lib/routes';
import { signInAs } from '../support/auth';

/**
 * The teaching overview and Student analytics, from the academy root.
 *
 * Requires `pnpm --filter @cove/api db:seed` and `db:seed:e2e`.
 *
 * Nothing here asserts an absolute count. The student journey and the grading
 * suite both add submissions to the same fixtures, so a test that pinned "19
 * failed attempts" would fail on the second run rather than on a regression.
 * What is asserted is the shape: which role sees the page, that every section
 * occupies its own full-width row in the approved order, that the numbers carry
 * their denominators, that filters survive a reload, that a preview link opens
 * the detail page on the same scope, that `Order` spans the whole result, and
 * that nothing about any of it is reachable by a role that must not have it.
 *
 * Serial: the filter tests build on the state the previous one left in the URL.
 */
test.describe.configure({ mode: 'serial' });

const PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'CoveDev123!';
const TEACHER_EMAIL = 'teacher@cove.test';
const SECOND_TEACHER_EMAIL = 'teacher2@cove.test';
const MANAGER_EMAIL = 'manager@cove.test';
const STUDENT_EMAIL = 'student@cove.test';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000/api/rpc';

const CLASS_NAME = 'E2E Cohort';

/** §6 — the approved reading order, top to bottom, one section per row. */
const SECTIONS = [
  'teaching-queue',
  'metrics-ledger',
  'student-participation',
  'score-order',
  'active-learning',
  'curriculum-readiness',
  'difficult-problems',
] as const;

let academySlug = '';
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
 * Hiding a page from a role is not the boundary — the server is — so the denial
 * tests have to ask the server without a page in the way.
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

/**
 * Picks a value from a Studio selector.
 *
 * These filters are `ResponsiveSelector`, the same searchable popover the
 * academy switcher and sign-up use — not a native `<select>` — so the choice is
 * a click on the trigger and a click on the option rather than `selectOption`.
 * The trigger is found by its accessible name so the assertion does not depend
 * on how many controls happen to sit beside it.
 */
async function chooseFilter(
  page: Page,
  filter: RegExp,
  option: RegExp,
): Promise<void> {
  await page.getByRole('combobox', { name: filter }).click();
  await page.getByRole('option', { name: option }).first().click();
}

const CLASS_FILTER = /^(Class|학급)$/;
const COURSE_FILTER = /^(Course|코스)$/;
const ALL_COURSES = /^(All courses|코스 전체)$/;

function overviewUrl(search = ''): string {
  const base = routes.academy(academySlug);
  return search ? `${base}?${search}` : base;
}

function studentsUrl(search = ''): string {
  const base = routes.academyTeachStudents(academySlug);
  return search ? `${base}?${search}` : base;
}

test.beforeAll(async ({ browser }) => {
  // The dev server compiles a route on its first request, and this one pulls
  // in Recharts. Warming it once keeps every later navigation inside the
  // ordinary per-test timeout.
  test.setTimeout(240_000);
  teacherContext = await browser.newContext();
  teacherPage = await teacherContext.newPage();
  academySlug = await signIn(teacherPage, TEACHER_EMAIL);
  await teacherPage.goto(overviewUrl(), { timeout: 180_000 });
  await expect(teacherPage.getByTestId('student-participation')).toBeVisible({
    timeout: 120_000,
  });
});

test.afterAll(async () => {
  await teacherContext.close();
});

test('every section occupies its own row, in the approved order', async () => {
  const page = teacherPage;
  await page.goto(overviewUrl());

  const boxes: { id: string; y: number; x: number; width: number }[] = [];
  for (const id of SECTIONS) {
    const section = page.getByTestId(id);
    await expect(section).toBeVisible();
    const box = await section.boundingBox();
    boxes.push({ id, y: box!.y, x: box!.x, width: box!.width });
  }

  // §17 — a full-width single-column sequence with no two-section row. Every
  // section starts below the previous one and shares its left edge and width.
  for (let index = 1; index < boxes.length; index += 1) {
    expect(boxes[index].y).toBeGreaterThan(boxes[index - 1].y);
    expect(boxes[index].x).toBeCloseTo(boxes[0].x, 0);
    expect(boxes[index].width).toBeCloseTo(boxes[0].width, 0);
  }
});

test('the queue comes before the numbers that explain it', async () => {
  const page = teacherPage;
  await page.goto(overviewUrl());

  // The signature surface answers the teacher's first question, so the ledger
  // it is measured against sits underneath rather than above.
  const queue = await page.getByTestId('teaching-queue').boundingBox();
  const ledger = await page.getByTestId('metrics-ledger').boundingBox();
  expect(queue!.y).toBeLessThan(ledger!.y);
});

test('the ledger carries every number with its denominator', async () => {
  const page = teacherPage;
  await page.goto(overviewUrl());

  const ledger = page.getByTestId('metrics-ledger');
  // §6.4 — a score is never printed alone, and a missing score is never a zero.
  await expect(
    ledger.getByText(
      /attempted problem|has no score yet|have no score yet|시도한 문제|점수가 없어/i,
    ).first(),
  ).toBeVisible();
  await expect(
    ledger.getByText(/were active this period|was active this period|활동했습니다/i),
  ).toBeVisible();
});

test('the period is printed with its dates and timezone, not only as "7 days"', async () => {
  const page = teacherPage;
  await page.goto(overviewUrl());
  await expect(page.getByText(/Asia\/Seoul/).first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^7 days$|^7일$/ }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('participation keeps the grouped bars and an equal table', async () => {
  const page = teacherPage;
  await page.goto(overviewUrl());

  const participation = page.getByTestId('student-participation');
  // §6.5 — the CEO-required pair: volume beside outcome, never volume alone.
  await expect(
    participation.getByText(/^Submissions$|^제출$/).first(),
  ).toBeVisible();
  await expect(
    participation.getByText(/^Problems solved$|^해결한 문제$/).first(),
  ).toBeVisible();

  await participation.locator('details summary').first().click();
  await expect(
    participation.getByRole('columnheader', {
      name: /active learning|학습 활동 시간/i,
    }),
  ).toBeVisible();
});

test('the activity preview switches ends without losing the scope', async () => {
  const page = teacherPage;
  await page.goto(overviewUrl());

  const activity = page.getByTestId('active-learning');
  await activity.getByRole('button', { name: /least active|적은 순/i }).click();
  await expect(
    activity.getByRole('button', { name: /least active|적은 순/i }),
  ).toHaveAttribute('aria-pressed', 'true');

  // §6.7 — the choice on screen is what the link opens.
  await expect(
    activity.getByRole('link', { name: /view all activity|활동 전체 보기/i }),
  ).toHaveAttribute('href', /sort=activeTime&direction=asc/);
});

test('class, course, and range selections survive a reload and a deep link', async () => {
  const page = teacherPage;
  await page.goto(overviewUrl());

  await chooseFilter(page, CLASS_FILTER, new RegExp(`^${CLASS_NAME}$`));
  await expect(page).toHaveURL(/class=[0-9a-f-]{36}/);

  await page.getByRole('button', { name: /^30 days$|^30일$/ }).click();
  await expect(page).toHaveURL(/range=30d/);

  const deepLink = page.url();
  await page.reload();
  await expect(page).toHaveURL(deepLink);
  await expect(
    page.getByRole('button', { name: /^30 days$|^30일$/ }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('an unknown class in the address renders the whole scope instead of failing', async () => {
  const page = teacherPage;
  // A class from no academy at all. §5.3 removes it rather than refusing.
  await page.goto(
    overviewUrl('class=00000000-0000-4000-8000-0000000000ff&range=90d'),
  );
  await expect(page.getByTestId('student-participation')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^7 days$|^7일$/ }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('the superseded participation lens is dropped from the address', async () => {
  const page = teacherPage;
  await page.goto(overviewUrl('participation=work&range=30d'));
  // §5.3 — canonicalization removes it; the range it travelled with survives.
  await expect(page).not.toHaveURL(/participation=/);
  await expect(page).toHaveURL(/range=30d/);
});

test('a preview link opens Student analytics on the same scope', async () => {
  const page = teacherPage;
  await page.goto(overviewUrl());

  await chooseFilter(page, CLASS_FILTER, new RegExp(`^${CLASS_NAME}$`));
  await expect(page).toHaveURL(/class=[0-9a-f-]{36}/);
  const classId = new URL(page.url()).searchParams.get('class')!;

  await page
    .getByTestId('score-order')
    .getByRole('link', { name: /view full score order|점수 순서 전체 보기/i })
    .click();

  await page.waitForURL(/\/teach\/students\?/, { timeout: 30_000 });
  const target = new URL(page.url()).searchParams;
  expect(target.get('class')).toBe(classId);
  expect(target.get('sort')).toBe('score');
  await expect(page.getByRole('table')).toBeVisible({ timeout: 60_000 });
});

test('a queue row opens the student in class-scoped Solution status', async () => {
  const page = teacherPage;
  await page.goto(overviewUrl());

  const open = page
    .getByTestId('teaching-queue')
    .getByRole('link', { name: /view progress|학습 현황 보기/i })
    .first();
  if ((await open.count()) === 0) test.skip();

  await open.click();
  await page.waitForURL(/\/teach\/classes\/[0-9a-f-]+\/progress\?student=/, {
    timeout: 30_000,
  });
  await expect(page.getByTestId('progress-students')).toBeVisible({
    timeout: 60_000,
  });
});

test('every queue row states the measurement behind its reason', async () => {
  const page = teacherPage;
  await page.goto(overviewUrl());

  const rows = page.getByTestId('teaching-queue').getByRole('listitem');
  if ((await rows.count()) > 0) {
    // A chip with no number in it would be a verdict rather than an
    // observation, which is exactly what §6.3 rules out.
    await expect(rows.first().getByText(/\d/).first()).toBeVisible();
  }
});

test('Current rank spans the whole result rather than restarting per page', async () => {
  const page = teacherPage;
  await page.goto(studentsUrl('pageSize=25&sort=name&direction=asc'));

  const table = page.getByRole('table');
  await expect(table).toBeVisible({ timeout: 60_000 });

  const rowCount = await table.locator('tbody tr').count();
  const firstOrder = await table
    .locator('tbody tr')
    .first()
    .getByTestId('student-current-rank')
    .innerText();
  expect(firstOrder.trim()).toBe('1');

  const next = page.getByRole('button', { name: /^(next|다음)$/i });
  if (await next.isEnabled()) {
    await next.click();
    await expect(page).toHaveURL(/page=2/);
    const secondPageFirst = await table
      .locator('tbody tr')
      .first()
      .getByTestId('student-current-rank')
      .innerText();
    // §7.3 — page two continues the numbering rather than starting again at 1.
    expect(Number(secondPageFirst.trim())).toBeGreaterThan(rowCount);
  }
});

test('Student analytics opens with essential columns and no horizontal scroll', async () => {
  const page = teacherPage;
  await page.goto(studentsUrl());

  const table = page.getByRole('table');
  await expect(table).toBeVisible({ timeout: 60_000 });
  const headers = table.locator('thead');

  await expect(headers).toContainText(/student|학생/i);
  await expect(headers).toContainText(/class|학급/i);
  await expect(headers).toContainText(/average score|평균 점수/i);
  await expect(headers).toContainText(/solved|해결/i);
  await expect(headers).toContainText(/active learning|학습 활동 시간/i);
  await expect(headers).toContainText(/attention|확인 사유/i);
  await expect(headers).not.toContainText(/current rank|현재 순위/i);
  await expect(headers).not.toContainText(/submissions|제출/i);

  expect(
    await table.evaluate((element) => {
      const scroller = element.parentElement;
      return scroller ? scroller.scrollWidth > scroller.clientWidth : true;
    }),
  ).toBe(false);

});

test('the curriculum filters narrow in order and clear their descendants', async () => {
  const page = teacherPage;
  await page.goto(studentsUrl());
  await expect(page.getByRole('table')).toBeVisible({ timeout: 60_000 });

  // With no course chosen there is nothing authorized to list below it, so the
  // deeper pickers are absent rather than present and empty.
  const before = await page.getByRole('combobox').count();

  await page.getByRole('combobox', { name: COURSE_FILTER }).click();
  // The first row clears the filter, so the first real course is the second.
  await page.getByRole('option').nth(1).click();
  await expect(page).toHaveURL(/course=[0-9a-f-]{36}/);
  expect(await page.getByRole('combobox').count()).toBeGreaterThanOrEqual(before);

  // Clearing the course takes every descendant with it; §5.4.
  await chooseFilter(page, COURSE_FILTER, ALL_COURSES);
  await expect(page).not.toHaveURL(/course=|module=|lecture=|problem=/);
});

test('the attention facet narrows to any of the reasons picked', async () => {
  const page = teacherPage;
  await page.goto(studentsUrl());
  await expect(page.getByRole('table')).toBeVisible({ timeout: 60_000 });

  // The Studio's facet chip, not a native select: open it and tick a reason.
  await page.getByRole('button', { name: /attention|확인 사유/i }).click();
  await page.getByRole('option', { name: /no activity|활동 없음/i }).click();
  await expect(page).toHaveURL(/attention=inactive/);

  // §5.4 — the whole state is deep-linkable, repeated params included.
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page).toHaveURL(/attention=inactive/);
});

test('a score always travels with the problems it was measured over', async () => {
  const page = teacherPage;
  await page.goto(studentsUrl('sort=score&direction=desc'));
  await expect(page.getByRole('table')).toBeVisible({ timeout: 60_000 });

  // §7.4 — 100% over one problem must not read as 100% over twenty.
  await expect(
    page.getByText(/over \d+ problems?|문제 \d+개 기준/).first(),
  ).toBeVisible();
});

test('a teacher sees only their own classes, and the server agrees', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const otherAcademyId = await signIn(page, SECOND_TEACHER_EMAIL);

  for (const path of [
    'academyTeacherOverview/get',
    'academyTeacherStudents/list',
  ]) {
    const response = await rpc(page, path, {
      academySlug: otherAcademyId,
      range: '7d',
    });
    expect(response.status).toBe(200);
    const filters = response.body.filters as { classes: { label: string }[] };
    // The fixture cohort belongs to the first teacher. A second teacher must
    // not list it, whatever the UI would have rendered.
    expect(filters.classes.map((entry) => entry.label)).not.toContain(
      CLASS_NAME,
    );
  }

  await context.close();
});

test('a student is redirected and a manager never receives teacher analytics', async ({
  browser,
}) => {
  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  const studentAcademy = await signIn(studentPage, STUDENT_EMAIL);
  await studentPage.goto(routes.academy(studentAcademy));
  await studentPage.waitForURL(/\/learn\/courses/, { timeout: 30_000 });

  for (const path of [
    'academyTeacherOverview/get',
    'academyTeacherStudents/list',
  ]) {
    const denial = await rpc(studentPage, path, {
      academySlug: studentAcademy,
      range: '7d',
    });
    expect(denial.status).toBeGreaterThanOrEqual(400);
  }
  await studentContext.close();

  const managerContext = await browser.newContext();
  const managerPage = await managerContext.newPage();
  const managerAcademy = await signIn(managerPage, MANAGER_EMAIL);
  await managerPage.goto(routes.academy(managerAcademy));
  // The management overview, not the teaching one.
  await expect(managerPage.getByTestId('teaching-queue')).toHaveCount(0);

  const managerDenial = await rpc(managerPage, 'academyTeacherOverview/get', {
    academySlug: managerAcademy,
    range: '7d',
  });
  expect(managerDenial.status).toBeGreaterThanOrEqual(400);
  expect(managerDenial.body).toMatchObject({
    code: 'TEACHER_OVERVIEW_ACCESS_DENIED',
  });
  await managerContext.close();
});
