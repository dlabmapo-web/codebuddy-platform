import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { signInAs } from "../support/auth";
import { routes } from "../../packages/web/src/lib/routes";
const academyId = "20000000-0000-4000-8000-000000000001",
  courseId = "ee050000-0000-4000-8000-000000000001",
  lectureId = "ee050000-0000-4000-8000-000000000020",
  classId = "e0000000-0000-4000-8000-000000000040",
  slug = "development-academy";
const api = process.env.E2E_VIDEO_API ?? "http://localhost:4500/api/videos";
test.use({ actionTimeout: 30000 });
test.skip(
  process.env.E2E_VIDEO_ENABLED !== "1",
  "Development-only video fixture",
);
test.beforeAll(() => {
  execFileSync(
    "pnpm",
    ["--filter", "@cove/api", "exec", "tsx", "scripts/seed-video-e2e.mts"],
    { stdio: "pipe" },
  );
});
async function login(page: Page, name: string, path: string) {
  let token = "";
  page.on("request", (r) => {
    if (r.headers().authorization?.startsWith("Bearer "))
      token = r.headers().authorization;
  });
  await signInAs({
    page,
    identifier: name,
    password: "CoveDev123!",
    initialPath: path,
  });
  if (page.url() !== new URL(path, page.url()).href) await page.goto(path);
  await expect.poll(() => token).not.toBe("");
  return { Authorization: token };
}
test("author upload, private decoded video, captions, watch completion, resume and teacher history", async ({
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
    .getByRole("button", { name: "Add video lesson", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Title", { exact: true })
    .fill("Original video explanation");
  await dialog.getByLabel("Include in score", { exact: true }).check();
  await dialog
    .getByLabel("Video file", { exact: true })
    .setInputFiles("/tmp/cove-video-test/original.mp4");
  await expect(
    dialog.getByRole("status").filter({ hasText: "READY" }),
  ).toBeVisible({ timeout: 150000 });
  await dialog.getByLabel("Caption language (language tag)").fill("en");
  await dialog
    .getByLabel("Caption label", { exact: true })
    .fill("Original English");
  const caption = page.waitForResponse((r) => r.url() === api + "/caption");
  await dialog.getByLabel("Subtitle file (.vtt)").setInputFiles({
    name: "original.vtt",
    mimeType: "text/vtt",
    buffer: Buffer.from(
      "WEBVTT\n\n00:00.000 --> 00:08.000\nOriginal synthetic caption\n",
    ),
  });
  expect((await caption).status()).toBe(201);
  await expect(dialog.getByText("Original English (en)")).toBeVisible();
  const saved = page.waitForResponse(
    (r) => r.url() === api && r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Save video", exact: true }).click();
  const result = await saved;
  expect(result.status()).toBe(201);
  const { materialId } = await result.json();
  await expect(dialog).toBeHidden();
  const target = { academyId, courseId, lectureId, materialId };
  expect(
    (
      await page.request.post(api + "/visibility", {
        headers: author,
        data: { ...target, isVisible: true },
      })
    ).status(),
  ).toBe(201);
  const ctx = await browser.newContext(),
    student = await ctx.newPage();
  try {
    const headers = await login(
      student,
      "student@cove.test",
      routes.academyLearnVideo(slug, materialId, { classId }),
    );
    const video = student.locator("video");
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth), {
        timeout: 60000,
      })
      .toBeGreaterThan(0);
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
      .toBeGreaterThan(0.5);
    await student.getByRole("button", { name: "Pause", exact: true }).click();
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
      .toBe(true);
    await student
      .getByLabel("Playback speed", { exact: true })
      .selectOption("2");
    expect(await video.evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(
      2,
    );
    await student.getByLabel("Quality", { exact: true }).selectOption("0");
    await student.getByLabel("Captions", { exact: true }).selectOption("en");
    await expect
      .poll(() =>
        video.evaluate((v: HTMLVideoElement) =>
          Array.from(v.textTracks).some((t) => t.mode === "showing"),
        ),
      )
      .toBe(true);
    await student.getByRole("button", { name: "Mute", exact: true }).click();
    expect(await video.evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
    const read = await (
      await student.request.get(api, {
        headers,
        params: { academyId, materialId, classId },
      })
    ).json();
    expect(JSON.stringify(read)).not.toMatch(
      /objectKey|original\.mp4".*storage|SUPABASE_SECRET|token/,
    );
    expect(read.asset.byteSize).toMatch(/^\d+$/);
    const media = routes.academyLearnVideo(slug, materialId, { classId });
    expect(media).toContain("/learn/videos/");
    const base = `/api/learn/videos/${academyId}/${materialId}/${read.asset.id}/main/${classId}/`;
    const partial = await student.request.get(
      new URL(base + read.asset.mp4Path, student.url()).href,
      { headers: { Range: "bytes=0-99" } },
    );
    expect(partial.status()).toBe(206);
    expect((await partial.body()).length).toBe(100);
    const anonymous = await browser.newContext();
    try {
      expect(
        (
          await anonymous.request.get(
            new URL(base + read.asset.mp4Path, student.url()).href,
          )
        ).status(),
      ).toBe(401);
    } finally {
      await anonymous.close();
    }
    expect(
      (
        await student.request.get(api + "/media", {
          headers,
          params: {
            academyId,
            materialId,
            assetId: read.asset.id,
            path: "original.mp4",
            classId,
          },
        })
      ).status(),
    ).toBe(404);
    const whole = await student.request.get(api + "/media", {
      headers,
      params: {
        academyId,
        materialId,
        assetId: read.asset.id,
        path: "../original.mp4",
        classId,
      },
    });
    expect(whole.status()).toBe(404);
    await student
      .getByRole("button", { name: "Start over", exact: true })
      .click();
    await expect(student.getByText("Completed", { exact: true })).toBeVisible({
      timeout: 90000,
    });
    const history = await (
      await student.request.get(api + "/history", {
        headers,
        params: { academyId, materialId, classId },
      })
    ).json();
    expect(history[0].completed).toBe(true);
    expect(history[0].watchedMs / read.asset.durationMs).toBeGreaterThanOrEqual(
      0.9,
    );
    await student.reload();
    await expect(video).toBeVisible();
    await expect(
      student.getByRole("button", { name: "Submit", exact: true }),
    ).toHaveCount(0);
    await expect(
      student.getByRole("button", { name: "Run", exact: true }),
    ).toHaveCount(0);
    await student.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        student.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await student.screenshot({
      path: `/tmp/cove-video-${info.project.name}.png`,
      fullPage: true,
    });
    const teacherContext = await browser.newContext(),
      teacher = await teacherContext.newPage();
    try {
      await login(
        teacher,
        "teacher@cove.test",
        routes.academyTeachVideo(slug, classId, materialId),
      );
      await expect(
        teacher.getByRole("cell", { name: "Completed", exact: true }).first(),
      ).toBeVisible();
    } finally {
      await teacherContext.close();
    }
    await student.getByRole("link", { name: "Previous", exact: true }).click();
    await expect(student).toHaveURL(/\/learn\/exercises\//);
  } finally {
    await ctx.close();
  }
});
test("failed replacement preserves published media and policy, preview creates no watch record", async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  const author = await login(
    page,
    "teamlead@cove.test",
    routes.academyCourse(slug, courseId),
  );
  const all = await page.request.get(api + "/capabilities");
  expect((await all.json()).enabled).toBe(true);
  await page
    .getByRole("button", { name: "Add video lesson", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("Replacement guard");
  await dialog
    .getByLabel("Video file", { exact: true })
    .setInputFiles("/tmp/cove-video-test/original.mp4");
  await expect(
    dialog.getByRole("status").filter({ hasText: "READY" }),
  ).toBeVisible({ timeout: 150000 });
  const save = page.waitForResponse(
    (r) => r.url() === api && r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Save video", exact: true }).click();
  const { materialId } = await (await save).json();
  await expect(dialog).toBeHidden();
  await page.request.post(api + "/visibility", {
    headers: author,
    data: { academyId, courseId, lectureId, materialId, isVisible: true },
  });
  const before = await (
    await page.request.get(api, {
      headers: author,
      params: { academyId, materialId, preview: "true" },
    })
  ).json();
  const previewContext = await browser.newContext(),
    preview = await previewContext.newPage();
  const previewWatchRequests: string[] = [];
  preview.on("request", (request) => {
    if (
      request.url() === api + "/session" ||
      request.url() === api + "/checkpoint"
    )
      previewWatchRequests.push(request.url());
  });
  if (browser.browserType().name() === "chromium")
    await preview.route("**/*.m3u8", (route) => route.abort());
  try {
    await login(
      preview,
      "teamlead@cove.test",
      routes.academyLearnVideo(slug, materialId, { preview: true }),
    );
    await preview.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(
        () =>
          preview
            .locator("video")
            .evaluate((v: HTMLVideoElement) => v.videoWidth),
        { timeout: 60000 },
      )
      .toBeGreaterThan(0);
    expect(previewWatchRequests).toEqual([]);
    if (browser.browserType().name() === "chromium")
      await expect(
        preview.getByLabel("Quality", { exact: true }),
      ).toBeDisabled();
  } finally {
    await previewContext.close();
  }
  const reservation = await (
    await page.request.post(api + "/reserve", {
      headers: author,
      data: {
        academyId,
        courseId,
        lectureId,
        filename: "invalid.mp4",
        byteSize: "18",
        requestKey: randomUUID(),
      },
    })
  ).json();
  // The ordinary author UI sends this source with a real signed TUS grant.
  const { Upload } = await import("tus-js-client");
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(Buffer.from("invalid video data"), {
      endpoint: reservation.endpoint,
      headers: { ...author, "x-signature": reservation.token },
      metadata: {
        bucketName: reservation.bucket,
        objectName: reservation.objectName,
        contentType: "application/octet-stream",
      },
      chunkSize: 6 * 1024 * 1024,
      onSuccess: () => resolve(),
      onError: reject,
    });
    upload.start();
  });
  expect(
    (
      await page.request.post(api + "/finish", {
        headers: author,
        data: { academyId, courseId, lectureId, assetId: reservation.assetId },
      })
    ).status(),
  ).toBe(201);
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(api + "/asset", {
              headers: author,
              params: {
                academyId,
                courseId,
                lectureId,
                assetId: reservation.assetId,
              },
            })
          ).json()
        ).state,
      { timeout: 90000 },
    )
    .toBe("FAILED");
  expect(
    (
      await page.request.post(api, {
        headers: author,
        data: {
          academyId,
          courseId,
          lectureId,
          materialId,
          title: before.title,
          ...before.config,
          assetId: reservation.assetId,
          requestKey: randomUUID(),
        },
      })
    ).status(),
  ).toBe(400);
  const after = await (
    await page.request.get(api, {
      headers: author,
      params: { academyId, materialId, preview: "true" },
    })
  ).json();
  expect(after.asset.id).toBe(before.asset.id);
  expect(after.config.revision).toBe(before.config.revision);
});
