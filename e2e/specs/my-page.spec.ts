import { expect, test, type Page } from '@playwright/test';

import { routes } from '../../packages/web/src/lib/routes';
import { signInAs } from '../support/auth';

test.describe.configure({ mode: 'serial' });

const PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'CoveDev123!';
const STUDENT = process.env.E2E_STUDENT_USERNAME ?? 'cove-student';
const MANAGER = process.env.E2E_MANAGER_EMAIL ?? 'manager@cove.test';
const SECOND_ACADEMY_ID = 'e1000000-0000-4000-8000-000000000001';

async function openMyPage(page: Page, identifier = STUDENT) {
  const academySlug = await signInAs({ page, identifier, password: PASSWORD });
  await page.goto(`/account?academy=${academySlug}`);
  await expect(page.getByRole('heading', { name: /Cove Student|Cove Academy Manager/ }))
    .toBeVisible();
  return academySlug;
}

test('a student can save their academy profile and keep global security separate', async ({
  page,
}) => {
  await openMyPage(page);
  const academySection = page.getByRole('heading', { name: 'Academy profile' })
    .locator('xpath=ancestor::section');
  const academyName = academySection.getByLabel('Name in this academy');
  const original = await academyName.inputValue();
  const marker = `Cove Student ${Date.now()}`;

  await academyName.fill(marker);
  await academySection.getByRole('button', { name: 'Save changes' }).click();
  await expect(academySection.getByText('Saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Name in this academy')).toHaveValue(marker);

  // Restore the idempotent fixture for the next project/browser run.
  await page.getByLabel('Name in this academy').fill(original);
  await page.getByRole('heading', { name: 'Academy profile' })
    .locator('xpath=ancestor::section')
    .getByRole('button', { name: 'Save changes' }).click();

  await page.getByRole('button', { name: 'Change password' }).last().click();
  await expect(page.getByLabel('Current password')).toBeVisible();
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Confirm new password')).toBeVisible();
});

test('academy switching asks before discarding an unsaved draft', async ({ page }) => {
  const academySlug = await openMyPage(page);
  await page.getByLabel('Name in this academy').fill(`Unsaved ${Date.now()}`);

  await page.getByRole('button', { name: /E2E Profile Academy/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Unsaved changes' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page).toHaveURL(new RegExp(`academy=${academySlug}`));

  await page.getByRole('button', { name: /E2E Profile Academy/ }).click();
  await dialog.getByRole('button', { name: 'Discard and switch' }).click();
  await expect(page).toHaveURL(new RegExp(`academy=${SECOND_ACADEMY_ID}`));
  await expect(page.getByText('E2E Profile Academy', { exact: true }).first()).toBeVisible();
});

test('photo cropping stays bounded and is keyboard operable', async ({ page }) => {
  await openMyPage(page);
  const identity = page.locator('main section').first();
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#0f766e';
    context.fillRect(0, 0, 160, 180);
    context.fillStyle = '#f59e0b';
    context.fillRect(160, 0, 160, 180);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await identity.locator('input[type="file"]').setInputFiles({
    name: 'profile-crop.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });

  const preview = identity.getByRole('img', { name: 'Profile photo crop preview' });
  await expect(preview).toBeVisible();
  const box = await preview.boundingBox();
  expect(box?.width).toBeLessThanOrEqual(224);
  expect(box?.height).toBeLessThanOrEqual(224);

  const zoom = identity.getByRole('slider', { name: 'Zoom' });
  await zoom.focus();
  await page.keyboard.press('ArrowRight');
  await expect(zoom).not.toHaveValue('1');
  await identity.getByRole('button', { name: 'Save changes' }).click();
  await expect(identity.getByRole('button', { name: 'Remove photo' }))
    .toBeVisible({ timeout: 30_000 });
  await expect(identity.getByRole('img', { name: /Profile photo of/ })).toBeVisible();

  // Restore the fallback state so repeated and cross-browser runs are stable.
  await identity.getByRole('button', { name: 'Remove photo' }).click();
  await expect(identity.getByRole('button', { name: 'Choose a photo' }))
    .toBeVisible({ timeout: 30_000 });
});

test('password confirmation is validated before any credential request', async ({ page }) => {
  await openMyPage(page);
  await page.getByRole('button', { name: 'Change password' }).click();
  await page.getByLabel('Current password').fill(PASSWORD);
  await page.getByLabel('New password', { exact: true }).fill('DifferentPassword123!');
  await page.getByLabel('Confirm new password').fill('DoesNotMatch123!');
  await page.getByRole('button', { name: 'Change password' }).last().click();
  await expect(page.getByText('The two passwords do not match.')).toBeVisible();
});

test('a manager sees academy fields but not the member credential controls', async ({ page }) => {
  const academySlug = await openMyPage(page, MANAGER);
  await page.goto(routes.academyPeople(academySlug));
  const studentRow = page.getByRole('row').filter({ hasText: 'student@cove.test' });
  await studentRow.getByRole('link', { name: /Profile/ }).click();
  await expect(page.getByRole('heading', { name: 'Cove Student' })).toBeVisible();
  await expect(page.getByText(/Sign-in email, password, connected accounts/)).toBeVisible();
  await expect(page.getByLabel('Current password')).toHaveCount(0);
  await expect(page.getByLabel('Student number')).toBeVisible();
});

test('the page remains usable in Korean and dark theme', async ({ page }) => {
  await openMyPage(page);
  await page.getByRole('button', { name: 'Language' }).click();
  await page.getByRole('menuitemradio', { name: '한국어' }).click();
  await expect(page.getByRole('heading', { name: '학원 프로필' })).toBeVisible();

  await page.getByRole('button', { name: '테마' }).click();
  await page.getByRole('menuitemradio', { name: '다크' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
});
