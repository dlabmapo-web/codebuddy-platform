import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { signInAs } from "../support/auth";
import { routes } from "../../packages/web/src/lib/routes";
const diagram = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
  "base64",
);
const academyId = "20000000-0000-4000-8000-000000000001",
  courseId = "ee040000-0000-4000-8000-000000000001",
  lectureId = "ee040000-0000-4000-8000-000000000020",
  classId = "e0000000-0000-4000-8000-000000000040",
  slug = "development-academy";
const api =
  process.env.E2E_MULTIPLE_CHOICE_API ?? "http://localhost:4000/api/manual";
test.skip(
  process.env.E2E_MULTIPLE_CHOICE_ENABLED !== "1",
  "Opt-in development choice fixture",
);
test.beforeAll(() => {
  execFileSync(
    "pnpm",
    [
      "--filter",
      "@cove/api",
      "exec",
      "tsx",
      "scripts/seed-multiple-choice-e2e.mts",
    ],
    { stdio: "pipe" },
  );
});
test("private option images render in author preview and explanation images require completion", async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  const author = await login(
    page,
    "teamlead@cove.test",
    routes.academyCourse(slug, courseId),
  );
  await page
    .getByRole("button", { name: "Add multiple-choice question" })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Title", { exact: true })
    .fill("Original image question");
  await dialog
    .getByLabel("Question", { exact: true })
    .fill("Choose the diagram.");
  const upload = page.waitForResponse(
    (r) =>
      r.url().includes("/manual/assets?") && r.request().method() === "POST",
  );
  await dialog
    .getByRole("region", { name: "Option 1", exact: true })
    .locator('input[type=file][accept="image/*"]')
    .setInputFiles({
      name: "diagram.png",
      mimeType: "image/png",
      buffer: diagram,
    });
  const publicAsset = await (await upload).json();
  await expect(
    dialog
      .getByRole("region", { name: "Option 1", exact: true })
      .locator("img"),
  ).toBeVisible();
  await dialog.locator("[contenteditable=true]").nth(3).fill("No diagram");
  await dialog.getByLabel("Correct option 1", { exact: true }).check();
  await dialog.getByLabel("Write explanation", { exact: true }).check();
  const privateUpload = page.waitForResponse(
    (r) =>
      r.url().includes("/manual/assets?") && r.request().method() === "POST",
  );
  await dialog
    .locator('input[type=file][accept="image/*"]')
    .last()
    .setInputFiles({
      name: "solution.png",
      mimeType: "image/png",
      buffer: diagram,
    });
  const privateAsset = await (await privateUpload).json();
  await dialog
    .getByRole("button", { name: "Preview question", exact: true })
    .click();
  await expect(dialog.locator(".choice-rich img")).toBeVisible();
  const save = page.waitForResponse(
    (r) => r.url() === api && r.request().method() === "POST",
  );
  await expect(
    dialog.getByRole("button", { name: "Save activity" }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Save activity" }).click();
  const saved = await save;
  expect(saved.status()).toBe(201);
  const { materialId } = await saved.json(),
    target = { academyId, materialId };
  await expect(dialog).toBeHidden();
  await page.request.post(api + "/visibility", {
    headers: author,
    data: { ...target, isVisible: true },
  });
  const context = await browser.newContext(),
    student = await context.newPage();
  try {
    const headers = await login(
      student,
      "student@cove.test",
      routes.academyLearnQuiz(slug, materialId, { classId }),
    );
    const image = student.locator(".choice-rich img").first();
    await expect
      .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBe(1);
    const getImage = (assetId: string, submissionId?: string) =>
      student.request.get(api + "/choice-image", {
        headers,
        params: {
          ...target,
          classId,
          assetId,
          ...(submissionId ? { submissionId } : {}),
        },
      });
    expect((await getImage(publicAsset.assetId)).status()).toBe(200);
    expect((await getImage(privateAsset.assetId)).status()).toBe(404);
    expect(
      (
        await student.request.get(api + "/choice-image", {
          headers,
          params: { ...target, assetId: privateAsset.assetId, preview: "true" },
        })
      ).status(),
    ).toBe(403);
    const radios = student.getByRole("radio");
    await radios.nth(1).check();
    const wrong = student.waitForResponse((r) => r.url() === api + "/submit");
    await student.getByRole("button", { name: "Submit", exact: true }).click();
    const wrongId = (await (await wrong).json()).submissionId;
    expect((await getImage(privateAsset.assetId, wrongId)).status()).toBe(404);
    await expect(radios.nth(1)).not.toBeChecked();
    await radios.nth(0).check();
    const correct = student.waitForResponse((r) => r.url() === api + "/submit");
    await student.getByRole("button", { name: "Submit", exact: true }).click();
    const correctId = (await (await correct).json()).submissionId;
    expect((await getImage(privateAsset.assetId, correctId)).status()).toBe(
      200,
    );
    await expect
      .poll(() =>
        student
          .getByTestId("short-answer-explanation")
          .locator("img")
          .evaluate((el: HTMLImageElement) => el.naturalWidth),
      )
      .toBe(1);
    expect((await getImage(privateAsset.assetId, wrongId)).status()).toBe(404);
    const body = await (
      await student.request.get(api, {
        headers,
        params: { ...target, classId },
      })
    ).json();
    expect(JSON.stringify(body)).not.toMatch(/correctOptionIds|storage\/v1/);
  } finally {
    await context.close();
  }
});
async function login(page: Page, identifier: string, path: string) {
  let token = "";
  page.on("request", (r) => {
    if (r.headers().authorization?.startsWith("Bearer "))
      token = r.headers().authorization;
  });
  await signInAs({
    page,
    identifier,
    password: "CoveDev123!",
    initialPath: path,
  });
  if (page.url() !== new URL(path, page.url()).href) await page.goto(path);
  await expect.poll(() => token).not.toBe("");
  return { Authorization: token };
}
test("author single choice, explicit student answers, private result, explanation and teacher override", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(300000);
  const author = await login(
    page,
    "teamlead@cove.test",
    routes.academyCourse(slug, courseId),
  );
  await page
    .getByRole("button", { name: "Add multiple-choice question" })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Title", { exact: true })
    .fill("Original single choice");
  await dialog
    .getByLabel("Question", { exact: true })
    .fill("Choose the orbit label.");
  const editors = dialog.locator("[contenteditable=true]");
  await editors.nth(2).fill("Orbit");
  await editors.nth(3).fill("Cloud");
  await dialog.getByLabel("Correct option 1", { exact: true }).check();
  await dialog.getByLabel("Write explanation", { exact: true }).check();
  await editors.last().fill("PRIVATE_choice_explanation");
  await dialog.getByLabel("Exclude from score").uncheck();
  await dialog
    .getByRole("button", { name: "Preview question", exact: true })
    .click();
  await dialog.getByRole("radio", { name: /Option 1:/ }).check();
  await dialog.getByRole("button", { name: "Test selection" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Correct");
  const response = page.waitForResponse(
    (r) => r.url() === api && r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Save activity" }).click();
  const saved = await response;
  expect(saved.status()).toBe(201);
  const { materialId } = await saved.json();
  await expect(dialog).toBeHidden();
  const target = { academyId, materialId };
  expect(
    (
      await page.request.post(api + "/visibility", {
        headers: author,
        data: { ...target, isVisible: true },
      })
    ).ok(),
  ).toBe(true);
  const context = await browser.newContext();
  const student = await context.newPage();
  try {
    const headers = await login(
      student,
      "student@cove.test",
      routes.academyLearnQuiz(slug, materialId, { classId }),
    );
    const submit = student.getByRole("button", { name: "Submit", exact: true }),
      radios = student.getByRole("radio");
    await expect(submit).toBeDisabled();
    await expect(radios).toHaveCount(2);
    await expect(
      student.getByRole("button", { name: "Run", exact: true }),
    ).toHaveCount(0);
    await expect(
      student.getByRole("button", { name: "Save code" }),
    ).toHaveCount(0);
    const read = async () =>
      await (
        await student.request.get(api, {
          headers,
          params: { ...target, classId },
        })
      ).json();
    expect(JSON.stringify(await read())).not.toMatch(
      /correctOptionIds|PRIVATE_choice_explanation/,
    );
    let drafts = 0;
    student.on("request", (r) => {
      if (r.url().endsWith("/draft")) drafts++;
    });
    await radios.nth(0).check();
    await radios.nth(1).check();
    await expect(radios.nth(0)).not.toBeChecked();
    await radios.nth(1).click();
    await expect(radios.nth(1)).toBeChecked();
    student.once("dialog", (d) => d.dismiss());
    await student.getByRole("link", { name: "Previous", exact: true }).click();
    await expect(radios.nth(1)).toBeChecked();
    await submit.click();
    await expect(
      student.getByText(/Incorrect · 0 \/ 100/).first(),
    ).toBeVisible();
    await expect(radios.nth(1)).not.toBeChecked();
    expect(drafts).toBe(0);
    let attempt = (await read()).attempts[0];
    expect(
      (
        await (
          await student.request.get(api + "/explanation", {
            headers,
            params: { ...target, classId, submissionId: attempt.id },
          })
        ).json()
      ).explanation,
    ).toBeNull();
    await radios.nth(0).check();
    await submit.click();
    await expect(
      student.getByText(/Correct · 100 \/ 100/).first(),
    ).toBeVisible();
    await expect(student.getByTestId("short-answer-explanation")).toContainText(
      "PRIVATE_choice_explanation",
    );
    const correct = (await read()).attempts[0];
    expect(JSON.stringify(await read())).not.toContain("correctOptionIds");
    await student.screenshot({
      path: `/tmp/cove-choice-${info.project.name}.png`,
      fullPage: true,
    });
    const teacherContext = await browser.newContext();
    const teacher = await teacherContext.newPage();
    try {
      await login(
        teacher,
        "teacher@cove.test",
        routes.academyTeachManual(slug, classId, materialId),
      );
      await teacher.getByLabel("Score", { exact: true }).fill("40");
      await teacher.getByLabel("Completed", { exact: true }).uncheck();
      await teacher
        .getByLabel("Feedback", { exact: true })
        .fill("Please revisit this original question.");
      await teacher.getByRole("button", { name: "Publish review" }).click();
      await expect(teacher.getByText("Review history (1)")).toBeVisible();
      await expect(
        student.getByText(/40 \/ 100 · Needs revision/).first(),
      ).toBeVisible({ timeout: 20000 });
      await expect(student.getByTestId("short-answer-explanation")).toHaveCount(
        0,
      );
      expect((await read()).attempts[0].id).toBe(correct.id);
    } finally {
      await teacherContext.close();
    }
    await radios.nth(0).check();
    student.once("dialog", (d) => d.accept());
    const materialList = (await read()).materials;
    const currentIndex = materialList.findIndex(
      (m: { materialId: string }) => m.materialId === materialId,
    );
    const previous = materialList[currentIndex - 1];
    expect(previous).toBeDefined();
    const destination = routes.academyLearnMaterial(
      slug, previous.materialId, previous.type, { classId },
    );
    await student.getByRole("link", { name: "Previous", exact: true }).click();
    await expect(student).toHaveURL(new URL(destination, student.url()).href);
  } finally {
    await context.close();
  }
});
test("multiple answer shuffle, exact-set grading, request replay, structural locks and stale revisions", async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  const author = await login(
    page,
    "teamlead@cove.test",
    routes.academyCourse(slug, courseId),
  );
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const definition = {
    version: 1,
    question: "Choose both colors.",
    problemDescription: "<p>Original multi-select question.</p>",
    selectionMode: "MULTIPLE",
    options: ids.map((id, i) => ({
      id,
      content: `<p>${["Blue", "Round", "Green"][i]}</p>`,
    })),
    correctOptionIds: [ids[0], ids[2]],
    shuffleOptions: true,
    explanationEnabled: true,
    explanation: "<p>PRIVATE_multi_explanation</p>",
  };
  const created = await page.request.post(api, {
    headers: author,
    data: {
      academyId,
      courseId,
      lectureId,
      type: "MULTIPLE_CHOICE",
      title: "Original multiple choice",
      files: {},
      multipleChoice: definition,
    },
  });
  expect(created.status()).toBe(201);
  const { materialId } = await created.json(),
    target = { academyId, materialId };
  await page.request.post(api + "/visibility", {
    headers: author,
    data: { ...target, isVisible: true },
  });
  const context = await browser.newContext();
  const student = await context.newPage();
  try {
    const headers = await login(
      student,
      "student@cove.test",
      routes.academyLearnQuiz(slug, materialId, { classId }),
    );
    const checks = student.getByRole("checkbox"),
      submit = student.getByRole("button", { name: "Submit", exact: true });
    await expect(checks).toHaveCount(3);
    await expect(submit).toBeDisabled();
    await student.getByRole("checkbox", { name: /Blue/ }).check();
    await student.getByRole("checkbox", { name: /Green/ }).check();
    await expect(submit).toBeEnabled();
    const order = await checks.evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("aria-label")),
    );
    await expect
      .poll(
        async () =>
          await checks.evaluateAll((nodes) =>
            nodes.map((n) => n.getAttribute("aria-label")),
          ),
      )
      .toEqual(order);
    const submitted = student.waitForResponse(
      (r) => r.url() === api + "/submit",
    );
    await submit.click();
    const admitted = await submitted;
    expect(admitted.status()).toBe(201);
    const payload = admitted.request().postDataJSON();
    const result = await admitted.json();
    expect(
      (
        await student.request.post(api + "/submit", { headers, data: payload })
      ).status(),
    ).toBe(201);
    expect(
      (
        await student.request.post(api + "/submit", {
          headers,
          data: { ...payload, selectedOptionIds: [ids[1]] },
        })
      ).status(),
    ).toBe(409);
    const read = async () =>
      await (
        await student.request.get(api, {
          headers,
          params: { ...target, classId },
        })
      ).json();
    const body = await read();
    expect(body.attempts).toHaveLength(1);
    expect(body.attempts[0].multipleChoiceAssessment.displayOrder).toEqual(
      payload.displayOrder,
    );
    expect(body.attempts[0].multipleChoiceAssessment.completed).toBe(true);
    expect(body.attempts[0].id).toBe(result.submissionId);
    for (const selectedOptionIds of [[], [ids[0], ids[0]], [randomUUID()]])
      expect(
        (
          await student.request.post(api + "/submit", {
            headers,
            data: { ...payload, selectedOptionIds, requestKey: randomUUID() },
          })
        ).status(),
      ).toBe(400);
    expect(
      (
        await student.request.post(api + "/submit", {
          headers,
          data: {
            ...payload,
            displayOrder: [ids[0], ids[0], ids[2]],
            requestKey: randomUUID(),
          },
        })
      ).status(),
    ).toBe(400);
    const authorRead = await (
      await page.request.get(api, {
        headers: author,
        params: { ...target, preview: "true" },
      })
    ).json();
    const save = {
      academyId,
      courseId,
      lectureId,
      materialId,
      type: "MULTIPLE_CHOICE",
      title: "Changed original",
      ...authorRead.config,
    };
    expect(
      (
        await page.request.post(api, {
          headers: author,
          data: {
            ...save,
            multipleChoice: { ...definition, correctOptionIds: [ids[1]] },
          },
        })
      ).status(),
    ).toBe(409);
    await student.getByRole("checkbox", { name: /Blue/ }).check();
    expect(
      (
        await page.request.post(api, {
          headers: author,
          data: {
            ...save,
            multipleChoice: {
              ...definition,
              question: "Revised original caption.",
            },
          },
        })
      ).status(),
    ).toBe(201);
    const stale = student.waitForResponse((r) => r.url() === api + "/submit");
    await submit.click();
    expect((await stale).status()).toBe(409);
    await expect(student.getByRole("checkbox", { name: /Blue/ })).toBeChecked();
    student.once("dialog", (d) => d.accept());
    await student.reload();
    await expect(student.getByRole("checkbox").first()).toBeVisible();
    await student.getByRole("checkbox", { name: /Blue/ }).check();
    await submit.click();
    await expect(
      student.getByText(/Incorrect · 0 \/ 100/).first(),
    ).toBeVisible();
    expect((await read()).attempts).toHaveLength(2);
    await student.getByText("Submission (2)", { exact: true }).click();
    await student.getByText("Read-only", { exact: true }).nth(1).click();
    await expect(
      student.getByTestId("choice-history-explanation"),
    ).toContainText("PRIVATE_multi_explanation");
    await expect(student.getByTestId("short-answer-explanation")).toHaveCount(
      0,
    );
    await student.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        student.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
  } finally {
    await context.close();
  }
});
