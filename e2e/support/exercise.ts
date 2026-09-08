import { expect, type Locator, type Page } from '@playwright/test';

async function chooseFixtureClass(page: Page, destination: Locator) {
  const fixtureClass = page.getByRole('link', { name: /E2E Cohort/ });
  // Both course outlines and exercises can ask for class context. An error
  // page must fail rather than being mistaken for an optional chooser.
  await expect(destination.or(fixtureClass)).toBeVisible({ timeout: 30_000 });
  if (await fixtureClass.isVisible()) await fixtureClass.click();
  await expect(destination).toBeVisible({ timeout: 30_000 });
}

export async function enterFixtureExercise(page: Page) {
  await chooseFixtureClass(page, page.locator('.monaco-editor').first());
}

export async function enterFixtureCourse(page: Page) {
  await chooseFixtureClass(page, page.getByPlaceholder(/search problems|문제 검색/i));
}
