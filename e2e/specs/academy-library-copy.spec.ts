import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { routes } from "../../packages/web/src/lib/routes";

test("both academy-copy entry points show issues and a warning-only course becomes a draft", async ({ page }) => {
  const dir = process.env.COVE_LIBRARY_SYNC_BUILD_DIR;
  if (!dir) throw Error("Run the isolated library browser harness");
  const fixture = JSON.parse(await readFile(resolve(dir, "browser.json"), "utf8"));
  await page.context().addCookies(fixture.auth.admin.cookies);

  await page.goto(routes.adminLibrary, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Copy from academy", exact: true }).click();
  const picker = page.getByRole("dialog");
  await picker.getByRole("row").filter({ hasText: "Copy fixture with hidden quiz" })
    .getByRole("button", { name: "Select course" }).click();

  const blocked = page.getByRole("dialog");
  await expect(blocked.getByRole("alert")).toContainText("Practice module / Practice lesson");
  await expect(blocked.getByRole("alert")).toContainText("Hidden quiz · Multiple choice (hidden)");
  await expect(blocked.getByRole("alert")).toContainText("Select a valid correct option");
  await expect(blocked.getByRole("button", { name: "Create library draft" })).toBeDisabled();

  await page.goto("/admin/content/courses", { waitUntil: "domcontentloaded" });
  const row = page.getByRole("row").filter({ hasText: "Copy fixture draft" });
  await expect(row).toBeVisible();
  const actions = row.getByRole("button", { name: "More actions", exact: true });
  const copyToLibrary = page.getByRole("menuitem", { name: "Copy to library", exact: true });
  // The server renders the table before the client finishes hydrating its menu.
  await expect(async () => {
    if (!(await copyToLibrary.isVisible())) await actions.press("Enter", { timeout: 3_000 });
    await expect(copyToLibrary).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 150_000, intervals: [500, 1_000] });
  await copyToLibrary.press("Enter", { timeout: 15_000 });
  const ready = page.getByRole("dialog");
  await expect(ready.getByRole("status")).toContainText("Add tests before assigning");
  await ready.getByRole("textbox", { name: "Library course title" }).fill("Local copy acceptance");
  await ready.getByRole("button", { name: "Create library draft" }).click();
  await expect(page).toHaveURL(/\/admin\/content\/library\/[0-9a-f-]+\?copied=1/, { timeout: 120_000 });
  await expect(page.getByRole("heading", { name: "Local copy acceptance" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Copied to library as a draft" })).toBeVisible();
  await page.goto(routes.adminLibrary, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("row").filter({ hasText: "Local copy acceptance" })).toContainText("Draft");
});

test("a manager sees published courses in the import catalog before and after copying", async ({ page }) => {
  const dir = process.env.COVE_LIBRARY_SYNC_BUILD_DIR;
  if (!dir) throw Error("Run the isolated library browser harness");
  const fixture = JSON.parse(await readFile(resolve(dir, "browser.json"), "utf8"));
  await page.context().addCookies(fixture.auth.manager.cookies);
  await page.goto(routes.academyLearnCourses(fixture.slug), { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Import from Library", exact: true }).click();
  await expect(page).toHaveURL(routes.academyLibrary(fixture.slug));

  const legacy = page.getByRole("listitem").filter({
    has: page.getByRole("heading", { name: /Published legacy course/ }),
  });
  const alreadyCopied = page.getByRole("listitem").filter({
    has: page.getByRole("heading", { name: /Published course already copied/ }),
  });
  await expect(legacy).toBeVisible();
  await expect(alreadyCopied).toContainText("You already have a copy: Existing copy in this academy");
  await expect(page.getByRole("heading", { name: /Library draft only|Withdrawn library course/ })).toHaveCount(0);

  await legacy.getByRole("button", { name: "Preview", exact: true }).press("Enter");
  const preview = page.getByRole("dialog");
  await expect(preview.getByText("Legacy module", { exact: true })).toBeVisible();
  await expect(preview.getByRole("button", { name: "Copy to my academy", exact: true })).toBeEnabled();
  await preview.getByRole("button", { name: "Copy to my academy", exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/academy\/cove\/learn\/courses\/[a-f0-9-]+/, { timeout: 120_000 });

  await page.goto(routes.academyLibrary(fixture.slug), { waitUntil: "domcontentloaded" });
  await expect(legacy).toContainText("You already have a copy: Published legacy course");
  await expect(alreadyCopied).toBeVisible();
});
