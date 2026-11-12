import { NativeAdmission } from "../judge/native-admission.js";
import { snapshotTransaction } from "../judge/snapshot-transaction.js";
import { createHash, randomUUID } from "node:crypto";

import { HttpStatus, Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  isCompiledLanguage,
  isSampleCheckActive,
  type GetSampleCheckInput,
  type SampleCheckStatus,
  type SampleCheckView,
  type StartPracticeRunCheckInput,
  type StartPracticeSampleCheckInput,
  type StartRunCheckInput,
  type StartSampleCheckInput,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { learningScopeFor } from "../classes/assigned-course-access.js";
import { AppException } from "../common/app-exception.js";
import type { ApiEnvironment } from "../config/env.schema.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { runExerciseFor, runSnapshotFor, sampleSnapshotFor } from "../judge/sample-check-snapshot.js";
import { JudgeQueue } from "../judge/judge.queue.js";
import { SAMPLE_QUEUE_WAIT_MS } from "../judge/sample-check.runner.js";
import {
  SampleCheckStore,
  type SampleCheckRecord,
} from "../judge/sample-check.store.js";
import { reachableMaterialWhere } from "./curriculum-visibility.js";
import { LearningClassContextService } from "./learning-class-context.service.js";
import { programExit } from "../judge/program-exit.js";
import { staffPracticeMaterial, staffPracticeMaterialWhere } from "./staff-practice.service.js";

/** The class a staff member's own practice checks name: they have none. */
const STAFF_PRACTICE = "staff-practice";

/** Beyond the run's own bounds, before an active check is presumed lost. */
const LOST_SLACK_MS = 60_000;

/** The longest one read is held open waiting for a check to move on. */
export const SAMPLE_CHECK_WAIT_MS = 5_000;
/** How often a held read looks at the check again: Redis only, no database. */
const WAIT_STEP_MS = 50;
/**
 * A check that has just started running is usually finished a moment later.
 * Waiting this long for its result saves the browser a second read and the
 * terminal a "Running" line that would vanish at once.
 */
const RUNNING_GRACE_MS = 400;

const exerciseInclude = {
  programmingExercise: {
    include: { testCases: { orderBy: [{ position: "asc" }, { id: "asc" }] } },
  },
  lecture: { include: { courseModule: { select: { courseId: true } } } },
} satisfies Prisma.MaterialInclude;

/**
 * Public sample checks: a student's Test button, judged by the server.
 *
 * This service admits a check and reads it back; the judge runs it
 * (`sample-check.runner.ts`). It reuses every access rule Submit applies —
 * the student's own permission, curriculum reachability, and an authorized
 * class context — and none of Submit's consequences: it never creates a
 * submission, never counts an attempt, never touches progress, best score,
 * points or answer history, and admits a check even when a student's official
 * attempts would be refused.
 *
 * Only the selected SAMPLE case is ever loaded into a check. A hidden case,
 * a nonexistent position, another academy's problem and another student's
 * check all answer the same way, and none of their definitions leave here.
 */
@Injectable()
export class SampleCheckService {
  private nativeAdmission?: NativeAdmission;
  private native() { return this.nativeAdmission ??= new NativeAdmission(this.config, this.prisma, this.queue); }
  private readonly logger = new Logger(SampleCheckService.name);
  private readonly store: SampleCheckStore | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly config: ConfigService<ApiEnvironment, true>,
    private readonly classContext: LearningClassContextService,
    @Optional() private readonly queue?: JudgeQueue,
  ) {
    this.store = queue ? new SampleCheckStore(() => queue.redis()) : null;
  }

  async start(
    identity: SupabaseIdentity,
    input: StartSampleCheckInput,
  ): Promise<SampleCheckView> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "submissions.own.create",
    );
    const { userId } = actor;
    const store = this.store;
    const queue = this.queue;
    if (!store || !queue) throw unavailable();

    const material = await snapshotTransaction(this.prisma, tx => tx.material.findFirst({
      where: {
        id: input.materialId,
        type: 'PROGRAMMING_EXERCISE',
        ...reachableMaterialWhere(input.academyId, learningScopeFor(input.academyId, actor)),
      },
      include: exerciseInclude,
    }));
    const exercise = material?.programmingExercise;
    if (!material || !exercise) throw notFound();
    if (exercise.submissionPolicy === "PRACTICE_ONLY") throw new AppException("EXERCISE_PRACTICE_ONLY", HttpStatus.BAD_REQUEST);

    if (exercise.submissionPolicy === "MANUAL_REVIEW") throw new AppException("EXERCISE_NOT_AVAILABLE", HttpStatus.BAD_REQUEST);

    // An authorized class context, exactly as Submit requires one. Practice
    // is still work done in a class.
    await this.classContext.resolve({
      academyId: input.academyId,
      userId,
      courseId: material.lecture.courseModule.courseId,
      requestedClassId: input.classId,
    });

    // C and C++ have no browser runtime: their Test is always the server's.
    if (!isCompiledLanguage(exercise.language) && !(await this.enabledFor(input.academyId))) {
      // Disabled academies retain their existing local practice flow.
      throw unavailable();
    }
    if (exercise.gradingRevision !== input.workspaceRevision) {
      throw new AppException("SAMPLE_CHECK_STALE", HttpStatus.CONFLICT);
    }
    const testCase = exercise.testCases.find(
      (candidate) =>
        candidate.position === input.position && candidate.visibility === "SAMPLE",
    );
    // Hidden and nonexistent positions are indistinguishable from here.
    if (!testCase) throw notFound();

    const descriptor = await this.native().select({
      academyId: input.academyId, materialId: material.id, gradingRevision: exercise.gradingRevision, context: "live", kind: "sample",
    }, exercise);
    const snapshot = sampleSnapshotFor(
      exercise, testCase, input.code,
      this.config.get("PYODIDE_VERSION", { infer: true }), descriptor,
    );
    if (!snapshot) throw unavailable();

    const codeHash = sha256(input.code);
    const requestHash = sha256(
      JSON.stringify([
        input.materialId,
        input.classId,
        input.position,
        input.workspaceRevision,
        codeHash,
      ]),
    );
    return this.admit(store, queue, {
      kind: "sample", userId, input, materialId: material.id, position: testCase.position,
      exerciseRevision: exercise.gradingRevision, codeHash, requestHash, snapshot,
    });
  }

  /**
   * A C/C++ Run: the student's code on the input they typed, judged by
   * nothing. The same access rules, admission, limits and polling as a sample
   * check, and none of Submit's consequences. Python's Run stays in the
   * browser, so only compiled languages are accepted here.
   */
  async startRun(
    identity: SupabaseIdentity,
    input: StartRunCheckInput,
  ): Promise<SampleCheckView> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "submissions.own.create",
    );
    const { userId } = actor;
    const store = this.store;
    const queue = this.queue;
    if (!store || !queue) throw unavailable();
    const material = await snapshotTransaction(this.prisma, tx => tx.material.findFirst({
      where: {
        id: input.materialId,
        type: 'PROGRAMMING_EXERCISE',
        ...reachableMaterialWhere(input.academyId, learningScopeFor(input.academyId, actor)),
      },
      include: exerciseInclude,
    }));
    const exercise = material?.programmingExercise;
    if (!material || !exercise || !isCompiledLanguage(exercise.language)) throw notFound();
    await this.classContext.resolve({
      academyId: input.academyId,
      userId,
      courseId: material.lecture.courseModule.courseId,
      requestedClassId: input.classId,
    });
    if (exercise.gradingRevision !== input.workspaceRevision) {
      throw new AppException("SAMPLE_CHECK_STALE", HttpStatus.CONFLICT);
    }
    const descriptor = await this.native().select({
      academyId: input.academyId, materialId: material.id, gradingRevision: exercise.gradingRevision, context: "live", kind: "run",
    }, runExerciseFor(exercise, input.stdin));
    if (descriptor?.engine !== "native-gcc") throw unavailable();
    const snapshot = runSnapshotFor(
      exercise, input.stdin, input.code,
      this.config.get("PYODIDE_VERSION", { infer: true }), descriptor, input.endOfInput,
    );
    if (!snapshot) throw unavailable();
    const codeHash = sha256(input.code);
    const requestHash = sha256(
      JSON.stringify(["run", input.materialId, input.classId, input.workspaceRevision, codeHash, sha256(input.stdin), Boolean(input.endOfInput)]),
    );
    const continued = await this.continues(store, {
      checkId: input.continues, userId, materialId: material.id, codeHash, practice: false,
      stdin: input.stdin, endOfInput: input.endOfInput,
    });
    return this.admit(store, queue, {
      kind: "run", userId, input, materialId: material.id, position: 0,
      exerciseRevision: exercise.gradingRevision, codeHash, requestHash, snapshot, continued,
    });
  }

  /**
   * A staff member's own C/C++ practice: a public case, or a Run on their
   * input. The student checks' rules and limits, authorized as practice Submit
   * is: their own membership, no class, and an unpublished preview for those
   * who review curriculum. Python practice runs in the browser.
   */
  async startPractice(
    identity: SupabaseIdentity,
    input: StartPracticeSampleCheckInput | (StartPracticeRunCheckInput & { stdin: string }),
  ): Promise<SampleCheckView> {
    const actor = await this.access.requirePermission(identity.authUserId, input.academyId, "curriculum.read");
    const store = this.store;
    const queue = this.queue;
    if (!store || !queue) throw unavailable();
    const { material, exercise } = await snapshotTransaction(this.prisma, tx =>
      staffPracticeMaterial(tx, actor, { academyId: input.academyId, materialId: input.materialId, preview: input.preview }));
    if (!isCompiledLanguage(exercise.language) || exercise.quiz) throw notFound();
    if (exercise.gradingRevision !== input.workspaceRevision) {
      throw new AppException("SAMPLE_CHECK_STALE", HttpStatus.CONFLICT);
    }
    const run = "stdin" in input;
    if (!run && exercise.submissionPolicy === "MANUAL_REVIEW") throw new AppException("EXERCISE_NOT_AVAILABLE", HttpStatus.BAD_REQUEST);
    const testCase = run ? null : exercise.testCases.find(
      (candidate) => candidate.position === input.position && candidate.visibility === "SAMPLE",
    );
    if (!run && !testCase) throw notFound();
    const descriptor = await this.native().select({
      academyId: input.academyId, materialId: material.id, gradingRevision: exercise.gradingRevision,
      context: input.preview ? "preview" : "live", kind: run ? "run" : "sample",
    }, run ? runExerciseFor(exercise, input.stdin) : exercise);
    if (descriptor?.engine !== "native-gcc") throw unavailable();
    const pyodide = this.config.get("PYODIDE_VERSION", { infer: true });
    const snapshot = run
      ? runSnapshotFor(exercise, input.stdin, input.code, pyodide, descriptor, input.endOfInput)
      : sampleSnapshotFor(exercise, testCase!, input.code, pyodide, descriptor);
    if (!snapshot) throw unavailable();
    const codeHash = sha256(input.code);
    const requestHash = sha256(JSON.stringify(run
      ? ["practice-run", input.materialId, input.workspaceRevision, codeHash, sha256(input.stdin), Boolean(input.endOfInput)]
      : ["practice", input.materialId, testCase!.position, input.workspaceRevision, codeHash]));
    const continued = run && await this.continues(store, {
      checkId: input.continues, userId: actor.userId, materialId: material.id, codeHash, practice: true,
      stdin: input.stdin, endOfInput: input.endOfInput,
    });
    return this.admit(store, queue, {
      kind: run ? "run" : "sample", userId: actor.userId,
      input: { academyId: input.academyId, classId: STAFF_PRACTICE, clientRequestId: input.clientRequestId },
      materialId: material.id, position: run ? 0 : testCase!.position,
      exerciseRevision: exercise.gradingRevision, codeHash, requestHash, snapshot, practice: true, continued,
    });
  }

  /**
   * Whether a Run is the next step of one whose program was waiting for
   * input: the same student, problem and code, a Run that ended waiting, and
   * everything it was given before plus more. Anything else is a new Run and
   * is charged as one. One Redis read, and only when the browser claims it.
   */
  private async continues(
    store: SampleCheckStore,
    claim: {
      checkId: string | undefined; userId: string; materialId: string; codeHash: string;
      practice: boolean; stdin: string; endOfInput: boolean | undefined;
    },
  ): Promise<boolean> {
    if (!claim.checkId) return false;
    const previous = await store.get(claim.checkId).catch(() => null);
    if (!previous || previous.kind !== "run" || previous.status !== "COMPLETED" || !previous.result?.awaitingInput) {
      return false;
    }
    const before = previous.snapshot.testCase.input;
    return previous.userId === claim.userId && previous.materialId === claim.materialId &&
      previous.codeHash === claim.codeHash && Boolean(previous.practice) === claim.practice &&
      claim.stdin.startsWith(before) && (claim.stdin.length > before.length || Boolean(claim.endOfInput));
  }

  private async admit(
    store: SampleCheckStore,
    queue: JudgeQueue,
    check: {
      kind: "sample" | "run";
      practice?: boolean;
      userId: string;
      input: { academyId: string; classId: string; clientRequestId: string };
      materialId: string;
      position: number;
      exerciseRevision: number;
      codeHash: string;
      requestHash: string;
      snapshot: SampleCheckRecord["snapshot"];
      /** The next input line of a waiting Run: charged to its own budget. */
      continued?: boolean;
    },
  ): Promise<SampleCheckView> {
    const { input, userId, snapshot, codeHash, requestHash } = check;
    try {
      const now = Date.now();
      const record: SampleCheckRecord = {
        checkId: randomUUID(),
        kind: check.kind,
        userId,
        academyId: input.academyId,
        classId: input.classId,
        ...(check.practice ? { practice: true as const } : {}),
        materialId: check.materialId,
        position: check.position,
        exerciseRevision: check.exerciseRevision,
        codeHash,
        requestHash,
        clientRequestId: input.clientRequestId,
        status: "QUEUED",
        acceptedAt: now,
        dispatchedAt: null,
        finishedAt: null,
        lostAfter: now + SAMPLE_QUEUE_WAIT_MS + snapshot.totalTimeLimitMs + LOST_SLACK_MS,
        snapshot,
        result: null,
        failure: null,
        timings: { queueMs: null, executionMs: null, comparisonMs: null },
      };

      // Deduplication, the rate limit and both outstanding limits in one call:
      // two retries of one click cannot each spend a token on their way to
      // being deduplicated.
      const admission = await store.admit(record, {
        academyOutstanding: this.config.get("SAMPLE_CHECK_ACADEMY_OUTSTANDING", {
          infer: true,
        }),
        ...(check.continued
          ? {
              perMinute: this.config.get("SAMPLE_CHECK_CONTINUATIONS_PER_MINUTE", { infer: true }),
              bucket: "continue" as const,
            }
          : { perMinute: this.config.get("SAMPLE_CHECK_PER_MINUTE", { infer: true }) }),
      });
      if (admission.kind === "duplicate") {
        return this.replay(store, admission.checkId, requestHash);
      }
      if (admission.kind === "rate-limited") {
        throw new AppException("SAMPLE_CHECK_RATE_LIMITED", HttpStatus.TOO_MANY_REQUESTS);
      }
      if (admission.kind === "busy") {
        throw new AppException("SAMPLE_CHECK_BUSY", HttpStatus.CONFLICT);
      }
      if (admission.kind === "academy-full") {
        throw new AppException("SAMPLE_CHECK_RATE_LIMITED", HttpStatus.TOO_MANY_REQUESTS);
      }

      try {
        await queue.enqueueSampleCheck(record.checkId, record.snapshot.executionRuntimeSnapshot);
      } catch (error) {
        this.logger.error(`sample check ${record.checkId} could not be queued: ${String(error)}`);
        throw unavailable();
      }
      return toView(record, true);
    } catch (error) {
      if (error instanceof AppException) throw error;
      // Redis itself is down. Never a silent local pass or fail.
      this.logger.error(`sample check store unavailable: ${String(error)}`);
      throw unavailable();
    }
  }

  /**
   * A check, reauthorized: holding its id grants nothing. A check that is not
   * this student's reads exactly as an expired one does.
   */
  async get(
    identity: SupabaseIdentity,
    input: GetSampleCheckInput,
    signal?: AbortSignal,
  ): Promise<SampleCheckView> {
    const { store, record, visible } = await this.readOwned(identity, input);
    if (!record) return expiredView(input.checkId);
    const current = (await this.endIfOverdue(store, record)) ?? record;
    if (!input.waitWhile || !isSampleCheckActive(input.waitWhile)) return toView(current, visible);
    return toView(await this.waitWhile(store, current, input.waitWhile, signal), visible);
  }

  /**
   * Holds a read until the check leaves the status the browser last saw.
   *
   * The browser used to ask once a second, so even a program that ran in ten
   * milliseconds reached the terminal a second later, and every input line of
   * a C/C++ Run paid that second again. Held here instead, the answer leaves
   * as soon as the worker writes it. Access was checked once, above; the loop
   * reads only Redis, so a held read costs the database what one poll did.
   * Bounded by `SAMPLE_CHECK_WAIT_MS`, after which the browser simply asks
   * again, and released at once when the browser goes away.
   */
  private async waitWhile(
    store: SampleCheckStore,
    record: SampleCheckRecord,
    seen: SampleCheckStatus,
    signal?: AbortSignal,
  ): Promise<SampleCheckRecord> {
    const deadline = Date.now() + SAMPLE_CHECK_WAIT_MS;
    let current = record;
    let movedAt: number | null = null;
    while (isSampleCheckActive(current.status) && !signal?.aborted) {
      const now = Date.now();
      if (now >= deadline) break;
      if (current.status !== seen) {
        movedAt ??= now;
        // Running now: give a short program the moment it needs to finish.
        if (current.status !== "RUNNING" || now - movedAt >= RUNNING_GRACE_MS) break;
      }
      await pause(WAIT_STEP_MS, signal);
      try {
        const next = await store.get(current.checkId);
        if (!next) break;
        current = (await this.endIfOverdue(store, next)) ?? next;
      } catch {
        // Redis faltered mid-wait: answer with what is known; the browser asks again.
        break;
      }
    }
    return current;
  }

  /**
   * Ends a check that has outstayed its limits, on the read that notices.
   *
   * The ten-second queue wait is measured from acceptance, but the worker can
   * only check it once it has picked the job up — so a judge with every slot
   * busy leaves a student watching "Queued" long past the limit they were
   * promised, and holding the outstanding slot that stops them starting
   * another. Whoever reads the check next ends it instead.
   *
   * Both endings are compare-and-set from an active status, so a worker
   * claiming the job at the same moment wins and keeps its run; this read then
   * reports whatever the worker made of it.
   */
  private async endIfOverdue(
    store: SampleCheckStore,
    record: SampleCheckRecord,
  ): Promise<SampleCheckRecord | null> {
    const now = Date.now();
    if (record.status === "QUEUED" && now > record.acceptedAt + SAMPLE_QUEUE_WAIT_MS) {
      const expired = await store.transition(record, ["QUEUED"], {
        status: "TIMED_OUT",
        failure: "QUEUE_WAIT",
        finishedAt: now,
      });
      if (!expired) return store.get(record.checkId);
      // Terminal, so its admission markers are freed in the same write and the
      // student may start another check at once. The job it never reached is
      // dropped rather than left to produce a result nobody is waiting for.
      await this.queue?.removeSampleCheck(record.checkId, record.snapshot.executionRuntimeSnapshot).catch(() => undefined);
      return expired;
    }
    if (isSampleCheckActive(record.status) && now > record.lostAfter) {
      // The job died without finishing. Reported as ours, not the student's.
      return store.transition(record, ["QUEUED", "RUNNING", "STOPPING"], {
        status: "UNAVAILABLE",
        failure: "WORKER_LOST",
        finishedAt: now,
      });
    }
    return null;
  }

  /**
   * Stops a check. Queued work is removed at once; running work cannot be
   * interrupted mid-case in this release, so it becomes `STOPPING` and holds
   * its slot until its bounded run ends — capacity is never marked free just
   * because someone stopped waiting. Idempotent.
   */
  async cancel(
    identity: SupabaseIdentity,
    input: { academyId: string; checkId: string },
  ): Promise<SampleCheckView> {
    const { store, record, visible } = await this.readOwned(identity, input);
    if (!record) return expiredView(input.checkId);
    if (record.status === "QUEUED") {
      const cancelled = await store.transition(record, ["QUEUED"], {
        status: "CANCELLED",
        finishedAt: Date.now(),
      });
      if (cancelled) {
        await this.queue?.removeSampleCheck(record.checkId, record.snapshot.executionRuntimeSnapshot).catch(() => undefined);
        return toView(cancelled, visible);
      }
    }
    if (record.status === "RUNNING" || record.status === "QUEUED") {
      const stopping = await store.transition(record, ["RUNNING"], {
        status: "STOPPING",
      });
      if (stopping) return toView(stopping, visible);
    }
    const latest = await store.get(record.checkId);
    return latest ? toView(latest, visible) : expiredView(input.checkId);
  }

  private async readOwned(
    identity: SupabaseIdentity,
    input: { academyId: string; checkId: string },
  ): Promise<{
    store: SampleCheckStore;
    record: SampleCheckRecord | null;
    visible: boolean;
  }> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.read",
    );
    const store = this.store;
    if (!store) throw unavailable();
    let record: SampleCheckRecord | null;
    try {
      record = await store.get(input.checkId);
    } catch (error) {
      this.logger.error(`sample check store unavailable: ${String(error)}`);
      throw unavailable();
    }
    if (!record || record.userId !== actor.userId || record.academyId !== input.academyId) {
      return { store, record: null, visible: false };
    }
    // Current access, not access at acceptance: a student who has since lost
    // the course reads nothing more about it. Polling needs revision/visibility
    // only; code, statements, hidden cases and the course graph stay out.
    const material = await this.prisma.material.findFirst({
      where: {
        id: record.materialId,
        // A staff member's practice reads back under practice's own rules,
        // which reach the unpublished revision a preview ran.
        ...(record.practice
          ? staffPracticeMaterialWhere(input.academyId, actor, true)
          : reachableMaterialWhere(input.academyId, learningScopeFor(input.academyId, actor))),
      },
      select: {
        programmingExercise: {
          select: {
            gradingRevision: true,
            testCases: {
              where: { position: record.position, visibility: "SAMPLE" },
              select: { position: true, visibility: true },
            },
          },
        },
      },
    });
    const exercise = material?.programmingExercise;
    if (!exercise) throw notFound();
    // The rule is shown only while this exact case is still public at this
    // revision. A reordered or hidden case withholds it rather than risk
    // describing a different case under the same position. A Run has no case:
    // its input was the student's own.
    const visible =
      exercise.gradingRevision === record.exerciseRevision &&
      (record.kind === "run" ||
        exercise.testCases.some(
          (candidate) =>
            candidate.position === record!.position && candidate.visibility === "SAMPLE",
        ));
    return { store, record, visible };
  }

  private async replay(
    store: SampleCheckStore,
    checkId: string,
    requestHash: string,
  ): Promise<SampleCheckView> {
    const record = await store.get(checkId);
    if (!record) return expiredView(checkId);
    if (record.requestHash !== requestHash) {
      throw new AppException("SAMPLE_CHECK_CONFLICT", HttpStatus.CONFLICT);
    }
    if (record.status === "QUEUED") await this.queue?.enqueueSampleCheck(record.checkId, record.snapshot.executionRuntimeSnapshot);
    return toView(record, true);
  }

  private async enabledFor(academyId: string): Promise<boolean> {
    const flag = await this.prisma.academyFeatureFlag.findUnique({
      where: { academyId_feature: { academyId, feature: "SERVER_SAMPLE_CHECKS" } },
      select: { isEnabled: true },
    });
    return flag?.isEnabled ?? false;
  }
}

