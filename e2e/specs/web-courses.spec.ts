import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { routes } from "../../packages/web/src/lib/routes";
const provider = "http://127.0.0.1:4320",
  api = "http://127.0.0.1:4319/api";
const shots = resolve("docs/research/assets/2026-11-16-web-courses-localhost");
type Fixture = { id: string; academy: { id: string; slug: string } };
async function fixture(
  request: APIRequestContext,
  role: string,
  parentFixtureId?: string,
): Promise<Fixture> {
  const response = await request.post(provider + "/fixtures", {
    data: { role, parentFixtureId },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function enter(page: Page, fixture: Fixture) {
  const response = await page.request.get("/sso/start", { maxRedirects: 0 });
  const target = new URL(response.headers().location!);
  target.searchParams.set("fixture", fixture.id);
  await page.goto(provider + "/os/authorize?" + target.searchParams);
  await expect(page).toHaveURL(
    /\/(?:academy\/|admin(?:\/|$))/,
  );
}
async function token(page: Page) {
  const parts = (await page.context().cookies())
    .filter((c) => /auth-token(?:\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  return JSON.parse(
    Buffer.from(
      parts
        .map((c) => c.value)
        .join("")
        .replace(/^base64-/, ""),
      "base64url",
    ).toString(),
  ).access_token as string;
}
test("Web authoring, six-material student lecture and teacher reading reports on localhost", async ({
  page,
  browser,
  request,
}) => {
  await mkdir(shots, { recursive: true });
  const author = await fixture(request, "lab_head");
  const learner = await fixture(request, "student", author.id);
  const tutor = await fixture(request, "tutor", author.id);
  await enter(page, author);
  console.info("WEB_BROWSER author signed in");
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3309",
    viewport: { width: 1440, height: 1000 },
  });
  await context.route(
    "https://dlab-sso-provider.invalid/storage/v1/object/sign/**",
    (route) =>
      route.fulfill({
        path: resolve("e2e/fixtures/lecture-material.pdf"),
        contentType: "application/pdf",
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cross-Origin-Resource-Policy": "cross-origin",
        },
      }),
  );
  const student = await context.newPage();
  await enter(student, learner);
  const teacherContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3309",
    viewport: { width: 1440, height: 1000 },
  });
  const teacher = await teacherContext.newPage();
  await enter(teacher, tutor);
  const seeded = await request.post(
    `${provider}/fixtures/${author.id}/classroom`,
    {
      data: {
        studentFixtureId: learner.id,
        teacherFixtureId: tutor.id,
        emptyWork: true,
        includePdf: true,
        webCourse: true,
      },
    },
  );
  expect(seeded.ok(), await seeded.text()).toBe(true);
  const room = await seeded.json(),
    academyId = author.academy.id,
    slug = author.academy.slug,
    classId = room.classes[0].id;
  console.info("WEB_BROWSER fixtures ready");
  // Course creation really chooses and persists WEB.
  await page.goto(routes.academyLearnCourses(slug));
  await page.getByRole("button", { name: /^New course$|^새 코스$/ }).click();
  const modal = page.getByRole("dialog");
  await modal.getByRole("textbox").first().fill("Web course creation check");
  // The type is one dropdown, opened and chosen from the keyboard.
  const courseType = modal.getByRole("button", { name: /^(Course type|코스 유형)/ });
  await expect(courseType).toContainText("Python");
  await courseType.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitemradio")).toHaveCount(3);
  await page.waitForTimeout(300);
  await page.screenshot({
    path: resolve(shots, "01a-course-type-menu.png"),
    fullPage: true, animations: 'disabled',
  });
  await page.getByRole("menuitemradio", { name: /Web/ }).click();
  await expect(courseType).toContainText("Web");
  await expect(modal.getByText(/coding practice is not offered|코딩 실습은 제공하지 않습니다/)).toBeVisible();
  await page.screenshot({
    path: resolve(shots, "01-create-web-course.png"),
    fullPage: true, animations: 'disabled',
  });
  await modal
    .getByRole("button", { name: /Create and open|만들고 열기/ })
    .click();
  await expect(page).toHaveURL(/\/(?:content|learn)\/courses\/[a-f0-9-]+$/);
  console.info("WEB_BROWSER course created");
  await page.goto(routes.academyLearnCourse(slug, room.courseId));
  await expect(
    page.getByRole("button", { name: /^New material$|^새 자료$/ }).first(),
  ).toBeVisible();
  // The Excel import adds problems, which a web course does not hold.
  await expect(
    page.getByRole("link", { name: /Import from Excel|엑셀/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: /^New material$|^새 자료$/ })
    .first()
    .click();
  const picker = page.getByRole("dialog");
  await expect(picker.getByText(/^Explanation$|^설명 자료$/)).toBeVisible();
  // Every kind is on show; the ones that are code to run cannot be chosen.
  for (const kind of [/^Coding practice$|^코딩 실습$/, /^PDF \+ coding practice$|^PDF \+ 코딩 실습$/]) {
    const card = picker.locator("label").filter({ has: page.getByText(kind) });
    await expect(card.getByRole("radio")).toBeDisabled();
    await expect(card).toContainText(/Not in web courses|웹 코스에서는 사용 불가/);
    await card.click({ force: true });
    await expect(page.getByRole("button", { name: /^Next$|^다음$/ })).toBeDisabled();
  }
  const turtle = picker.locator("label").filter({ has: page.getByText(/^Turtle exercise$|^터틀 실습$/) });
  if (await turtle.count()) await expect(turtle.getByRole("radio")).toBeDisabled();
  for (const kind of [/^PDF document$|^PDF 문서$/, /^Written response$|^서술형 문제$/, /^Multiple choice$|^객관식 문제$/, /^Video lesson$|^동영상 수업$/])
    await expect(picker.locator("label").filter({ has: page.getByText(kind) }).getByRole("radio")).toBeEnabled();
  // Let the dialog finish opening so the capture is not mid-transition.
  await page.waitForTimeout(400);
  await page.screenshot({
    path: resolve(shots, "02-web-material-picker.png"),
    fullPage: true, animations: 'disabled',
  });
  // In a short window the grid scrolls inside the dialog; it never runs
  // under the Cancel / Next footer.
  await page.setViewportSize({ width: 1440, height: 620 });
  const lastCard = picker.locator("label").last();
  await lastCard.scrollIntoViewIfNeeded();
  const lastBox = (await lastCard.boundingBox())!;
  const footerBox = (await picker.getByRole("button", { name: /^Cancel$|^취소$/ }).boundingBox())!;
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(footerBox.y);
  expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(620);
  await page.screenshot({
    path: resolve(shots, "02a-web-material-picker-short-window.png"),
    fullPage: true, animations: 'disabled',
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await picker.getByText(/^Explanation$|^설명 자료$/).click();
  await page.getByRole("button", { name: /^Next$|^다음$/ }).click();
  await page
    .getByRole("textbox", { name: /^Title$|^제목$/ })
    .fill("[실습] My first HTML page");
  await page
    .getByRole("button", { name: /^Practice page$|^실습 페이지$/ })
    .click();
  await expect(page.locator('.tiptap [data-callout="practice"]')).toBeVisible();
  await page.getByRole("switch", { name: /Side pane|참고 자료 패널/ }).check();
  await page
    .locator(".tiptap")
    .nth(1)
    .fill("Keep index.html open in VS Code and use Live Server.");
  const sideSwitch = page.getByRole("switch", {
    name: /Side pane|참고 자료 패널/,
  });
  page.once("dialog", (dialog) => dialog.dismiss());
  await sideSwitch.click();
  await expect(sideSwitch).toBeChecked();
  page.once("dialog", (dialog) => dialog.accept());
  await sideSwitch.uncheck();
  await expect(page.locator(".tiptap")).toHaveCount(1);
  await sideSwitch.check();
  await expect(page.locator(".tiptap").nth(1)).toHaveText("");
  await page
    .locator(".tiptap")
    .nth(1)
    .fill("Keep index.html open in VS Code and use Live Server.");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "expected-result.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="180"><rect width="600" height="180" fill="#f4f7fb"/><text x="28" y="74" font-family="sans-serif" font-size="32" fill="#16181d">Hello, web!</text><text x="28" y="122" font-family="sans-serif" font-size="18" fill="#5a6270">My first HTML page</text></svg>',
      ),
    });
  await expect(page.locator(".tiptap img")).toBeVisible();
  await page.screenshot({
    path: resolve(shots, "03-author-templates-and-side-pane.png"),
    fullPage: true, animations: 'disabled',
  });
  const saved = page.waitForResponse(
    (r) => r.url() === api + "/explanations" && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: /Save explanation|설명 자료 저장/ })
    .click();
  const save = await saved;
  expect(save.ok(), await save.text()).toBe(true);
  const practiceId = (await save.json()).materialId;
  await expect(page).toHaveURL(new RegExp("/explanations/" + practiceId + "$"));
  const headers = { Authorization: "Bearer " + (await token(page)) };
  const savePage = async (title: string, body: string, sideBody?: string) => {
    const response = await request.post(api + "/explanations", {
      headers,
      data: {
        academyId,
        courseId: room.courseId,
        lectureId: room.lectureId,
        title,
        body,
        sideBody,
        isVisible: true,
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).materialId as string;
  };
  const missionId = await savePage(
    "[미션] A card for your favourite place",
    '<div data-callout="mission">Create a page using div, h1 and p.</div><h2>Your mission</h2><p>Write a title and a short description. Add a border around the card.</p><h2>Expected result</h2><blockquote><h3>My favourite place</h3><p>A place to learn and create.</p></blockquote>',
  );
  const splitId = await savePage(
    "Build a profile card",
    '<div data-callout="practice">Follow the instructions and compare with the reference.</div><h2>Instructions</h2><p>Create a profile card with a title, introduction and favourite link.</p><ul><li>Use a div as the container.</li><li>Use padding and a border.</li><li>Open index.html with Live Server.</li></ul>',
    '<pre data-language="html" data-filename="index.html"><code class="language-html">&lt;div class="profile"&gt;\n  &lt;h1&gt;Hello, web!&lt;/h1&gt;\n  &lt;p&gt;A place to learn and create.&lt;/p&gt;\n&lt;/div&gt;</code></pre><pre data-language="css" data-filename="style.css"><code class="language-css">.profile {\n  padding: 24px;\n  border: 1px solid #ddd;\n}</code></pre>',
  );
  const viewResponse = student.waitForResponse(
    (r) =>
      r.url().endsWith("/explanations/view") && r.request().method() === "POST",
  );
  await student.goto(
    routes.academyLearnMaterial(slug, practiceId, "EXPLANATION", { classId }),
  );
  expect((await viewResponse).ok()).toBe(true);
  await expect(student.locator("article h1").first()).toContainText("[실습]");
  await expect(
    student.frameLocator("article iframe").first().locator(".cove-code-header"),
  ).toContainText("index.html");
  await student.screenshot({
    path: resolve(shots, "04-student-practice-desktop.png"),
    fullPage: true, animations: 'disabled',
  });
  await student.getByRole("link", { name: /^Next$|^다음$/ }).click();
  await expect(student).toHaveURL(new RegExp(missionId));
  await expect(
    student.frameLocator("article iframe").locator('[data-callout="mission"]'),
  ).toBeVisible();
  await student.screenshot({
    path: resolve(shots, "05-student-mission-desktop.png"),
    fullPage: true, animations: 'disabled',
  });
  await student.goto(
    routes.academyLearnMaterial(slug, splitId, "EXPLANATION", { classId }),
  );
  const divider = student.getByRole("separator", {
    name: /Resize instructions|너비 조절/,
  });
  await expect(divider).toBeVisible();
  await divider.focus();
  const before = Number(await divider.getAttribute("aria-valuenow"));
  await student.keyboard.press("ArrowRight");
  await expect(divider).toHaveAttribute("aria-valuenow", String(before + 2));
  const box = (await divider.boundingBox())!;
  await student.mouse.move(box.x + 2, box.y + 100);
  await student.mouse.down();
  await student.mouse.move(box.x + 75, box.y + 100);
  await student.mouse.up();
  const resized = await divider.getAttribute("aria-valuenow");
  await student.reload();
  await expect(divider).toHaveAttribute("aria-valuenow", resized!);
  await expect(student.locator('article[data-collab-surface="statement"]')).toHaveCount(2);
  await expect.poll(() => student.locator('article[data-collab-surface="statement"]').evaluateAll(cards => cards.every(card => {
    const pane = card.parentElement!; const style = getComputedStyle(card);
    return card.getBoundingClientRect().height >= pane.getBoundingClientRect().height - parseFloat(style.marginTop) - parseFloat(style.marginBottom) - 2;
  }))).toBe(true);
  await expect(student.getByRole('button', { name: /Open Tanstack query devtools/ })).toHaveCount(0);
  await student.screenshot({
    path: resolve(shots, "06-two-pane-desktop.png"),
    fullPage: true, animations: 'disabled',
  });
  await student.setViewportSize({ width: 390, height: 844 });
  await expect(
    student.getByRole("tab", { name: /^Instructions$|^안내$/ }),
  ).toBeVisible();
  await student.getByRole("tab", { name: /^Reference$|^참고 자료$/ }).click();
  await expect(
    student.getByRole("tab", { name: /^Reference$|^참고 자료$/ }),
  ).toHaveAttribute("aria-selected", "true");
  await student.screenshot({
    path: resolve(shots, "07-two-pane-mobile-reference.png"),
    fullPage: true, animations: 'disabled',
  });
  await student.getByRole("tab", { name: /^Instructions$|^안내$/ }).click();
  await student.screenshot({
    path: resolve(shots, "08-two-pane-mobile-instructions.png"),
    fullPage: true, animations: 'disabled',
  });
  await student.setViewportSize({ width: 1440, height: 1000 });
  await student.goto(
    routes.academyLearnMaterial(slug, room.pdfMaterialId, "PDF_DOCUMENT", {
      classId,
    }),
  );
  await expect(student.locator(".react-pdf__Page canvas")).toBeVisible();
  await student.screenshot({
    path: resolve(shots, "09-pdf-desktop.png"),
    fullPage: true, animations: 'disabled',
  });
  await student.goto(
    routes.academyLearnMaterial(slug, room.quizMaterialId, "MULTIPLE_CHOICE", {
      classId,
    }),
  );
  const submit = student.getByRole("button", { name: /^Submit$|^제출$/ });
  await expect(submit).toBeDisabled();
  await student.getByRole("radio").first().check();
  const submitted = student.waitForResponse(response => response.url() === api + '/manual/submit' && response.request().method() === 'POST');
  await submit.click();
  const submittedResponse = await submitted; expect(submittedResponse.ok(), await submittedResponse.text()).toBe(true);
  await expect(student.getByRole('button', { name: /Submitting|제출 중/ })).toHaveCount(0);
  await expect(student.getByRole("radio").first()).toBeVisible();
  // The outline follows the submission without leaving the page.
  await expect(student.getByText("5 / 6", { exact: true }).first()).toBeVisible();
  await student.screenshot({
    path: resolve(shots, "10-quiz-desktop.png"),
    fullPage: true, animations: 'disabled',
  });
  await student.setViewportSize({ width: 390, height: 844 });
  await student.screenshot({
    path: resolve(shots, "11-quiz-mobile.png"),
    fullPage: true, animations: 'disabled',
  });
  await student.setViewportSize({ width: 1440, height: 1000 });
  await student.goto(
    routes.academyLearnMaterial(slug, room.videoMaterialId, "VIDEO_LESSON", {
      classId,
    }),
  );
  // A distant database: every watch checkpoint takes 700 ms to answer. The
  // player must not save per frame, or its queue falls behind the video and
  // the progress under it is still catching up after the video has ended.
  let checkpoints = 0;
  let distant = true;
  await student.route("**/checkpoint", async (route) => {
    checkpoints++;
    if (distant) await new Promise((done) => setTimeout(done, 700));
    // The page may have moved on while this one waited.
    await route.continue().catch(() => undefined);
  });
  const video = student.locator("video");
  await expect(video).toBeVisible();
  await video.evaluate((v: HTMLVideoElement) => {
    v.muted = true;
    return v.play();
  });
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.ended), {
      timeout: 30000,
    })
    .toBe(true);
  // Stay on the video: it moves to the next material five seconds after it ends.
  await student.getByRole("button", { name: /^Cancel$|^취소$/ }).click();
  // Watched to the end means complete at once, not minutes later.
  await expect(
    student.getByText(/^Completed$|^시청 완료$/).first(),
  ).toBeVisible({ timeout: 5000 });
  const watched = await student.getByText(/^\d+% (watched|시청)/).first().innerText();
  expect(Number(watched.match(/^\d+/)![0])).toBeGreaterThanOrEqual(90);
  console.info(`WEB_BROWSER video checkpoints=${checkpoints}`);
  expect(checkpoints).toBeGreaterThan(0);
  expect(checkpoints).toBeLessThanOrEqual(15);
  distant = false;
  await expect(student.getByText("6 / 6", { exact: true }).first()).toBeVisible();
  await student.screenshot({
    path: resolve(shots, "12-video-desktop.png"),
    fullPage: true, animations: 'disabled',
  });
  await student.goto(
    routes.academyLearnCourse(slug, room.courseId, { classId }),
  );
  await expect(student.getByText(/6 \/ 6/).first()).toBeVisible({
    timeout: 30000,
  });
  await student.screenshot({
    path: resolve(shots, "13-student-completed-outline.png"),
    fullPage: true, animations: 'disabled',
  });
  await teacher.goto(
    `${routes.academy(slug)}/teach/classes/${classId}/progress`,
  );
  await expect(
    teacher.getByRole("heading", { name: /Lecture progress|강의 진도/ }).first(),
  ).toBeVisible();
  await expect(
    teacher.getByRole("row", { name: /Browser student/ }).getByText("6 / 6"),
  ).toBeVisible();
  await teacher.screenshot({
    path: resolve(shots, "14-teacher-students.png"),
    fullPage: true, animations: 'disabled',
  });
  await teacher.getByRole("button", { name: /^Curriculum$|^커리큘럼$/ }).click();
  await teacher.screenshot({
    path: resolve(shots, "15-teacher-curriculum.png"),
    fullPage: true, animations: 'disabled',
  });
  await teacher.getByRole("button", { name: /Build a profile card/ }).click();
  const materialStudents = teacher.getByRole("region", {
    name: /Build a profile card/,
  });
  await expect(materialStudents.getByText("Browser student")).toBeVisible();
  await teacher.screenshot({
    path: resolve(shots, "16-teacher-material-students.png"),
    fullPage: true, animations: 'disabled',
  });
  await materialStudents
    .getByRole("button", { name: /Viewing status|열람 상태/ })
    .click();
  await teacher
    .getByRole("menuitemradio", { name: /^Not viewed$|^미열람$/ })
    .click();
  await expect(
    teacher.getByText(/No students to show|표시할 학생/),
  ).toBeVisible();
  await teacher.reload();
  await expect(
    teacher.getByRole("button", { name: /^Curriculum$|^커리큘럼$/ }),
  ).toHaveAttribute("aria-current", "page");
  // The remaining visual matrix uses the real locale/theme cookies in isolated contexts.
  const appearance = async (target: Page, language: 'en' | 'ko', theme: 'light' | 'dark') => {
    await target.context().addCookies([
      { name: 'i18next', value: language, url: 'http://127.0.0.1:3309' },
      { name: 'cove-theme', value: theme, url: 'http://127.0.0.1:3309' },
    ]);
  };
  await appearance(student, 'ko', 'light');
  await student.goto(routes.academyLearnMaterial(slug, splitId, 'EXPLANATION', { classId }));
  await expect(student.locator('[data-collab-anchor="statement:reference"]')).toBeVisible();
  await expect(student.locator('article h2').last()).toHaveText('참고 자료');
  await student.screenshot({ path: resolve(shots, '17-two-pane-korean-light.png'), fullPage: true, animations: 'disabled' });
  await appearance(student, 'ko', 'dark'); await student.reload();
  await expect(student.locator('html')).toHaveClass(/dark/);
  await student.screenshot({ path: resolve(shots, '18-two-pane-korean-dark-desktop.png'), fullPage: true, animations: 'disabled' });
  await student.setViewportSize({ width: 390, height: 844 });
  await student.getByRole('tab', { name: '참고 자료', exact: true }).click();
  await student.screenshot({ path: resolve(shots, '19-two-pane-korean-dark-mobile.png'), fullPage: true, animations: 'disabled' });
  await student.setViewportSize({ width: 1440, height: 1000 });
  await appearance(teacher, 'ko', 'dark');
  await teacher.goto(`${routes.academy(slug)}/teach/classes/${classId}/progress`);
  await expect(teacher.getByRole('heading', { name: /강의 진도/ }).first()).toBeVisible();
  await teacher.screenshot({ path: resolve(shots, '20-teacher-korean-dark.png'), fullPage: true, animations: 'disabled' });
  await appearance(teacher, 'en', 'light');
  // Adding a coding course must not trap the teacher in the web-only lens.
  const companionResponse = await request.post(`${provider}/fixtures/${author.id}/companion-course`, { data: { classId } });
  expect(companionResponse.ok(), await companionResponse.text()).toBe(true);
  const companion = await companionResponse.json();
  await teacher.goto(`${routes.academy(slug)}/teach/classes/${classId}/progress?view=problems&course=${room.courseId}`);
  await teacher.getByRole('button', { name: 'Course', exact: true }).click();
  await expect(teacher.getByRole('menuitemradio', { name: 'Python companion', exact: true })).toBeVisible();
  await teacher.screenshot({ path: resolve(shots, '21-mixed-class-course-picker.png'), fullPage: true, animations: 'disabled' });
  await teacher.getByRole('menuitemradio', { name: 'Python companion', exact: true }).click();
  await expect(teacher).toHaveURL(new RegExp('course=' + companion.courseId));
  await expect(teacher.getByRole('button', { name: /^Curriculum$/ })).toHaveCount(0);
  await expect(teacher.getByText('Python companion', { exact: true }).first()).toBeVisible();
  await teacher.screenshot({ path: resolve(shots, '22-mixed-class-coding-report.png'), fullPage: true, animations: 'disabled' });
  await teacher.goBack();
  await expect(teacher.getByRole('button', { name: 'Course', exact: true })).toBeVisible();
  await expect(teacher.getByRole('button', { name: /^Curriculum$/ })).toHaveAttribute('aria-current', 'page');
  // HQ authors the same Web type in the native platform library.
  const operator = await fixture(request, 'hq_admin');
  const adminContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3309', viewport: { width: 1440, height: 1000 } });
  const admin = await adminContext.newPage(); await enter(admin, operator);
  await admin.goto(routes.adminLibrary);
  await admin.getByRole('button', { name: 'New course', exact: true }).click();
  const libraryDialog = admin.getByRole('dialog');
  await libraryDialog.getByRole('textbox').first().fill('Web master verification');
  const libraryType = libraryDialog.getByRole('button', { name: /^Course type/ });
  await libraryType.click(); await admin.getByRole('menuitemradio', { name: /Web/ }).click();
  await expect(libraryType).toContainText('Web');
  await expect(libraryDialog.getByText('Material', { exact: true })).toBeVisible();
  await admin.screenshot({ path: resolve(shots, '23-admin-library-create-web.png'), fullPage: true, animations: 'disabled' });
  await libraryDialog.getByRole('button', { name: 'Create and open', exact: true }).click();
  await expect(admin).toHaveURL(/\/admin\/content\/library\/[a-f0-9-]+$/);
  await expect(admin.getByRole('heading', { name: 'Web master verification', exact: true })).toBeVisible();
  await expect(admin.getByRole('link', { name: /Import from Excel/ })).toHaveCount(0);
  await admin.screenshot({ path: resolve(shots, '24-admin-library-web-builder.png'), fullPage: true, animations: 'disabled' });
  await admin.goto(routes.adminLibrary);
  const libraryRow = admin.getByRole('row').filter({ hasText: 'Web master verification' });
  await expect(libraryRow.getByText(/Web$/).first()).toBeVisible();
  await admin.getByRole('button', { name: 'Language', exact: true }).and(admin.locator('[aria-haspopup="dialog"]')).click();
  await admin.getByRole('option', { name: /Web/ }).click(); await admin.keyboard.press('Escape');
  await expect(libraryRow).toBeVisible();
  await admin.screenshot({ path: resolve(shots, '25-admin-library-web-list.png'), fullPage: true, animations: 'disabled' });
  await appearance(admin, 'ko', 'dark'); await admin.reload();
  await expect(admin.getByRole('heading', { name: '콘텐츠 라이브러리', exact: true })).toBeVisible();
  await expect(admin.locator('html')).toHaveClass(/dark/);
  await admin.screenshot({ path: resolve(shots, '26-admin-library-korean-dark.png'), fullPage: true, animations: 'disabled' });
  await adminContext.close();
  await context.close();
  await teacherContext.close();
});
