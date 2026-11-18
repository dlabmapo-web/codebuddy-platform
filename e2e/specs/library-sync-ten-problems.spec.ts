import {
  test,
  expect,
  type APIRequestContext,
  type Page,
  type Locator,
} from "@playwright/test";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  CourseSummary,
  CourseTree,
  ExerciseAuthoringContext,
  ExerciseDraftFields,
} from "../../packages/shared/src/content/course";
import type {
  AcademyLibrarySyncUpdates,
  LibrarySyncConflictDetail,
} from "../../packages/shared/src/library-sync/sync";
import { routes } from "../../packages/web/src/lib/routes";

test.skip(
  process.env.COVE_LIBRARY_SYNC_SCENARIO !== "ten-problems",
  "Uses the dedicated disposable localhost harness",
);

type Target = {
  academyId: string;
  courseId: string;
  lectureId: string;
  materialId: string;
};
type Evidence = { file: string; caption: string };
const title = "Library sync lab — 10 problems";
const academyP2 =
  "<p>Cove Development: double the number using repeated addition. Keep our classroom example.</p>";
const libraryP2 =
  "<p>Head office: double the number using multiplication. Include negative inputs.</p>";
const sameP5 =
  "<p>Read one integer and print twice its value. Example: 5 becomes 10.</p>";
const finalP2 =
  "<p>Head office revision 3: multiply by two and explain the negative-number example.</p>";