/** Resolves after `ms`, or at once when the request goes away. */
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
  });
}

/** The public projection. The snapshot's code never leaves; its case only if still public. */
export function toView(record: SampleCheckRecord, visible: boolean): SampleCheckView {
  const run = record.kind === "run";
  return {
    checkId: record.checkId,
    kind: run ? "run" : "sample",
    status: record.status,
    position: run ? null : record.position,
    codeHash: record.codeHash,
    exerciseRevision: record.exerciseRevision,
    result:
      record.status === "COMPLETED" && record.result
        ? {
            ...record.result,
            // A check's input is public or the student's own: its ending may be shown.
            ...programExit({ exitCode: record.result.exitCode ?? null, exitSignal: record.result.exitSignal ?? null }),
            compileDiagnostics: record.result.compileDiagnostics ?? null,
            rule: visible && !run
              ? {
                  comparator: record.snapshot.testCase.comparator,
                  expected: record.snapshot.testCase.expectedOutput,
                }
              : null,
          }
        : null,
    refreshRequired: !visible,
    timings: record.timings,
  };
}

function expiredView(checkId: string): SampleCheckView {
  return {
    checkId,
    kind: "sample",
    status: "EXPIRED",
    position: null,
    codeHash: null,
    exerciseRevision: null,
    result: null,
    refreshRequired: false,
    timings: { queueMs: null, executionMs: null, comparisonMs: null },
  };
}

function notFound(): AppException {
  return new AppException("SAMPLE_CHECK_NOT_FOUND", HttpStatus.NOT_FOUND);
}

function unavailable(): AppException {
  return new AppException("SAMPLE_CHECK_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
