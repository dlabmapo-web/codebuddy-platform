import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { nativeRuntimeVersion } from "@cove/grading-runtime";
import {
  createProgrammingExerciseSchema,
  defaultEliceGradingProfile,
  legacyGradingProfile,
  type NativeGccDescriptor,
  type NativeRuntimeDescriptor,
} from "@cove/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { SupportGrantResolver } from "../authorization/support-grant.resolver.js";
import { CourseService } from "../content/course.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { LearningClassContextService } from "../learn/learning-class-context.service.js";
import { SampleCheckService } from "../learn/sample-check.service.js";
import { SubmissionService } from "../learn/submission.service.js";
import type { MonitoringRevocationService } from "../monitoring/monitoring-revocation.service.js";
import type { PointAwardService } from "../points/point-award.service.js";
import type { OutputComparator } from "./comparator-pool.js";
import { ExecutionCapacity } from "./execution-capacity.js";
import type { CompileResult, ExecutionEngine, ExecutionResult } from "./execution-engine.js";
import { GradingService } from "./grading.service.js";
import { JudgeQueue } from "./judge.queue.js";
import { NATIVE_READINESS_HEARTBEAT, nativeReadinessKey } from "./native-admission.js";
import { SampleCheckRunner } from "./sample-check.runner.js";
import { SampleCheckStore } from "./sample-check.store.js";

/**
 * C and C++ exercises end to end, short of the kernel: a real PostgreSQL with
 * every migration, a real Redis, the real admission, snapshot, grading,
 * persistence and student projection, with a scripted GCC engine standing in
 * for the native node (whose jails `deploy/native/gcc-qualification.mjs`
 * qualifies on Linux). Opt-in, like the other judge integration specs:
 *
 *   COVE_INTEGRATION_DATABASE_URL=postgresql://… \
 *   COVE_INTEGRATION_REDIS_URL=redis://… \
 *   pnpm --filter @cove/api exec vitest run src/judge/compiled-exercises.integration.spec.ts
 */
const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;
const redisUrl = process.env.COVE_INTEGRATION_REDIS_URL;

const digest = `sha256:${"1".repeat(64)}`;
const comparatorIdentity = { engine: "pyodide" as const, version: "0.27.5", packageDigest: digest, semanticsVersion: "cove-python-comparator-v1" };
const cpython: NativeRuntimeDescriptor = {
  schemaVersion: 1, engine: "native-cpython", pythonVersion: "3.12.12", architecture: "arm64",
  rootfsDigest: digest, packageManifestDigest: digest, nsjailRevision: "d8415bc8eea43cdd413daba25af63127019a1189",
  nsjailBinaryDigest: digest, sandboxPolicyVersion: "nsjail-cpython-v1", sandboxPolicyDigest: digest,
  guestBootstrapDigest: digest, comparator: comparatorIdentity,
};
const gcc: NativeGccDescriptor = {
  schemaVersion: 1, engine: "native-gcc", gccVersion: "12.2.0", architecture: "arm64",
  toolchainRootfsDigest: digest, runRootfsDigest: digest, packageManifestDigest: digest,
  compile: { C: { argv: ["/usr/bin/gcc-12"] }, CPP: { argv: ["/usr/bin/g++-12"], pchDigest: digest } },
  nsjailRevision: "d8415bc8eea43cdd413daba25af63127019a1189", nsjailBinaryDigest: digest,
  sandboxPolicyVersion: "nsjail-gcc-v1", compilePolicyDigest: digest, runPolicyDigest: digest,
  execGateDigest: digest, comparator: comparatorIdentity,
};
const artifact = `sha256:${"a".repeat(64)}`;
/** A client that reports every statement, as navigation-performance's does. */
const countingClient = (connectionString: string) =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString }), log: [{ emit: "event", level: "query" }] });

