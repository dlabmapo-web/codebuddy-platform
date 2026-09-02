import { expect, test, type Page } from '@playwright/test';

import { routes } from '../../packages/web/src/lib/routes';
import { signInAs } from '../support/auth';

const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'CoveDev123!';
const ADMIN = process.env.E2E_ADMIN_USERNAME ?? 'cove-admin';
const ACADEMY = 'Cove Development Academy';
const COURSE = 'E2E Python Basics';

async function signInAsOperator(page: Page) {
  await signInAs({ page, identifier: ADMIN, password: PASSWORD, landing: /\/admin/ });
}

test('the content browser keeps scope while switching lenses and opens the console editor', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAsOperator(page);
  await page.goto('/admin/content/courses');

  const summary = page.getByTestId('content-summary');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText(/Courses/);
  await expect(summary).toContainText(/Classes/);
  await expect(summary).toContainText(/Problems/);
  await expect(summary).toContainText(/across \d+ academ/);

  await page.getByRole('button', { name: 'Academy', exact: true }).click();
  await page.getByRole('option', { name: ACADEMY }).click();
  await page.keyboard.press('Escape');
  await expect(summary).toContainText('across 1 academy');

  const search = page.getByRole('textbox', { name: 'Search courses by title' });
  await search.fill(COURSE);
  await expect(page.getByRole('row').filter({ hasText: COURSE })).toBeVisible();

  await page.getByRole('button', { name: 'Content type' }).click();
  await page.getByRole('option', { name: 'Problems' }).click();
  await expect(page).toHaveURL(/\/admin\/content\/problems\?academy=/);
  expect(page.url()).not.toContain('q=');
  await expect(page.getByRole('textbox', { name: 'Search problems by title' })).toHaveValue('');
  await expect(summary).toContainText('across 1 academy');
  await expect(page.locator('section').filter({ has: page.getByRole('heading', { name: 'Problems', level: 2 }) }).locator('.bg-peer').first()).toBeVisible();

  await page.getByRole('button', { name: 'Content type' }).click();
  await page.getByRole('option', { name: 'Courses' }).click();
  await expect(page).toHaveURL(/\/admin\/content\/courses\?academy=/);
  const courseRow = page.getByRole('row').filter({
    has: page.getByText(COURSE, { exact: true }),
  });
  await expect(courseRow).toBeVisible();
  await courseRow.getByRole('button', { name: /More/ }).click();
  await expect(page.getByRole('menuitem', { name: /Hide/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Delete course' })).toBeVisible();
  // Edit pointed at the same href as Open, so the menu offered a second name
  // for one destination. It is gone; nothing here should bring it back.
  await expect(page.getByRole('menuitem', { name: 'Edit' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  for (const width of [1280, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    const metrics = await page.locator('table').evaluate((table) => {
      const scroller = table.parentElement;
      return {
        clientWidth: scroller?.clientWidth ?? 0,
        scrollWidth: scroller?.scrollWidth ?? 0,
      };
    });
    expect(metrics.scrollWidth, `table overflowed at ${width}px`).toBeLessThanOrEqual(
      metrics.clientWidth + 1,
    );
  }

  await courseRow.getByRole('link', { name: 'Open' }).click();
  await expect(page).toHaveURL(
    new RegExp(
      `${routes.adminAcademyCourses('development-academy')}/[^/?]+\\?from=`,
    ),
  );
  await expect(page.getByText(/Standing in as/i)).toHaveCount(0);

  // One way out, not two. The builder's own "All courses" link stands down
  // under the console shell, which knows where the operator actually came from.
  await expect(page.getByRole('link', { name: /All courses/i })).toHaveCount(0);

  // And the rail agrees with the page. The URL is under /admin/academies, so a
  // path-only rule lights Academies while the page's own Back says Content —
  // the sidebar and the page disagreeing on every content row an operator opens.
  await expect(
    page.locator('a[aria-current="page"], a[data-active="true"]').filter({
      hasText: 'Content',
    }),
  ).toHaveCount(1);

  // Back returns to the browser the operator opened this from, filter intact —
  // not to the academy's own course index, which is where they have never been.
  // Located by href because the sidebar's own Content link shares the label and
  // points at the unfiltered `/admin/content`.
  await page.locator('a[href^="/admin/content/courses?"]').first().click();
  await expect(page).toHaveURL(/\/admin\/content\/courses\?academy=/);

  expect(consoleErrors).toEqual([]);
});

test('sorting reaches the server and stays in the address', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInAsOperator(page);
  await page.goto('/admin/content/courses');

  await page.getByRole('columnheader', { name: 'Modules' }).getByRole('button').click();
  await page.getByRole('menuitem', { name: /Ascending/i }).click();
  await expect(page).toHaveURL(/sort=modules&dir=asc/);

  const counts = await page
    .locator('tbody tr td:nth-child(5)')
    .allInnerTexts();
  const numbers = counts.map((text) => Number(text.trim()));
  expect(numbers).toEqual([...numbers].sort((a, b) => a - b));

  // Lectures is summed after the rows load, so it must not offer a sort that
  // could only ever order the page against itself.
  await expect(
    page.getByRole('columnheader', { name: 'Lectures' }).getByRole('button'),
  ).toHaveCount(0);
});

test('the columns menu hides and restores a content column', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInAsOperator(page);
  await page.goto('/admin/content/courses');

  const header = page.getByRole('columnheader', { name: 'Modules' });
  await expect(header).toBeVisible();

  await page.getByRole('button', { name: 'Columns' }).click();
  await page.getByRole('menuitem', { name: 'Modules' }).click();
  await expect(header).toHaveCount(0);

  await page.getByRole('menuitem', { name: 'Modules' }).click();
  await expect(header).toBeVisible();
});
