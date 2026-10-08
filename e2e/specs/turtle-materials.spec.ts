import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { signInAs } from "../support/auth";
import { routes } from "../../packages/web/src/lib/routes";
const academyId = "20000000-0000-4000-8000-000000000001",
  courseId = "ee020000-0000-4000-8000-000000000001",
  lectureId = "ee020000-0000-4000-8000-000000000020",
  classId = "e0000000-0000-4000-8000-000000000040",
  slug = "development-academy";
const api = "http://localhost:4000/api/manual";
test.skip(
  process.env.E2E_GUI_ENABLED !== "1",
  "Requires the opt-in isolated GUI runtime",
);
async function login(page: Page, identifier: string, path: string) {
  let token = "";
  page.on("request", (r) => {
    const h = r.headers().authorization;
    if (h?.startsWith("Bearer ")) token = h;
  });
  await signInAs({
    page,
    identifier,
    password: "CoveDev123!",
    initialPath: path,
  });
  await expect.poll(() => token).not.toBe("");
  return { Authorization: token };
}
async function code(page: Page, value: string) {
  await expect(page.locator(".monaco-editor")).toBeVisible({ timeout: 45000 });
  await expect
    .poll(() =>
      page.evaluate((next) => {
        const model = (
          window as unknown as {
            monaco?: {
              editor: { getModels(): Array<{ setValue(v: string): void }> };
            };
          }
        ).monaco?.editor.getModels()[0];
        if (!model) return false;
        model.setValue(next);
        return true;
      }, value),
    )
    .toBe(true);
}
async function painted(page: Page) {
  await expect
    .poll(
      () =>
        page.locator("[data-testid=turtle-display] canvas").evaluate((node) => {
          const c = node as HTMLCanvasElement;
          if (!c.width || !c.height) return 0;
          const p = c
            .getContext("2d")!
            .getImageData(0, 0, c.width, c.height).data;
          let red = 0;
          for (let i = 0; i < p.length; i += 4)
            if (p[i] > 170 && p[i + 1] < 120 && p[i + 2] < 120) red++;
          return red;
        }),
      { timeout: 30000 },
    )
    .toBeGreaterThan(30);
}
const drawing = `import turtle\ns = turtle.Screen()\ns.setup(640, 480)\nt = turtle.Turtle()\nt.shape('turtle')\nt.color('red')\nt.begin_fill()\nfor _ in range(4):\n    t.forward(70)\n    t.left(90)\nt.end_fill()\nlabel = turtle.Turtle()\nlabel.hideturtle()\nlabel.penup()\nlabel.goto(-200, 150)\nlabel.write('Cove keyboard game', font=('Arial', 16, 'normal'))\ndef move():\n    t.forward(20)\n    print('KEY', int(round(t.xcor())), flush=True)\ns.onkey(move, 'Right')\ns.listen()\ns.ontimer(lambda: print('TIMER', flush=True), 100)\nprint('READY', flush=True)\nprint('HELLO', input('name: '), flush=True)\nturtle.mainloop()\n`;
test.beforeAll(() => {
  execFileSync(
    "pnpm",
    ["--filter", "@cove/api", "exec", "tsx", "scripts/seed-turtle-e2e.mts"],
    { stdio: "pipe" },
  );
});
test("turtle authoring, real drawing/input/game, immutable submission and teacher review", async ({
  page,
  browser,
}) => {
  test.setTimeout(600000);
  page.setDefaultTimeout(45000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const author = await login(
    page,
    "teamlead@cove.test",
    routes.academyCourse(slug, courseId),
  );
  await page
    .getByRole("button", { name: "Add turtle / written response" })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("Turtle E2E mission");
  await dialog.getByLabel("Starter code").fill(drawing);
  await dialog.getByLabel("Solution code").fill("# SECRET_PRIVATE_SOLUTION");
  await dialog.getByLabel("Exclude from score").uncheck();
  await dialog.getByLabel("width", { exact: true }).fill("640");
  await dialog.getByLabel("height", { exact: true }).fill("480");
  await dialog
    .locator("[contenteditable=true]")
    .fill("Draw a red square, then use the Right arrow to move the turtle.");
  const save = page.waitForResponse(
    (r) => r.url() === api && r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Save activity" }).click();
  const saved = await save;
  expect(saved.status()).toBe(201);
  const { materialId } = await saved.json();
  await expect(dialog).toBeHidden();
  const target = { academyId, materialId };
  const preview = await page.request.get(api, {
    headers: author,
    params: { ...target, preview: "true" },
  });
  expect(preview.ok()).toBe(true);
  expect((await preview.json()).config.solutionFiles["main.py"]).toContain(
    "SECRET_PRIVATE",
  );
  const studentContext = await browser.newContext();
  await studentContext.addInitScript(() => {
    (window as unknown as { coveTestSockets: WebSocket[] }).coveTestSockets =
      [];
    const original = WebSocket.prototype.send;
    WebSocket.prototype.send = function (
      this: WebSocket,
      data: Parameters<WebSocket["send"]>[0],
    ) {
      const sockets = (window as unknown as { coveTestSockets: WebSocket[] })
        .coveTestSockets;
      if (this.url.includes(":4010/") && !sockets.includes(this))
        sockets.push(this);
      return original.call(this, data);
    };
  });
  const student = await studentContext.newPage();
  student.on("pageerror", (e) => errors.push(e.message));
  const studentHeaders = await login(
    student,
    "student@cove.test",
    routes.academyLearnManual(slug, materialId, { classId }),
  );
  await expect(student.locator("main[role=alert]")).toContainText(
    "not available",
  );
  expect(
    (
      await page.request.post(api + "/visibility", {
        headers: author,
        data: { ...target, isVisible: true },
      })
    ).ok(),
  ).toBe(true);
  await student.reload();
  await expect(
    student.getByRole("button", { name: "Run", exact: true }),
  ).toBeVisible();
  const payload = await student.request.get(api, {
    headers: studentHeaders,
    params: target,
  });
  expect(JSON.stringify(await payload.json())).not.toContain("SECRET_PRIVATE");
  const capacityFixture = await page.request.post(api, {
    headers: author,
    data: {
      academyId,
      courseId,
      lectureId,
      title: "Hidden capacity fixture",
      type: "TURTLE_EXERCISE",
      files: { "main.py": "input()" },
    },
  });
  expect(capacityFixture.ok()).toBe(true);
  const capacityMaterial = (await capacityFixture.json()).materialId;
  const blockerIds: string[] = [];
  try {
    for (const id of [materialId, capacityMaterial]) {
      const response = await page.request.post(api + "/sessions", {
        headers: author,
        data: {
          academyId,
          materialId: id,
          preview: true,
          files: { "main.py": "input()" },
          answer: "",
          revision: 0,
          contentRevision: 1,
        },
      });
      expect(response.ok()).toBe(true);
      blockerIds.push((await response.json()).id);
    }
    for (const id of blockerIds)
      await page.request.get(api + "/sessions/" + id, { headers: author });
    await student.getByRole("button", { name: "Run", exact: true }).click();
    await expect(student.getByText(/QUEUED/)).toBeVisible();
    await page.request.delete(api + "/sessions/" + blockerIds[0], {
      headers: author,
    });
    await expect(student.getByTestId("turtle-terminal")).toContainText(
      "name:",
      { timeout: 45000 },
    );
    await painted(student);
  } finally {
    for (const id of blockerIds)
      await page.request.delete(api + "/sessions/" + id, { headers: author });
  }
  await student.getByLabel("Terminal input").fill("Cove");
  await student.getByLabel("Terminal input").press("Enter");
  await expect(student.getByTestId("turtle-terminal")).toContainText(
    "HELLO Cove",
  );
  await expect(student.getByTestId("turtle-terminal")).toContainText("TIMER");
  await student.locator("[data-testid=turtle-display] canvas").click();
  await student.keyboard.press("ArrowRight");
  await expect(student.getByTestId("turtle-terminal")).toContainText("KEY 20");
  await student.keyboard.press("Escape");
  await expect(
    student.getByRole("button", { name: "Release keyboard" }),
  ).toBeFocused();
  await student.screenshot({ path: "/tmp/cove-turtle-desktop.png" });
  await studentContext.setOffline(true);
  await expect(student.locator("main > p[role=alert]")).toBeVisible();
  await studentContext.setOffline(false);
  await expect(student.locator("main > p[role=alert]")).toHaveCount(0);
  await student.evaluate(() =>
    (window as unknown as { coveTestSockets: WebSocket[] }).coveTestSockets
      .at(-1)
      ?.close(),
  );
  await expect(
    student.getByRole("status").filter({ hasText: "Disconnected" }),
  ).toBeVisible();
  await expect(
    student.getByRole("status").filter({ hasText: "Ready" }),
  ).toBeVisible({ timeout: 15000 });
  await painted(student);
  const own = await student.request.get(api, {
    headers: studentHeaders,
    params: target,
  });
  expect(own.ok()).toBe(true);
  await student.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(
    student.getByRole("button", { name: "Run", exact: true }),
  ).toBeEnabled();
  await code(student, drawing + "\n# saved draft");
  await student.getByRole("button", { name: "Save code" }).click();
  await expect(
    student.getByRole("status").filter({ hasText: "Saved" }),
  ).toContainText("Saved");
  await student.reload();
  await expect
    .poll(() =>
      student.evaluate(() =>
        (
          window as unknown as {
            monaco?: { editor: { getModels(): Array<{ getValue(): string }> } };
          }
        ).monaco?.editor
          .getModels()[0]
          ?.getValue(),
      ),
    )
    .toContain("saved draft");
  await student.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(
    student.getByText("Awaiting teacher review", { exact: true }),
  ).toBeVisible();
  const after = await (
    await student.request.get(api, { headers: studentHeaders, params: target })
  ).json();
  const attempt = after.attempts[0];
  expect(JSON.stringify(after)).not.toContain("SECRET_PRIVATE");
  expect(attempt.files["main.py"]).toContain("saved draft");
  expect(attempt.reviews).toEqual([]);
  await code(student, "print('draft changed after submission')");
  await student.getByRole("button", { name: "Save code" }).click();
  const immutable = await (
    await student.request.get(api, { headers: studentHeaders, params: target })
  ).json();
  expect(immutable.attempts[0].files["main.py"]).toBe(attempt.files["main.py"]);
  const teacherContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  teacher.on("pageerror", (e) => errors.push(e.message));
  const teacherHeaders = await login(
    teacher,
    "teacher@cove.test",
    routes.academyTeachManual(slug, classId, materialId),
  );
  await expect(
    teacher.getByText("Immutable submitted work", { exact: false }),
  ).toBeVisible();
  await expect(teacher.getByTestId("turtle-display")).toHaveCount(0);
  await teacher.getByRole("button", { name: "Run submitted code" }).click();
  await expect(teacher.getByTestId("turtle-terminal")).toContainText("name:", {
    timeout: 45000,
  });
  await painted(teacher);
  await teacher.getByRole("button", { name: "Stop", exact: true }).click();
  await teacher.getByLabel("Score", { exact: true }).fill("87.5");
  await teacher.getByLabel("Completed", { exact: true }).check();
  await teacher
    .getByLabel("Feedback", { exact: true })
    .fill("Good event-loop and keyboard handling.");
  await teacher.getByRole("button", { name: "Publish review" }).click();
  await teacher.getByText(/Review history/).click();
  await expect(teacher.getByText("Version 1", { exact: false })).toBeVisible();
  const stale = await teacher.request.post(api + "/review", {
    headers: teacherHeaders,
    data: {
      ...target,
      submissionId: attempt.id,
      expectedVersion: 0,
      scoreHundredths: 100,
      completed: false,
      feedback: "stale",
    },
  });
  expect(stale.status()).toBe(409);
  await student.reload();
  await expect(student.getByText("87.5 / 100 · Completed")).toBeVisible();
  await expect(
    student.getByText("Good event-loop and keyboard handling.").first(),
  ).toBeVisible();
  const writtenSave = await page.request.post(api, {
    headers: author,
    data: {
      academyId,
      courseId,
      lectureId,
      title: "Turtle explanation",
      modelAnswer: "PRIVATE_WRITTEN_MODEL_ANSWER",
      type: "WRITTEN_RESPONSE",
      description: "<p>Explain the event loop.</p>",
      includeInScore: true,
      submitEnabled: true,
      files: {},
    },
  });
  expect(writtenSave.ok()).toBe(true);
  const written = (await writtenSave.json()).materialId;
  await page.request.post(api + "/visibility", {
    headers: author,
    data: { academyId, materialId: written, isVisible: true },
  });
  await student.goto(routes.academyLearnManual(slug, written, { classId }));
  await expect(
    student.getByRole("button", { name: "Run", exact: true }),
  ).toHaveCount(0);
  const writtenPayload = await (
    await student.request.get(api, {
      headers: studentHeaders,
      params: { academyId, materialId: written, classId },
    })
  ).json();
  expect(writtenPayload.config.modelAnswer).toBe("");
  expect(JSON.stringify(writtenPayload)).not.toContain(
    "PRIVATE_WRITTEN_MODEL_ANSWER",
  );
  await student
    .getByLabel("Your answer")
    .fill("The event loop dispatches keyboard events until Stop.");
  await student.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(
    student.getByText("Awaiting teacher review", { exact: true }),
  ).toBeVisible();
  await student.setViewportSize({ width: 390, height: 844 });
  expect(
    await student.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const forbidden = await student.request.get(api + "/roster", {
    headers: studentHeaders,
    params: { ...target, classId },
  });
  expect(forbidden.status()).toBe(403);
  await student.goto(routes.academyLearnManual(slug, materialId, { classId }));
  await student.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(
    student.getByText("Awaiting teacher review", { exact: true }),
  ).toBeVisible();
  await student.setViewportSize({ width: 1280, height: 900 });
  await code(student, drawing);
  await student.getByRole("button", { name: "Run", exact: true }).click();
  await expect(student.getByTestId("turtle-terminal")).toContainText("name:", {
    timeout: 45000,
  });
  await painted(student);
  await student.getByLabel("Terminal input").fill("watch");
  await student.getByLabel("Terminal input").press("Enter");
  await expect(student.getByTestId("turtle-terminal")).toContainText(
    "HELLO watch",
  );
  await teacher.reload();
  await teacher
    .getByRole("button", { name: "View learner drawing (read-only)" })
    .click();
  await painted(teacher);
  await expect(teacher.getByText("Read-only", { exact: true })).toBeVisible();
  await teacher.locator("[data-testid=turtle-display] canvas").click();
  await teacher.keyboard.press("ArrowRight");
  await expect(student.getByTestId("turtle-terminal")).not.toContainText(
    "KEY 20",
  );
  await teacher.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(
    student.getByRole("button", { name: "Stop", exact: true }),
  ).toBeEnabled();
  await student.locator("[data-testid=turtle-display] canvas").click();
  await student.keyboard.press("ArrowRight");
  await expect(student.getByTestId("turtle-terminal")).toContainText("KEY 20");
  await student.setViewportSize({ width: 390, height: 844 });
  await expect(
    student.getByRole("button", { name: "→", exact: true }),
  ).toBeVisible();
  await student.getByRole("button", { name: "→", exact: true }).click();
  await student.getByRole("tab", { name: "Terminal", exact: true }).click();
  await expect(student.getByTestId("turtle-terminal")).toContainText("KEY 40");
  await student.getByRole("tab", { name: "Drawing", exact: true }).click();
  await expect(
    student.locator("[data-testid=turtle-display] canvas"),
  ).toBeVisible();
  await painted(student);
  const displayBounds = await student.getByTestId("turtle-display").boundingBox();
  const footerBounds = await student.locator("footer").boundingBox();
  expect(displayBounds).not.toBeNull();
  expect(footerBounds).not.toBeNull();
  expect(footerBounds!.y).toBeGreaterThanOrEqual(
    displayBounds!.y + displayBounds!.height,
  );
  await student.screenshot({ path: "/tmp/cove-turtle-mobile.png", fullPage: true });
  expect(
    await student.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await student.setViewportSize({ width: 1280, height: 900 });
  await student.getByRole("button", { name: "Stop", exact: true }).click();
  await student.getByRole("button", { name: "Materials", exact: true }).click();
  await expect(
    student.getByRole("link", { name: /Exercise after Turtle/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await studentContext.close();
  await teacherContext.close();
});

test("immutable lesson assets, private solution assets, excluded scoring and disabled Submit", async ({
  page,
  browser,
}) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(45000);
  const author = await login(
    page,
    "teamlead@cove.test",
    routes.academyCourse(slug, courseId),
  );
  async function asset(name: string, bytes: Buffer) {
    const response = await page.request.post(api + "/assets", {
      headers: {
        ...author,
        "Content-Type": "application/octet-stream",
        "X-File-Name": encodeURIComponent(name),
      },
      params: { academyId, courseId },
      data: bytes,
    });
    expect(response.ok()).toBe(true);
    return response.json();
  }
  const dataAsset = await asset(
    "data.txt",
    Buffer.from("IMMUTABLE_LESSON_DATA"),
  );
  const solutionAsset = await asset(
    "secret.txt",
    Buffer.from("PRIVATE_SOLUTION_DATA"),
  );
  const gif = await asset(
    "shape.gif",
    Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64",
    ),
  );
  const program =
    "import turtle\nturtle.register_shape('assets/shape.gif')\nt=turtle.Turtle('assets/shape.gif')\nt.color('red'); t.circle(40)\nprint(open('assets/data.txt').read(),flush=True)\ntry:\n open('assets/data.txt','w').write('overwrite')\nexcept PermissionError:\n print('ASSET_READ_ONLY',flush=True)\nturtle.done()\n";
  const saved = await page.request.post(api, {
    headers: author,
    data: {
      academyId,
      courseId,
      lectureId,
      title: "Excluded asset practice",
      type: "TURTLE_EXERCISE",
      files: { "main.py": program },
      solutionFiles: { "main.py": "print(open('assets/secret.txt').read())" },
      assets: [dataAsset, gif],
      solutionAssets: [solutionAsset],
      submitEnabled: true,
      includeInScore: false,
      timeLimitSeconds: 60,
    },
  });
  expect(saved.ok()).toBe(true);
  const { materialId } = await saved.json();
  const target = { academyId, materialId };
  await page.request.post(api + "/visibility", {
    headers: author,
    data: { ...target, isVisible: true },
  });
  const context = await browser.newContext();
  const student = await context.newPage();
  student.setDefaultTimeout(45000);
  const headers = await login(
    student,
    "student@cove.test",
    routes.academyLearnManual(slug, materialId, { classId }),
  );
  const payload = await (
    await student.request.get(api, { headers, params: { ...target, classId } })
  ).json();
  expect(payload.config.solutionAssets).toEqual([]);
  expect(payload.config.solutionFiles).toBeNull();
  expect(JSON.stringify(payload)).not.toContain(solutionAsset.assetId);
  await expect(
    student.getByText(/Teacher graded.*Excluded from score/),
  ).toBeVisible();
  await student.getByRole("button", { name: "Run", exact: true }).click();
  await expect(student.getByTestId("turtle-terminal")).toContainText(
    "IMMUTABLE_LESSON_DATA",
    { timeout: 45000 },
  );
  await expect(student.getByTestId("turtle-terminal")).toContainText(
    "ASSET_READ_ONLY",
  );
  await painted(student);
  await student.getByRole("button", { name: "Stop", exact: true }).click();
  await student.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(
    student.getByText("Awaiting teacher review", { exact: true }),
  ).toBeVisible();
  const attempt = (
    await (
      await student.request.get(api, {
        headers,
        params: { ...target, classId },
      })
    ).json()
  ).attempts[0];
  expect(attempt.includeInScore).toBe(false);
  const invalid = await page.request.post(api, {
    headers: author,
    data: {
      academyId,
      courseId,
      lectureId,
      title: "Invalid controls",
      type: "TURTLE_EXERCISE",
      submitEnabled: false,
      includeInScore: true,
    },
  });
  expect(invalid.status()).toBe(400);
  const update = await page.request.post(api, {
    headers: author,
    data: {
      ...payload.config,
      academyId,
      courseId,
      lectureId,
      materialId,
      type: "TURTLE_EXERCISE",
      title: "Excluded asset practice",
      submitEnabled: false,
      includeInScore: false,
      solutionFiles: { "main.py": "print(open('assets/secret.txt').read())" },
      solutionAssets: [solutionAsset],
    },
  });
  expect(update.ok()).toBe(true);
  await student.reload();
  await expect(
    student.getByRole("button", { name: "Submit", exact: true }),
  ).toHaveCount(0);
  const disabled = await student.request.post(api + "/submit", {
    headers,
    data: {
      ...target,
      classId,
      contentRevision: payload.config.revision + 1,
      revision: 0,
      files: { "main.py": program },
      answer: "",
      requestKey: crypto.randomUUID(),
    },
  });
  expect(disabled.status()).toBe(403);
  await context.close();
});
