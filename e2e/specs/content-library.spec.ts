import { expect, test, type Page } from '@playwright/test';

import { routes } from '../../packages/web/src/lib/routes';
import { signInAs } from '../support/auth';

const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'CoveDev123!';
const ADMIN = process.env.E2E_ADMIN_USERNAME ?? 'cove-admin';
const TEAM_LEAD = process.env.E2E_TEAM_LEAD_USERNAME ?? 'cove-teamlead';
const ACADEMY_SLUG = 'development-academy';

/** Seeded by `pnpm --filter @cove/api db:seed:library`. */
const PUBLISHED = 'DLAB Python Level 1';
const DRAFT = 'DLAB Python Level 2 (draft)';

async function signInAsOperator(page: Page) {
  await signInAs({
    page,
    identifier: ADMIN,
    password: PASSWORD,
    landing: /\/admin/,
  });
}

async function signInAsTeamLead(page: Page) {
  await signInAs({
    page,
    identifier: TEAM_LEAD,
    password: PASSWORD,
    landing: /\/academy\//,
  });
}

test.describe('the content library', () => {
  test('an operator authors a master course and sees who is teaching it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInAsOperator(page);
    await page.goto(routes.adminLibrary);

    // The rail's own row, above the cross-academy list it must not be confused
    // with — the reason "Courses" was renamed when this page arrived.
    await expect(
      page.getByRole('link', { name: 'Library', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Academy courses' }),
    ).toBeVisible();

    const published = page.getByRole('listitem').filter({ hasText: PUBLISHED });
    await expect(published).toBeVisible();
    await expect(published.getByText('Published')).toBeVisible();

    // Both states are on the page, which is what proves the branch-side list
    // is filtering rather than simply happening to show one course.
    const draft = page.getByRole('listitem').filter({ hasText: DRAFT });
    await expect(draft.getByText('Draft')).toBeVisible();

    // The library's own editor, at an address carrying no academy slug: head
    // office never sees its curriculum addressed as a customer's academy.
    await published.getByRole('link', { name: 'Open' }).click();
    await expect(page).toHaveURL(/\/admin\/content\/library\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: PUBLISHED })).toBeVisible();

    // The workbook importer, which the console's academy-scoped builder leaves
    // off and this one turns on: head office writes more problems than anyone.
    await expect(page.getByRole('link', { name: /Import/i })).toBeVisible();
  });

  test('a team lead copies a master, owns the copy, and is told when head office moves on', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInAsTeamLead(page);
    await page.goto(routes.academyCourses(ACADEMY_SLUG));

    await page.getByRole('link', { name: 'Add from library' }).click();
    await expect(page).toHaveURL(routes.academyLibrary(ACADEMY_SLUG));

    // Only what head office published. A draft offered here would be the one
    // failure this page must never have.
    await expect(page.getByText(PUBLISHED)).toBeVisible();
    await expect(page.getByText(DRAFT)).toHaveCount(0);

    const card = page.getByRole('listitem').filter({ hasText: PUBLISHED });
    await card.getByRole('button', { name: 'Preview' }).click();

    // The outline that will arrive, not a summary of it.
    await expect(page.getByText('Variables and input')).toBeVisible();
    await expect(page.getByText('Reading a line')).toBeVisible();

    const name = page.getByRole('textbox', {
      name: 'Name it in your academy',
    });
    await expect(name).toHaveValue(PUBLISHED);
    const copyTitle = `${PUBLISHED} (e2e)`;
    await name.fill(copyTitle);
    await page.getByRole('button', { name: 'Copy to my academy' }).click();

    // Lands in the branch's own builder, on its own course.
    await expect(page).toHaveURL(
      new RegExp(`${routes.academyCourses(ACADEMY_SLUG)}/[0-9a-f-]+$`),
    );
    await expect(page.getByRole('heading', { name: copyTitle })).toBeVisible();

    // And it is a copy: hidden until the branch publishes it, and carrying the
    // module head office wrote.
    await expect(page.getByText('Variables and input')).toBeVisible();

    await page.goto(routes.academyCourses(ACADEMY_SLUG));
    const row = page.getByRole('row').filter({ hasText: copyTitle });
    await expect(row).toBeVisible();
    await expect(row.getByText('Hidden')).toBeVisible();
    await expect(row.getByText(`From library · ${PUBLISHED}`)).toBeVisible();
    // Untouched, so exactly one chip and no `Customized` beside it.
    await expect(row.getByText('Up to date')).toBeVisible();
    await expect(row.getByText('Customized')).toHaveCount(0);
  });

  test('the library never appears among the platform’s customers', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInAsOperator(page);

    // The academies table is the list that says who the customers are. A
    // library counted among them is head office's own curriculum turning up in
    // the middle of a support call.
    await page.goto('/admin');
    await expect(page.getByText('Content Library')).toHaveCount(0);

    // And the cross-academy browser answers "what is this academy running",
    // which a master course is not an answer to.
    await page.goto('/admin/content/courses');
    await expect(page.getByRole('row').filter({ hasText: PUBLISHED })).toHaveCount(
      0,
    );
  });
});
