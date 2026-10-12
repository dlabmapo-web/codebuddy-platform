import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { signInAs } from "../support/auth";
import { routes } from "../../packages/web/src/lib/routes";
const slug = "development-academy",
  classId = "e0000000-0000-4000-8000-000000000040";
const id = (n: number) =>
  `ee060000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const names = [
  "Mixed coding start",
  "Mixed PDF",
  "Mixed turtle",
  "Mixed short answer",
  "Mixed choice",
  "Mixed video",
  "Mixed coding finish",
];
const types = [
  "PROGRAMMING_EXERCISE",
  "PDF_DOCUMENT",
  "TURTLE_EXERCISE",
  "WRITTEN_RESPONSE",
  "MULTIPLE_CHOICE",
  "VIDEO_LESSON",
  "PROGRAMMING_EXERCISE",
];
const path = (i: number) =>
  routes.academyLearnMaterial(slug, id(30 + i), types[i], { classId });
test.skip(
  process.env.E2E_MIXED_ENABLED !== "1",
  "Run with all five features and prepared synthetic assets",
);
test.use({ actionTimeout: 30000 });
test.beforeAll(() =>
  execFileSync(
    "pnpm",
    [
      "--filter",
      "@cove/api",
      "exec",
      "tsx",
      "scripts/seed-mixed-materials-e2e.mts",
    ],
    { stdio: "pipe" },
  ),
);
async function arrived(page: Page, i: number) {
  await expect(page).toHaveURL(
    new RegExp(`/learn/[^/]+/${id(30 + i)}\\?classId=${classId}`),
  );
  await expect(
    page.getByRole("heading").filter({ hasText: names[i] }).first(),
  ).toBeVisible();
  await expect(page.locator("main[role=alert]")).toHaveCount(0);
  if (i === 0 || i === 6)
    await expect(page.locator(".monaco-editor")).toBeVisible();
  if (i === 5)
    await page.locator("video").evaluate((v: HTMLVideoElement) => v.pause());
}
async function move(page: Page, direction: "Next" | "Previous") {
  await page
    .getByRole("button", { name: direction, exact: true })
    .or(page.getByRole("link", { name: new RegExp(`^${direction}`) }))
    .first()
    .click();
}
test("all five features: forward/back across lectures, coding drawer, resource isolation and browser history", async ({
  page,
}, info) => {
  test.setTimeout(360000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAs({
    page,
    identifier: "student@cove.test",
    password: "CoveDev123!",
    initialPath: path(0),
  });
  await arrived(page, 0);
  for (let i = 1; i < 7; i++) {
    await move(page, "Next");
    await arrived(page, i);
  }
  for (let i = 5; i >= 0; i--) {
    await move(page, "Previous");
    await arrived(page, i);
  }
  const outlineToggle = page
    .getByRole("button", { name: /course outline/i })
    .first();
  if ((await outlineToggle.getAttribute("aria-expanded")) !== "true")
    await outlineToggle.click();
  const drawer = page.locator('aside[data-collab-surface="curriculum"]');
  await drawer.getByRole("button", { name: /Mixed lecture 2/ }).click();
  for (const name of names)
    await expect(
      drawer.getByRole("button").filter({ hasText: name }),
    ).toBeVisible();
  await expect(drawer).not.toContainText("Teacher graded");
  await expect(
    drawer.getByRole("button").filter({ hasText: "Mixed PDF resource" }),
  ).toHaveCount(0);
  await expect(
    drawer.getByRole("button").filter({ hasText: "Mixed video resource" }),
  ).toHaveCount(0);
  await drawer.getByRole("button").filter({ hasText: "Mixed video" }).click();
  await arrived(page, 5);
  await page
    .getByRole("button", { name: "Mixed video resource", exact: true })
    .click();
  const resource = page.getByRole("dialog");
  await expect(resource.locator("video")).toBeVisible();
  await resource.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(
      () =>
        resource
          .locator("video")
          .evaluate((v: HTMLVideoElement) => v.videoWidth),
      { timeout: 60000 },
    )
    .toBeGreaterThan(0);
  await expect(resource.getByText(/Next lesson in/)).toHaveCount(0);
  await resource
    .getByRole("button", { name: "Close", exact: true })
    .last()
    .click();
  await expect(resource).toBeHidden();
  await page.goBack();
  await arrived(page, 0);
  await page.goForward();
  await arrived(page, 5);
  await page.getByRole("button", { name: "Materials", exact: true }).click();
  const refreshed = page.waitForResponse(
    (response) =>
      response.url().includes("/api/manual?") &&
      new URL(response.url()).searchParams.get("materialId") === id(33) &&
      response.status() === 200,
  );
  await page
    .getByRole("link", { name: "Mixed short answer", exact: true })
    .click();
  await arrived(page, 3);
  await refreshed;
  await page.reload();
  await arrived(page, 3);
  await page.screenshot({
    path: `/tmp/cove-mixed-${info.project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
