import { expect, test } from '@playwright/test';

import { routes } from '../../packages/web/src/lib/routes';
import { signInAs } from '../support/auth';

const password = process.env.E2E_STUDENT_PASSWORD ?? 'CoveDev123!';

for (const [identifier, suffix] of [
  ['manager@cove.test', '/classes'],
  ['teamlead@cove.test', '/classes'],
  ['teacher@cove.test', '/teach/classes'],
  ['student@cove.test', '/learn/courses'],
] as const) {
  test(`${identifier} enters class work without Overview`, async ({ page }) => {
    const overviewRequests: string[] = [];
    page.on('request', request => {
      if (/academy(?:Teacher|Operations|Curriculum)Overview|getOverview(?:\?|\/|$)/i.test(request.url())) {
        overviewRequests.push(request.url());
      }
    });
    const slug = await signInAs({
      page, identifier, password,
      landing: new RegExp(`${suffix}$`),
    });
    const academyRoot = routes.academy(slug);
    await expect(page).toHaveURL(new RegExp(`${academyRoot}${suffix}$`));
    await expect(page.getByRole('link', { name: /^(Overview|개요)$/ })).toHaveCount(0);

    await page.goto(academyRoot);
    await expect(page).toHaveURL(new RegExp(`${academyRoot}${suffix}$`));
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`${academyRoot}${suffix}$`));
    expect(overviewRequests).toEqual([]);
  });
}
