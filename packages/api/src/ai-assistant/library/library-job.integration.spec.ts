import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AiModelError, FakeModelClient, type AiModelRequest } from "../ai-model.js";
import { usageMonth } from "../usage.js";
import { createAiFixture, type AiFixture } from "../testing/ai-fixture.js";
import { AiLibraryJobService } from "./library-job.service.js";

/**
 * The library's whole life against PostgreSQL with every migration, the real
 * grader over a table-driven engine, and a fake model. Opt-in:
 *
 *   COVE_INTEGRATION_DATABASE_URL=postgresql://… npx vitest run src/ai-assistant
 */
const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;

const hints = [1, 2, 3, 4, 5].map((n) => ({ ko: `힌트 ${n}번이에요. 두 수를 비교해 볼까요?`, en: `Hint number ${n}. How can you compare the two numbers?` }));
const mistake = (n: number, program: string) => ({
  label: `Mistake ${n}`, wrongProgram: program, ko: `실수 ${n}번이에요. 어떤 수를 출력하나요?`, en: `Mistake number ${n}. Which number do you print?`,
});
const good = () => ({
  hints: structuredClone(hints),
  mistakes: ["FIRST", "SECOND", "SMALLER", "SUM", "ZERO", "ALWAYS9", "CRASH"].map((program, index) => mistake(index + 1, program)),
  correctPrograms: [{ approach: "if", code: "IF_OK" }, { approach: "max", code: "MAX_OK" }, { approach: "sort", code: "SORT_BAD" }],
});

