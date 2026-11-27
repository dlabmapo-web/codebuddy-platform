import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { LearningClassContextService } from "../learn/learning-class-context.service.js";
import { SupportGrantResolver } from "../authorization/support-grant.resolver.js";
import type { PrismaService } from "../database/prisma.service.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { AiHelpService } from "./ai-help.service.js";
import { AiModelError, FakeModelClient, type AiModelRequest } from "./ai-model.js";
import { createAiFixture, type AiFixture } from "./testing/ai-fixture.js";
import { usageMonth } from "./usage.js";

/** The AI teacher's analysis against PostgreSQL with every migration and a fake model. */
const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;
const WRONG = "a = int(input())\nb = int(input())\nprint(min(a, b))";

/** A good analysis: words only, quoting the student's own line. */
const analysis = (over: Record<string, unknown> = {}) => ({
  item: null, result: "With 2 and 5 your program printed 2, not 5.", line: 3,
  why: "`print(min(a, b))` picks the smaller number, but the task asks for the bigger one.",
  think: "Which of the two numbers should be printed? What does your line choose?", tryIt: "Try 1 and 2 on paper.", alsoCheck: null, ...over,
});

describe.skipIf(!databaseUrl)("the AI teacher's analysis", () => {
  let f: AiFixture;
  let answer: (request: AiModelRequest, signal: AbortSignal) => unknown;
  let model: FakeModelClient;
  let help: AiHelpService;

  const service = (over: { env?: Record<string, unknown>; prisma?: PrismaService; queue?: unknown; model?: FakeModelClient } = {}) => {
    const config = Object.create(f.config) as typeof f.config;
    config.get = ((key: string) => over.env && key in over.env ? over.env[key] : (f.config.get as (k: string) => unknown)(key)) as never;
    const prisma = over.prisma ?? f.prisma;
    return new AiHelpService(
      prisma, new AcademyAccessService(prisma, new SupportGrantResolver(prisma)), config, over.model ?? model,
      new LearningClassContextService(prisma), (over.queue ?? f.queue) as never,
    );
  };
  const student = () => f.identity(f.auth.student);
  const other = () => f.identity(f.auth.other);

  /** A graded submission of the fixture's problem, with its frozen cases: 2 examples, then 2 hidden tests. */
  const submit = async (materialId: string, over: Record<string, unknown> = {}, cases?: { outcome: string; output?: string | null; difference?: string; error?: [string, string | null, number] }[]) => {
    const tests = await f.prisma.exerciseTestCase.findMany({ where: { exerciseMaterialId: materialId }, orderBy: { position: "asc" } });
    const results = cases ?? [{ outcome: "WRONG_OUTPUT", output: "2\n", difference: "too_small" }, { outcome: "PASSED", output: "9" }, { outcome: "WRONG_OUTPUT", difference: "too_small" }, { outcome: "SKIPPED" }];
    const row = await f.prisma.submission.create({
      data: {
        userId: f.ids.student, materialId, sourceMaterialId: materialId, courseId: f.ids.course, classId: f.ids.klass, gradingRevision: 1,
        language: "PYTHON", timeLimitMs: 1, memoryLimitMb: 1, code: WRONG, totalCount: 4, engineVersion: "x", status: "FAILED",
        problemTitle: "t", courseTitle: "t", moduleTitle: "t", lectureTitle: "t", modulePosition: 1, lecturePosition: 1, problemPosition: 1,
        ...over,
        gradingCases: { create: tests.map((test, index) => ({ position: index + 1, input: test.input, expectedOutput: test.expectedOutput, isSample: test.visibility === "SAMPLE", comparator: test.comparator })) },
        cases: { create: results.map((item, index) => ({
          // As the grader stores them: a hidden test keeps how its output differs, never the output.
          position: index + 1, isSample: index < 2, outcome: item.outcome as never, actualOutput: index < 2 ? item.output ?? null : null,
          outputDifference: item.difference ?? null,
          ...(item.error ? { pythonErrorType: item.error[0], pythonErrorMessage: item.error[1], pythonErrorLine: item.error[2] } : {}),
        })) },
      } as never,
    });
    return row.id;
  };
  const ask = (submissionId: string, over: Record<string, unknown> = {}, who = student(), from = help) =>
    from.request(who, { academyId: f.ids.academy, submissionId, locale: "en", requestId: randomUUID(), mode: "analyze", ...over } as never);
  const view = (submissionId: string, from = help) => from.get(student(), { academyId: f.ids.academy, submissionId });
  const code = (promise: Promise<unknown>) => promise.then(() => "ok", (error: { code?: string }) => error.code ?? String(error));

  beforeAll(async () => { f = await createAiFixture(databaseUrl!); }, 180_000);
  afterAll(async () => { await f?.close(); });
  beforeEach(async () => {
    await f.prisma.aiHelpReply.deleteMany({ where: { academyId: f.ids.academy } });
    await f.prisma.aiUsageMonth.deleteMany({});
    answer = () => analysis();
    model = new FakeModelClient((request, signal) => answer(request, signal));
    help = service();
  });

  it("analyzes a failed submission once, records it, counts it, and shows it again for free", async () => {
    const id = await submit(await f.createExercise());
    expect(await view(id)).toEqual({ state: "AVAILABLE", remainingForProblem: 3, remainingToday: 10, replies: [] });
    expect(model.requests).toEqual([]);
    const result = await ask(id);
    expect(result).toMatchObject({ state: "AVAILABLE", remainingForProblem: 2, remainingToday: 9, fallback: null, reply: {
      level: 1, reported: false,
      analysis: { result: "With 2 and 5 your program printed 2, not 5.", line: 3, why: "`print(min(a, b))` picks the smaller number, but the task asks for the bigger one.", tryIt: "Try 1 and 2 on paper.", alsoCheck: null },
    } });
    expect(result.reply!.text.split("\n")).toHaveLength(4);
    const row = await f.prisma.aiHelpReply.findFirstOrThrow({ where: { submissionId: id } });
    expect(row).toMatchObject({ status: "DONE", level: 1, locale: "en", classId: f.ids.klass, inputTokens: 100, outputTokens: 20, costMicros: 20, promptVersion: "v6", libraryItemId: null });
    expect(row.analysis).toMatchObject({ line: 3 });
    expect(await f.prisma.aiUsageMonth.findFirstOrThrow()).toMatchObject({ kind: "HELP", requests: 1, costMicros: 20n });
    // Asking again shows the same answer, and costs nothing.
    expect((await ask(id)).reply?.id).toBe(result.reply!.id);
    expect(model.requests).toHaveLength(1);
    expect(await view(id)).toMatchObject({ remainingForProblem: 2, replies: [{ id: result.reply!.id }] });
  });

  it("explains it once more simply, from the analysis", async () => {
    const id = await submit(await f.createExercise());
    // A simpler explanation of nothing is the analysis.
    expect((await ask(id, { mode: "simpler" })).reply?.level).toBe(1);
    answer = () => analysis({ result: "Your program printed the small number.", why: "It picks the smaller one.", think: "Which one does the task want?" });
    const simpler = await ask(id, { mode: "simpler" });
    expect(simpler).toMatchObject({ remainingForProblem: 1, reply: { level: 2, analysis: { result: "Your program printed the small number." } } });
    expect(model.requests[1]!.instructions).toContain("did not understand it");
    expect(model.requests[1]!.content).toContain("EARLIER EXPLANATION:\nWith 2 and 5 your program printed 2, not 5.");
    expect((await ask(id, { mode: "simpler" })).reply?.id).toBe(simpler.reply!.id);
    expect(model.requests).toHaveLength(2);
    expect((await view(id)).replies.map((reply) => reply.level)).toEqual([1, 2]);
  });

  it("reads every test: examples in full, hidden ones only by kind, nothing personal", async () => {
    const materialId = await f.createExercise();
    await ask(await submit(materialId, {}, [
      { outcome: "WRONG_OUTPUT", output: "2\n" }, { outcome: "PASSED", output: "9" },
      { outcome: "WRONG_OUTPUT", difference: "too_small" }, { outcome: "RUNTIME_ERROR", error: ["ValueError", null, 2] },
    ]));
    const { content, instructions } = model.requests[0]!;
    expect(content).toContain("3| print(min(a, b))");
    expect(content).toContain("TESTS: passed 1 of 4. Examples: 1 of 2 passed. Hidden tests: 0 of 2 passed.");
    expect(content).toContain('- Test 1 (example): input "2\\n5"; expected "5"; printed "2": printed a number that is too small.');
    expect(content).toContain('PASSED EXAMPLE: Test 2 (example): input "9\\n4"; expected "9"; printed "9", which is right.');
    expect(content).toContain("HIDDEN TESTS (their data is secret): 2 failed: 1 printed a number that is too small; 1 stopped with ValueError on line 2.");
    expect(content + instructions).not.toMatch(/SOLUTION_SENTINEL|111222|333444|SECRETNAME/);
    expect(content + instructions).not.toContain(f.ids.student);
    // A line the student wrote may be quoted; the program itself is not copied.
    expect(JSON.stringify(await f.prisma.aiHelpReply.findMany({ where: { materialId } }))).not.toContain("b = int(input())");

    // Every example passes: the hidden tests are described, never shown.
    await ask(await submit(materialId, {}, [{ outcome: "PASSED", output: "5" }, { outcome: "PASSED", output: "9" }, { outcome: "WRONG_OUTPUT", difference: "nothing" }, { outcome: "WRONG_OUTPUT" }]));
    // A hidden test graded before the word existed is not said to have printed nothing.
    expect(model.requests[1]!.content).toContain("HIDDEN TESTS (their data is secret): 2 failed: 1 printed nothing; 1 printed a different output.");
    expect(model.requests[1]!.content).not.toContain("FAILED EXAMPLES");
    // An example's exception comes with its message and line.
    await ask(await submit(await f.createExercise(), {}, [{ outcome: "RUNTIME_ERROR", error: ["IndexError", "list index out of range", 3] }, { outcome: "SKIPPED" }, { outcome: "SKIPPED" }, { outcome: "SKIPPED" }]));
    expect(model.requests[2]!.content).toContain("the program stopped with IndexError on line 3: list index out of range.");
  });

  it("recognises a known mistake by the tests it fails, follows the teacher's path, and records what it used", async () => {
    const materialId = await f.createExercise();
    await f.prisma.aiLibrary.create({ data: { materialId, contentDigest: "d", gradingRevision: 1, state: "READY", comparedAt: new Date(), correctPrograms: [{ approach: "max", code: "print(max(int(input()), int(input())))" }] } });
    const items = await Promise.all(([["Smaller", "FPFS", "ACTIVE"], ["Sum", "FFFF", "ACTIVE"], ["Hidden one", "FPFS", "HIDDEN"]] as const).map(([label, fingerprint, state], index) =>
      f.prisma.aiLibraryItem.create({ data: { materialId, kind: "FEEDBACK", position: index + 1, label, textKo: "도움말", textEn: `About ${label}`, wrongProgram: "WRONG_PROGRAM_SENTINEL", fingerprint, state } })));
    await f.prisma.aiLibraryItem.createMany({ data: [1, 2].map((position) => ({ materialId, kind: "HINT" as const, position, textKo: `힌트 ${position}`, textEn: `Path ${position}`, state: "ACTIVE" as const })) });
    answer = () => analysis({ item: "F1" });
    const id = await submit(materialId);
    await ask(id);
    const { content } = model.requests[0]!;
    expect(content).toContain("MATCHED MISTAKE (a program with this mistake fails exactly the same tests):\n- F1 Smaller: About Smaller");
    expect(content).toContain("OTHER KNOWN MISTAKES FOR THIS PROBLEM (did not match these results; use one only if the code clearly has it):\n- F2 Sum: About Sum");
    expect(content).toContain("TEACHER'S PATH (the intended way, step by step):\n1. Path 1\n2. Path 2");
    expect(content).not.toMatch(/Hidden one|WRONG_PROGRAM_SENTINEL|print\(max|FPFS/);
    expect((await f.prisma.aiHelpReply.findFirstOrThrow({ where: { submissionId: id } })).libraryItemId).toBe(items[0]!.id);

    // What the teacher wrote is the path.
    await f.prisma.exerciseHint.create({ data: { exerciseMaterialId: materialId, position: 1, content: "Teacher's own hint" } });
    await ask(await submit(materialId));
    expect(model.requests[1]!.content).toContain("TEACHER'S PATH (the intended way, step by step):\n1. Teacher's own hint");
    // A library for another revision is not used, its hints included.
    await f.prisma.exerciseHint.deleteMany({ where: { exerciseMaterialId: materialId } });
    await f.prisma.aiLibrary.update({ where: { materialId }, data: { gradingRevision: 9 } });
    answer = () => analysis({ item: "F1" });
    const stale = await ask(await submit(materialId));
    expect(model.requests[2]!.content).not.toMatch(/MISTAKE|TEACHER'S PATH/);
    // An id that names nothing leaves the analysis standing, linked to nothing.
    expect((await f.prisma.aiHelpReply.findUniqueOrThrow({ where: { id: stale.reply!.id } })).libraryItemId).toBeNull();
  });

  it("allows three analyses a problem a day, then the teacher", async () => {
    const materialId = await f.createExercise();
    const [first, second, third] = [await submit(materialId), await submit(materialId), await submit(materialId)];
    const analysed = await ask(first);
    expect(analysed.remainingForProblem).toBe(2);
    expect((await ask(first, { mode: "simpler" })).remainingForProblem).toBe(1);
    expect(await ask(second)).toMatchObject({ state: "LIMIT_PROBLEM", remainingForProblem: 0, reply: { level: 1 } });
    expect(await ask(third)).toMatchObject({ state: "LIMIT_PROBLEM", reply: null, fallback: null });
    // Saved answers are still shown at the limit.
    expect((await ask(first)).reply?.id).toBe(analysed.reply!.id);
    // Another problem has its own three.
    expect((await ask(await submit(await f.createExercise()))).reply).not.toBeNull();
    expect(model.requests).toHaveLength(4);
  });

  it("stops at ten a day, and a day starts at midnight in Seoul", async () => {
    const problems = await Promise.all([1, 2, 3, 4].map(() => f.createExercise()));
    // Three a problem: an analysis and a simpler one, then a second submission.
    for (const materialId of problems.slice(0, 3)) {
      const id = await submit(materialId);
      expect((await ask(id)).reply).not.toBeNull();
      expect((await ask(id, { mode: "simpler" })).reply).not.toBeNull();
      expect((await ask(await submit(materialId))).reply).not.toBeNull();
    }
    const last = await submit(problems[3]!);
    expect((await ask(last)).remainingToday).toBe(0);
    expect(await ask(last, { mode: "simpler" })).toMatchObject({ state: "LIMIT_DAY", reply: null });
    await f.prisma.aiHelpReply.updateMany({ where: { academyId: f.ids.academy }, data: { createdAt: new Date(Date.now() - 25 * 3_600_000) } });
    expect((await ask(last, { mode: "simpler" })).reply?.level).toBe(2);
  });

  it("writes one analysis for two clicks at once, and lets one of two submissions take the last", async () => {
    const materialId = await f.createExercise();
    const id = await submit(materialId);
    const [a, b] = await Promise.all([ask(id), ask(id)]);
    // The second click waits its turn and is shown the analysis the first one wrote.
    expect(new Set([a, b].map((item) => item.reply?.id ?? item.fallback))).toHaveProperty("size", 1);
    expect(await f.prisma.aiHelpReply.count({ where: { submissionId: id, status: "DONE" } })).toBe(1);
    await ask(id, { mode: "simpler" });
    const [c, d] = await Promise.all([ask(await submit(materialId)), ask(await submit(materialId))]);
    expect([c, d].filter((item) => item.reply).length).toBe(1);
    expect(await f.prisma.aiHelpReply.count({ where: { materialId, status: "DONE" } })).toBe(3);
    expect(model.requests).toHaveLength(3);
  });

  it("answers one click once, however often it is sent", async () => {
    const materialId = await f.createExercise();
    const id = await submit(materialId);
    const requestId = randomUUID();
    const first = await ask(id, { requestId });
    const again = await ask(id, { requestId });
    expect(again.reply).toMatchObject({ id: first.reply!.id, text: first.reply!.text });
    expect(model.requests).toHaveLength(1);
    expect(await code(ask(await submit(materialId), { requestId }))).toBe("CONTENT_EDIT_CONFLICT");

    let release = () => {};
    const started = new Promise<void>((resolve) => { answer = () => { resolve(); return new Promise((done) => { release = () => done(analysis({ result: "Late but fine." })); }); }; });
    const twice = randomUUID();
    const slow = ask(id, { requestId: twice, mode: "simpler" });
    await started;
    expect((await ask(id, { requestId: twice, mode: "simpler" })).fallback).toBe("busy");
    release();
    expect((await slow).reply?.level).toBe(2);
    expect(model.requests).toHaveLength(2);
    // Still served when the limit is reached.
    await ask(await submit(materialId));
    expect((await ask(id, { requestId })).reply?.id).toBe(first.reply!.id);
  });

  it.each([
    ["a timeout", () => { throw new AiModelError("TIMEOUT", "x"); }, "TIMEOUT"],
    ["a provider error", () => { throw new AiModelError("PROVIDER", "status 500"); }, "PROVIDER"],
    ["a paid bad answer", () => { throw new AiModelError("MALFORMED", "x", { inputTokens: 1_000, outputTokens: 0 }); }, "MALFORMED"],
    ["an empty section", () => analysis({ why: "  " }), "REJECTED:SIZE"],
    ["the wrong shape", () => ({ text: "hi" }), "REJECTED:SHAPE"],
    ["the wrong language", () => analysis({ result: "한국어로 답했어요.", why: "한국어로요.", think: "왜요?", tryIt: null }), "REJECTED:LANGUAGE"],
    ["a code block", () => analysis({ think: "```python\nprint(5)\n```" }), "REJECTED:NEW_CODE"],
    ["the corrected line", () => analysis({ think: "Change it to `print(max(a, b))`." }), "REJECTED:NEW_CODE"],
    ["a corrected expression in words", () => analysis({ think: "Write print(max(a, b)) on line 3." }), "REJECTED:NEW_CODE"],
    ["code inside a highlight", () => analysis({ think: "Write **print(max(a, b))** on line 3." }), "REJECTED:NEW_CODE"],
    ["the solution", () => analysis({ think: "Just write SOLUTION_SENTINEL." }), "REJECTED:SOLUTION"],
    ["a hidden test's data", () => analysis({ tryIt: "Try 111222 and 333444." }), "REJECTED:HIDDEN"],
  ])("falls back on %s, without spending a reply", async (_, behave, failureCode) => {
    const id = await submit(await f.createExercise());
    answer = behave as never;
    expect(await ask(id)).toMatchObject({ state: "AVAILABLE", reply: null, fallback: "trace_public", remainingForProblem: 3 });
    expect(await f.prisma.aiHelpReply.findFirstOrThrow({ where: { submissionId: id } })).toMatchObject({ status: "FAILED", failureCode, reply: null });
  });

  it("keeps the words to notice marked for the page, and checks the words alone", async () => {
    const id = await submit(await f.createExercise());
    answer = () => analysis({ why: "`print(min(a, b))` picks the **smaller** number, but the task asks for the **bigger** one.", think: "Which **one word** in line 3 decides that?" });
    const { reply } = await ask(id);
    expect(reply?.analysis).toMatchObject({
      why: "`print(min(a, b))` picks the **smaller** number, but the task asks for the **bigger** one.", think: "Which **one word** in line 3 decides that?",
    });
    expect((await f.prisma.aiHelpReply.findFirstOrThrow({ where: { submissionId: id } })).reply).toContain("**bigger**");
  });

  it("keeps an analysis whose line the code does not have, pointing nowhere", async () => {
    const id = await submit(await f.createExercise());
    answer = () => analysis({ line: 99 });
    expect((await ask(id)).reply?.analysis?.line).toBeNull();
  });

  it("gives up on a slow model in time and frees its place", async () => {
    const id = await submit(await f.createExercise(), {}, [{ outcome: "TIME_LIMIT" }, { outcome: "SKIPPED" }, { outcome: "SKIPPED" }, { outcome: "SKIPPED" }]);
    answer = () => new Promise(() => undefined);
    const quick = service({ env: { AI_ASSISTANT_TIMEOUT_MS: 100, AI_ASSISTANT_CONCURRENCY: 1 } });
    expect((await ask(id, {}, student(), quick)).fallback).toBe("time_limit");
    answer = () => analysis({ result: "Your program ran out of time.", think: "Which value should change?" });
    expect((await ask(id, {}, student(), quick)).reply).not.toBeNull();
  });

  it("says busy when too many calls run, or one student asks too fast", async () => {
    const id = await submit(await f.createExercise());
    expect((await ask(id, {}, student(), service({ env: { AI_ASSISTANT_CONCURRENCY: 0 } }))).fallback).toBe("busy");
    expect((await ask(id, {}, student(), service({ queue: { consumeSubmissionToken: async () => false } }))).fallback).toBe("busy");
    expect((await ask(id, {}, student(), service({ queue: { consumeSubmissionToken: async () => { throw new Error("redis"); } } }))).fallback).toBe("busy");
    expect(await f.prisma.aiHelpReply.count({ where: { submissionId: id } })).toBe(0);
  });

  it("stops counting a reservation whose request died", async () => {
    const id = await submit(await f.createExercise());
    answer = () => { throw new Error("the process is gone"); };
    await expect(ask(id)).rejects.toThrow("gone");
    expect((await view(id)).remainingForProblem).toBe(2);
    await f.prisma.aiHelpReply.updateMany({ where: { submissionId: id }, data: { createdAt: new Date(Date.now() - 90_000) } });
    expect((await view(id)).remainingForProblem).toBe(3);
  });

  it("holds no transaction open while the model runs", async () => {
    const id = await submit(await f.createExercise());
    let open = -1;
    answer = async () => {
      const rows = await f.prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database() AND state LIKE 'idle in transaction%'`;
      open = Number(rows[0]!.n);
      return analysis();
    };
    await ask(id);
    expect(open).toBe(0);
  });

  describe("who may ask", () => {
    it("is only the student whose submission it is", async () => {
      const id = await submit(await f.createExercise());
      expect(await code(ask(id, {}, other()))).toBe("SUBMISSION_NOT_FOUND");
      expect(await code(ask(randomUUID()))).toBe("SUBMISSION_NOT_FOUND");
      expect(await code(help.get(other(), { academyId: f.ids.academy, submissionId: id }))).toBe("SUBMISSION_NOT_FOUND");
      expect(await code(ask(id, {}, f.identity(randomUUID())))).not.toBe("ok");
      expect(await code(ask(id, { academyId: randomUUID() }))).not.toBe("ok");
      const { id: foreign } = await f.prisma.academy.create({ data: { organizationId: f.ids.organization, name: "X", slug: `x-${randomUUID().slice(0, 8)}`, status: "ACTIVE" } });
      await f.prisma.academyMembership.create({ data: { academyId: foreign, userId: f.ids.student, role: "STUDENT", status: "ACTIVE" } });
      expect(await code(ask(id, { academyId: foreign }))).toBe("SUBMISSION_NOT_FOUND");
      expect(model.requests).toEqual([]);
    });
    it("ends with access to the course", async () => {
      const materialId = await f.createExercise();
      const id = await submit(materialId);
      await f.prisma.material.update({ where: { id: materialId }, data: { isVisible: false } });
      expect(await code(ask(id))).toBe("SUBMISSION_NOT_FOUND");
      expect(await code(view(id))).toBe("SUBMISSION_NOT_FOUND");
    });

    const off = async (id: string, state = "OFF", from = help) => {
      expect((await view(id, from)).state).toBe(state);
      expect(await ask(id, {}, student(), from)).toMatchObject({ state, reply: null, fallback: null });
      expect(model.requests).toEqual([]);
    };
    it.each([
      ["passed", { status: "PASSED" }], ["a judge error", { status: "ERRORED" }], ["still running", { status: "RUNNING" }],
      ["aborted", { gradingAborted: true }], ["a quiz answer", { quizSnapshot: { version: 1 } }],
      ["C", { language: "C" }],
    ])("refuses a submission that is %s", async (_, over) => {
      const materialId = await f.createExercise();
      await off(await submit(materialId, over));
    });
    it.each([
      ["without the checkbox", { aiFeedbackEnabled: false }], ["a quiz", { quiz: { choices: [] } }], ["practice only", { submissionPolicy: "PRACTICE_ONLY" }],
      ["manual review", { submissionPolicy: "MANUAL_REVIEW" }], ["now written in C", { language: "C" }],
    ])("refuses a problem that is %s", async (_, over) => off(await submit(await f.createExercise(over))));
    it("refuses a repair made by the platform", async () => {
      const run = await f.prisma.platformOperationRun.findFirst().catch(() => null);
      if (run) await off(await submit(await f.createExercise(), { regradeRunId: run.id }));
    });
    it("refuses with any switch off, and never says which", async () => {
      const id = await submit(await f.createExercise());
      await off(id, "OFF", service({ env: { AI_ASSISTANT_ENABLED: false } }));
      await off(id, "OFF", service({ model: Object.assign(Object.create(model), { available: false }) }));
      await f.prisma.aiUsageMonth.create({ data: { month: new Date(usageMonth()), kind: "HELP", costMicros: 5_000_000n } });
      await off(id);
      await f.prisma.aiUsageMonth.deleteMany({});
      await f.prisma.academyFeatureFlag.updateMany({ where: { academyId: f.ids.academy }, data: { isEnabled: false } });
      await off(id);
      await f.prisma.academyFeatureFlag.updateMany({ where: { academyId: f.ids.academy }, data: { isEnabled: true } });
      expect((await view(id)).state).toBe("AVAILABLE");
    });
    it("refuses an edited problem, and any problem while an exam is open", async () => {
      const materialId = await f.createExercise();
      const id = await submit(materialId);
      await f.prisma.programmingExercise.update({ where: { materialId }, data: { gradingRevision: 2 } });
      await off(id, "STALE");
      await f.prisma.programmingExercise.update({ where: { materialId }, data: { gradingRevision: 1 } });

      const lecture = await f.prisma.lecture.create({ data: { courseModuleId: f.ids.module, title: "Exam", position: 50, kind: "TEST", isVisible: true, externalKey: randomUUID() } });
      await f.prisma.lectureTest.create({ data: { lectureId: lecture.id } as never });
      const attempt = await f.prisma.testAttempt.create({ data: { lectureId: lecture.id, classId: f.ids.klass, userId: f.ids.student, attemptNo: 1, consentedAt: new Date(), itemsSnapshot: [] } });
      await off(id, "EXAM_OPEN");
      await f.prisma.testAttempt.update({ where: { id: attempt.id }, data: { deadlineAt: new Date(Date.now() - 1_000) } });
      expect((await view(id)).state).toBe("AVAILABLE");
      await f.prisma.testAttempt.update({ where: { id: attempt.id }, data: { deadlineAt: null, endedAt: new Date(), endReason: "STUDENT" } });
      expect((await view(id)).state).toBe("AVAILABLE");
      const exam = await submit(materialId, { testAttemptId: attempt.id });
      await off(exam);
    });
    it("calls nothing for code too long to read, or nothing to explain", async () => {
      expect((await ask(await submit(await f.createExercise(), { code: "x".repeat(8_001) }))).fallback).toBe("trace_public");
      const id = await submit(await f.createExercise({ description: "" }), {}, [{ outcome: "PASSED" }, { outcome: "PASSED" }, { outcome: "WRONG_OUTPUT" }, { outcome: "PASSED" }]);
      expect((await ask(id)).fallback).toBe("try_small");
      expect(model.requests).toEqual([]);
      expect(await f.prisma.aiHelpReply.count({ where: { academyId: f.ids.academy } })).toBe(0);
    });
  });

  it("takes a report from the student, once, and hides a mistake two students report", async () => {
    const materialId = await f.createExercise();
    await f.prisma.aiLibrary.create({ data: { materialId, contentDigest: "r", gradingRevision: 1, state: "READY", comparedAt: new Date() } });
    const item = await f.prisma.aiLibraryItem.create({ data: { materialId, kind: "FEEDBACK", position: 1, label: "L", textKo: "가", textEn: "a", fingerprint: "FPFS", state: "ACTIVE" } });
    answer = () => analysis({ item: "F1" });
    const { reply } = await ask(await submit(materialId));
    await help.report(student(), { academyId: f.ids.academy, replyId: reply!.id });
    const first = await f.prisma.aiHelpReply.findUniqueOrThrow({ where: { id: reply!.id } });
    await help.report(student(), { academyId: f.ids.academy, replyId: reply!.id });
    expect((await f.prisma.aiHelpReply.findUniqueOrThrow({ where: { id: reply!.id } })).reportedAt).toEqual(first.reportedAt);
    expect(await code(help.report(other(), { academyId: f.ids.academy, replyId: reply!.id }))).toBe("SUBMISSION_NOT_FOUND");
    const state = async () => (await f.prisma.aiLibraryItem.findUniqueOrThrow({ where: { id: item.id } })).state;
    expect(await state()).toBe("ACTIVE");
    // A second student's analysis used the same mistake, and they report it too.
    const theirs = await ask(await submit(materialId, { userId: f.ids.other }), {}, other());
    await help.report(other(), { academyId: f.ids.academy, replyId: theirs.reply!.id });
    expect(await state()).toBe("HIDDEN");
  });

  it("goes with the student, and stays detached from a deleted class", async () => {
    const id = await submit(await f.createExercise());
    await ask(id);
    const klass = await f.prisma.class.create({ data: { academyId: f.ids.academy, name: "Gone", createdByUserId: f.ids.manager } });
    await f.prisma.aiHelpReply.updateMany({ where: { submissionId: id }, data: { classId: klass.id } });
    await f.prisma.class.delete({ where: { id: klass.id } });
    expect((await f.prisma.aiHelpReply.findFirstOrThrow({ where: { submissionId: id } })).classId).toBeNull();
    await f.prisma.submission.delete({ where: { id } });
    expect(await f.prisma.aiHelpReply.count({ where: { submissionId: id } })).toBe(0);
  });

  it("costs the same few statements however much history there is", async () => {
    const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }), log: [{ emit: "event", level: "query" }] });
    let statements: string[] = [];
    client.$on("query", (event) => statements.push(event.query));
    const counted = service({ prisma: client as unknown as PrismaService });
    const measure = async (action: () => Promise<unknown>) => { statements = []; await action(); return statements.length; };
    const materialId = await f.createExercise();
    const id = await submit(materialId);
    const one = { view: await measure(() => view(id, counted)), ask: await measure(() => ask(id, {}, student(), counted)) };
    const earlier = [];
    for (let i = 0; i < 100; i++) earlier.push(await submit(materialId));
    await f.prisma.aiHelpReply.createMany({ data: earlier.map((submissionId) => ({
      requestId: randomUUID(), userId: f.ids.student, academyId: f.ids.academy, submissionId, materialId, gradingRevision: 1, level: 1, locale: "en",
      status: "DONE" as const, reply: "old", promptVersion: "v4", createdAt: new Date(Date.now() - 3 * 86_400_000),
    })) });
    const next = await submit(materialId);
    const many = { view: await measure(() => view(next, counted)), ask: await measure(() => ask(next, {}, student(), counted)) };
    console.log("AI help statements", one, many);
    expect(many).toEqual(one);
    expect(one.view).toBeLessThanOrEqual(4);
    expect(one.ask).toBeLessThanOrEqual(8 + 1); // BEGIN and COMMIT are counted too.
    await client.$disconnect();
  }, 60_000);

  describe("after Run and Test run (the campus courses design, §6)", () => {
    const askCode = (materialId: string, code: string, over: Record<string, unknown> = {}, from = help) =>
      from.requestForCode(student(), {
        academyId: f.ids.academy, classId: f.ids.klass, materialId, code, workspaceRevision: 1, source: "TEST_RUN",
        locale: "en", requestId: randomUUID(), mode: "analyze", ...over,
      } as never);
    beforeEach(async () => {
      f.helpEnqueued.length = 0;
      f.engine.programs.set(WRONG, (stdin) => `${Math.min(...f.numbers(stdin))}\n`);
    });

    it("runs the editor's code on the examples on the server and explains a failure from them only", async () => {
      const materialId = await f.createExercise();
      const runs = f.engine.runs;
      const result = await askCode(materialId, WRONG, { source: "RUN" });
      expect(result).toMatchObject({ state: "AVAILABLE", remainingForProblem: 2, fallback: null });
      expect(result.reply?.analysis?.line).toBe(3);
      // The two examples, never the hidden tests.
      expect(f.engine.runs - runs).toBe(2);
      expect(f.helpEnqueued).toHaveLength(1);
      const check = await f.prisma.aiHelpCheck.findFirstOrThrow({ where: { materialId } });
      expect(check).toMatchObject({ source: "RUN", status: "FAILED", fingerprint: "FF", userId: f.ids.student });
      expect((check.results as { position: number }[]).map((item) => item.position)).toEqual([1, 2]);
      const row = await f.prisma.aiHelpReply.findFirstOrThrow({ where: { checkId: check.id } });
      expect(row).toMatchObject({ source: "RUN", submissionId: null, status: "DONE", level: 1 });
      const content = model.requests[0]!.content;
      expect(content).toContain("only the examples were run");
      expect(content).not.toContain("111222");
      expect(content).not.toContain("333444");
      // No submission, attempt or progress.
      expect(await f.prisma.submission.count({ where: { materialId } })).toBe(0);
    });

    it("says all examples pass for free, with no model call and nothing counted", async () => {
      const materialId = await f.createExercise();
      const result = await askCode(materialId, "SOLUTION_SENTINEL");
      expect(result).toMatchObject({ examplesPassed: true, reply: null, fallback: null, remainingForProblem: 3 });
      expect(model.requests).toEqual([]);
      expect(await f.prisma.aiHelpReply.count({ where: { materialId } })).toBe(0);
      // Asked again: the check is reused, not run again.
      expect(await askCode(materialId, "SOLUTION_SENTINEL")).toMatchObject({ examplesPassed: true });
      expect(f.helpEnqueued).toHaveLength(1);
    });

    it("gives the saved answer for the same code again: no new check, no new call", async () => {
      const materialId = await f.createExercise();
      const first = await askCode(materialId, WRONG);
      const again = await askCode(materialId, WRONG);
      expect(again.reply?.id).toBe(first.reply?.id);
      expect(f.helpEnqueued).toHaveLength(1);
      expect(model.requests).toHaveLength(1);
      // A simpler explanation is of the same check's analysis.
      const simpler = await askCode(materialId, WRONG, { mode: "simpler" });
      expect(simpler.reply?.level).toBe(2);
      expect(f.helpEnqueued).toHaveLength(1);
    });

    it("shares one limit with Submit, and starts no check past it", async () => {
      const materialId = await f.createExercise();
      await ask(await submit(materialId));
      await askCode(materialId, WRONG);
      f.engine.programs.set(`${WRONG}\n`, (stdin) => `${Math.min(...f.numbers(stdin))}\n`);
      expect(await askCode(materialId, `${WRONG}\n`)).toMatchObject({ reply: { level: 1 }, remainingForProblem: 0, state: "LIMIT_PROBLEM" });
      f.engine.programs.set(`${WRONG}\n\n`, (stdin) => `${Math.min(...f.numbers(stdin))}\n`);
      const checks = f.helpEnqueued.length;
      expect(await askCode(materialId, `${WRONG}\n\n`)).toMatchObject({ state: "LIMIT_PROBLEM", reply: null });
      expect(f.helpEnqueued).toHaveLength(checks);
    });

    it("is off when the course has no AI teacher, and refuses a stale workspace", async () => {
      const materialId = await f.createExercise();
      await f.prisma.course.update({ where: { id: f.ids.course }, data: { aiTeacherEnabled: false } });
      try {
        expect(await askCode(materialId, WRONG)).toMatchObject({ state: "OFF", reply: null });
        expect(f.helpEnqueued).toEqual([]);
      } finally {
        await f.prisma.course.update({ where: { id: f.ids.course }, data: { aiTeacherEnabled: true } });
      }
      expect(await code(askCode(materialId, WRONG, { workspaceRevision: 2 }))).toBe("SAMPLE_CHECK_STALE");
      expect(await code(askCode(materialId, WRONG, { academyId: randomUUID() }))).not.toBe("ok");
    });

    it("costs a bounded number of statements, the same with much history", async () => {
      const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }), log: [{ emit: "event", level: "query" }] });
      let statements: string[] = [];
      client.$on("query", (event) => statements.push(event.query));
      const counted = service({ prisma: client as unknown as PrismaService });
      const measure = async (action: () => Promise<unknown>) => { statements = []; await action(); return statements.length; };
      const materialId = await f.createExercise();
      const one = { ask: await measure(() => askCode(materialId, WRONG, {}, counted)), again: await measure(() => askCode(materialId, WRONG, {}, counted)) };
      console.log("AI help after Run/Test run statements", one);
      // Access, reach, one read and the class; then the exercise in one read,
      // the check, its result, the reservation and the answer. BEGIN and COMMIT count.
      expect(one.ask).toBeLessThanOrEqual(12);
      // The same code again: access, reach, one read and the class.
      expect(one.again).toBeLessThanOrEqual(4);
      await client.$disconnect();
    }, 60_000);
  });
});
