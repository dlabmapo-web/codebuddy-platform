import { routes } from "../../packages/web/src/lib/routes";
import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
const provider = "http://127.0.0.1:4320";
type Fixture = { id: string; academy: { id: string; slug: string } };
async function fixture(
  request: APIRequestContext,
  role: string,
  parentFixtureId?: string,
  name?: string,
): Promise<Fixture> {
  const r = await request.post(provider + "/fixtures", {
    data: { role, parentFixtureId, name },
  });
  expect(r.ok(), await r.text()).toBe(true);
  return r.json();
}
async function enter(page: Page, f: Fixture) {
  const r = await page.request.get("/sso/start", {
    maxRedirects: 0,
    timeout: 180000,
  });
  const target = new URL(r.headers().location!);
  target.searchParams.set("fixture", f.id);
  await page.goto(provider + "/os/authorize?" + target.searchParams);
  await expect(page).toHaveURL(new RegExp("/academy/" + f.academy.slug + "$"));
}
async function token(page: Page) {
  const cookies = (await page.context().cookies())
    .filter((c) => /auth-token(?:\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  return JSON.parse(
    Buffer.from(
      cookies
        .map((c) => c.value)
        .join("")
        .replace(/^base64-/, ""),
      "base64url",
    ).toString(),
  ).access_token as string;
}
async function rpc(page: Page, method: string, input: object) {
  return page.request.post("http://127.0.0.1:4319/api/rpc/" + method, {
    headers: { Authorization: "Bearer " + (await token(page)) },
    data: { json: input },
  });
}
async function editor(page: Page, value?: string) {
  return page.evaluate((next) => {
    const monaco = (
      window as unknown as {
        monaco?: {
          editor: {
            getEditors(): Array<{
              getDomNode(): HTMLElement | null;
              getModel(): {
                getValue(): string;
                setValue(v: string): void;
              } | null;
            }>;
          };
        };
      }
    ).monaco;
    const model = monaco?.editor
      .getEditors()
      .find(
        (e) =>
          e.getDomNode()?.getClientRects().length &&
          getComputedStyle(e.getDomNode()!).visibility !== "hidden",
      )
      ?.getModel();
    if (next !== undefined) model?.setValue(next);
    return model?.getValue() ?? null;
  }, value);
}
async function moveInEditor(page: Page) {
  const box = await page
    .locator(".monaco-editor:visible")
    .first()
    .boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 150, box!.y + 30, { steps: 3 });
}
for (const role of ["lab_head", "instructor", "tutor"] as const) {
  test(`${role} reviews saved history and privately runs an older submission`, async ({
    page,
    browser,
    request,
  }, info) => {
    test.setTimeout(600000);
    page.on("pageerror", (e) =>
      console.error("History browser error:", e.message),
    );
    const owner =
      role === "lab_head"
        ? page
        : await browser.newPage({ baseURL: "http://127.0.0.1:3309" });
    const manager = await fixture(request, "lab_head");
    await enter(owner, manager);
    const staff =
      role === "lab_head" ? manager : await fixture(request, role, manager.id);
    if (role !== "lab_head") await enter(page, staff);
    const student = await fixture(request, "student", manager.id);
    const learner = await browser.newPage({ baseURL: "http://127.0.0.1:3309" });
    await enter(learner, student);
    const offline = await fixture(
      request,
      "student",
      manager.id,
      "Offline student 10",
    );
    const offlinePage = await browser.newPage({
      baseURL: "http://127.0.0.1:3309",
    });
    await enter(offlinePage, offline);
    await offlinePage.close();
    try {
      const seeded = await request.post(
        provider + "/fixtures/" + manager.id + "/classroom",
        {
          data: {
            studentFixtureId: student.id,
            includePdf: true,
            includeTurtle: true,
            seedHistory: true,
            reviewStudentFixtureId: offline.id,
          },
        },
      );
      expect(seeded.ok(), await seeded.text()).toBe(true);
      const c = await seeded.json();
      const classId = c.classes[0].id;
      if (role === "tutor") {
        const member = await (
          await request.get(provider + "/fixtures/" + staff.id)
        ).json();
        const assigned = await rpc(owner, "academyClasses/setTeacher", {
          academyId: manager.academy.id,
          classId,
          teacherMembershipId: member.memberships[0].id,
          expectedUpdatedAt: c.classes[0].updatedAt,
        });
        expect(assigned.ok(), await assigned.text()).toBe(true);
      }
      const root = "/academy/" + manager.academy.slug;
      if (role === "instructor") {
        await page.goto(`${root}/teach/history`);
        await page
          .getByRole("link")
          .filter({ hasText: "Assigned Python class" })
          .click();
        await expect(
          page.getByRole("heading", { name: "Select a student", exact: true }),
        ).toBeVisible({ timeout: 90000 });
        await page
          .getByRole("complementary", { name: "Students", exact: true })
          .getByRole("button")
          .filter({ hasText: "Browser student" })
          .click();
        await expect(
          page.getByRole("heading", { name: "Browser student", exact: true }),
        ).toBeVisible();
      }
      await page.goto(
        `${root}/teach/classes/${classId}/progress?view=students&student=${c.studentMembershipId}`,
      );
      console.log("History dashboard loaded for", role);
      const workspace = page.getByTestId("student-history-workspace");
      await expect(
        workspace.getByText("Assessed work completion", { exact: true }),
      ).toBeVisible();
      await expect(
        workspace.getByText("36 other responses", { exact: false }),
      ).toBeVisible();
      if (role === "lab_head") {
        await workspace
          .getByRole("textbox", { name: "Search materials", exact: true })
          .fill("Add two numbers");
        await expect(workspace.getByRole("row")).toHaveCount(2);
        await expect(
          workspace.getByText("36 other responses", { exact: false }),
        ).toBeVisible();
        await workspace
          .getByRole("button", { name: "Clear filters", exact: true })
          .click();
        await expect(workspace.getByRole("row")).toHaveCount(8);
        await workspace
          .getByRole("textbox", {
            name: "Name, username or email",
            exact: true,
          })
          .fill("no matching student");
        await expect(
          workspace.getByText("No matching students", { exact: true }),
        ).toBeVisible();
        await expect(
          workspace.getByRole("heading", {
            name: "Browser student",
            exact: true,
          }),
        ).toBeVisible();
        await workspace
          .getByRole("textbox", {
            name: "Name, username or email",
            exact: true,
          })
          .fill("");
        await page.setViewportSize({ width: 390, height: 844 });
        await workspace
          .getByRole("button", { name: "Students", exact: true })
          .click();
        await expect(
          workspace.getByRole("complementary", {
            name: "Students",
            exact: true,
          }),
        ).toBeVisible();
        await workspace
          .getByRole("complementary", { name: "Students", exact: true })
          .getByRole("button")
          .filter({ hasText: "Browser student" })
          .click();
        await expect(
          workspace.getByRole("heading", {
            name: "Browser student",
            exact: true,
          }),
        ).toBeVisible();
        await page.screenshot({
          path: info.outputPath("student-history-narrow.png"),
        });
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
      const codeRow = workspace
        .getByRole("row")
        .filter({ hasText: "Add two numbers" });
      await codeRow
        .getByRole("button", { name: "Add two numbers", exact: true })
        .click();
      await expect(page).toHaveURL(/\/work\//, { timeout: 90000 });
      await expect(page.getByTestId("historical-submission")).toBeVisible();
      await expect.poll(() => editor(page)).toBe('print("HISTORICAL LATEST")');
      await expect(page.getByTestId("problem-statement")).toBeVisible();
      await expect(
        page
          .getByTestId("historical-submission")
          .getByText("Easy", { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByTestId("historical-submission")
          .getByText("Browser student", { exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("student-history-workspace")).toHaveCount(
        0,
      );
      const reviewBounds = await page
        .getByTestId("student-work-page")
        .boundingBox();
      expect(reviewBounds?.x).toBe(0);
      expect(reviewBounds?.width).toBe(page.viewportSize()!.width);
      expect(reviewBounds?.height).toBe(page.viewportSize()!.height);
      const statementBounds = await page
        .getByTestId("problem-statement")
        .boundingBox();
      const editorBounds = await page
        .locator(".monaco-editor:visible")
        .first()
        .boundingBox();
      expect(statementBounds!.x + statementBounds!.width).toBeLessThanOrEqual(
        editorBounds!.x,
      );
      await page.screenshot({
        path: info.outputPath("full-screen-latest-submission.png"),
      });
      await page
        .getByRole("button", { name: "View attempts", exact: true })
        .click();
      await page.getByRole("menuitemradio").last().click();
      await expect.poll(() => editor(page)).toBe('print("HISTORICAL FIRST")');
      await expect
        .poll(async () => {
          await editor(page, 'print("PRIVATE REVIEW OUTPUT")');
          return editor(page);
        })
        .toBe('print("PRIVATE REVIEW OUTPUT")');
      await page.getByRole("button", { name: "Run", exact: true }).click();
      await expect(
        page
          .getByTestId("historical-submission")
          .getByTestId("terminal")
          .getByText("PRIVATE REVIEW OUTPUT", { exact: true }),
      ).toBeVisible({ timeout: 90000 });
      page.once("dialog", (d) => d.dismiss());
      await page
        .getByRole("button", { name: "Back to student history", exact: true })
        .click();
      await expect(page.getByTestId("historical-submission")).toBeVisible();
      await expect
        .poll(() => editor(page))
        .toBe('print("PRIVATE REVIEW OUTPUT")');
      const backDialog = page.waitForEvent("dialog");
      await page.evaluate(() => window.history.back());
      await (await backDialog).dismiss();
      await expect(page).toHaveURL(/\/work\//, { timeout: 90000 });
      await expect
        .poll(() => editor(page))
        .toBe('print("PRIVATE REVIEW OUTPUT")');
      page.once("dialog", (d) => d.accept());
      await page
        .getByRole("button", { name: "Reset to submission", exact: true })
        .click();
      await expect.poll(() => editor(page)).toBe('print("HISTORICAL FIRST")');
      console.log("Private Python run/reset passed for", role);
      await page
        .getByRole("button", { name: "Back to student history", exact: true })
        .click();
      await expect(workspace).toBeVisible();
      await expect(page).toHaveURL(/\/progress\?/);
      if (role === "instructor") {
        const attempts = await rpc(page, "studentWorkHistory/listAttempts", {
          academyId: manager.academy.id,
          classId,
          membershipId: c.studentMembershipId,
          materialId: c.materialId,
          page: 1,
        });
        const old = (await attempts.json()).json.attempts[1];
        await page.goto(
          `${root}/teach/classes/${classId}/progress?view=students&student=${c.studentMembershipId}&reviewMaterial=${c.materialId}&attempt=${old.id}`,
          { waitUntil: "commit" },
        );
        await expect(page).toHaveURL(/\/work\//, { timeout: 90000 });
        await expect.poll(() => editor(page)).toBe('print("HISTORICAL FIRST")');
        await page
          .getByRole("button", { name: "Back to student history", exact: true })
          .click();
        await expect(workspace).toBeVisible();
      }
      await workspace
        .getByRole("row")
        .filter({ hasText: "Name the language" })
        .getByRole("button", { name: "Open work", exact: true })
        .click();
      await page
        .getByRole("navigation", { name: "History pages" })
        .getByRole("button", { name: "Next page" })
        .click();
      await page
        .getByRole("button", { name: "View attempts", exact: true })
        .click();
      await page.getByRole("menuitemradio").last().click();
      await expect(
        page.getByText("SAVED ANSWER 0", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Back to student history", exact: true })
        .click();
      await workspace
        .getByRole("row")
        .filter({ hasText: "Draw a red square" })
        .getByRole("button", { name: "Open work", exact: true })
        .click();
      await expect.poll(() => editor(page)).toContain("SAVED TURTLE");
      await editor(
        page,
        "import turtle\nprint('PRIVATE TURTLE OUTPUT', flush=True)\nturtle.circle(30)\nturtle.done()",
      );
      await page.getByRole("button", { name: "Run", exact: true }).click();
      await expect(
        page
          .getByTestId("historical-submission")
          .locator("pre")
          .filter({ hasText: "PRIVATE TURTLE OUTPUT" }),
      ).toBeVisible({ timeout: 90000 });
      await expect(
        page
          .getByTestId("historical-submission")
          .getByTestId("turtle-display")
          .locator("canvas"),
      ).toBeVisible({ timeout: 30000 });
      await page.getByRole("button", { name: "Stop", exact: true }).click();
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByRole("button", { name: "Reset to submission", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Back to student history", exact: true })
        .click();
      console.log("Private Turtle run/reset passed for", role);
      const result = await rpc(page, "studentWorkHistory/listAttempts", {
        academyId: manager.academy.id,
        classId,
        membershipId: c.studentMembershipId,
        materialId: c.materialId,
        page: 1,
      });
      expect(result.ok()).toBe(true);
      expect((await result.json()).json.pagination.totalCount).toBe(2);
      await expect(page.getByTestId("historical-submission")).not.toBeVisible();
      const scope = {
        academyId: manager.academy.id,
        classId,
        membershipId: c.studentMembershipId,
      };
      expect(
        (
          await rpc(learner, "studentWorkHistory/listAttempts", {
            ...scope,
            materialId: c.materialId,
            page: 1,
          })
        ).status(),
      ).toBe(403);
      const mismatched = await rpc(page, "studentWorkHistory/getSubmission", {
        ...scope,
        materialId: c.shortMaterialId,
        submissionId: (
          await (
            await rpc(page, "studentWorkHistory/listAttempts", {
              ...scope,
              materialId: c.materialId,
              page: 1,
            })
          ).json()
        ).json.attempts[0].id,
        kind: "programming",
      });
      expect(mismatched.ok()).toBe(false);
      expect(await mismatched.text()).not.toContain("HISTORICAL");
      if (role === "tutor")
        expect(
          (
            await rpc(page, "studentWorkHistory/listStudentMaterials", {
              ...scope,
              classId: c.classes[1].id,
              page: 1,
            })
          ).status(),
        ).toBe(403);
      await page.screenshot({
        path: info.outputPath("student-history-dashboard.png"),
        fullPage: false,
      });
      // No active material must still yield a usable course outline, not endless loading.
      const liveUrl = `${root}/teach/classes/${classId}/students/${c.studentMembershipId}/live`;
      await page.goto(liveUrl);
      await expect(
        page.getByText(
          "No material is selected. Choose one from the course outline to inspect this student’s work.",
          { exact: true },
        ),
      ).toBeVisible();
      const courseOutline = page.getByRole("complementary", {
        name: "Course",
        exact: true,
      });
      await courseOutline
        .getByRole("button")
        .filter({ hasText: "Python basics" })
        .click();
      await courseOutline
        .getByRole("button")
        .filter({ hasText: "Addition lesson" })
        .click();
      await expect(
        courseOutline
          .getByRole("button")
          .filter({ hasText: "Add two numbers" }),
      ).toBeVisible();
      await expect(
        page.getByText("Loading material…", { exact: true }),
      ).toHaveCount(0);
      await courseOutline
        .getByRole("button")
        .filter({ hasText: "Add two numbers" })
        .click();
      await expect.poll(() => editor(page)).toBe("print(2 + 3)");
      await learner.goto(
        routes.academyLearnExercise(manager.academy.slug, c.materialId, {
          classId,
        }),
      );
      await expect.poll(() => editor(learner)).toBe("print(2 + 3)");
      await expect(page.getByTestId("observation-connection")).toHaveText(
        "Live",
        { timeout: 60000 },
      );
      // The material watch badge can arrive before the coding document joins.
      // Require a real document round trip before testing pointer publication.
      await editor(learner, "print('INITIAL LIVE ROUND TRIP')");
      await expect
        .poll(() => editor(page), { timeout: 60000 })
        .toBe("print('INITIAL LIVE ROUND TRIP')");
      await editor(learner, "print(2 + 3)");
      await expect.poll(() => editor(page)).toBe("print(2 + 3)");
      await moveInEditor(page);
      await expect(learner.getByTestId("peer-pointer").first()).toBeVisible();
      // Tutoring is a material-specific roster and an inline editor, without a dialog.
      await page.getByRole("button", { name: "Tutoring", exact: true }).click();
      const tutoring = page.getByRole("complementary", {
        name: "Tutoring",
        exact: true,
      });
      await expect(tutoring).toBeVisible();
      await expect(
        tutoring.getByRole("button").filter({ hasText: "Offline student 10" }),
      ).toContainText("Submitted");
      await page.screenshot({
        path: info.outputPath("inline-tutoring-roster.png"),
      });
      await tutoring
        .getByRole("button")
        .filter({ hasText: "Offline student 10" })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect
        .poll(() => editor(page))
        .toBe('print("OFFLINE STUDENT SUBMISSION")');
      await expect(
        page
          .getByTestId("historical-submission")
          .getByTestId("problem-statement"),
      ).toBeVisible();
      await expect(
        page
          .getByTestId("historical-submission")
          .getByText("Offline student 10", { exact: true }),
      ).toBeVisible();
      await expect(page).toHaveURL(liveUrl + "?materialId=" + c.materialId);
      await page.screenshot({
        path: info.outputPath("inline-student-submission.png"),
      });
      await expect(learner.getByTestId("peer-pointer")).toHaveCount(0);
      await editor(page, 'print("PRIVATE OFFLINE REVIEW")');
      await page
        .getByTestId("tutor-student-work")
        .getByRole("button", { name: "Run", exact: true })
        .click();
      await expect(
        page.getByTestId("tutor-student-work").getByTestId("terminal"),
      ).toContainText("PRIVATE OFFLINE REVIEW", { timeout: 90000 });
      await expect.poll(() => editor(learner)).toBe("print(2 + 3)");
      if (role === "instructor") {
        page.once("dialog", (dialog) => dialog.dismiss());
        await page
          .getByRole("link", { name: "Edit problem", exact: true })
          .click();
        await expect
          .poll(() => editor(page))
          .toBe('print("PRIVATE OFFLINE REVIEW")');
        await expect(page).toHaveURL(liveUrl + "?materialId=" + c.materialId);
        // A live navigation control must not discard the private testing copy.
        await learner.goto(
          routes.academyLearnPdf(manager.academy.slug, c.pdfMaterialId, {
            classId,
          }),
        );
        await expect(
          page.getByTestId("student-current-material"),
        ).toContainText("Lesson reference PDF");
        page.once("dialog", (dialog) => dialog.dismiss());
        await page
          .getByRole("button", { name: "Return to live", exact: true })
          .click();
        await expect
          .poll(() => editor(page))
          .toBe('print("PRIVATE OFFLINE REVIEW")');
        await expect(page).toHaveURL(liveUrl + "?materialId=" + c.materialId);
        await learner.goto(
          routes.academyLearnExercise(manager.academy.slug, c.materialId, {
            classId,
          }),
        );
        await expect(
          page.getByTestId("student-current-material"),
        ).toContainText("Add two numbers");
      }
      page.once("dialog", (d) => d.accept());
      await page
        .getByTestId("tutor-student-work")
        .getByRole("button", { name: "Return to monitoring", exact: true })
        .click();
      await expect(page.getByTestId("inline-tutoring")).toHaveCount(0);
      await editor(learner, "print('LIVE AFTER TUTORING')");
      await expect
        .poll(() => editor(page))
        .toBe("print('LIVE AFTER TUTORING')");
      await moveInEditor(page);
      await expect(learner.getByTestId("peer-pointer").first()).toBeVisible();
      await moveInEditor(learner);
      await expect(page.getByTestId("peer-pointer").first()).toBeVisible();
      // The top selector also opens offline work for the same exercise.
      await page
        .getByRole("button", {
          name: "Switch student, current student Browser student",
          exact: true,
        })
        .click();
      await page
        .getByRole("button")
        .filter({ hasText: "Offline student 10" })
        .click();
      await expect
        .poll(() => editor(page))
        .toBe('print("OFFLINE STUDENT SUBMISSION")');
      await page
        .getByRole("button", { name: "Return to monitoring", exact: true })
        .click();
      await page.getByRole("button", { name: "Tutoring", exact: true }).click();
      await expect(
        page.getByRole("complementary", { name: "Tutoring", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("complementary", { name: "Tutoring", exact: true }),
      ).toHaveCount(0);
      if (role === "lab_head" && process.env.COVE_HISTORY_LAYOUT_ONLY !== "1") {
        for (const [title, id] of [
          ["Lesson reference PDF", c.pdfMaterialId],
          ["Name the language", c.shortMaterialId],
          ["Choose the operator", c.quizMaterialId],
          ["Lesson video", c.videoMaterialId],
          ["Draw a red square", c.turtleMaterialId],
          ["Add two numbers", c.materialId],
        ]) {
          await page
            .getByRole("button", { name: "Tutoring", exact: true })
            .click();
          const outline = learner.getByRole("complementary", {
            name: "Course",
            exact: true,
          });
          if (!(await outline.isVisible()))
            await learner
              .getByRole("button", {
                name: "Show or hide the course outline",
                exact: true,
              })
              .click();
          await outline.getByRole("button").filter({ hasText: title }).click();
          await expect(learner).toHaveURL(new RegExp(id));
          await expect(
            learner.getByRole("heading", { name: title, exact: true }),
          ).toBeVisible();
          await page
            .getByRole("complementary", { name: "Tutoring", exact: true })
            .getByRole("button", { name: "Close tutoring list", exact: true })
            .click();
          await expect(
            page.getByTestId("student-current-material"),
          ).toContainText(title);
          const follow = page.getByRole("button", {
            name: "Return to live",
            exact: true,
          });
          if (await follow.isVisible()) await follow.click();
          await expect(
            page.getByRole("heading", { name: title, exact: true }),
          ).toBeVisible();
        }
        await page
          .getByRole("button", { name: "Tutoring", exact: true })
          .click();
        await page
          .getByRole("complementary", { name: "Tutoring", exact: true })
          .getByRole("button")
          .filter({ hasText: "Offline student 10" })
          .click();
        await expect
          .poll(() => editor(page))
          .toBe('print("OFFLINE STUDENT SUBMISSION")');
        console.log(
          "Checking inline tutoring idle continuity",
          info.project.name,
        );
        await page.waitForTimeout(125000);
        await page
          .getByRole("button", { name: "Return to monitoring", exact: true })
          .click();
        await editor(learner, "print('AFTER IDLE TUTORING')");
        await expect
          .poll(() => editor(page))
          .toBe("print('AFTER IDLE TUTORING')");
        await moveInEditor(page);
        await expect(learner.getByTestId("peer-pointer").first()).toBeVisible();
      }
      // Each student has a separate full-page History action.
      await page
        .getByRole("button", {
          name: "Switch student, current student Browser student",
          exact: true,
        })
        .click();
      await page
        .getByRole("link", {
          name: "Student history · Offline student 10",
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(
        new RegExp(`/progress.*student=${c.reviewStudentMembershipId}`),
      );
      await expect(
        page
          .getByTestId("student-history-workspace")
          .getByRole("heading", { name: "Offline student 10", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByTestId("student-history-workspace").locator("select"),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Course", exact: true }).click();
      await page
        .getByRole("menuitemradio", {
          name: "All assigned courses",
          exact: true,
        })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.screenshot({
        path: info.outputPath("selected-student-dashboard.png"),
      });
    } finally {
      await learner.close();
      if (owner !== page) await owner.close();
    }
  });
}

for (const role of ["lab_head", "instructor", "tutor"] as const) {
  test(`${role} opens problem editor directly from monitoring`, async ({
    page,
    browser,
    request,
  }, info) => {
    test.setTimeout(180000);
    const manager = await fixture(request, "lab_head");
    const owner =
      role === "lab_head"
        ? page
        : await browser.newPage({ baseURL: "http://127.0.0.1:3309" });
    await enter(owner, manager);
    const staff =
      role === "lab_head" ? manager : await fixture(request, role, manager.id);
    if (role !== "lab_head") await enter(page, staff);
    const student = await fixture(request, "student", manager.id);
    const learner = await browser.newPage({ baseURL: "http://127.0.0.1:3309" });
    try {
      await enter(learner, student);
      const seeded = await request.post(
        provider + "/fixtures/" + manager.id + "/classroom",
        {
          data: { studentFixtureId: student.id },
        },
      );
      expect(seeded.ok(), await seeded.text()).toBe(true);
      const c = await seeded.json(),
        classId = c.classes[0].id;
      if (role === "tutor") {
        const member = await (
          await request.get(provider + "/fixtures/" + staff.id)
        ).json();
        const assigned = await rpc(owner, "academyClasses/setTeacher", {
          academyId: manager.academy.id,
          classId,
          teacherMembershipId: member.memberships[0].id,
          expectedUpdatedAt: c.classes[0].updatedAt,
        });
        expect(assigned.ok(), await assigned.text()).toBe(true);
      }
      const root = routes.academy(manager.academy.slug);
      await page.goto(
        `${root}/teach/classes/${classId}/students/${c.studentMembershipId}/live?materialId=${c.materialId}`,
      );
      await expect(
        page.getByRole("heading", { name: "Add two numbers", exact: true }),
      ).toBeVisible();
      const shortcut = page.getByRole("link", {
        name: "Edit problem",
        exact: true,
      });
      const destination = `${root}/content/courses/${c.courseId}/lectures/${c.lectureId}/exercises/${c.materialId}`;
      if (role === "tutor") {
        await expect(shortcut).toHaveCount(0);
        // Teachers keep the existing read-only authoring view.
        await page.goto(destination);
        await expect(
          page.getByLabel("Problem title", { exact: false }),
        ).toBeDisabled();
      } else {
        await expect(shortcut).toHaveAttribute("href", destination);
        await shortcut.click();
        await expect(page).toHaveURL(destination, { timeout: 90000 });
        await expect(
          page.getByLabel("Problem title", { exact: false }),
        ).toBeEnabled();
        await expect(
          page.getByLabel("Problem title", { exact: false }),
        ).toHaveValue("Add two numbers");
        await expect(page.getByTestId("grading-cases")).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Add test case", exact: true }),
        ).toBeEnabled();
      }
      await page.screenshot({
        path: info.outputPath("monitoring-problem-editor.png"),
      });
    } finally {
      await learner.close();
      if (owner !== page) await owner.close();
    }
  });
}

test("unsubmitted draft workspaces match normal coding and Turtle layouts", async ({
  page,
  browser,
  request,
}, info) => {
  test.setTimeout(420000);
  const manager = await fixture(request, "lab_head");
  await enter(page, manager);
  const student = await fixture(request, "student", manager.id);
  const learner = await browser.newPage({ baseURL: "http://127.0.0.1:3309" });
  await enter(learner, student);
  await learner.close();
  const seeded = await request.post(
    provider + "/fixtures/" + manager.id + "/classroom",
    {
      data: {
        studentFixtureId: student.id,
        includeTurtle: true,
        seedDrafts: true,
      },
    },
  );
  expect(seeded.ok(), await seeded.text()).toBe(true);
  const c = await seeded.json();
  const classId = c.classes[0].id;
  const root = "/academy/" + manager.academy.slug;
  await page.goto(`${root}/teach/history`);
  await expect(page.getByTestId("history-class-picker")).toBeVisible({
    timeout: 90000,
  });
  await page
    .getByRole("link")
    .filter({ hasText: "Assigned Python class" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Select a student", exact: true }),
  ).toBeVisible({ timeout: 90000 });
  await page
    .getByRole("complementary", { name: "Students", exact: true })
    .getByRole("button")
    .filter({ hasText: "Browser student" })
    .click();
  await expect(page.getByTestId("history-student-overview")).toBeVisible();
  await expect(page.getByTestId("history-enrollment")).toContainText(
    "Unlimited",
  );
  await expect(
    page.getByRole("heading", { name: "Course Completion", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Course Progress", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Daily learning time", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Assessed work completion" }),
  ).toHaveAttribute("aria-valuenow", "0");
  await page.screenshot({ path: info.outputPath("student-dashboard.png") });
  await page
    .getByRole("heading", { name: "Course Progress", exact: true })
    .scrollIntoViewIfNeeded();
  await page
    .getByRole("img", { name: "Daily learning time", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("course-progress.png") });
  await page
    .getByRole("button", { name: "Add two numbers", exact: true })
    .click();
  await expect(page.getByTestId("private-coding-workspace")).toBeVisible({
    timeout: 90000,
  });
  await expect(
    page.getByRole("complementary", { name: "Course", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("problem-statement")).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Your run", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Increase editor font size",
      exact: true,
    }),
  ).toBeVisible();
  await expect.poll(() => editor(page)).toBe("print(2 + 3)");
  await page.screenshot({ path: info.outputPath("coding-draft.png") });
  await editor(page, 'print("PRIVATE DRAFT RESULT")');
  await expect(
    page.getByRole("button", { name: "Run", exact: true }),
  ).toBeEnabled({ timeout: 90000 });
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(
    page.getByTestId("private-coding-workspace").getByTestId("terminal"),
  ).toContainText("PRIVATE DRAFT RESULT", { timeout: 90000 });
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Reset private copy", exact: true })
    .click();
  await expect.poll(() => editor(page)).toBe("print(2 + 3)");
  await page.getByRole("button", { name: "Test 1", exact: true }).click();
  await expect(
    page.getByTestId("private-coding-workspace").getByTestId("terminal"),
  ).toContainText("5", { timeout: 90000 });
  const preview = await rpc(page, "monitoring/getExercisePreview", {
    academyId: manager.academy.id,
    classId,
    membershipId: c.studentMembershipId,
    materialId: c.materialId,
  });
  expect(preview.ok(), await preview.text()).toBe(true);
  expect((await preview.json()).json.studentCode).toBe("print(2 + 3)");
  await page.getByRole("button", { name: /Draw a red square Turtle/ }).click();
  await expect(page.getByTestId("private-turtle-workspace")).toBeVisible({
    timeout: 90000,
  });
  await expect.poll(() => editor(page)).toContain("SAVED TURTLE DRAFT");
  await expect(
    page.getByRole("complementary", { name: "Course", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Drawing", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("separator", { name: "Resize editor and results" }),
  ).toBeVisible();
  await expect(page.getByTestId("historical-submission")).not.toContainText(
    "Waiting for live response",
  );
  await editor(
    page,
    "import turtle\nprint('PRIVATE TURTLE DRAFT RESULT',flush=True)\nturtle.circle(35)\nprint('PRIVATE DRAWING READY',flush=True)\nturtle.done()",
  );
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Terminal", exact: true }),
  ).toContainText("PRIVATE DRAWING READY", { timeout: 90000 });
  await expect(
    page.getByTestId("turtle-display").locator("canvas"),
  ).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: info.outputPath("turtle-draft.png") });
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Reset private copy", exact: true })
    .click();
  await expect.poll(() => editor(page)).toContain("SAVED TURTLE DRAFT");
  const original = await rpc(page, "monitoring/getObservedMaterial", {
    academyId: manager.academy.id,
    classId,
    membershipId: c.studentMembershipId,
    materialId: c.turtleMaterialId,
  });
  expect(original.ok(), await original.text()).toBe(true);
  expect((await original.json()).json.saved.files["main.py"]).toContain(
    "SAVED TURTLE DRAFT",
  );
  const attempts = await rpc(page, "studentWorkHistory/listAttempts", {
    academyId: manager.academy.id,
    classId,
    membershipId: c.studentMembershipId,
    materialId: c.turtleMaterialId,
    page: 1,
  });
  expect((await attempts.json()).json.pagination.totalCount).toBe(0);
});

test("no-work tutoring keeps the statement and shows an empty panel without starter code", async ({
  page,
  browser,
  request,
}, info) => {
  test.setTimeout(240000);
  const manager = await fixture(request, "lab_head");
  await enter(page, manager);
  const student = await fixture(
    request,
    "student",
    manager.id,
    "No work student",
  );
  const learner = await browser.newPage({ baseURL: "http://127.0.0.1:3309" });
  await enter(learner, student);
  await learner.close();
  const response = await request.post(
    provider + "/fixtures/" + manager.id + "/classroom",
    {
      data: {
        studentFixtureId: student.id,
        emptyWork: true,
        includeTurtle: true,
      },
    },
  );
  expect(response.ok(), await response.text()).toBe(true);
  const c = await response.json(),
    root = "/academy/" + manager.academy.slug;
  await page.goto(
    `${root}/teach/classes/${c.classes[0].id}/students/${c.studentMembershipId}/work/${c.materialId}`,
  );
  await expect(page.getByTestId("history-no-work")).toBeVisible({
    timeout: 90000,
  });
  await expect(
    page
      .frameLocator('iframe[title="Problem"]')
      .getByText("Read two numbers and print their sum."),
  ).toBeVisible();
  await expect(page.getByTestId("historical-submission")).toContainText(
    "No work student",
  );
  await expect(page.getByTestId("private-coding-workspace")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Run", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("empty-coding-work.png") });
  await page.getByRole("button", { name: /Draw a red square Turtle/ }).click();
  await expect(page).toHaveURL(new RegExp("/work/" + c.turtleMaterialId), {
    timeout: 90000,
  });
  await expect(
    page.getByRole("heading", { name: "Draw a red square", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("history-no-work")).toBeVisible();
  await expect(page.getByTestId("private-turtle-workspace")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Run", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("empty-turtle-work.png") });
  await page.goto(
    `${root}/teach/classes/${c.classes[0].id}/students/${c.studentMembershipId}/live?materialId=${c.materialId}`,
  );
  await page.getByRole("button", { name: "Tutoring", exact: true }).click();
  await page
    .getByRole("complementary", { name: "Tutoring", exact: true })
    .getByRole("button")
    .filter({ hasText: "No work student" })
    .click();
  await expect(page.getByTestId("history-no-work")).toBeVisible({
    timeout: 90000,
  });
  await expect(page.getByTestId("embedded-review-header")).toHaveCount(1);
  await expect(
    page
      .getByTestId("historical-submission")
      .getByRole("heading", { level: 1 }),
  ).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("inline-empty-work.png") });
});