describe.skipIf(!databaseUrl)("AI libraries, end to end", () => {
  let f: AiFixture;
  let write: () => unknown;
  let review: (request: AiModelRequest) => unknown;
  let grow: () => unknown;
  let model: FakeModelClient;
  let jobs: AiLibraryJobService;

  const ids = (request: AiModelRequest) => [...request.content.matchAll(/ITEM (\w+) /g)].map((m) => m[1]!);
  const approve = (request: AiModelRequest) => ({ reviews: ids(request).map((id) => ({ id, ok: true, reason: "" })) });
  const library = (materialId: string) => f.prisma.aiLibrary.findUniqueOrThrow({ where: { materialId } });
  const items = (materialId: string, state = "ACTIVE") =>
    f.prisma.aiLibraryItem.findMany({ where: { materialId, state: state as never }, orderBy: [{ kind: "asc" }, { position: "asc" }] });
  /** Write, run every check, judge, review. */
  const cycle = async () => { await jobs.pass(); await f.runChecks(); await jobs.pass(); };
  const due = (materialId: string) => f.prisma.aiLibrary.update({ where: { materialId }, data: { nextAttemptAt: new Date(0) } });

  beforeAll(async () => {
    f = await createAiFixture(databaseUrl!);
    const { programs } = f.engine;
    const n = f.numbers;
    programs.set("IF_OK", (s) => String(Math.max(...n(s))));
    programs.set("MAX_OK", (s) => `${Math.max(...n(s))}\n`);
    programs.set("SORT_BAD", (s) => String(Math.min(...n(s))));
    programs.set("FIRST", (s) => String(n(s)[0]));
    programs.set("SECOND", (s) => String(n(s)[1]));
    programs.set("SMALLER", (s) => String(Math.min(...n(s))));
    programs.set("SUM", (s) => String(n(s)[0] + n(s)[1]));
    programs.set("ZERO", () => "0");
    programs.set("ALWAYS9", () => "9");
    programs.set("PASSES", (s) => String(Math.max(...n(s))));
  }, 180_000);
  afterAll(async () => { await f?.close(); });

  beforeEach(async () => {
    // Earlier cases' problems must not compete for a pass. Hiding them would
    // not do: a hidden problem is learned too (the campus courses design, §5).
    await f.prisma.programmingExercise.updateMany({ where: { material: { lectureId: f.ids.lecture } }, data: { aiFeedbackEnabled: false } });
    await f.prisma.course.update({ where: { id: f.ids.course }, data: { aiTeacherEnabled: true } });
    await f.prisma.aiLibrary.deleteMany({ where: { exercise: { material: { lectureId: f.ids.lecture } } } });
    await f.prisma.aiLibraryCheck.deleteMany({});
    await f.prisma.aiUsageMonth.deleteMany({});
    f.enqueued.length = 0;
    write = good;
    review = approve;
    grow = () => ({ mistakes: [] });
    model = new FakeModelClient((request) => request.schema.name === "library" ? write() : request.schema.name === "grow" ? grow() : review(request));
    jobs = new AiLibraryJobService(f.prisma, f.config, model, f.queue);
  });

  it("writes, tests and publishes a library with no teacher work, and no student record", async () => {
    const materialId = await f.createExercise();
    const before = await Promise.all([f.prisma.submission.count(), f.prisma.studentExerciseProgress.count(), f.prisma.staffPracticeAttempt.count()]);
    await jobs.pass();
    expect((await library(materialId)).state).toBe("CHECKING");
    expect(f.enqueued).toHaveLength(1 + 3 + 7);
    expect(await items(materialId)).toEqual([]);
    await f.runChecks();
    await jobs.pass();

    const done = await library(materialId);
    expect(done).toMatchObject({ state: "READY", gradingRevision: 1, lastErrorCode: null, leaseId: null });
    expect((done.correctPrograms as { code: string }[]).map((item) => item.code).sort()).toEqual(["IF_OK", "MAX_OK"]);
    const active = await items(materialId);
    expect(active.filter((item) => item.kind === "HINT").map((item) => item.position)).toEqual([1, 2, 3, 4, 5]);
    // Seven distinct wrong programs; the first five are kept.
    expect(active.filter((item) => item.kind === "FEEDBACK").map((item) => item.label)).toEqual(["Mistake 1", "Mistake 2", "Mistake 3", "Mistake 4", "Mistake 5"]);
    expect((await items(materialId, "REJECTED")).map((item) => item.rejectReason)).toEqual(["EXTRA", "EXTRA"]);
    // Only public outputs, and only of cases that produced one.
    expect(active.find((item) => item.label === "Mistake 1")!.publicOutputs).toEqual({ 1: "2", 2: "9" });
    // Which tests each wrong program fails, hidden ones too, for recognising a student's mistake on the server.
    expect(active.filter((item) => item.kind === "FEEDBACK").map((item) => [item.label, item.fingerprint])).toEqual([
      ["Mistake 1", "FPFP"], ["Mistake 2", "PFPF"], ["Mistake 3", "FFFF"], ["Mistake 4", "FFFF"], ["Mistake 5", "FFFF"],
    ]);
    expect(active.filter((item) => item.kind === "HINT").every((item) => item.fingerprint === null)).toBe(true);
    expect(await Promise.all([f.prisma.submission.count(), f.prisma.studentExerciseProgress.count(), f.prisma.staffPracticeAttempt.count()])).toEqual(before);
    expect(model.requests).toHaveLength(2);
    const month = await f.prisma.aiUsageMonth.findFirstOrThrow({ where: { kind: "LIBRARY" } });
    expect(month).toMatchObject({ requests: 2, inputTokens: 200n });
  });

  it("keeps at most five libraries waiting in the grader", async () => {
    const created = await Promise.all([1, 2, 3, 4, 5, 6, 7].map(() => f.createExercise()));
    await jobs.pass();
    const states = await f.prisma.aiLibrary.findMany({ where: { materialId: { in: created } }, select: { state: true } });
    expect(states.filter((row) => row.state === "CHECKING")).toHaveLength(5);
    expect(states.filter((row) => row.state === "WAITING")).toHaveLength(2);
    await f.runChecks();
    await jobs.pass();
    // The next pass takes the rest; the same content is copied, not tested again.
    expect(await f.prisma.aiLibrary.count({ where: { materialId: { in: created }, state: "READY" } })).toBe(7);
    expect(await f.prisma.aiLibraryItem.count({ where: { materialId: { in: created }, origin: "COPY" } })).toBeGreaterThan(0);
  });

  it("writes and reviews five libraries at the same time, and says while work is under way", async () => {
    const created = await Promise.all([1, 2, 3, 4, 5].map(() => f.createExercise()));
    let active = 0;
    let most = 0;
    const slow = new FakeModelClient(async (request) => {
      active += 1;
      most = Math.max(most, active);
      await new Promise((resolve) => setTimeout(resolve, 50));
      active -= 1;
      return request.schema.name === "library" ? write() : approve(request);
    });
    const parallel = new AiLibraryJobService(f.prisma, f.config, slow, f.queue);
    expect(await parallel.pass()).toBe(true);
    expect(most).toBe(5);
    await f.runChecks();
    most = 0;
    expect(await parallel.pass()).toBe(true);
    expect(most).toBe(5);
    expect(await f.prisma.aiLibrary.count({ where: { materialId: { in: created }, state: "READY" } })).toBe(5);
    expect(await parallel.pass()).toBe(false);
  });

  it("sends the teacher's solution while writing, and never a hidden test or a person", async () => {
    await f.createExercise();
    await cycle();
    const [writing, reviewing] = model.requests;
    expect(writing!.content).toContain("SOLUTION_SENTINEL");
    expect(reviewing!.content).not.toContain("SOLUTION_SENTINEL");
    for (const request of model.requests) expect(request.content + request.instructions).not.toMatch(/111222|333444|SECRETNAME/);
  });

  it("keeps the teacher's solution home when that is switched off", async () => {
    const quiet = await createAiFixture(databaseUrl!, { AI_LIBRARY_SEND_SOLUTIONS: false }, { alone: false });
    try {
      await quiet.createExercise();
      await new AiLibraryJobService(quiet.prisma, quiet.config, model, quiet.queue).pass();
      expect(model.requests.filter((r) => r.schema.name === "library").length).toBeGreaterThan(0);
      for (const request of model.requests) expect(request.content).not.toContain("SOLUTION_SENTINEL");
    } finally {
      await quiet.prisma.programmingExercise.updateMany({ where: { material: { lectureId: quiet.ids.lecture } }, data: { aiFeedbackEnabled: false } });
      await quiet.close();
    }
  });

  it("drops a wrong program that passes, a duplicate, an answer in a hint and what review refuses", async () => {
    const materialId = await f.createExercise();
    write = () => {
      const value = good();
      value.hints[0]!.en = "Just print max(a, b).";
      value.mistakes[0] = mistake(1, "PASSES");
      value.mistakes[6] = mistake(7, " SECOND ");
      return value;
    };
    review = (request) => ({ reviews: approve(request).reviews.map((item) => item.id === "F5" ? { ...item, ok: false, reason: "untrue" } : item) });
    await cycle();
    const reasons = Object.fromEntries((await items(materialId, "REJECTED")).map((item) => [item.label || item.textEn, item.rejectReason]));
    expect(reasons).toMatchObject({ "Mistake 1": "WRONG_PASSES", "Just print max(a, b).": "CODE" });
    expect(Object.values(reasons)).toContain("REVIEW: untrue");
    expect(await f.prisma.aiLibraryItem.count({ where: { materialId, label: "Mistake 7" } })).toBe(0);
    expect((await library(materialId)).state).toBe("READY");
    expect((await items(materialId)).some((item) => item.rejectReason)).toBe(false);
  });

  it("tells staff when the teacher's own solution fails, and asks nothing more", async () => {
    f.engine.programs.set("BAD_SOLUTION", () => "1");
    const materialId = await f.createExercise({}, "BAD_SOLUTION");
    await cycle();
    expect(await library(materialId)).toMatchObject({ state: "FAILED", lastErrorCode: "SOLUTION_FAILS" });
    expect(await f.prisma.aiLibraryItem.count({ where: { materialId } })).toBe(0);
    await cycle();
    expect(model.requests).toHaveLength(1);
  });

  it("without a solution, trusts the tests only when two different programs agree", async () => {
    const materialId = await f.createExercise({}, null);
    write = () => ({ ...good(), correctPrograms: [{ approach: "if", code: "IF_OK" }, { approach: "copy", code: "IF_OK " }] });
    f.engine.programs.set("IF_OK ", (s) => String(Math.max(...f.numbers(s))));
    await cycle();
    expect(await library(materialId)).toMatchObject({ state: "WAITING", lastErrorCode: "NO_CORRECT" });
    write = good;
    await due(materialId);
    await cycle();
    expect((await library(materialId)).state).toBe("READY");
  });

  it("gives up after three tries with too few good items", async () => {
    const materialId = await f.createExercise();
    review = () => ({ reviews: [] });
    for (let i = 0; i < 4; i++) { await due(materialId).catch(() => undefined); await cycle(); }
    expect(await library(materialId)).toMatchObject({ state: "FAILED", lastErrorCode: "TOO_FEW", attempts: 3 });
    expect(await items(materialId)).toEqual([]);
  });

  it.each(["TIMEOUT", "PROVIDER", "MALFORMED"] as const)("waits and tries again after %s, counting what it paid", async (code) => {
    const materialId = await f.createExercise();
    write = () => { throw new AiModelError(code, "x", { inputTokens: 1_000, outputTokens: 10 }); };
    await jobs.pass();
    const row = await library(materialId);
    expect(row).toMatchObject({ state: "WAITING", lastErrorCode: code, attempts: 1, leaseId: null });
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 10 * 60_000);
    expect((await f.prisma.aiUsageMonth.findFirstOrThrow()).costMicros).toBe(105n);
  });

  it("stops at the monthly limit and starts again when it lifts", async () => {
    const materialId = await f.createExercise();
    await f.prisma.aiUsageMonth.create({ data: { month: new Date(usageMonth()), kind: "LIBRARY", costMicros: 10_000_000n } });
    await jobs.pass();
    expect(model.requests).toEqual([]);
    expect((await library(materialId)).state).toBe("WAITING");
    await f.prisma.aiUsageMonth.deleteMany({});
    await cycle();
    expect((await library(materialId)).state).toBe("READY");
  });

  it("does nothing outside its hours, or with any switch off", async () => {
    const materialId = await f.createExercise();
    const at = (env: Record<string, unknown>) => {
      const config = Object.create(f.config) as typeof f.config;
      config.get = ((key: string) => key in env ? env[key] : (f.config.get as (k: string) => unknown)(key)) as never;
      return new AiLibraryJobService(f.prisma, config, model, f.queue);
    };
    await at({ AI_LIBRARY_HOURS: "5-5" }).pass();
    await at({ AI_LIBRARY_ENABLED: false }).tick();
    await new AiLibraryJobService(f.prisma, f.config, model).tick();
    expect(await f.prisma.aiLibrary.count({ where: { materialId } })).toBe(0);
    await f.prisma.academyFeatureFlag.updateMany({ where: { academyId: f.ids.academy }, data: { isEnabled: false } });
    await jobs.pass();
    await f.prisma.academyFeatureFlag.updateMany({ where: { academyId: f.ids.academy }, data: { isEnabled: true } });
    await f.prisma.programmingExercise.update({ where: { materialId }, data: { aiFeedbackEnabled: false } });
    await jobs.pass();
    // The course's AI teacher choice is a master switch over the problem's own.
    await f.prisma.programmingExercise.update({ where: { materialId }, data: { aiFeedbackEnabled: true } });
    await f.prisma.course.update({ where: { id: f.ids.course }, data: { aiTeacherEnabled: false } });
    await jobs.pass();
    expect(model.requests).toEqual([]);
    expect(await f.prisma.aiLibrary.count({ where: { materialId } })).toBe(0);
  });

  it("learns a problem students cannot see yet, so its notes are ready before they can", async () => {
    const materialId = await f.createExercise();
    await f.prisma.material.update({ where: { id: materialId }, data: { isVisible: false } });
    await cycle();
    expect((await library(materialId)).state).toBe("READY");
  });

  it.each([
    ["manual review", { submissionPolicy: "MANUAL_REVIEW" }], ["practice only", { submissionPolicy: "PRACTICE_ONLY" }],
    ["a quiz", { quiz: { choices: [] } }], ["C", { language: "C" }],
  ])("skips %s", async (_, over) => {
    await f.createExercise(over);
    await jobs.pass();
    expect(model.requests).toEqual([]);
  });

  it("copies a tested library for the same content with no call", async () => {
    const first = await f.createExercise();
    await cycle();
    const staffed = (await items(first))[0]!;
    await f.prisma.aiLibraryItem.update({ where: { id: staffed.id }, data: { origin: "STAFF", textEn: "Edited by staff." } });
    const calls = model.requests.length;
    const second = await f.createExercise();
    await jobs.pass();
    expect(model.requests).toHaveLength(calls);
    expect((await library(second)).state).toBe("READY");
    const copied = await items(second);
    expect(new Set(copied.map((item) => item.origin))).toEqual(new Set(["COPY"]));
    // A teacher's own words stay in their academy.
    expect(copied.some((item) => item.textEn === "Edited by staff.")).toBe(false);
    expect(copied).toHaveLength((await items(first)).length - 1);
    expect(copied.filter((item) => item.kind === "FEEDBACK").every((item) => /^[PFS]{4}$/.test(item.fingerprint ?? ""))).toBe(true);
  });

  it("writes again when the problem changes, and keeps and re-tests what staff wrote", async () => {
    const materialId = await f.createExercise();
    await cycle();
    const [kept, broken] = (await items(materialId)).filter((item) => item.kind === "FEEDBACK");
    await f.prisma.aiLibraryItem.update({ where: { id: kept!.id }, data: { origin: "STAFF", textEn: "Kept words." } });
    await f.prisma.aiLibraryItem.update({ where: { id: broken!.id }, data: { origin: "STAFF", wrongProgram: "PASSES" } });
    await f.prisma.programmingExercise.update({ where: { materialId }, data: { description: "<p>New words.</p>", gradingRevision: 2 } });
    await cycle();
    const row = await library(materialId);
    expect(row).toMatchObject({ state: "READY", gradingRevision: 2 });
    const active = await items(materialId);
    expect(active.some((item) => item.textEn === "Kept words.")).toBe(true);
    expect((await f.prisma.aiLibraryItem.findUniqueOrThrow({ where: { id: broken!.id } }))).toMatchObject({ state: "HIDDEN", rejectReason: "WRONG_PASSES" });
    expect(active.filter((item) => item.kind === "FEEDBACK" && item.origin === "AI")).toHaveLength(5);
    expect((await items(materialId, "REJECTED")).some((item) => item.rejectReason === "REPLACED")).toBe(true);
  });

  it("keeps the library when only the revision moves", async () => {
    const materialId = await f.createExercise();
    await cycle();
    const calls = model.requests.length;
    await f.prisma.programmingExercise.update({ where: { materialId }, data: { timeLimitMs: 4_000, gradingRevision: 5 } });
    await jobs.pass();
    expect(model.requests).toHaveLength(calls);
    expect(await library(materialId)).toMatchObject({ state: "READY", gradingRevision: 5 });
  });

  it("an edit while the model writes wins: the stale worker commits nothing", async () => {
    const materialId = await f.createExercise();
    let edited = false;
    write = () => good();
    const slow = new FakeModelClient(async (request) => {
      if (request.schema.name === "library" && !edited) {
        edited = true;
        await f.prisma.aiLibrary.update({ where: { materialId }, data: { leaseId: null, leaseUntil: null, state: "WAITING", nextAttemptAt: new Date(Date.now() + 60_000) } });
      }
      return request.schema.name === "library" ? write() : approve(request);
    });
    await new AiLibraryJobService(f.prisma, f.config, slow, f.queue).pass();
    expect(f.enqueued).toEqual([]);
    expect(await library(materialId)).toMatchObject({ state: "WAITING" });
    expect(await f.prisma.aiLibraryItem.count({ where: { materialId } })).toBe(0);
  });

  it("recovers a worker lost while writing, and checks lost in the queue", async () => {
    const materialId = await f.createExercise();
    await jobs.pass();
    f.enqueued.length = 0; // every dispatch was lost
    await f.prisma.aiLibraryCheck.updateMany({ where: { materialId }, data: { createdAt: new Date(Date.now() - 5 * 60_000) } });
    await jobs.pass();
    expect(f.enqueued).toHaveLength(11);
    await f.runChecks();
    await jobs.pass();
    expect((await library(materialId)).state).toBe("READY");

    await f.prisma.aiLibrary.update({ where: { materialId }, data: { state: "WRITING", leaseId: f.ids.academy, leaseUntil: new Date(0) } });
    await cycle();
    expect((await library(materialId)).state).toBe("READY");
  });

  it("learns every new mistake from one unmatched answer, several at a time, without a student's code (the campus courses design, §7)", async () => {
    const materialId = await f.createExercise();
    await cycle();
    const submission = async (userId: string) => (await f.prisma.submission.create({
      data: {
        userId, materialId, sourceMaterialId: materialId, courseId: f.ids.course, classId: f.ids.klass, gradingRevision: 1, language: "PYTHON",
        timeLimitMs: 1, memoryLimitMb: 1, code: "STUDENT_CODE_SENTINEL", totalCount: 1, engineVersion: "x", status: "FAILED",
        problemTitle: "t", courseTitle: "t", moduleTitle: "t", lectureTitle: "t", modulePosition: 1, lecturePosition: 1, problemPosition: 1,
      },
    })).id;
    const unmatched = async (reply: string) => {
      const row = await f.prisma.aiHelpReply.create({
        data: {
          requestId: crypto.randomUUID(), userId: f.ids.student, academyId: f.ids.academy, submissionId: await submission(f.ids.student), materialId, gradingRevision: 1,
          level: 1, locale: "en", status: "DONE", reply, promptVersion: "v5",
        },
      });
      // Finished on the database's clock, as `finishReply` does: the growth
      // compares it with a time the database wrote.
      await f.prisma.$executeRaw`UPDATE ai_help_replies SET completed_at = now() WHERE id = ${row.id}::uuid`;
    };
    // One student, one answer: enough to learn from.
    await unmatched("You took the smallest after sorting.");
    // Two new mistakes and one the library already knows (FIRST is Mistake 1's program).
    grow = () => ({ mistakes: [mistake(8, "SORT_BAD"), mistake(9, "FIRST"), mistake(10, "ALWAYS9 ")] });
    f.engine.programs.set("ALWAYS9 ", () => "9");
    await jobs.pass();
    const request = model.requests.find((item) => item.schema.name === "grow")!;
    expect(request.content).toContain("You took the smallest after sorting.");
    expect(request.content).not.toContain("STUDENT_CODE_SENTINEL");
    await f.runChecks();
    await jobs.pass();
    const grown = (await items(materialId)).filter((item) => item.origin === "GROWN");
    expect(grown.map((item) => item.label).sort()).toEqual(["Mistake 10", "Mistake 8"]);
    expect((await library(materialId)).state).toBe("READY");
    expect((await items(materialId)).filter((item) => item.kind === "FEEDBACK")).toHaveLength(7);

    // Nothing new since: no call. A newer answer is learned from on the next pass.
    await jobs.pass();
    expect(model.requests.filter((item) => item.schema.name === "grow")).toHaveLength(1);
    await unmatched("You printed the sum of both numbers.");
    grow = () => ({ mistakes: [mistake(11, "SUM ")] });
    f.engine.programs.set("SUM ", (s) => String(f.numbers(s)[0] + f.numbers(s)[1]));
    await jobs.pass();
    const second = model.requests.filter((item) => item.schema.name === "grow");
    expect(second).toHaveLength(2);
    // Only the answers since the last growth.
    expect(second[1]!.content).toContain("You printed the sum of both numbers.");
    expect(second[1]!.content).not.toContain("You took the smallest after sorting.");
  });

  it("stops growing a problem at thirty mistakes", async () => {
    const materialId = await f.createExercise();
    await cycle();
    await f.prisma.aiLibraryItem.createMany({
      data: Array.from({ length: 25 }, (_, index) => ({
        materialId, kind: "FEEDBACK" as const, position: 10 + index, label: `Staff ${index}`, textKo: "실수예요.", textEn: "A mistake.", origin: "STAFF" as const, state: "ACTIVE" as const,
      })),
    });
    const submissionId = (await f.prisma.submission.create({
      data: {
        userId: f.ids.student, materialId, sourceMaterialId: materialId, courseId: f.ids.course, classId: f.ids.klass, gradingRevision: 1, language: "PYTHON",
        timeLimitMs: 1, memoryLimitMb: 1, code: "x", totalCount: 1, engineVersion: "x", status: "FAILED",
        problemTitle: "t", courseTitle: "t", moduleTitle: "t", lectureTitle: "t", modulePosition: 1, lecturePosition: 1, problemPosition: 1,
      },
    })).id;
    await f.prisma.aiHelpReply.create({
      data: {
        requestId: crypto.randomUUID(), userId: f.ids.student, academyId: f.ids.academy, submissionId, materialId, gradingRevision: 1,
        level: 1, locale: "en", status: "DONE", reply: "Something new.", promptVersion: "v5", completedAt: new Date(),
      },
    });
    await jobs.pass();
    expect(model.requests.filter((item) => item.schema.name === "grow")).toHaveLength(0);
  });

  it("goes with its exercise", async () => {
    const materialId = await f.createExercise();
    await jobs.pass();
    const [check] = f.enqueued.splice(0);
    await f.prisma.material.delete({ where: { id: materialId } });
    expect(await f.prisma.aiLibraryCheck.count({ where: { materialId } })).toBe(0);
    await f.checks.run(check!);
  });
});