/** Real authenticated authoring, adoption, publishing and worker execution; no content is written through fixture SQL. */
test("10 library problems, 2 academy additions, conflicting and convergent edits, later releases and all resolution choices", async ({
  browser,
  page: admin,
}, info) => {
  const directory = process.env.COVE_LIBRARY_SYNC_BUILD_DIR;
  if (!directory || process.env.COVE_LIBRARY_SYNC_SCENARIO !== "ten-problems")
    throw Error("Run the isolated ten-problem harness");
  const f = JSON.parse(
    await readFile(resolve(directory, "browser.json"), "utf8"),
  );
  const artifacts = resolve(
    info.config.rootDir,
    "../../test-results/library-sync-ten-problems/evidence",
  );
  await mkdir(artifacts, { recursive: true });
  await admin.context().addCookies(f.auth.admin.cookies);
  const managerContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3342",
    storageState: f.auth.manager,
    viewport: { width: 1600, height: 1000 },
  });
  const manager = await managerContext.newPage();
  const screenshots: Evidence[] = [];
  const checks: Array<{ scenario: string; result: string }> = [];
  const observations: Record<string, unknown> = {};
  const consoleErrors: string[] = [];
  for (const p of [admin, manager])
    p.on("pageerror", (error) => consoleErrors.push(error.message));
  function token(actor: "admin" | "manager") {
    const cookie = f.auth[actor].cookies.find(
      (c: { name: string }) => c.name === "sb-127-auth-token",
    );
    return JSON.parse(
      Buffer.from(cookie.value.slice(7), "base64url").toString(),
    ).access_token as string;
  }
  async function rpc<T>(
    actor: "admin" | "manager",
    route: string,
    input: unknown,
  ): Promise<T> {
    const request: APIRequestContext =
      actor === "admin" ? admin.request : manager.request;
    const response = await request.post(
      "http://127.0.0.1:4342/api/rpc/" + route,
      {
        headers: {
          Authorization: "Bearer " + token(actor),
          "X-Cove-Bff-Secret":
            "local-library-sync-browser-only-never-production",
        },
        data: { json: input },
      },
    );
    const body = await response.json();
    expect(
      response.ok(),
      `${route}: HTTP ${response.status()} ${JSON.stringify(body)}`,
    ).toBe(true);
    return body.json as T;
  }
  async function screenshot(
    p: Page,
    file: string,
    caption: string,
    element?: Locator,
  ) {
    await p.evaluate(async () => {
      await document.fonts.ready;
    });
    if (element) {
      const viewport = p.viewportSize();
      const bounds = await element.boundingBox();
      if (viewport && bounds && bounds.height > viewport.height - 160)
        await p.setViewportSize({
          width: viewport.width,
          height: Math.ceil(bounds.height + 200),
        });
      await element.screenshot({
        path: resolve(artifacts, file),
        animations: "disabled",
      });
      if (viewport) await p.setViewportSize(viewport);
    } else
      await p.screenshot({
        path: resolve(artifacts, file),
        fullPage: true,
        animations: "disabled",
      });
    screenshots.push({ file, caption });
    await info.attach(caption, {
      path: resolve(artifacts, file),
      contentType: "image/png",
    });
  }
  async function outline(p: Page, url: string, lastProblem: string) {
    await p.goto(url);
    const expand = p.getByRole("button", { name: "Expand all", exact: true });
    if (await expand.count()) await expand.click();
    await expect(
      p.getByText(lastProblem, { exact: true }).first(),
    ).toBeVisible();
  }
  const draft = (n: number): ExerciseDraftFields => ({
    title: `Problem ${String(n).padStart(2, "0")}${n > 10 && n < 13 ? " — academy only" : ""}`,
    difficulty: "EASY",
    description: `<p>Original problem ${String(n).padStart(2, "0")}: read one integer and print double its value.</p>`,
    inputFormat: "One integer n.",
    outputFormat: "Print 2 * n.",
    constraints: "-100 <= n <= 100",
    starterCode: "n = int(input())\n# Print the answer\n",
    language: "PYTHON",
    solutions: [
      { title: "Main solution", code: "n = int(input())\nprint(n * 2)\n" },
    ],
    aiFeedbackEnabled: false,
    isVisible: true,
    submissionPolicy: "AUTOMATIC",
    referencePdfMaterialId: null,
    testCases: [
      {
        input: String(n),
        expectedOutput: String(n * 2),
        visibility: "SAMPLE",
        comparator: "STDOUT",
        weight: 1,
        timeLimitMsOverride: null,
        softTimeLimitMs: null,
        softPenalty: null,
        label: "Original sample",
      },
    ],
    grading: {
      mode: "LEGACY_STDIO",
      inputPromptPolicy: "IGNORE",
      totalTimeLimitMs: null,
      comparatorTimeLimitMs: null,
      materialMaximumHundredths: null,
      materialScorePolicy: null,
    },
    hints: [],
  });
  async function exercise(actor: "admin" | "manager", target: Target) {
    return rpc<ExerciseAuthoringContext>(
      actor,
      "academyCourses/getExercise",
      target,
    );
  }
  async function edit(
    actor: "admin" | "manager",
    target: Target,
    patch: Partial<ExerciseDraftFields>,
  ) {
    const [context, privateAnswer] = await Promise.all([
      exercise(actor, target),
      rpc<{ solutions: ExerciseDraftFields["solutions"] }>(
        actor,
        "academyCourses/getExerciseSolution",
        target,
      ),
    ]);
    const material = context.material!,
      e = material.programmingExercise!;
    const { semanticVersion: _semanticVersion, ...grading } = e.grading;
    const input: ExerciseDraftFields = {
      title: material.title,
      difficulty: e.difficulty,
      description: e.description,
      inputFormat: e.inputFormat,
      outputFormat: e.outputFormat,
      constraints: e.constraints,
      starterCode: e.starterCode,
      language: e.language,
      aiFeedbackEnabled: e.aiFeedbackEnabled,
      isVisible: material.isVisible,
      solutions: privateAnswer.solutions,
      submissionPolicy: e.submissionPolicy,
      manualAssessment: e.manualAssessment,
      referencePdfMaterialId: e.referencePdfMaterialId,
      quiz: e.quiz,
      testCases: e.testCases.map(({ id: _id, position: _position, ...c }) => c),
      hints: e.hints.map(({ id: _id, position: _position, ...h }) => h),
      grading,
      ...patch,
    };
    return rpc<ExerciseAuthoringContext>(
      actor,
      "academyCourses/updateExercise",
      { ...target, ...input, expectedUpdatedAt: e.updatedAt },
    );
  }
  let masterId = "",
    copyId = "",
    sourceLecture = "",
    copyLecture = "";
  const sources = new Map<number, string>(),
    copies = new Map<number, string>();
  const sourceTarget = (n: number): Target => ({
    academyId: f.ids.library,
    courseId: masterId,
    lectureId: sourceLecture,
    materialId: sources.get(n)!,
  });
  const copyTarget = (n: number): Target => ({
    academyId: f.ids.academy,
    courseId: copyId,
    lectureId: copyLecture,
    materialId: copies.get(n)!,
  });
  const updates = () =>
    rpc<AcademyLibrarySyncUpdates>("manager", "academyLibrarySync/updates", {
      academyId: f.ids.academy,
      courseId: copyId,
    });
  const copyTree = () =>
    rpc<CourseTree>("manager", "academyCourses/getTree", {
      academyId: f.ids.academy,
      courseId: copyId,
    });
  const materials = (tree: CourseTree) =>
    tree.modules.flatMap((m) => m.lectures.flatMap((l) => l.materials));
  async function settled(release: number) {
    await expect
      .poll(async () => (await updates()).sync?.appliedReleaseNumber, {
        timeout: 45000,
        intervals: [200, 500, 1000],
      })
      .toBe(release);
    return updates();
  }
  async function publish(note: string, number: number) {
    await admin.goto(routes.adminLibraryCourse(masterId));
    void note; void number; // Internal publication identifiers are not shown in the product UI.
    await admin
      .getByRole("button", { name: "Publish updates", exact: true })
      .click();
    await expect(
      admin
        .getByRole("status")
        .filter({ hasText: `Updates published` }),
    ).toBeVisible();
  }
  async function compare(n: number) {
    await manager.goto(routes.academyCourseLibraryUpdates(f.slug, copyId));
    const decision = manager
      .getByRole("button")
      .filter({ hasText: `Problem ${String(n).padStart(2, "0")}` })
      .filter({ hasText: "Description" });
    await expect(decision).toBeVisible();
    await decision.click();
    await expect(
      manager.getByRole("button", { name: "Keep academy version", exact: true }),
    ).toBeVisible();
    return manager.locator("section[aria-label]").last();
  }
  async function saveReport(status: string, error?: string) {
    const report = {
      status,
      environment:
        "Isolated localhost: real Nest/Next/ORPC/Prisma/worker, disposable PostgreSQL and Redis, synthetic local identities",
      academy: "Cove Development",
      masterId,
      copyId,
      checks,
      screenshots,
      observations,
      consoleErrors,
      ...(error ? { error } : {}),
    };
    await writeFile(
      resolve(artifacts, "results.json"),
      JSON.stringify(report, null, 2),
    );
    const markdown = `# Cove Development — 10 + 2 problem sync test\n\nResult: **${status}**\n\nFresh local test academy; no shared Supabase or production data was changed. All content writes went through authenticated product APIs. Publishing and conflict decisions were exercised in the real browser.\n\n| Scenario | Result |\n|---|---|\n${checks.map((c) => `| ${c.scenario} | ${c.result} |`).join("\n")}\n\n${screenshots.map((s) => `## ${s.caption}\n\n![${s.caption}](${s.file})\n`).join("\n")}\n\nFull before/after values and IDs: [results.json](results.json).\n\nReproduce: \`COVE_LIBRARY_SYNC_BROWSER=1 COVE_LIBRARY_SYNC_SCENARIO=ten-problems bash packages/api/scripts/test-library-sync.sh\`. Temporary servers/databases are removed after the run.\n${error ? `\nFailure: ${error}\n` : ""}`;
    await writeFile(resolve(artifacts, "report.md"), markdown);
  }
  try {
    await test.step("Admin creates and publishes 10 real programming problems", async () => {
      const course = await rpc<CourseSummary>(
        "admin",
        "academyCourses/create",
        {
          academyId: f.ids.library,
          title,
          description:
            "Local acceptance: overlapping edits, convergence and academy-owned additions.",
          language: "PYTHON",
        },
      );
      masterId = course.id;
      let tree = await rpc<CourseTree>("admin", "academyCourses/createModule", {
        academyId: f.ids.library,
        courseId: masterId,
        title: "Python foundations",
        description: "Library-owned curriculum",
      });
      tree = await rpc<CourseTree>("admin", "academyCourses/createLecture", {
        academyId: f.ids.library,
        courseId: masterId,
        moduleId: tree.modules[0]!.id,
        title: "Double an integer — problems 01–10",
        description: "10 original library problems",
      });
      sourceLecture = tree.modules[0]!.lectures[0]!.id;
      for (let n = 1; n <= 10; n++) {
        const created = await rpc<ExerciseAuthoringContext>(
          "admin",
          "academyCourses/createExercise",
          {
            academyId: f.ids.library,
            courseId: masterId,
            lectureId: sourceLecture,
            ...draft(n),
          },
        );
        sources.set(n, created.material!.id);
      }
      await publish("Release 1: original 10 problems", 1);
      await outline(admin, routes.adminLibraryCourse(masterId), "Problem 10");
      await screenshot(
        admin,
        "01-admin-ten-problems.png",
        "Admin library: 10 original problems, release 1",
      );
      checks.push({
        scenario: "Admin library baseline",
        result:
          "PASS — 10 programming problems created through the editor APIs and published as release 1.",
      });
    });
    await test.step("Cove Development copies the course and adds two problems", async () => {
      const copy = await rpc<CourseSummary>("manager", "academyLibrary/adopt", {
        academyId: f.ids.academy,
        libraryCourseId: masterId,
        title,
      });
      copyId = copy.id;
      let tree = await copyTree();
      expect(materials(tree)).toHaveLength(10);
      copyLecture = tree.modules[0]!.lectures[0]!.id;
      for (const material of materials(tree))
        copies.set(Number(material.title.match(/\d+/)![0]), material.id);
      await outline(
        manager,
        routes.academyCourse(f.slug, copyId),
        "Problem 10",
      );
      await screenshot(
        manager,
        "02-academy-adopted-ten.png",
        "Cove Development: copied all 10 library problems",
      );
      for (const n of [11, 12]) {
        const created = await rpc<ExerciseAuthoringContext>(
          "manager",
          "academyCourses/createExercise",
          {
            academyId: f.ids.academy,
            courseId: copyId,
            lectureId: copyLecture,
            ...draft(n),
          },
        );
        copies.set(n, created.material!.id);
      }
      await edit("manager", copyTarget(2), { description: academyP2 });
      await edit("manager", copyTarget(5), { description: sameP5 });
      tree = await copyTree();
      expect(materials(tree)).toHaveLength(12);
      observations.academyBeforeRelease2 = tree;
      await outline(
        manager,
        routes.academyCourse(f.slug, copyId),
        "Problem 12 — academy only",
      );
      await screenshot(
        manager,
        "03-academy-twelve-problems.png",
        "Academy customized copy: 10 library problems plus its own problems 11 and 12",
      );
      checks.push({
        scenario: "Adoption and academy-owned additions",
        result:
          "PASS — copied all 10, added academy problems 11 and 12, then edited instructions for problems 02 and 05.",
      });
    });
    await test.step("Admin drafts different problem 02 instructions, identical problem 05 instructions, and independent corrections", async () => {
      await edit("admin", sourceTarget(2), {
        description: libraryP2,
        testCases: [
          ...draft(2).testCases,
          {
            ...draft(2).testCases[0]!,
            input: "-2",
            expectedOutput: "-4",
            visibility: "HIDDEN",
            label: "Library negative-number case",
          },
        ],
      });
      await edit("admin", sourceTarget(5), { description: sameP5 });
      await edit("admin", sourceTarget(3), {
        testCases: [
          ...draft(3).testCases,
          {
            ...draft(3).testCases[0]!,
            input: "0",
            expectedOutput: "0",
            visibility: "HIDDEN",
            label: "Library zero case",
          },
        ],
      });
      await edit("admin", sourceTarget(7), {
        title: "Problem 07 — clarified by library",
      });
      expect(
        (await exercise("manager", copyTarget(2))).material!
          .programmingExercise!.description,
      ).toBe(academyP2);
      const preview = await rpc<CourseTree>(
        "manager",
        "academyLibrary/preview",
        { academyId: f.ids.academy, libraryCourseId: masterId },
      );
      expect(
        materials(preview).find((m) => m.id === sources.get(7))!.title,
      ).toBe("Problem 07");
      const before = await updates();
      expect(before.sync!.appliedReleaseNumber).toBe(1);
      expect(before.conflicts).toHaveLength(0);
      await outline(admin, routes.adminLibraryCourse(masterId), "Problem 10");
      await screenshot(
        admin,
        "04-admin-unpublished-corrections.png",
        "Admin working changes: academies still use release 1 until Publish updates",
      );
      await publish(
        "Release 2: P02 different, P05 identical, P02/P03 new tests, P07 title",
        2,
      );
      const state = await settled(2);
      expect(state.conflicts).toHaveLength(1);
      expect(state.conflicts[0]).toMatchObject({
        nodeKey: sources.get(2),
        unitKey: "exercise.description",
        kind: "CONCURRENT_EDIT",
      });
      observations.release2Updates = state;
      observations.release2AcademyTree = await copyTree();
      const p2 = (await exercise("manager", copyTarget(2))).material!
        .programmingExercise!;
      const p5 = (await exercise("manager", copyTarget(5))).material!
        .programmingExercise!;
      expect(p2.description).toBe(academyP2);
      expect(p2.testCases).toHaveLength(2);
      expect(
        p2.testCases.some((c) => c.input === "-2" && c.expectedOutput === "-4"),
      ).toBe(true);
      expect(p5.description).toBe(sameP5);
      expect(state.conflicts.some((c) => c.nodeKey === sources.get(5))).toBe(
        false,
      );
      expect(
        (await exercise("manager", copyTarget(3))).material!
          .programmingExercise!.testCases,
      ).toHaveLength(2);
      const tree = await copyTree();
      expect(materials(tree)).toHaveLength(12);
      expect(materials(tree).find((m) => m.id === copies.get(7))!.title).toBe(
        "Problem 07 — clarified by library",
      );
      for (const n of [11, 12])
        expect(
          materials(tree).find((m) => m.id === copies.get(n)),
        ).toMatchObject({ title: draft(n).title, isVisible: true });
      const panel = await compare(2);
      await screenshot(
        manager,
        "05-problem-two-conflict.png",
        "Problem 02: different instructions preserve the academy version and raise one conflict",
        panel,
      );
      checks.push({
        scenario: "Unpublished drafts",
        result:
          "PASS — no academy update before publishing; preview remained on release 1.",
      });
      checks.push({
        scenario: "Problem 02: both sides changed instructions differently",
        result:
          "PASS — academy wording preserved; exactly one CONCURRENT_EDIT decision with base/academy/library versions.",
      });
      checks.push({
        scenario: "Problem 05: both sides made exactly the same change",
        result:
          "PASS — converged automatically, identical wording retained, no conflict.",
      });
      checks.push({
        scenario: "Independent changes while problem 02 conflicts",
        result:
          "PASS — P02 negative test and P03 zero test applied; P07 title synced; both academy-only problems and their IDs survived.",
      });
      await outline(
        manager,
        routes.academyCourse(f.slug, copyId),
        "Problem 12 — academy only",
      );
      await manager
        .getByRole("button", {
          name: "Actions for Problem “Problem 05”",
          exact: true,
        })
        .click();
      await manager
        .getByRole("menuitem", { name: "Edit", exact: true })
        .click();
      await expect(
        manager.getByText(
          "Read one integer and print twice its value. Example: 5 becomes 10.",
          { exact: true },
        ),
      ).toBeVisible();
      await screenshot(
        manager,
        "06-problem-five-converged.png",
        "Problem 05: academy editor contains the identical shared instructions, with no conflict",
        manager.locator("section").filter({
          has: manager.getByText("Basic information", { exact: true }),
        }),
      );
    });
    await test.step("A later release retains the original conflict base; keep academy closes it", async () => {
      const original = (await updates()).conflicts[0]!;
      const first = await rpc<LibrarySyncConflictDetail>(
        "manager",
        "academyLibrarySync/conflict",
        { academyId: f.ids.academy, conflictId: original.id },
      );
      await edit("admin", sourceTarget(2), { description: finalP2 });
      await publish(
        "Release 3: another P02 correction while academy decision remains open",
        3,
      );
      await settled(3);
      const second = await rpc<LibrarySyncConflictDetail>(
        "manager",
        "academyLibrarySync/conflict",
        { academyId: f.ids.academy, conflictId: original.id },
      );
      expect(second.base).toEqual(first.base);
      expect(second.ours.value).toBe(academyP2);
      expect(second.theirs.value).toBe(finalP2);
      const panel = await compare(2);
      await screenshot(
        manager,
        "07-conflict-survives-next-release.png",
        "Release 3: original shared base retained while the incoming library wording advances",
        panel,
      );
      await manager
        .getByRole("button", { name: "Keep academy version", exact: true })
        .click();
      await expect(manager).toHaveURL(routes.academyLearnCourse(f.slug, copyId));
      expect(
        (await exercise("manager", copyTarget(2))).material!
          .programmingExercise!.description,
      ).toBe(academyP2);
      checks.push({
        scenario: "Unresolved conflict across another release",
        result:
          "PASS — same conflict and original base retained; new library wording refreshed without overwriting academy wording.",
      });
      checks.push({
        scenario: "Keep academy version",
        result:
          "PASS — browser decision preserved P02 wording and cleared the conflict.",
      });
    });
    await test.step("New upstream material and untouched removal retain academy additions and the kept decision", async () => {
      const created = await rpc<ExerciseAuthoringContext>(
        "admin",
        "academyCourses/createExercise",
        {
          academyId: f.ids.library,
          courseId: masterId,
          lectureId: sourceLecture,
          ...draft(13),
        },
      );
      sources.set(13, created.material!.id);
      await rpc("admin", "academyCourses/deleteExercise", sourceTarget(10));
      await publish(
        "Release 4: add P13, remove untouched P10; preserve academy P02 and local P11/P12",
        4,
      );
      const state = await settled(4);
      expect(state.conflicts).toHaveLength(0);
      const tree = await copyTree();
      expect(materials(tree)).toHaveLength(13);
      expect(materials(tree).filter((m) => m.isVisible)).toHaveLength(12);
      expect(
        materials(tree).find((m) => m.id === copies.get(10)),
      ).toMatchObject({ title: "Problem 10", isVisible: false });
      expect(materials(tree).some((m) => m.title === "Problem 13")).toBe(true);
      for (const n of [11, 12])
        expect(
          materials(tree).find((m) => m.id === copies.get(n)),
        ).toMatchObject({ title: draft(n).title, isVisible: true });
      expect(
        (await exercise("manager", copyTarget(2))).material!
          .programmingExercise!.description,
      ).toBe(academyP2);
      observations.release4AcademyTree = tree;
      await outline(
        manager,
        routes.academyCourse(f.slug, copyId),
        "Problem 13",
      );
      await screenshot(
        manager,
        "08-addition-and-archival.png",
        "Release 4: new P13 added, P10 archived, academy P11/P12 retained, no repeated P02 conflict",
      );
      checks.push({
        scenario: "New library problem and upstream removal",
        result:
          "PASS — P13 added, untouched P10 archived/hidden with original row retained; academy P11/P12 preserved. 13 stored rows, 12 visible.",
      });
      checks.push({
        scenario: "No repeated conflict after keep",
        result:
          "PASS — later release did not reopen the acknowledged P02 instructions decision.",
      });
    });
    await test.step("Use admin version resolves a different real conflict", async () => {
      await edit("manager", copyTarget(4), {
        description: "<p>Academy problem 04 wording to compare.</p>",
      });
      await edit("admin", sourceTarget(4), {
        description: "<p>Library problem 04 corrected wording to accept.</p>",
      });
      await publish(
        "Release 5: P04 different edits; academy chooses library",
        5,
      );
      await settled(5);
      const panel = await compare(4);
      await screenshot(
        manager,
        "09-use-library-before.png",
        "Problem 04: a second conflict, before choosing Use admin version",
        panel,
      );
      await manager
        .getByRole("button", { name: "Use admin version", exact: true })
        .click();
      await expect(manager).toHaveURL(routes.academyLearnCourse(f.slug, copyId));
      expect(
        (await exercise("manager", copyTarget(4))).material!
          .programmingExercise!.description,
      ).toBe("<p>Library problem 04 corrected wording to accept.</p>");
      checks.push({
        scenario: "Use admin version",
        result:
          "PASS — browser decision applied the library's P04 wording and cleared its conflict.",
      });
    });
    await test.step("Keeping academy wording resolves another conflict and the final course stays consistent", async () => {
      await edit("manager", copyTarget(9), {
        description: "<p>Academy P09: explain with a classroom example.</p>",
      });
      await edit("admin", sourceTarget(9), {
        description:
          "<p>Library P09: explicitly cover zero and negative inputs.</p>",
      });
      await publish(
        "Release 6: P09 differing edits; academy manually combines both",
        6,
      );
      await settled(6);
      const panel = await compare(9);
      await screenshot(
        manager,
        "10-manual-merge-before.png",
        "Problem 09: third conflict, before manually combining both versions",
        panel,
      );
      const merged = '<p>Academy P09: explain with a classroom example.</p>';
      await manager.getByRole('button', { name: 'Keep academy version', exact: true }).click();
      await expect(manager).toHaveURL(routes.academyLearnCourse(f.slug, copyId));
      const final = await copyTree();
      expect(materials(final)).toHaveLength(13);
      expect(
        (await exercise("manager", copyTarget(9))).material!
          .programmingExercise!.description,
      ).toBe(merged);
      expect(
        (await exercise("manager", copyTarget(2))).material!
          .programmingExercise!.description,
      ).toBe(academyP2);
      expect(
        (await exercise("manager", copyTarget(5))).material!
          .programmingExercise!.description,
      ).toBe(sameP5);
      expect((await updates()).conflicts).toHaveLength(0);
      await manager.reload();
      await expect(manager).toHaveURL(routes.academyLearnCourse(f.slug, copyId));
      await screenshot(
        manager,
        "11-final-no-decisions.png",
        "Release 6 after reload: all decisions resolved, academy customizations preserved",
      );
      await expect(manager.getByRole('tab', { name: 'History', exact: true })).toHaveCount(0);
      await admin.goto(routes.adminLibraryCourse(masterId));
      await expect(admin.getByText('Release history', { exact: true })).toHaveCount(0);
      await screenshot(admin, '12-admin-batch-publish.png', 'One batch publish control, without release notes or history');
      observations.finalAcademyTree = final;
      observations.finalUpdates = await updates();
      checks.push({
        scenario: "Keep academy version",
        result:
          "PASS — browser kept the academy’s P09 instructions and survived a reload.",
      });
      checks.push({
        scenario: "Final integrity",
        result:
          "PASS — no open decisions; kept P02, converged P05, accepted P04, manually merged P09, retained P11/P12, retained archived P10, adopted P13.",
      });
      expect(consoleErrors).toEqual([]);
    });
    await rm(resolve(artifacts, "failure.png"), { force: true });
    await saveReport("PASSED");
  } catch (error) {
    await screenshot(manager, "failure.png", "Browser state at failure").catch(
      () => {},
    );
    await saveReport("FAILED", String(error));
    throw error;
  } finally {
    await managerContext.close();
  }
});
