import { expect, test, type Page } from '@playwright/test';

import { signInAs } from '../support/auth';

const PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'CoveDev123!';
const minute = 60_000;

function warning(page: Page) {
  return page
    .locator('div.fixed.inset-x-0')
    .filter({ hasText: /you will be signed out in|자동 로그아웃까지/i });
}

test('student warning, continuation, cross-tab activity, video, and expiry', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  const startedAt = Date.now();
  let virtualNow = startedAt;

  const installLeaseReply = async (target: Page) => {
    await target.route('**/api/rpc/studentSession/extend', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          json: { deadline: new Date(virtualNow + 30 * minute).toISOString() },
        }),
      });
    });
  };

  await page.clock.install({ time: startedAt });
  await installLeaseReply(page);
  const academyId = await signInAs({
    page,
    identifier: 'student@cove.test',
    password: PASSWORD,
  });
  await page.goto(`/studio/academies/${academyId}/learn/courses`);
  await expect(page.getByTestId('inactivity-guard')).toHaveCount(1);

  // One minute past the boundary avoids coupling the browser assertion to the
  // few milliseconds the server needed to issue its initial deadline.
  virtualNow += 20 * minute;
  await page.clock.fastForward(20 * minute);
  await expect(warning(page)).toBeVisible();

  await page.getByRole('button', { name: /continue session|계속 사용하기/i }).click();
  await expect(warning(page)).toBeHidden();

  const second = await context.newPage();
  await second.clock.install({ time: startedAt });
  await installLeaseReply(second);
  await second.goto(`/studio/academies/${academyId}/learn/courses`);
  await second.clock.fastForward(16 * minute);

  virtualNow += 16 * minute;
  await page.clock.fastForward(16 * minute);
  await second.clock.fastForward(16 * minute);
  await expect(warning(page)).toBeVisible();

  // A deliberate action in one tab extends every tab's shared deadline.
  await second.mouse.click(100, 100);
  await expect(warning(page)).toBeHidden();

  virtualNow += 20 * minute;
  await page.clock.fastForward(20 * minute);
  await expect(warning(page)).toBeVisible();

  // Playing media counts; a paused element sends no continuing activity.
  await page.evaluate(() => {
    const video = document.createElement('video');
    video.dataset.paused = 'false';
    Object.defineProperty(video, 'paused', {
      configurable: true,
      get: () => video.dataset.paused === 'true',
    });
    Object.defineProperty(video, 'ended', {
      configurable: true,
      get: () => false,
    });
    document.body.append(video);
    video.dispatchEvent(new Event('timeupdate'));
    video.dataset.paused = 'true';
    video.dispatchEvent(new Event('pause'));
  });
  await expect(warning(page)).toBeHidden();

  await second.close();
  virtualNow += 31 * minute;
  await page.clock.fastForward(31 * minute);
  await expect(page).toHaveURL(/\/auth\/login/, { timeout: 30_000 });
  await context.close();
});
