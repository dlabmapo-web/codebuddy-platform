import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { routes } from '../../packages/web/src/lib/routes';

const provider = 'http://127.0.0.1:4320';
type Fixture = { id: string; academy: { id: string; slug: string } };

async function fixture(request: APIRequestContext, role: string, parentFixtureId?: string): Promise<Fixture> {
  const response = await request.post(`${provider}/fixtures`, { data: { role, parentFixtureId } });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function enter(page: Page, account: Fixture) {
  await page.context().addCookies([{ name: 'i18next', value: 'en', url: 'http://127.0.0.1:3309' }]);
  const response = await page.request.get('/sso/start', { maxRedirects: 0 });
  const target = new URL(response.headers().location!);
  target.searchParams.set('fixture', account.id);
  await page.goto(`${provider}/os/authorize?${target.searchParams}`);
  await expect(page).toHaveURL(/\/academy\//);
}

test('private problem images follow Student Next, Previous, outline, and browser history without restarting the editor', async ({ page, request }, testInfo) => {
  const author = await fixture(request, 'lab_head');
  const student = await fixture(request, 'student', author.id);
  await enter(page, author);
  await enter(page, student);
  const response = await request.post(`${provider}/fixtures/${author.id}/classroom`, {
    data: { studentFixtureId: student.id, emptyWork: true, includeImageNavigation: true },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const room = await response.json();
  const materialUrl = (index: number) => routes.academyLearnExercise(author.academy.slug, room.imageMaterialIds[index - 1], {
    classId: room.classes[0].id, mode: 'student',
  });
  // A reload would hide the original bug. Keep the same page/editor mounted.
  await page.goto(materialUrl(1));
  await expect(page.locator('.monaco-editor').first()).toBeVisible();
  await page.evaluate(() => {
    (window as Window & { imageNavigationSentinel?: boolean }).imageNavigationSentinel = true;
    document.querySelector('.monaco-editor')!.setAttribute('data-image-navigation-editor', 'retained');
  });
  async function visiblePicture(index: number) {
    await expect(page).toHaveURL(materialUrl(index));
    await expect(page.getByRole('heading', { name: `Image problem ${index}`, exact: true })).toBeVisible();
    // The translated frame title differs by locale; the description is the
    // only rich-text frame in this fixture, so locate it independently of copy.
    const image = page.frameLocator('iframe').getByRole('img', { name: `Picture for problem ${index}` });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
    await expect(page.locator('.monaco-editor[data-image-navigation-editor="retained"]')).toHaveCount(1);
    expect(await page.evaluate(() => (window as Window & { imageNavigationSentinel?: boolean }).imageNavigationSentinel)).toBe(true);
  }
  await visiblePicture(1);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await visiblePicture(2);
  await page.screenshot({ path: testInfo.outputPath('next-image-visible.png') });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await visiblePicture(3);
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await visiblePicture(2);
  await page.goBack();
  await visiblePicture(3);
  await page.goForward();
  await visiblePicture(2);
  const outlineRow = page.getByRole('complementary').getByRole('button', { name: /Image problem 1/ });
  if (!await outlineRow.isVisible()) await page.getByRole('button', { name: /course outline/i }).click();
  await outlineRow.click();
  await visiblePicture(1);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await visiblePicture(2);
  await page.screenshot({ path: testInfo.outputPath('repeated-navigation-image-visible.png') });
});
