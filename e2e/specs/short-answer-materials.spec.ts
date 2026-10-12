import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { signInAs } from "../support/auth";
import { routes } from "../../packages/web/src/lib/routes";
const academyId = "20000000-0000-4000-8000-000000000001",
  courseId = "ee030000-0000-4000-8000-000000000001",
  lectureId = "ee030000-0000-4000-8000-000000000020",
  classId = "e0000000-0000-4000-8000-000000000040",
  slug = "development-academy";
const api =
  process.env.E2E_SHORT_ANSWER_API ?? "http://localhost:4000/api/manual";
test.skip(
  process.env.E2E_SHORT_ANSWER_ENABLED !== "1",
  "Opt-in short-answer fixture",
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
  if (page.url() !== new URL(path, page.url()).href) await page.goto(path);
  await expect.poll(() => token).not.toBe("");
  return { Authorization: token };
}
test.beforeAll(() => {
  execFileSync(
    "pnpm",
    [
      "--filter",
      "@cove/api",
      "exec",
      "tsx",
      "scripts/seed-short-answer-e2e.mts",
    ],
    { stdio: "pipe" },
  );
});
test("exact authoring, explicit input, private grading, explanation and teacher override", async ({
  page,
  browser,
}) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(30000);
  const author = await login(
    page,
    "teamlead@cove.test",
    routes.academyCourse(slug, courseId),
  );
  const turtleAction = page.getByRole("button", {
    name: "Add turtle / written response",
  });
  if (process.env.E2E_GUI_ENABLED === "1")
    await expect(turtleAction.first()).toBeVisible();
  else await expect(turtleAction).toHaveCount(0);
  await page
    .getByRole("button", { name: "Add short-answer question" })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Title", { exact: true })
    .fill("Original exact question");
  await dialog
    .getByLabel("Question", { exact: true })
    .fill("Name the requested word.");
  await dialog
    .locator("[contenteditable=true]")
    .fill("Read the question and write your answer.");
  await dialog
    .getByLabel("Grade manually without specifying answers")
    .uncheck();
  await dialog
    .getByLabel("Correct answer", { exact: true })
    .fill("SECRET_orbit");
  await dialog
    .getByLabel("Model answer (private)")
    .fill("PRIVATE_teacher_guidance");
  await dialog.getByLabel("Test answer", { exact: true }).fill("SECRET_orbit");
  await dialog.getByRole("button", { name: "Test matching" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Correct");
  await dialog.getByLabel("Write explanation").check();
  await dialog
    .locator("[contenteditable=true]")
    .last()
    .fill("PRIVATE_explanation_released_after_completion");
  await dialog.getByLabel("Exclude from score").uncheck();
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
  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  try {
    const studentHeaders = await login(
      student,
      "student@cove.test",
      routes.academyLearnManual(slug, materialId, { classId }),
    );
    const input = student.getByLabel("Your answer", { exact: true }),
      submit = student.getByRole("button", { name: "Submit", exact: true });
    await expect(input).toBeVisible();
    await expect(submit).toBeDisabled();
    await expect(
      student.getByRole("button", { name: "Run", exact: true }),
    ).toHaveCount(0);
    await expect(
      student.getByRole("button", { name: "Save code" }),
    ).toHaveCount(0);
    const read = await student.request.get(api, {
      headers: studentHeaders,
      params: { ...target, classId },
    });
    const body = await read.json();
    expect(JSON.stringify(body)).not.toMatch(
      /SECRET_orbit|PRIVATE_teacher|PRIVATE_explanation/,
    );
    await input.fill(" ");
    await expect(submit).toBeEnabled();
    let drafts = 0;
    student.on("request", (r) => {
      if (r.url().endsWith("/draft")) drafts++;
    });
    await input.fill("unsent multiline\n안녕");
    student.once("dialog", (d) => d.dismiss());
    await student.getByRole("link", { name: "Previous", exact: true }).click();
    await expect(input).toHaveValue("unsent multiline\n안녕");
    expect(drafts).toBe(0);
    await input.fill("wrong");
    await submit.click();
    await expect(student.getByText(/Incorrect · 0 \/ 100/).first()).toBeVisible(
      { timeout: 30000 },
    );
    await expect(input).toHaveValue("");
    await expect(student.getByTestId("short-answer-explanation")).toHaveCount(
      0,
    );
    let attempt = (
      await (
        await student.request.get(api, {
          headers: studentHeaders,
          params: { ...target, classId },
        })
      ).json()
    ).attempts[0];
    expect(
      (
        await (
          await student.request.get(api + "/explanation", {
            headers: studentHeaders,
            params: { ...target, classId, submissionId: attempt.id },
          })
        ).json()
      ).explanation,
    ).toBeNull();
    await input.fill("SECRET_orbit");
    await submit.click();
    await expect(student.getByText(/Correct · 100 \/ 100/).first()).toBeVisible(
      { timeout: 30000 },
    );
    await expect(student.getByTestId("short-answer-explanation")).toBeVisible();
    await student.reload();
    await expect(input).toHaveValue("");
    const history = await (
      await student.request.get(api, {
        headers: studentHeaders,
        params: { ...target, classId },
      })
    ).json();
    attempt = history.attempts[0];
    expect(history.attempts).toHaveLength(2);
    expect(attempt.reviews).toHaveLength(0);
    expect(attempt.shortAnswerAssessment.status).toBe("GRADED");
    // A published grading rule cannot be replaced through a forged author payload.
    const original = await (
      await page.request.get(api, {
        headers: author,
        params: { ...target, preview: "true" },
      })
    ).json();
    const locked = await page.request.post(api, {
      headers: author,
      data: {
        academyId,
        courseId,
        lectureId,
        materialId,
        title: "Original exact question",
        type: "WRITTEN_RESPONSE",
        ...original.config,
        shortAnswer: {
          ...original.config.shortAnswer,
          expectedAnswer: "replacement",
        },
      },
    });
    expect(locked.status()).toBe(409);
    const teacherContext = await browser.newContext();
    const teacher = await teacherContext.newPage();
    try {
      await login(
        teacher,
        "teacher@cove.test",
        routes.academyTeachManual(slug, classId, materialId),
      );
      await expect(
        teacher.getByText("SECRET_orbit", { exact: true }),
      ).toBeVisible();
      await teacher.getByLabel("Score", { exact: true }).fill("25");
      await teacher.getByLabel("Completed", { exact: true }).uncheck();
      await teacher
        .getByLabel("Feedback", { exact: true })
        .fill("Please revise your answer.");
      await teacher.getByRole("button", { name: "Publish review" }).click();
      await expect(
        teacher.getByText("Please revise your answer.").first(),
      ).toBeVisible();
      await expect(
        student.getByText(/25 \/ 100 · Needs revision/).first(),
      ).toBeVisible({ timeout: 30000 });
      await expect(student.getByTestId("short-answer-explanation")).toHaveCount(
        0,
      );
    } finally {
      await teacherContext.close();
    }
    await student.screenshot({
      path: `/tmp/cove-short-answer-${test.info().project.name}.png`,
    });
  } finally {
    await studentContext.close();
  }
});
test("regex author preview/search semantics and manual submission review", async ({
  page,
  browser,
}) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(30000);
  const author = await login(
    page,
    "teamlead@cove.test",
    routes.academyCourse(slug, courseId),
  );
  async function create(mode: "REGEX" | "MANUAL") {
    const definition = {
      version: 1,
      question: "Explain or match the word.",
      gradingMode: mode,
      expectedAnswer: "",
      pattern: mode === "REGEX" ? "orbit" : "",
      explanationEnabled: false,
      explanation: "",
    };
    const saved = await page.request.post(api, {
      headers: author,
      data: {
        academyId,
        courseId,
        lectureId,
        type: "WRITTEN_RESPONSE",
        title: mode + " original question",
        shortAnswer: definition,
      },
    });
    expect(saved.status()).toBe(201);
    const { materialId } = await saved.json();
    expect(
      (
        await page.request.post(api + "/visibility", {
          headers: author,
          data: { academyId, materialId, isVisible: true },
        })
      ).ok(),
    ).toBe(true);
    return materialId;
  }
  for (const [pattern, answer, correct] of [
    ["orbit", "orbital", true],
    ["^orbit$", "orbital", false],
  ] as const) {
    const r = await page.request.post(api + "/matching-preview", {
      headers: author,
      data: {
        academyId,
        definition: {
          version: 1,
          question: "Match",
          gradingMode: "REGEX",
          pattern,
          expectedAnswer: "",
          explanationEnabled: false,
          explanation: "",
        },
        answer,
      },
    });
    expect(await r.json()).toEqual({ correct });
  }
  const regex = await create("REGEX"),
    manual = await create("MANUAL");
  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  try {
    const studentHeaders = await login(
      student,
      "student@cove.test",
      routes.academyLearnManual(slug, regex, { classId }),
    );
    await student.getByLabel("Your answer", { exact: true }).fill("orbital");
    await student.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(student.getByText(/Correct ·/).first()).toBeVisible({
      timeout: 30000,
    });
    const target = { academyId, materialId: regex };
    const payload = {
      ...target,
      classId,
      files: {},
      answer: "orbital",
      revision: 0,
      contentRevision: 1,
      requestKey: crypto.randomUUID(),
    };
    const first = await (
      await student.request.post(api + "/submit", {
        headers: studentHeaders,
        data: payload,
      })
    ).json();
    const replay = await (
      await student.request.post(api + "/submit", {
        headers: studentHeaders,
        data: payload,
      })
    ).json();
    expect(first.submissionId).toBe(replay.submissionId);
    expect(
      (
        await student.request.post(api + "/draft", {
          headers: studentHeaders,
          data: { ...target, revision: 0, files: {}, answer: "draft" },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await student.request.post(api + "/matching-preview", {
          headers: studentHeaders,
          data: {
            academyId,
            definition: {
              question: "x",
              gradingMode: "EXACT",
              expectedAnswer: "x",
            },
            answer: "x",
          },
        })
      ).status(),
    ).toBe(403);
    await student.goto(routes.academyLearnManual(slug, manual, { classId }));
    await student
      .getByLabel("Your answer", { exact: true })
      .fill("My own multiline answer.\n안녕");
    await student.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(
      student.getByText("Awaiting teacher review", { exact: true }),
    ).toBeVisible();
    const teacherContext = await browser.newContext();
    const teacher = await teacherContext.newPage();
    try {
      await login(
        teacher,
        "teacher@cove.test",
        routes.academyTeachManual(slug, classId, manual),
      );
      await expect(
        teacher.getByText("My own multiline answer.", { exact: false }).first(),
      ).toBeVisible();
      await teacher.getByLabel("Score", { exact: true }).fill("75");
      await teacher.getByLabel("Completed", { exact: true }).check();
      await teacher
        .getByLabel("Feedback", { exact: true })
        .fill("Reviewed original response");
      await teacher.getByRole("button", { name: "Publish review" }).click();
      await expect(
        student.getByText(/75 \/ 100 · Completed/).first(),
      ).toBeVisible({ timeout: 30000 });
    } finally {
      await teacherContext.close();
    }
  } finally {
    await studentContext.close();
  }
});
test("stale prompts retain unsent text and regex errors retry one immutable attempt", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(30000);
  const author = await login(
    page,
    "teamlead@cove.test",
    routes.academyCourse(slug, courseId),
  );
  async function create(mode: "MANUAL" | "REGEX", pattern = "") {
    const response = await page.request.post(api, {
      headers: author,
      data: {
        academyId,
        courseId,
        lectureId,
        title: "Original recovery question",
        type: "WRITTEN_RESPONSE",
        shortAnswer: {
          version: 1,
          question: "Original prompt",
          gradingMode: mode,
          expectedAnswer: "",
          pattern,
          explanationEnabled: false,
          explanation: "",
        },
      },
    });
    expect(response.status()).toBe(201);
    const { materialId } = await response.json();
    expect(
      (
        await page.request.post(api + "/visibility", {
          headers: author,
          data: { academyId, materialId, isVisible: true },
        })
      ).ok(),
    ).toBe(true);
    return materialId;
  }
  const stale = await create("MANUAL"),
    timeout = await create("REGEX", "(a+)+$");
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const student = await context.newPage();
  try {
    const headers = await login(
      student,
      "student@cove.test",
      routes.academyLearnManual(slug, stale, { classId }),
    );
    const input = student.getByLabel("Your answer", { exact: true });
    await input.fill("Unsent original answer");
    const original = await (
      await page.request.get(api, {
        headers: author,
        params: { academyId, materialId: stale, preview: "true" },
      })
    ).json();
    const changed = await page.request.post(api, {
      headers: author,
      data: {
        academyId,
        courseId,
        lectureId,
        materialId: stale,
        type: "WRITTEN_RESPONSE",
        title: "Updated prompt",
        ...original.config,
        shortAnswer: {
          ...original.config.shortAnswer,
          question: "Updated question",
        },
      },
    });
    expect(changed.status()).toBe(201);
    await expect(
      student.getByRole("alert").filter({ hasText: "The question changed" }),
    ).toBeVisible({ timeout: 20000 });
    const rejected = student.waitForResponse(
      (r) => r.url() === api + "/submit",
    );
    await student.getByRole("button", { name: "Submit", exact: true }).click();
    expect((await rejected).status()).toBe(409);
    await expect(input).toHaveValue("Unsent original answer");
    student.once("dialog", (d) => d.accept());
    await student.goto(routes.academyLearnManual(slug, timeout, { classId }));
    await input.fill("a".repeat(4000) + "!");
    await student.getByRole("button", { name: "Submit", exact: true }).click();
    const retry = student.getByRole("button", { name: "Retry evaluation" });
    await expect(retry).toBeVisible({ timeout: 30000 });
    const before = await (
      await student.request.get(api, {
        headers,
        params: { academyId, materialId: timeout, classId },
      })
    ).json();
    expect(before.attempts).toHaveLength(1);
    expect(before.attempts[0].shortAnswerAssessment.scoreHundredths).toBeNull();
    await retry.click();
    await expect(retry).toBeVisible({ timeout: 30000 });
    const after = await (
      await student.request.get(api, {
        headers,
        params: { academyId, materialId: timeout, classId },
      })
    ).json();
    expect(after.attempts).toHaveLength(1);
    expect(after.attempts[0].id).toBe(before.attempts[0].id);
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
