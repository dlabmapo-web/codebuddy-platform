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
    landing: /\/admin\/academies(?:[/?#]|$)/,
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

    const published = page.getByRole('row').filter({ hasText: PUBLISHED });
    await expect(published).toBeVisible();
    await expect(
      published.getByText('Published', { exact: true }),
    ).toBeVisible();

    // Both states are on the page, which is what proves the branch-side list
    // is filtering rather than simply happening to show one course.
    const draft = page.getByRole('row').filter({ hasText: DRAFT });
    await expect(draft.getByText('Draft', { exact: true })).toBeVisible();

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
    await expect(
      page.getByRole('heading', { name: PUBLISHED, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(DRAFT, { exact: true })).toHaveCount(0);

    const card = page.getByRole('listitem').filter({ hasText: PUBLISHED });
    await card.getByRole('button', { name: 'Preview' }).click();

    // The outline that will arrive, not a summary of it.
    await expect(page.getByText('Variables and input')).toBeVisible();
    await expect(page.getByText('Reading a line')).toBeVisible();

    const name = page.getByRole('textbox', {
      name: 'Name it in your academy',
    });
    await expect(name).toHaveValue(PUBLISHED);
    const copyTitle = `${PUBLISHED} (e2e ${Date.now()})`;
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

    // The copy arrives ready to teach. Head office never switched a row on in
    // the library — nothing there is read by a student — and if the copy had
    // inherited those flags, the Team Lead would be looking at a complete
    // course that can deliver nothing, with no warning and several hundred
    // toggles between them and a working one.
    const copiedModule = page
      .getByRole('article')
      .filter({ hasText: 'Variables and input' });
    for (const title of [
      'Variables and input',
      'Reading a line',
      'Echo the input',
    ]) {
      await expect(
        copiedModule.getByRole('switch', {
          name: `Show “${title}” to students`,
        }),
      ).toBeChecked();
    }

    // Back the way a Team Lead actually goes — the builder's own "All courses"
    // link, not a fresh page load. One query client spans both routes, and the
    // courses table served its pre-adopt cache here until the copy invalidated
    // it: the course was missing until the page was reloaded by hand.
    await page.getByRole('link', { name: 'All courses' }).click();
    await expect(page).toHaveURL(routes.academyCourses(ACADEMY_SLUG));

    const row = page.getByRole('row').filter({ hasText: copyTitle });
    await expect(row).toBeVisible();
    await expect(row.getByText('Hidden')).toBeVisible();
    await expect(row.getByText(`From library · ${PUBLISHED}`)).toBeVisible();
    // Untouched, so exactly one chip and no `Customized` beside it.
    await expect(row.getByText('Up to date')).toBeVisible();
    await expect(row.getByText('Customized')).toHaveCount(0);

    // Publishing is the one switch, and it is only that: a course whose
    // delivery changed has not had its content edited, so the copy must not
    // start reporting itself as customized for having been switched on.
    const visibility = row.getByRole('switch', {
      name: `Show “${copyTitle}” to students`,
    });
    await visibility.click();
    await expect(visibility).toBeChecked();
    await expect(row.getByText('Visible')).toBeVisible();
    await expect(row.getByText('Customized')).toHaveCount(0);
    // And nothing warns, because the course can actually teach something.
    await expect(row.getByText('Nothing visible')).toHaveCount(0);
  });

  test('an admin copies an academy course into an independent library draft', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const suffix = Date.now();
    const sourceTitle = `Reverse source ${suffix}`;
    const masterTitle = `Reverse master ${suffix}`;
    await signInAsTeamLead(page);
    await page.goto(routes.academyLibrary(ACADEMY_SLUG));
    const published = page.getByRole('listitem').filter({ hasText: PUBLISHED });
    await published.getByRole('button', { name: 'Preview' }).click();
    await page
      .getByRole('textbox', { name: 'Name it in your academy' })
      .fill(sourceTitle);
    await page.getByRole('button', { name: 'Copy to my academy' }).click();
    await expect(
      page.getByRole('heading', { name: sourceTitle }),
    ).toBeVisible();

    await signInAsOperator(page);
    await page.goto(
      `/admin/content/courses?q=${encodeURIComponent(sourceTitle)}`,
    );
    const source = page.getByRole('row').filter({ hasText: sourceTitle });
    await source.getByRole('button', { name: /Actions|More/i }).click();
    await page.getByRole('menuitem', { name: 'Copy to library' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Variables and input')).toBeVisible();
    await expect(
      dialog.getByText(/Student work and class assignments are not copied/),
    ).toBeVisible();
    await expect(
      dialog.getByRole('textbox', { name: 'Title in the library' }),
    ).toHaveValue(sourceTitle);
    await dialog
      .getByRole('textbox', { name: 'Title in the library' })
      .fill(masterTitle);
    await dialog.getByRole('button', { name: 'Create library draft' }).click();
    await expect(page).toHaveURL(
      /\/admin\/content\/library\/[0-9a-f-]+\?copied=1$/,
      { timeout: 30_000 },
    );
    await expect(
      page.getByRole('heading', { name: masterTitle }),
    ).toBeVisible();
    await expect(
      page.getByText('Copied to library as a draft.', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        new RegExp(`Copied from .*${sourceTitle}.*independent copy`),
      ),
    ).toBeVisible();

    await page
      .getByRole('link', { name: 'Library', exact: true })
      .last()
      .click();
    const imported = page.getByRole('row').filter({ hasText: masterTitle });
    await expect(imported).toBeVisible();
    await expect(imported.getByText('Draft', { exact: true })).toBeVisible();
    await page.goto(
      `/admin/content/courses?q=${encodeURIComponent(sourceTitle)}`,
    );
    await expect(
      page.getByRole('row').filter({ hasText: sourceTitle }),
    ).toBeVisible();
  });

  test('the library never appears among the platform’s customers', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInAsOperator(page);

    // The academies table is the list that says who the customers are. A
    // library counted among them is head office's own curriculum turning up in
    // the middle of a support call.
    await page.goto(routes.adminAcademies);
    await expect(page.getByText('Content Library')).toHaveCount(0);

    // And the cross-academy browser answers "what is this academy running",
    // which a master course is not an answer to.
    await page.goto('/admin/content/courses');
    await expect(
      page.getByRole('table').getByText(PUBLISHED, { exact: true }),
    ).toHaveCount(0);
  });
});
