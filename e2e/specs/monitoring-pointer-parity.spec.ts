import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { routes } from '../../packages/web/src/lib/routes';
import { signInAs } from '../support/auth';

/**
 * The shared pointer, on two screens that do not match.
 *
 * Every earlier monitoring test runs both roles at the same size and the same
 * scroll offset, which is why two position bugs reached production through a
 * green suite: the coordinate was a fraction of the pane's *visible* box, and
 * then a fraction of the statement's *height*. Both are identical when the two
 * layouts are identical, and neither is otherwise.
 *
 * So the setup here is the test. Different viewport widths, different heights,
 * different scroll offsets, on the exercise that has hints — the case where
 * the two statements used to differ in length. The assertion is the only one
 * that matters: the teacher points at a piece of content, and the student's
 * arrow is on that same piece of content.
 *
 * Requires `pnpm --filter @cove/api db:seed` and `db:seed:e2e`.
 */
test.describe.configure({ mode: 'serial' });

const PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'CoveDev123!';
const STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL ?? 'student@cove.test';
const TEACHER_EMAIL = 'teacher@cove.test';
const CLASS_NAME = 'E2E Cohort';
/** The hinted exercise: the two roles used to render it at different heights. */
const HINTED_TITLE = 'Echo the input';

let academySlug = '';
let studentContext: BrowserContext;
let teacherContext: BrowserContext;
let studentPage: Page;
let teacherPage: Page;

const statementSurface = (page: Page) =>
  page.locator('[data-collab-surface="statement"]');

/** A block both roles render, far enough down to be worth pointing at. */
const target = (page: Page) =>
  page.getByTestId('problem-statement').getByText(/example 1|예제 1/i).first();

test.beforeAll(async ({ browser }) => {
  // Deliberately unequal, in both axes. The height difference is what forces
  // the two statements to sit at different scroll offsets.
  studentContext = await browser.newContext({
    viewport: { width: 1280, height: 620 },
  });
  teacherContext = await browser.newContext({
    viewport: { width: 1680, height: 900 },
  });
  studentPage = await studentContext.newPage();
  teacherPage = await teacherContext.newPage();

  academySlug = await signInAs({
    page: studentPage,
    identifier: STUDENT_EMAIL,
    password: PASSWORD,
  });
  await signInAs({
    page: teacherPage,
    identifier: TEACHER_EMAIL,
    password: PASSWORD,
  });
});

test.afterAll(async () => {
  await studentContext?.close();
  await teacherContext?.close();
});

test('the teacher opens a live watch on the hinted exercise', async () => {
  await studentPage.goto(routes.academyLearnCourses(academySlug));
  await teacherPage.goto(routes.academyTeachClasses(academySlug));
  await teacherPage.getByRole('heading', { name: CLASS_NAME }).click();
  await teacherPage.waitForURL(/\/teach\/classes\/[0-9a-f-]+$/, {
    timeout: 30_000,
  });

  await studentPage.getByText(HINTED_TITLE).first().click();
  await studentPage.waitForURL(/\/learn\/exercises\//, { timeout: 30_000 });
  await expect(statementSurface(studentPage)).toBeVisible({ timeout: 30_000 });

  const row = teacherPage.getByRole('row').filter({ hasText: 'Cove Student' });
  await expect(
    row.getByRole('link', { name: /open live|실시간 보기/i }),
  ).toBeVisible({ timeout: 30_000 });
  await row.getByRole('link', { name: /open live|실시간 보기/i }).click();
  await teacherPage.waitForURL(/\/students\/[0-9a-f-]+\/live$/, {
    timeout: 30_000,
  });
  await expect(statementSurface(teacherPage)).toBeVisible({ timeout: 30_000 });
});

test('both statements enter canvas mode once the document is shared', async () => {
  // The shared coordinate space only exists while collaborating. If this fails
  // the parity assertion below would be testing the fallback, not the design.
  for (const page of [studentPage, teacherPage]) {
    await expect(
      page.locator('[data-collab-canvas="statement"]'),
    ).toHaveCount(1, { timeout: 30_000 });
  }

  // Same document, and both say so — the guard that stops a teacher previewing
  // another exercise from drawing a confident arrow on this one.
  const material = async (page: Page) =>
    page
      .locator('[data-collab-canvas="statement"]')
      .getAttribute('data-collab-material');
  expect(await material(studentPage)).toBe(await material(teacherPage));
});

test('the arrow lands on the same content at different scroll offsets', async () => {
  // Diverge the two panes as far as the content allows. The student's viewport
  // is shorter, so their statement scrolls where the teacher's may not.
  await studentPage.evaluate(() => {
    document
      .querySelector('[data-collab-surface="statement"]')
      ?.scrollBy({ top: 140 });
  });
  await studentPage.waitForTimeout(200);

  const studentTarget = await target(studentPage).boundingBox();
  const teacherTarget = await target(teacherPage).boundingBox();
  expect(studentTarget).not.toBeNull();
  expect(teacherTarget).not.toBeNull();

  // The premise: the two layouts really are different. Without this the test
  // proves nothing that the existing suite did not already cover.
  expect(Math.abs(studentTarget!.y - teacherTarget!.y)).toBeGreaterThan(20);

  const peer = studentPage.getByTestId('peer-pointer');
  await expect
    .poll(
      async () => {
        // Re-moved every poll: the teacher's arrow fades from the student's
        // screen after three seconds of stillness, by design.
        await teacherPage.mouse.move(
          teacherTarget!.x + teacherTarget!.width / 2,
          teacherTarget!.y + teacherTarget!.height / 2,
        );
        if ((await peer.count()) === 0) return null;
        const box = await peer.boundingBox();
        return box ? { x: box.x, y: box.y } : null;
      },
      { timeout: 30_000, intervals: [250] },
    )
    .not.toBeNull();

  const arrow = (await peer.boundingBox())!;
  const fresh = (await target(studentPage).boundingBox())!;
  // The arrow's tip, which is its top-left corner, is inside the same block on
  // this screen — not at the same fraction of a differently sized pane.
  expect(arrow.x).toBeGreaterThanOrEqual(fresh.x - 4);
  expect(arrow.x).toBeLessThanOrEqual(fresh.x + fresh.width + 4);
  expect(arrow.y).toBeGreaterThanOrEqual(fresh.y - 4);
  expect(arrow.y).toBeLessThanOrEqual(fresh.y + fresh.height + 4);
});

test('a pointer over the hints dialog is not drawn on the statement', async () => {
  // The dialog is portaled clear of every collaboration surface, so there is
  // no shared coordinate for it to report. Nothing new should appear on the
  // student's statement while the teacher reads hints.
  await teacherPage.getByTestId('open-hints').click();
  await expect(teacherPage.getByRole('dialog')).toBeVisible();
  const dialogBox = (await teacherPage.getByRole('dialog').boundingBox())!;
  await teacherPage.mouse.move(
    dialogBox.x + dialogBox.width / 2,
    dialogBox.y + dialogBox.height / 2,
  );

  // Three seconds is the teacher marker's idle lifetime; after it the arrow is
  // gone rather than parked somewhere it was never pointing.
  await studentPage.waitForTimeout(3_500);
  await expect(studentPage.getByTestId('peer-pointer')).toHaveCount(0);
});
