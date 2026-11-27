import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../academies/audit.service.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { SupportGrantResolver } from "../authorization/support-grant.resolver.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { CurriculumOutlineService } from "../learn/curriculum-outline.service.js";
import { LearnService } from "../learn/learn.service.js";
import { LearningClassContextService } from "../learn/learning-class-context.service.js";
import { AiMaintenanceService } from "./ai-maintenance.service.js";
import { FakeModelClient } from "./ai-model.js";
import { AiUsageService } from "./ai-usage.service.js";
import { AiLibraryService } from "./library/library.service.js";
import { createAiFixture, type AiFixture } from "./testing/ai-fixture.js";

/** Staff, operators, cleanup and the hint bank, against PostgreSQL. */
const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;

describe.skipIf(!databaseUrl)("AI library for staff, operators and readers", () => {
  let f: AiFixture;
  let library: AiLibraryService;
  let access: AcademyAccessService;
  const manager = () => f.identity(f.auth.manager);
  const code = (promise: Promise<unknown>) => promise.then(() => "ok", (error: { code?: string }) => error.code ?? String(error));
  const input = (materialId: string) => ({ academyId: f.ids.academy, courseId: f.ids.course, materialId });

  const withLibrary = async (over: Record<string, unknown> = {}) => {
    const materialId = await f.createExercise(over);
    await f.prisma.aiLibrary.create({
      data: { materialId, contentDigest: materialId, gradingRevision: 1, state: "READY", comparedAt: new Date(), correctPrograms: [{ approach: "max", code: "MAX" }] },
    });
    for (const [index, kind] of (["HINT", "HINT", "HINT", "FEEDBACK"] as const).entries()) {
      await f.prisma.aiLibraryItem.create({
        data: {
          materialId, kind, position: index + 1, label: kind === "HINT" ? "" : "Smaller", textKo: `힌트 ${index + 1}`, textEn: `Hint ${index + 1}`,
          state: "ACTIVE", ...(kind === "FEEDBACK" ? { wrongProgram: "WRONG" } : {}),
        },
      });
    }
    return materialId;
  };
  const failure = async (materialId: string, userId: string, over: Record<string, unknown> = {}) => f.prisma.submission.create({
    data: {
      userId, materialId, sourceMaterialId: materialId, courseId: f.ids.course, classId: f.ids.klass, gradingRevision: 1, language: "PYTHON", timeLimitMs: 1,
      memoryLimitMb: 1, code: "x", totalCount: 1, engineVersion: "x", status: "FAILED", problemTitle: "t", courseTitle: "t", moduleTitle: "t", lectureTitle: "t",
      modulePosition: 1, lecturePosition: 1, problemPosition: 1, ...over,
    } as never,
  });

  beforeAll(async () => {
    f = await createAiFixture(databaseUrl!);
    access = new AcademyAccessService(f.prisma, new SupportGrantResolver(f.prisma));
    library = new AiLibraryService(f.prisma, access, f.config, new AuditService());
  }, 180_000);
  afterAll(async () => { await f?.close(); });

  it("shows staff the whole library, and no student any of it", async () => {
    const materialId = await withLibrary();
    const view = await library.get(manager(), input(materialId));
    expect(view).toMatchObject({ enabled: true, state: "READY", current: true, correctPrograms: [{ approach: "max", code: "MAX" }] });
    expect(view.items.map((item) => item.kind)).toEqual(["HINT", "HINT", "HINT", "FEEDBACK"]);
    expect(view.items[3]!.wrongProgram).toBe("WRONG");
    expect(await code(library.get(f.identity(f.auth.student), input(materialId)))).not.toBe("ok");
    expect(await code(library.get(manager(), { ...input(materialId), academyId: randomUUID() }))).not.toBe("ok");
    expect(await code(library.get(manager(), { ...input(materialId), courseId: randomUUID() }))).toBe("EXERCISE_NOT_FOUND");
    expect((await library.get(manager(), input(await f.createExercise()))).state).toBe("NONE");
  });

  it("lets staff edit, hide and restore, one editor at a time, with a record", async () => {
    const materialId = await withLibrary();
    const item = (await library.get(manager(), input(materialId))).items[0]!;
    const edit = (over: object) => library.updateItem(manager(), { ...input(materialId), itemId: item.id, expectedVersion: 1, ...over });
    const after = (await edit({ textEn: "Better words." })).items.find((row) => row.id === item.id)!;
    expect(after).toMatchObject({ textEn: "Better words.", textKo: item.textKo, origin: "STAFF", version: 2 });
    expect(await code(edit({ textEn: "Lost update." }))).toBe("CONTENT_EDIT_CONFLICT");
    await f.prisma.aiLibraryReport.create({ data: { itemId: item.id, userId: f.ids.student } });
    expect((await edit({ state: "HIDDEN", expectedVersion: 2 })).items.find((row) => row.id === item.id)).toMatchObject({ state: "HIDDEN", reports: 1 });
    expect((await edit({ state: "ACTIVE", expectedVersion: 3 })).items.find((row) => row.id === item.id)).toMatchObject({ state: "ACTIVE", reports: 0 });
    expect(await f.prisma.auditLog.count({ where: { targetId: item.id, action: "ai.library_item.updated" } })).toBe(3);
    expect(await code(library.updateItem(f.identity(f.auth.student), { ...input(materialId), itemId: item.id, expectedVersion: 4, state: "HIDDEN" }))).not.toBe("ok");
    const other = await withLibrary();
    expect(await code(library.updateItem(manager(), { ...input(other), itemId: item.id, expectedVersion: 4, state: "HIDDEN" }))).toBe("EXERCISE_NOT_FOUND");
  });

  it("writes again when asked, once", async () => {
    const materialId = await withLibrary();
    expect((await library.regenerate(manager(), input(materialId))).state).toBe("WAITING");
    await f.prisma.aiLibrary.update({ where: { materialId }, data: { state: "CHECKING" } });
    expect((await library.regenerate(manager(), input(materialId))).state).toBe("CHECKING");
  });

  it("counts common mistakes from what is already saved", async () => {
    const materialId = await withLibrary();
    const [feedback] = await f.prisma.aiLibraryItem.findMany({ where: { materialId, kind: "FEEDBACK" } });
    for (const userId of [f.ids.student, f.ids.student, f.ids.other]) {
      const row = await failure(materialId, userId);
      await f.prisma.submissionCase.create({ data: { submissionId: row.id, position: 1, isSample: true, outcome: "RUNTIME_ERROR", pythonErrorType: "NameError", pythonErrorMessage: "m", pythonErrorLine: 1 } });
      await f.prisma.aiHelpReply.create({
        data: {
          requestId: randomUUID(), userId, academyId: f.ids.academy, submissionId: row.id, materialId, gradingRevision: 1, level: 1, locale: "ko", status: "DONE", reply: "가",
          promptVersion: "v2", libraryItemId: userId === f.ids.other ? null : feedback!.id,
        },
      });
    }
    await failure(materialId, f.ids.other, { status: "PASSED" });
    await failure(materialId, f.ids.other, { createdAt: new Date(Date.now() - 40 * 86_400_000) });
    expect((await library.get(manager(), input(materialId))).mistakes).toEqual({
      failures: 3, students: 2, pythonErrors: [{ type: "NameError", count: 3, students: 2 }],
      library: [{ itemId: feedback!.id, count: 2, students: 1 }], unmatched: 1,
    });
  });

  describe("the hint bank", () => {
    it("teaches the AI teacher and never reaches a student's statement", async () => {
      const materialId = await withLibrary();
      const build = (config: unknown) => new LearnService(f.prisma, {} as never, access, new CurriculumOutlineService(f.prisma), {} as never,
        new LearningClassContextService(f.prisma), undefined, undefined, config as never);
      const open = (config: unknown) => build(config).getExerciseWorkspace(f.identity(f.auth.student), { academyId: f.ids.academy, materialId, classId: f.ids.klass });
      const on = await open(f.config);
      // The switch reaches the workspace in its one statement; no AI text does.
      expect(on.exercise.aiAssistant).toBe(true);
      expect(on.exercise.hints).toEqual([]);
      expect(JSON.stringify(on)).not.toMatch(/Hint 1|힌트 1|WRONG|MAX|SOLUTION_SENTINEL|333444/);
      const off = await open(undefined);
      expect([off.exercise.aiAssistant, off.exercise.hints]).toEqual([false, []]);
      // What a teacher wrote is shown as it always was.
      await f.prisma.exerciseHint.create({ data: { exerciseMaterialId: materialId, position: 1, content: "Teacher" } });
      expect((await open(f.config)).exercise.hints).toEqual([{ position: 1, content: "Teacher" }]);
    });
  });

  it("opens a student's workspace with their own answers, oldest first, in one more statement", async () => {
    const materialId = await withLibrary();
    const submitted = await failure(materialId, f.ids.student, { code: "n = int(input())\n  total = n - 1\t\nprint(total)" });
    const check = await f.prisma.aiHelpCheck.create({
      data: { userId: f.ids.student, academyId: f.ids.academy, classId: f.ids.klass, materialId, gradingRevision: 1, source: "RUN", code: "print(1)\nprint(2)", codeHash: "h", snapshot: {}, status: "PASSED" },
    });
    const at = (minute: number) => new Date(Date.UTC(2026, 10, 27, 1, minute));
    const analysis = (line: number | null) => ({ result: "R", line, why: "The **loop** stops.", think: "T?", tryIt: null, alsoCheck: null });
    const reply = (over: Record<string, unknown>) => f.prisma.aiHelpReply.create({
      data: {
        requestId: randomUUID(), userId: f.ids.student, academyId: f.ids.academy, classId: f.ids.klass, submissionId: submitted.id, materialId, gradingRevision: 1,
        level: 1, locale: "en", status: "DONE", reply: "R", analysis: analysis(2), promptVersion: "v6", source: "SUBMIT", ...over,
      } as never,
    });
    const first = await reply({ createdAt: at(1) });
    const simpler = await reply({ level: 2, analysis: analysis(null), createdAt: at(2) });
    const fromRun = await reply({ submissionId: null, checkId: check.id, source: "RUN", analysis: analysis(2), createdAt: at(3) });
    // Not this student's, not finished, or another problem's: never listed.
    await reply({ userId: f.ids.other, requestId: randomUUID(), createdAt: at(4) });
    await reply({ status: "FAILED", reply: null, analysis: null, createdAt: at(5) });
    const elsewhere = await withLibrary();
    await reply({ materialId: elsewhere, createdAt: at(6) });

    const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }), log: [{ emit: "event", level: "query" }] });
    let statements = 0;
    client.$on("query", () => { statements += 1; });
    try {
      const counted = (config: unknown) => new LearnService(client as never, {} as never, new AcademyAccessService(client as never, new SupportGrantResolver(client as never)),
        new CurriculumOutlineService(client as never), {} as never, new LearningClassContextService(client as never), undefined, undefined, config as never);
      const open = async (config: unknown) => {
        statements = 0;
        const workspace = await counted(config).getExerciseWorkspace(f.identity(f.auth.student), { academyId: f.ids.academy, materialId, classId: f.ids.klass });
        return { workspace, statements };
      };
      const on = await open(f.config);
      const off = await open(undefined);
      expect(on.statements - off.statements).toBe(1);
      expect(off.workspace.aiHelpHistory).toBeUndefined();
      expect(on.workspace.aiHelpHistory!.map((item) => [item.id, item.level, item.source, item.subjectId, item.quoted])).toEqual([
        [first.id, 1, "SUBMIT", submitted.id, "total = n - 1"],
        [simpler.id, 2, "SUBMIT", submitted.id, null],
        [fromRun.id, 1, "RUN", check.id, "print(2)"],
      ]);
      expect(on.workspace.aiHelpHistory![0]).toMatchObject({ text: "R", reported: false, createdAt: at(1).toISOString(), analysis: { why: "The **loop** stops." } });
    } finally {
      await client.$disconnect();
    }
  }, 60_000);

  it("removes what is past its time and keeps the rest", async () => {
    const materialId = await withLibrary();
    const old = new Date(Date.now() - 200 * 86_400_000);
    const row = await failure(materialId, f.ids.student);
    const reply = (createdAt: Date) => f.prisma.aiHelpReply.create({
      data: { requestId: randomUUID(), userId: f.ids.student, academyId: f.ids.academy, submissionId: row.id, materialId, gradingRevision: 1, level: 1, locale: "ko", status: "DONE", reply: "가", promptVersion: "v2", createdAt },
    });
    await reply(old);
    const kept = await reply(new Date());
    await f.prisma.aiLibraryCheck.create({ data: { materialId, role: "WRONG", code: "x", snapshot: {}, status: "FAILED", finishedAt: old } });
    const rejected = await f.prisma.aiLibraryItem.create({ data: { materialId, kind: "HINT", position: 9, textKo: "가", textEn: "a", state: "REJECTED" } });
    await f.prisma.$executeRaw`UPDATE ai_library_items SET updated_at = ${old} WHERE id = ${rejected.id}::uuid`;
    const done = await new AiMaintenanceService(f.prisma, f.config).run();
    expect(done.replies).toBeGreaterThanOrEqual(1);
    expect(await f.prisma.aiHelpReply.findMany({ where: { submissionId: row.id }, select: { id: true } })).toEqual([{ id: kept.id }]);
    expect(await f.prisma.aiLibraryCheck.count({ where: { materialId } })).toBe(0);
    expect(await f.prisma.aiLibraryItem.count({ where: { id: rejected.id } })).toBe(0);
    expect(await f.prisma.aiLibraryItem.count({ where: { materialId, state: "ACTIVE" } })).toBe(4);
  });

  it("gives a campus manager their campus's counts and cost, and nobody else anything", async () => {
    const usage = new AiUsageService(f.prisma, access, f.config, new FakeModelClient(() => ({})));
    const input = { academyId: f.ids.academy };
    expect(await code(usage.academy(f.identity(f.auth.student), input))).not.toBe("ok");
    const materialId = await withLibrary();
    const row = await failure(materialId, f.ids.student);
    await f.prisma.aiHelpReply.create({
      data: {
        requestId: randomUUID(), userId: f.ids.student, academyId: f.ids.academy, submissionId: row.id, materialId, gradingRevision: 1, level: 1,
        locale: "ko", status: "DONE", reply: "SECRETNAME 가", promptVersion: "v6", costMicros: 1_500, latencyMs: 900,
      },
    });
    const view = await usage.academy(manager(), input);
    expect(view).toMatchObject({ enabled: { campus: true, help: true, library: true, model: "fake" }, problemLimit: 3, dailyLimit: 10, helpBudgetUsd: 5 });
    expect(view.last7Days.replies).toBeGreaterThanOrEqual(1);
    const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(new Date());
    expect(view.months[0]).toMatchObject({ month });
    expect(view.months[0]!.costUsd).toBeGreaterThanOrEqual(0.0015);
    expect(view.courses.find((course) => course.courseId === f.ids.course)).toMatchObject({ title: "Course" });
    expect(view.courses.find((course) => course.courseId === f.ids.course)!.replies).toBeGreaterThanOrEqual(1);
    expect(view.libraries.find((library) => library.state === "READY")!.count).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(view)).not.toMatch(/SECRETNAME|가/);
  });
});