describe.skipIf(!databaseUrl || !redisUrl)("C and C++ exercises, end to end", () => {
  let prisma: PrismaService;
  let counted: ReturnType<typeof countingClient>;
  let statements = 0;
  let courses: CourseService;
  let countedCourses: CourseService;
  let submissions: SubmissionService;
  let checks: SampleCheckService;
  let countedChecks: SampleCheckService;
  let queue: JudgeQueue;
  let manifestDirectory = "";
  let materialId = "";
  let revision = 1;
  let courseId = "";
  let lectureId = "";

  const ids = {
    organization: randomUUID(), academy: randomUUID(), manager: randomUUID(), student: randomUUID(),
    studentMembership: randomUUID(), klass: randomUUID(),
  };
  const auth = { manager: randomUUID(), student: randomUUID() };
  const identity = (authUserId: string) => ({ authUserId, email: `${authUserId}@it.test` }) as SupabaseIdentity;
  const manager = identity(auth.manager);
  const student = identity(auth.student);
  const answer = (input: string, expectedOutput: string, weight: number, visibility: "SAMPLE" | "HIDDEN") => ({
    input, expectedOutput, weight, visibility, comparator: "STDOUT" as const,
    timeLimitMsOverride: null, softTimeLimitMs: null, softPenalty: null, label: null,
  });
  const doubling = '#include <stdio.h>\nint main(void) { int n; scanf("%d", &n); printf("%d\\n", 2 * n); return 0; }\n';
  const exerciseInput = (target: { courseId: string; lectureId: string } = { courseId, lectureId }, grading = defaultEliceGradingProfile) =>
    createProgrammingExerciseSchema.parse({
      academyId: ids.academy, ...target, title: "Double in C", difficulty: "EASY",
      description: "<p>Print twice the input.</p>", inputFormat: "", outputFormat: "", constraints: "",
      starterCode: "", solutions: [{ title: null, code: doubling }], aiFeedbackEnabled: false, isVisible: true,
      testCases: [answer("2\n", "4", 20, "SAMPLE"), answer("7\n", "14", 40, "HIDDEN"), answer("8\n", "16", 40, "HIDDEN")],
      grading, hints: [],
    });
  /** A course with one module and one lecture, in the given language. */
  const courseWithLecture = async (title: string, language: "PYTHON" | "C" | "CPP") => {
    const course = await courses.create(manager, { academyId: ids.academy, title, description: "", language });
    await courses.createModule(manager, { academyId: ids.academy, courseId: course.id, title: "M", description: "" });
    const courseModule = await prisma.courseModule.findFirstOrThrow({ where: { courseId: course.id } });
    await courses.createLecture(manager, { academyId: ids.academy, courseId: course.id, moduleId: courseModule.id, title: "L", description: "" });
    const lecture = await prisma.lecture.findFirstOrThrow({ where: { courseModuleId: courseModule.id } });
    return { course, courseId: course.id, lectureId: lecture.id };
  };

  /** A scripted GCC engine: the native node's contract without its kernel. */
  const gccEngine = (script: {
    compile?: CompileResult;
    run?: (stdin: string) => ExecutionResult;
  }): ExecutionEngine & { compiled: number; released: string[] } => {
    const engine = {
      version: nativeRuntimeVersion(gcc),
      compiled: 0,
      released: [] as string[],
      compile: async () => {
        engine.compiled += 1;
        return script.compile ?? { status: "COMPILED" as const, artifact, lease: randomUUID(), diagnostics: "", compileMs: 30, cached: false };
      },
      release: async (lease: string) => { engine.released.push(lease); },
      run: async (request: { stdin: string }) =>
        script.run?.(request.stdin) ?? { stdout: `${2 * Number(request.stdin)}\n`, stderr: "", outcome: "PASSED" as const, runtimeMs: 1 },
      dispose: async () => undefined,
    };
    return engine;
  };
  const comparator: OutputComparator = {
    version: "pyodide-0.27.5",
    compare: async ({ actual, expected }) => (actual.trimEnd() === expected ? { kind: "match" } : { kind: "no-match" }),
  };
  const grade = async (submissionId: string, engine: ExecutionEngine) => {
    const points = { awardSolve: vi.fn() } as unknown as PointAwardService;
    await new GradingService(prisma, engine, points, comparator).grade(submissionId, async () => undefined);
  };
  const submit = (code: string) =>
    submissions.submit(student, { academyId: ids.academy, materialId, classId: ids.klass, code });
  /** Marks this node's GCC family ready on both lanes, as the native worker's heartbeat does. */
  const heartbeat = async () => {
    const redis = await queue.redis();
    for (const lane of ["official", "background"] as const)
      await redis.eval(NATIVE_READINESS_HEARTBEAT, 1, nativeReadinessKey(gcc, lane), "integration-node");
  };

  beforeAll(async () => {
    manifestDirectory = mkdtempSync(join(tmpdir(), "cove-gcc-manifest-"));
    const manifestPath = join(manifestDirectory, "manifest.json");
    writeFileSync(manifestPath, JSON.stringify({
      schemaVersion: 2, descriptor: cpython, gcc,
      resources: {
        physicalMemoryMb: 8192, envelopeMemoryMb: 4096, serviceOverheadMb: 1024, caseOverheadMb: 128, cpuSlots: 3,
        officialReservedSlots: 1, officialReservedMemoryMb: 656, maxCaseMemoryMb: 512, maxCasePids: 8, scratchMb: 16,
        maxCompilePids: 16, artifactStoreMb: 256,
      },
      eligibility: [{
        contexts: ["live", "preview"], kinds: ["official", "staff-practice", "sample", "regrade", "run"],
        maxCaseTimeLimitMs: 60_000, languages: ["PYTHON", "C", "CPP"],
      }],
    }));
    const config = new ConfigService({
      DATABASE_URL: databaseUrl,
      PYODIDE_VERSION: "0.27.5",
      SUBMISSION_RATE_LIMIT: 100,
      SAMPLE_CHECK_PER_MINUTE: 100,
      SAMPLE_CHECK_ACADEMY_OUTSTANDING: 50,
      NATIVE_GRADING_ENABLED: true,
      NATIVE_GRADING_BRIDGE_ACK: "filtered-compatibility-workers-v1",
      NATIVE_GRADING_MANIFEST: manifestPath,
    });
    prisma = new PrismaService(config as never);
    counted = countingClient(databaseUrl!);
    counted.$on("query", (event) => { statements += 1; if (process.env.LOG_STATEMENTS) console.log("SQL", event.query.slice(0, 140)); });
    const access = new AcademyAccessService(prisma, new SupportGrantResolver(prisma));
    courses = new CourseService(prisma, access, new AuditService(), { revokeClass: async () => undefined } as unknown as MonitoringRevocationService);
    queue = new JudgeQueue(redisUrl!);
    await (await queue.redis()).flushdb();
    const classContext = new LearningClassContextService(prisma);
    submissions = new SubmissionService(prisma, access, config as never, classContext, queue);
    checks = new SampleCheckService(prisma, access, config as never, classContext, queue);
    const countedPrisma = counted as unknown as PrismaService;
    countedCourses = new CourseService(
      countedPrisma, new AcademyAccessService(countedPrisma, new SupportGrantResolver(countedPrisma)),
      new AuditService(), { revokeClass: async () => undefined } as unknown as MonitoringRevocationService,
    );
    countedChecks = new SampleCheckService(
      countedPrisma, new AcademyAccessService(countedPrisma, new SupportGrantResolver(countedPrisma)),
      config as never, new LearningClassContextService(countedPrisma), queue,
    );

    await prisma.organization.create({ data: { id: ids.organization, name: "IT Org", slug: `it-${ids.organization.slice(0, 8)}` } });
    await prisma.academy.create({ data: { id: ids.academy, organizationId: ids.organization, name: "IT", slug: `it-${ids.academy.slice(0, 8)}`, status: "ACTIVE" } });
    for (const [id, authUserId, name] of [[ids.manager, auth.manager, "m"], [ids.student, auth.student, "s"]] as const)
      await prisma.user.create({ data: { id, authUserId, status: "ACTIVE", email: `${authUserId}@it.test`, username: `${name}${id.slice(0, 6)}` } });
    await prisma.academyMembership.create({ data: { academyId: ids.academy, userId: ids.manager, role: "MANAGER", status: "ACTIVE" } });
    await prisma.academyMembership.create({ data: { id: ids.studentMembership, academyId: ids.academy, userId: ids.student, role: "STUDENT", status: "ACTIVE" } });
    // A C course, in an academy with no feature switched on: every academy
    // offers Python, C and C++.
    ({ courseId, lectureId } = await courseWithLecture("C track", "C"));
    await prisma.class.create({ data: { id: ids.klass, academyId: ids.academy, name: "Cohort", createdByUserId: ids.manager } });
    await prisma.classCourse.create({ data: { classId: ids.klass, courseId, assignedByUserId: ids.manager } });
    await prisma.classEnrollment.create({ data: { classId: ids.klass, membershipId: ids.studentMembership, enrolledByUserId: ids.manager } });
  }, 180_000);

  afterAll(async () => {
    for (const q of [queue?.forRuntime(gcc)]) await q?.queue.obliterate({ force: true }).catch(() => undefined);
    await queue?.close();
    await prisma?.$disconnect();
    await counted?.$disconnect();
    if (manifestDirectory) rmSync(manifestDirectory, { recursive: true, force: true });
  });

  it("writes every coding exercise in its course's language, with weighted grading", async () => {
    expect(await prisma.academyFeatureFlag.count({ where: { academyId: ids.academy } })).toBe(0);
    expect((await prisma.course.findUniqueOrThrow({ where: { id: courseId } })).language).toBe("C");
    // C keeps every printed byte and grades by weight: a legacy profile is refused.
    await expect(courses.createExercise(manager, exerciseInput(undefined, { ...defaultEliceGradingProfile, inputPromptPolicy: "IGNORE" })))
      .rejects.toMatchObject({ code: "EXERCISE_VALIDATION_FAILED" });
    expect(await prisma.programmingExercise.count({ where: { material: { lecture: { id: lectureId } } } })).toBe(0);

    const created = await courses.createExercise(manager, exerciseInput());
    materialId = created.material!.id;
    expect(created.course.language).toBe("C");
    revision = created.material!.programmingExercise!.gradingRevision;
    const stored = await prisma.programmingExercise.findUniqueOrThrow({ where: { materialId } });
    expect(stored).toMatchObject({ language: "C", gradingMode: "ELICE_STDIO", inputPromptPolicy: "INCLUDE" });
    await courses.setExerciseVisibility(manager, { academyId: ids.academy, courseId, lectureId, materialId, isVisible: true });
    await prisma.courseModule.updateMany({ where: { courseId }, data: { isVisible: true } });
    await prisma.lecture.updateMany({ where: { id: lectureId }, data: { isVisible: true } });
    await courses.setVisibility(manager, { academyId: ids.academy, courseId, isVisible: true });
  });

  it("fixes a course's language once it holds a problem, and not before", async () => {
    // The C track holds the exercise written above.
    await expect(courses.update(manager, { academyId: ids.academy, courseId, language: "CPP" }))
      .rejects.toMatchObject({ code: "CONTENT_VALIDATION_FAILED" });
    expect((await prisma.course.findUniqueOrThrow({ where: { id: courseId } })).language).toBe("C");

    // An empty course can still change its language.
    const spare = await courseWithLecture("Spare", "PYTHON");
    statements = 0;
    const changed = await countedCourses.update(manager, { academyId: ids.academy, courseId: spare.courseId, language: "CPP" });
    const changeStatements = statements;
    expect(changed.language).toBe("CPP");

    // The next problem is C++, whatever an old client might send.
    statements = 0;
    const cpp = await countedCourses.createExercise(manager, { ...exerciseInput({ courseId: spare.courseId, lectureId: spare.lectureId }), language: "C" } as never);
    const createStatements = statements;
    expect((await prisma.programmingExercise.findUniqueOrThrow({ where: { materialId: cpp.material!.id } })).language).toBe("CPP");
    statements = 0;
    await countedCourses.update(manager, { academyId: ids.academy, courseId: spare.courseId, title: "Spare course" });
    const renameStatements = statements;
    // A language change costs the course lock and one count over a plain
    // update; a rename's title check costs one. Exercise creation reads the
    // language from the lock it already takes: no statement of its own.
    expect({ changeStatements, renameStatements, createStatements }).toEqual({ changeStatements: 14, renameStatements: 13, createStatements: 22 });

    // A quiz-style problem has no code and is stored as Python, but it is a
    // problem: a course holding only one is fixed too.
    const quizzes = await courseWithLecture("Quizzes", "C");
    const quiz = await courses.createExercise(manager, createProgrammingExerciseSchema.parse({
      academyId: ids.academy, courseId: quizzes.courseId, lectureId: quizzes.lectureId, title: "Pick one", difficulty: "EASY",
      description: "<p>Which?</p>", inputFormat: "", outputFormat: "", constraints: "", starterCode: "", solutions: [],
      aiFeedbackEnabled: false, isVisible: true, testCases: [], grading: legacyGradingProfile, hints: [],
      submissionPolicy: "AUTOMATIC",
      quiz: { choices: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctChoiceId: "a", explanation: "" },
    }));
    expect((await prisma.programmingExercise.findUniqueOrThrow({ where: { materialId: quiz.material!.id } })).language).toBe("PYTHON");
    await expect(courses.update(manager, { academyId: ids.academy, courseId: quizzes.courseId, language: "PYTHON" }))
      .rejects.toMatchObject({ code: "CONTENT_VALIDATION_FAILED" });
    // The course list counts that problem, which is what locks its form.
    const listed = (await courses.list(manager, ids.academy)).courses.find((course) => course.id === quizzes.courseId);
    expect(listed).toMatchObject({ language: "C", content: { problems: 1 } });
  });

  it("refuses a C submission while no GCC runtime is ready, recording nothing", async () => {
    await expect(submit(doubling)).rejects.toMatchObject({ code: "GRADING_UNAVAILABLE" });
    expect(await prisma.submission.count({ where: { userId: ids.student } })).toBe(0);
  });

  it("admits C to the GCC family with a version 5 policy and grades it on the leased program", async () => {
    await heartbeat();
    const { submissionId } = await submit(doubling);
    const row = await prisma.submission.findUniqueOrThrow({ where: { id: submissionId } });
    expect(row.language).toBe("C");
    expect(row.engineVersion).toBe(nativeRuntimeVersion(gcc));
    expect(row.executionQueue).toContain("-native-gcc-v1-");
    expect(row.executionRuntimeSnapshot).toEqual(gcc);
    expect(row.gradingPolicySnapshot).toMatchObject({ version: 5, language: "C", inputPromptPolicy: "INCLUDE" });

    const engine = gccEngine({});
    await grade(submissionId, engine);
    expect(engine.compiled).toBe(1);
    expect(engine.released).toHaveLength(1);
    const result = await submissions.get(student, { academyId: ids.academy, submissionId });
    expect(result).toMatchObject({ status: "PASSED", score: 100, compileFailed: false, compileDiagnostics: null });
  });

  it("withholds a hidden case's ending from the student (getchar and signal-choice probes)", async () => {
    // The program's own exit code is the first input byte: `return getchar();`.
    const exitProbe = await submit('#include <stdio.h>\nint main(void) { return getchar(); }\n');
    await grade(exitProbe.submissionId, gccEngine({
      run: (stdin) => ({ stdout: "", stderr: "", outcome: "RUNTIME_ERROR", runtimeMs: 1, termination: { exit: stdin.charCodeAt(0) } }),
    }));
    const stored = await prisma.submissionCase.findMany({ where: { submissionId: exitProbe.submissionId }, orderBy: { position: "asc" } });
    expect(stored.map((item) => item.exitCode)).toEqual([50, 55, 56]);
    const exitView = await submissions.get(student, { academyId: ids.academy, submissionId: exitProbe.submissionId });
    expect(exitView.cases.map((item) => [item.isSample, item.exitCode, item.exitSignal])).toEqual([
      [true, 50, null],
      [false, null, null],
      [false, null, null],
    ]);
    // Nowhere in what the student receives, not only not in the case field.
    expect(JSON.stringify(exitView)).not.toMatch(/"exitCode":5[56]\b/);

    // Choosing a signal by input parity is a bit per hidden case: also withheld.
    const signalProbe = await submit('#include <signal.h>\n#include <stdio.h>\nint main(void) { raise(getchar() & 1 ? SIGSEGV : SIGFPE); }\n');
    await grade(signalProbe.submissionId, gccEngine({
      run: (stdin) => ({ stdout: "", stderr: "", outcome: "RUNTIME_ERROR", runtimeMs: 1,
        termination: { signal: stdin.charCodeAt(0) & 1 ? "SIGSEGV" : "SIGFPE" } }),
    }));
    const signalView = await submissions.get(student, { academyId: ids.academy, submissionId: signalProbe.submissionId });
    expect(signalView.cases.map((item) => item.exitSignal)).toEqual(["SIGFPE", null, null]);
    expect(signalView.cases.every((item) => item.isSample || item.exitCode === null)).toBe(true);
  });

  it("records a compile error as a counted attempt worth 0, with GCC's messages and no case run", async () => {
    const before = await prisma.studentExerciseProgress.findUniqueOrThrow({ where: { userId_materialId: { userId: ids.student, materialId } } });
    const diagnostics = "main.c:1:30: error: 'x' undeclared (first use in this function)\n";
    const { submissionId } = await submit("int main(void) { return x; }\n");
    await grade(submissionId, gccEngine({ compile: { status: "COMPILE_ERROR", reason: "ERRORS", diagnostics, compileMs: 20, cached: false } }));

    const row = await prisma.submission.findUniqueOrThrow({ where: { id: submissionId } });
    expect(row).toMatchObject({ status: "FAILED", score: 0, compileFailed: true, compileDiagnostics: diagnostics });
    const cases = await prisma.submissionCase.findMany({ where: { submissionId } });
    expect(cases).toHaveLength(3);
    expect(cases.every((item) => item.outcome === "SKIPPED" && item.executionState === "NOT_RUN")).toBe(true);
    const after = await prisma.studentExerciseProgress.findUniqueOrThrow({ where: { userId_materialId: { userId: ids.student, materialId } } });
    expect(after.attemptCount).toBe(before.attemptCount + 1);
    const view = await submissions.get(student, { academyId: ids.academy, submissionId });
    expect(view).toMatchObject({ compileFailed: true, compileDiagnostics: diagnostics });
    const list = await submissions.list(student, { academyId: ids.academy, materialId });
    expect(list.submissions.find((item) => item.submissionId === submissionId)?.compileFailed).toBe(true);
  });

  it("keeps compile and exit fields consistent at the database", async () => {
    const { submissionId } = await submit(doubling);
    await expect(prisma.submission.update({ where: { id: submissionId }, data: { compileFailed: true } })).rejects.toThrow();
    await expect(prisma.submissionCase.create({
      data: { submissionId, position: 99, isSample: false, outcome: "PASSED", exitCode: 3 },
    })).rejects.toThrow();
    await expect(prisma.submissionCase.create({
      data: { submissionId, position: 98, isSample: false, outcome: "RUNTIME_ERROR", exitCode: 3, exitSignal: "SIGSEGV" },
    })).rejects.toThrow();
  });

  it("admits a Run on the student's input in a bounded number of statements and runs it without comparing", async () => {
    const submitted = await prisma.submission.count({ where: { userId: ids.student } });
    statements = 0;
    const accepted = await countedChecks.startRun(student, {
      academyId: ids.academy, classId: ids.klass, materialId, code: doubling, stdin: "21\n",
      workspaceRevision: revision, clientRequestId: randomUUID(),
    });
    // Exactly a Test's admission: the material read in its snapshot transaction
    // (begin, material, exercise, lecture, test cases, module, commit), the
    // class context (membership, enrollment, class) and the academy for native
    // admission. Nothing grows with the number of cases.
    expect(statements).toBe(11);
    expect(accepted).toMatchObject({ kind: "run", status: "QUEUED", position: null });

    const engine = gccEngine({ run: (stdin) => ({ stdout: `${2 * Number(stdin)}\nanything at all\n`, stderr: "", outcome: "PASSED", runtimeMs: 1 }) });
    await new SampleCheckRunner(new SampleCheckStore(() => queue.redis()), engine, comparator, new ExecutionCapacity(2)).run(accepted.checkId);
    const view = await checks.get(student, { academyId: ids.academy, checkId: accepted.checkId });
    expect(view).toMatchObject({ kind: "run", status: "COMPLETED", position: null });
    expect(view.result).toMatchObject({ outcome: "PASSED", outputMatched: null, stdout: "42\nanything at all\n", rule: null, compileDiagnostics: "" });
    expect(engine.compiled).toBe(1);
    expect(engine.released).toHaveLength(1);
    // Practice only: never a submission.
    expect(await prisma.submission.count({ where: { userId: ids.student } })).toBe(submitted);
  });

  it("reports a Run that did not compile with GCC's messages", async () => {
    const accepted = await checks.startRun(student, {
      academyId: ids.academy, classId: ids.klass, materialId, code: "int main(void) { return x; }\n", stdin: "",
      workspaceRevision: revision, clientRequestId: randomUUID(),
    });
    const diagnostics = "main.c:1:25: error: 'x' undeclared\n";
    await new SampleCheckRunner(new SampleCheckStore(() => queue.redis()),
      gccEngine({ compile: { status: "COMPILE_ERROR", reason: "ERRORS", diagnostics, compileMs: 10, cached: false } }),
      comparator, new ExecutionCapacity(2)).run(accepted.checkId);
    const view = await checks.get(student, { academyId: ids.academy, checkId: accepted.checkId });
    expect(view.result).toMatchObject({ outcome: "COMPILE_ERROR", compileDiagnostics: diagnostics, stdout: "" });
  });
});
