import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  OPERATION_RUNS_PAGE_MAX,
  STALE_PROBLEMS_MAX,
  type ListOperationRunsInput,
  type ListStaleProblemsInput,
  type OperationRun,
  type OperationRunList,
  type PlanRegradeInput,
  type RegradePlan,
  type StaleProblemBoard,
  type StartRegradeInput,
} from "@cove/shared";

import type { ApiEnvironment } from "../config/env.schema.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AuditService } from "../academies/audit.service.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { PlatformAccessService } from "../authorization/platform-access.service.js";
import { AppException } from "../common/app-exception.js";
import { currentSupportGrantId } from "../common/request-context.js";
import { PrismaService } from "../database/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";

/**
 * The ceiling on one run.
 *
 * A plan is one submission per affected student, so this is a number of
 * students at one problem — a figure in the tens for a class and the low
 * hundreds for an academy. The cap exists so that a mistake somewhere upstream
 * shows up as a refusal an operator can read rather than as a transaction that
 * takes the database down.
 */
export const REGRADE_MAX_SUBMISSIONS = 2_000;

/** How many repairs are written per transaction while a plan is expanded. */
const CREATE_CHUNK = 100;

/**
 * How long a counted-but-unconfirmed plan holds its problem.
 *
 * A plan claims the in-flight slot the moment it is counted, so two people
 * cannot both be looking at one and both confirm it. The cost is that a plan
 * nobody confirms — a closed tab, a browser crash, a reader who thought better
 * of it — would hold that problem forever, and the surface would report it as
 * "running now" while nothing ran. Ten minutes is far longer than reading a
 * confirmation dialog and far shorter than a working day.
 */
const PLAN_ABANDONED_AFTER_MS = 10 * 60_000;

/**
 * How long a dispatched run may go untouched before it is treated as lost.
 *
 * Its repairs are ordinary queued submissions, so BullMQ's own retries and the
 * judge's stale sweep resolve anything survivable long before this. A run still
 * in `RUNNING` an hour later lost its API process mid-dispatch, and holding the
 * problem on its behalf helps nobody.
 */
const RUN_STUCK_AFTER_MS = 60 * 60_000;

type StaleRow = { submissionId: string; userId: string };

/**
 * Re-grading the submissions a corrected problem left behind.
 *
 * ## The defect this exists to repair
 *
 * When an author corrects a test case, `ProgrammingExercise.gradingRevision`
 * increments. Nothing rewrites the work already graded against the old one, and
 * three surfaces then compare the two revisions and quietly stop trusting what
 * they hold: a student's own problem status falls back to their draft, their
 * overview stops counting the solve, and the teacher's progress view marks the
 * revision stale. Every student who had solved the problem sees it as unsolved,
 * and nothing puts it back.
 *
 * There is a second population with more at stake. A test case whose expected
 * output was wrong *failed correct programs*. Those students were never paid,
 * and re-grading them at the corrected revision takes the `solvedNow` branch in
 * `GradingService` — they are recorded as solving it and earn the award, and
 * any lecture or course they complete by it.
 *
 * ## Why a repair is a new submission
 *
 * A `Submission` owns an immutable snapshot: its grading cases, its limits, its
 * language, and the titles that printed when it was written. Re-running one in
 * place would grade it against the *old* cases and prove nothing; overwriting
 * the snapshot would destroy the history the snapshot exists to protect. So a
 * repair is a new row carrying the student's original code and the problem's
 * current snapshot — which also means it is `QUEUED`, and the judge's
 * claim-by-conditional-update works on it unchanged.
 *
 * `regradeRunId` is what marks it. Two things read that column: `nextProgress`
 * leaves the attempt count alone, and every history a person reads filters it
 * out.
 */
@Injectable()
export class RegradeService {
  private readonly logger = new Logger(RegradeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlatformAccessService,
    private readonly academyAccess: AcademyAccessService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  /* --------------------------------------------------------- authorization */

  /**
   * Who may repair one academy's records.
   *
   * Two axes answer, and the order matters. A Cove operator holding
   * `platform.health.read` may act in any academy — that is the whole point of
   * the console. An academy's own Team Lead or Manager may act in theirs, and
   * nowhere else, through `curriculum.regrade`.
   *
   * The academy axis is the one that carries the argument. Re-grading was first
   * written as an operator-only act on the reasoning that it is nobody's job
   * inside the academy — but the person who *causes* it is an academy's own
   * Team Lead correcting a test case, and they are the one who knows which
   * problem was wrong and which class is waiting on it. Making them ask Cove to
   * repair their own students' records is the kind of dependency that ends in a
   * support ticket for a button.
   *
   * Platform is tried first rather than last. `AcademyAccessService` resolves
   * an operator standing in an academy as `MANAGER`, so checking it first would
   * make an operator's authority look like a membership in the audit trail.
   */
  private async authorize(
    identity: SupabaseIdentity,
    academyId: string,
  ): Promise<{ userId: string; viaPlatform: boolean }> {
    try {
      const operator = await this.access.requirePermission(
        identity.authUserId,
        "platform.health.read",
      );
      return { userId: operator.userId, viaPlatform: true };
    } catch (error) {
      if (!isPlatformDenial(error)) throw error;
    }
    const actor = await this.academyAccess.requirePermission(
      identity.authUserId,
      academyId,
      "curriculum.regrade",
    );
    return { userId: actor.userId, viaPlatform: false };
  }

  /**
   * The console's cross-academy reads, which no academy role can make.
   *
   * "Every run on the platform" is a question only an operator has, and an
   * academy asking it would be asking about other customers.
   */
  private async requireOperator(identity: SupabaseIdentity): Promise<void> {
    await this.access.requirePermission(
      identity.authUserId,
      "platform.health.read",
    );
  }

  /* ------------------------------------------------------------- the board */

  /**
   * Problems whose grading moved on without their submissions.
   *
   * One query per question rather than one per problem: the stale rows are
   * grouped in the database, and the titles are read for the handful of
   * materials that came back. Walking the academy's problems and counting each
   * would be a query per exercise on a page whose purpose is to show many.
   */
  async staleProblems(
    identity: SupabaseIdentity,
    input: ListStaleProblemsInput,
  ): Promise<StaleProblemBoard> {
    await this.authorize(identity, input.academyId);

    const rows = await this.prisma.$queryRaw<
      {
        materialId: string;
        currentRevision: number;
        staleCount: number;
        studentCount: number;
      }[]
    >`
      WITH latest AS (
        -- Each student's most recent verdict per problem, repairs included.
        -- Counting every behind-revision row instead would keep a problem on
        -- this board after its students had been repaired, because their
        -- original submission is still behind and still exists.
        SELECT DISTINCT ON (s.material_id, s.user_id)
          s.material_id,
          s.user_id,
          s.grading_revision AS revision
        FROM submissions s
        JOIN courses c ON c.id = s.course_id
        WHERE c.academy_id = ${input.academyId}::uuid
          AND s.status IN ('PASSED', 'FAILED')
        ORDER BY s.material_id, s.user_id, s.created_at DESC, s.id DESC
      ),
      behind AS (
        SELECT l.material_id, e.grading_revision AS current_revision
        FROM latest l
        JOIN programming_exercises e ON e.material_id = l.material_id
        WHERE l.revision < e.grading_revision
      )
      SELECT
        b.material_id AS "materialId",
        b.current_revision AS "currentRevision",
        COUNT(*)::int AS "studentCount",
        -- Every old answer still on file for this problem, which is the volume
        -- of history behind the repair rather than the work it will do.
        (
          SELECT COUNT(*)::int
          FROM submissions old
          WHERE old.material_id = b.material_id
            AND old.status IN ('PASSED', 'FAILED')
            AND old.grading_revision < b.current_revision
        ) AS "staleCount"
      FROM behind b
      GROUP BY b.material_id, b.current_revision
      ORDER BY COUNT(*) DESC, b.material_id
      LIMIT ${STALE_PROBLEMS_MAX + 1}
    `;
    // One more than the ceiling, so "there are more" is a fact rather than a
    // guess from a full page.
    const truncated = rows.length > STALE_PROBLEMS_MAX;
    if (truncated) rows.length = STALE_PROBLEMS_MAX;
    if (rows.length === 0) {
      return { rows: [], academyId: input.academyId, truncated: false };
    }

    const materialIds = rows.map((row) => row.materialId);
    const [materials, inFlight] = await Promise.all([
      this.prisma.material.findMany({
        where: { id: { in: materialIds } },
        select: {
          id: true,
          title: true,
          lecture: {
            select: {
              title: true,
              courseModule: {
                select: {
                  title: true,
                  course: { select: { id: true, title: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.platformOperationRun.findMany({
        where: {
          operation: "REGRADE_STALE_SUBMISSIONS",
          targetId: { in: materialIds },
          // A claim only counts while it is still alive, which is the same
          // cutoff `releaseAbandoned` writes with. Reading it as "any PLANNING
          // or RUNNING row" deadlocked the page: an abandoned plan showed the
          // problem as running, the running label replaced the button that
          // selects it, and the sweep that would have freed it only runs when
          // somebody plans — which they could no longer do.
          //
          // Applied as a filter rather than by sweeping here, because a board
          // is a read. The row is still tidied up, by the next plan against it.
          OR: [
            {
              status: "PLANNING" as const,
              createdAt: { gte: new Date(Date.now() - PLAN_ABANDONED_AFTER_MS) },
            },
            {
              status: "RUNNING" as const,
              startedAt: { gte: new Date(Date.now() - RUN_STUCK_AFTER_MS) },
            },
          ],
        },
        select: { id: true, targetId: true },
      }),
    ]);

    const byId = new Map(materials.map((material) => [material.id, material]));
    const runByTarget = new Map(
      inFlight.map((run) => [run.targetId, run.id] as const),
    );

    return {
      academyId: input.academyId,
      truncated,
      rows: rows.flatMap((row) => {
        const material = byId.get(row.materialId);
        // A material deleted since its submissions were written. There is
        // nothing to re-grade against, and `grade()` would fail every job
        // `EXERCISE_UNAVAILABLE`, so it is not offered.
        if (!material) return [];
        const courseModule = material.lecture.courseModule;
        return [
          {
            materialId: row.materialId,
            problemTitle: material.title,
            courseId: courseModule.course.id,
            courseTitle: courseModule.course.title,
            moduleTitle: courseModule.title,
            lectureTitle: material.lecture.title,
            currentRevision: row.currentRevision,
            staleCount: row.staleCount,
            studentCount: row.studentCount,
            inFlightRunId: runByTarget.get(row.materialId) ?? null,
          },
        ];
      }),
    };
  }

  /* -------------------------------------------------------------- planning */

  /**
   * Counts what a re-grade would touch, and claims the problem while the
   * operator decides.
   *
   * The run is created before the count is shown, which is deliberate: it takes
   * the in-flight slot immediately, so two operators cannot both be looking at
   * a plan for the same problem and both confirm it. The cost is a `PLANNING`
   * row for a plan somebody abandoned, which is exactly the trace that explains
   * a question nobody asked out loud.
   */
  async planRegrade(
    identity: SupabaseIdentity,
    input: PlanRegradeInput,
    context: { requestId: string },
  ): Promise<RegradePlan> {
    const actor = await this.authorize(identity, input.academyId);
    const { material, currentRevision } = await this.requireProblem(input);

    const stale = await this.staleFor(input.materialId, currentRevision);
    if (stale.length === 0) {
      throw new AppException("OPERATION_PLAN_EMPTY", HttpStatus.CONFLICT);
    }
    if (stale.length > REGRADE_MAX_SUBMISSIONS) {
      throw new AppException("OPERATION_PLAN_TOO_LARGE", HttpStatus.CONFLICT);
    }

    await this.releaseAbandoned(input.materialId);

    const supportGrantId = currentSupportGrantId() ?? null;
    const run = await this.prisma
      .$transaction(async (tx) => {
        const created = await tx.platformOperationRun.create({
          data: {
            academyId: input.academyId,
            operation: "REGRADE_STALE_SUBMISSIONS",
            targetType: "material",
            targetId: input.materialId,
            actorUserId: actor.userId,
            requestId: context.requestId,
            supportGrantId,
            status: "PLANNING",
            // One repair per student: `staleFor` already reduced to each
            // student's most recent stale attempt, so these two are the same
            // number and the console says so rather than implying more work.
            plannedCount: stale.length,
            studentCount: stale.length,
          },
        });
        await this.audit.write(tx, {
          actorUserId: actor.userId,
          academyId: input.academyId,
          action: "platform.regrade.planned",
          targetType: "material",
          targetId: input.materialId,
          after: {
            runId: created.id,
            revision: currentRevision,
            plannedCount: stale.length,
          },
          requestId: context.requestId,
        });
        return created;
      })
      .catch((error) => {
        throw this.asInFlightConflict(error);
      });

    return {
      runId: run.id,
      materialId: input.materialId,
      problemTitle: material.title,
      currentRevision,
      plannedCount: stale.length,
      studentCount: stale.length,
    };
  }

  /**
   * Gives back a slot nobody is using.
   *
   * Runs before every plan rather than on a timer: the only moment anybody
   * cares that a problem is claimed is when somebody wants to claim it, and a
   * sweep that fires then needs no scheduler, no second process, and no
   * reasoning about what happens when two of them run at once.
   *
   * Both states are marked `FAILED` rather than deleted. A run that was counted
   * and abandoned is a real thing that happened, and the runs table is where
   * somebody looks to find out why a problem sat there.
   */
  private async releaseAbandoned(materialId: string): Promise<void> {
    const now = Date.now();
    await this.prisma.platformOperationRun.updateMany({
      where: {
        operation: "REGRADE_STALE_SUBMISSIONS",
        targetId: materialId,
        status: "PLANNING",
        createdAt: { lt: new Date(now - PLAN_ABANDONED_AFTER_MS) },
      },
      data: {
        status: "FAILED",
        failureReason: "PLAN_ABANDONED",
        finishedAt: new Date(),
      },
    });
    await this.prisma.platformOperationRun.updateMany({
      where: {
        operation: "REGRADE_STALE_SUBMISSIONS",
        targetId: materialId,
        status: "RUNNING",
        startedAt: { lt: new Date(now - RUN_STUCK_AFTER_MS) },
      },
      data: {
        status: "FAILED",
        failureReason: "RUN_LOST",
        finishedAt: new Date(),
      },
    });
  }

  /**
   * The reader closed the dialog without confirming.
   *
   * The tidy half of `releaseAbandoned`: this frees the problem immediately
   * instead of ten minutes later, which is what somebody who changed their mind
   * and wants to pick a different problem actually needs. The sweep stays,
   * because a closed tab never calls this.
   */
  async cancelPlan(
    identity: SupabaseIdentity,
    input: StartRegradeInput,
  ): Promise<{ cancelled: boolean }> {
    const run = await this.prisma.platformOperationRun.findUnique({
      where: { id: input.runId },
      select: { academyId: true },
    });
    if (!run) return { cancelled: false };
    await this.authorize(identity, run.academyId);

    // Filtered on PLANNING, so a confirm that landed first wins and a cancel
    // arriving after it cannot stop a run that is already dispatching.
    const released = await this.prisma.platformOperationRun.updateMany({
      where: { id: input.runId, status: "PLANNING" },
      data: {
        status: "FAILED",
        failureReason: "PLAN_CANCELLED",
        finishedAt: new Date(),
      },
    });
    return { cancelled: released.count > 0 };
  }

  /* ------------------------------------------------------------ dispatching */

  /**
   * Writes the repairs and hands them to the judge.
   *
   * Expansion is synchronous rather than a fan-out job, because a plan is one
   * row per affected student at one problem and `REGRADE_MAX_SUBMISSIONS`
   * refuses anything that is not. The grading itself is not synchronous: these
   * rows leave `QUEUED` and the judge takes them at its own pace.
   *
   * The plan is re-read here rather than trusted from `planRegrade`. A student
   * may have resubmitted while the confirmation dialog was open, and re-grading
   * a submission they have already superseded would repair a record with older
   * code than the student's own.
   */
  async startRegrade(
    identity: SupabaseIdentity,
    input: StartRegradeInput,
    dispatch: (job: {
      runId: string;
      submissionId: string;
      requestId: string | null;
    }) => Promise<void>,
  ): Promise<OperationRun> {
    const run = await this.prisma.platformOperationRun.findUnique({
      where: { id: input.runId },
    });
    if (!run) {
      throw new AppException("OPERATION_RUN_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    // Authorized against the run's own academy, read first. A Team Lead may
    // only start a run in the academy they hold, and the run is what says which
    // academy that is — taking it from the caller would let them name theirs.
    const actor = await this.authorize(identity, run.academyId);
    if (run.status !== "PLANNING") {
      throw new AppException("OPERATION_RUN_NOT_PENDING", HttpStatus.CONFLICT);
    }

    const { currentRevision } = await this.requireProblem({
      academyId: run.academyId,
      materialId: run.targetId,
    });
    const stale = await this.staleFor(run.targetId, currentRevision);
    if (stale.length === 0) {
      await this.settle(run.id, "COMPLETED", null);
      return this.run(identity, { runId: run.id });
    }

    await this.prisma.platformOperationRun.update({
      where: { id: run.id },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
        plannedCount: stale.length,
        studentCount: stale.length,
      },
    });
    await this.prisma.$transaction((tx) =>
      this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: run.academyId,
        action: "platform.regrade.started",
        targetType: "material",
        targetId: run.targetId,
        before: { revision: currentRevision, plannedCount: stale.length },
        requestId: run.requestId ?? undefined,
        supportGrantId: run.supportGrantId ?? undefined,
      }),
    );

    let dispatched = 0;
    for (let index = 0; index < stale.length; index += CREATE_CHUNK) {
      const chunk = stale.slice(index, index + CREATE_CHUNK);
      const created = await this.prisma.$transaction((tx) =>
        this.writeRepairs(tx, run.id, chunk),
      );
      for (const submissionId of created) {
        await dispatch({
          runId: run.id,
          submissionId,
          requestId: run.requestId,
        });
        dispatched += 1;
      }
      await this.prisma.platformOperationRun.update({
        where: { id: run.id },
        data: { dispatchedCount: dispatched },
      });
    }

    this.logger.log(
      `[${run.requestId ?? "-"}] regrade ${run.id}: dispatched ${dispatched}`,
    );
    return this.run(identity, { runId: run.id });
  }

  /* ---------------------------------------------------------------- reading */

  async run(
    identity: SupabaseIdentity,
    input: { runId: string },
  ): Promise<OperationRun> {
    const run = await this.prisma.platformOperationRun.findUnique({
      where: { id: input.runId },
      include: runInclude,
    });
    if (!run) {
      throw new AppException("OPERATION_RUN_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    await this.authorize(identity, run.academyId);
    return this.toRun(run);
  }

  async runs(
    identity: SupabaseIdentity,
    input: ListOperationRunsInput,
  ): Promise<OperationRunList> {
    // Narrowed to one academy, an academy role may ask. Unnarrowed, this is
    // "every run on the platform", which is an operator's question and would
    // otherwise be an academy reading about other customers.
    if (input.academyId) await this.authorize(identity, input.academyId);
    else await this.requireOperator(identity);

    const runs = await this.prisma.platformOperationRun.findMany({
      where: input.academyId ? { academyId: input.academyId } : {},
      orderBy: { createdAt: "desc" },
      take: Math.min(input.limit, OPERATION_RUNS_PAGE_MAX),
      include: runInclude,
    });
    const titles = await this.titlesFor(runs.map((run) => run.targetId));
    return { runs: runs.map((run) => this.toRun(run, titles)) };
  }

  /* ------------------------------------------------------------- internals */

  /**
   * §5.10's five rules, written once.
   *
   * `DISTINCT ON` is rule 4: one row per student, their most recent terminal
   * attempt. Re-grading the earlier ones would repair nothing the latest does
   * not, at a cost proportional to how much a student struggled — which is the
   * wrong thing for a repair to be proportional to.
   *
   * **The revision test is applied after that, not before it, and a repair is
   * an ordinary row inside it.** Filtering repairs out first was a bug: their
   * original submission stayed the newest row that matched, so a student came
   * back stale after being repaired and every later run re-graded them again.
   * Letting a repair be the newest submission makes the query self-correcting —
   * a student repaired at the current revision is no longer behind, and a
   * second revision bump makes their repair stale in turn, which is exactly
   * what should happen.
   */
  private async staleFor(
    materialId: string,
    currentRevision: number,
  ): Promise<StaleRow[]> {
    return this.prisma.$queryRaw<StaleRow[]>`
      SELECT latest."submissionId", latest."userId"
      FROM (
        SELECT DISTINCT ON (s.user_id)
          s.id AS "submissionId",
          s.user_id AS "userId",
          s.grading_revision AS revision
        FROM submissions s
        WHERE s.material_id = ${materialId}::uuid
          AND s.status IN ('PASSED', 'FAILED')
        ORDER BY s.user_id, s.created_at DESC, s.id DESC
      ) latest
      WHERE latest.revision < ${currentRevision}
    `;
  }

  /**
   * One chunk of repairs, each a new submission carrying the student's code and
   * the problem's current snapshot.
   *
   * `solveSessionId` and `solveElapsedSec` are deliberately absent: nobody sat
   * down and solved anything, and a synthetic solve time would corrupt the
   * teacher analytics that read those columns. `classId` is copied, because
   * point attribution and class rankings must keep describing the class the
   * work was actually done in — and a submission written before class
   * attribution existed has none, which is why those students' records are
   * repaired and their points are not.
   */
  private async writeRepairs(
    tx: Prisma.TransactionClient,
    runId: string,
    chunk: StaleRow[],
  ): Promise<string[]> {
    const originals = await tx.submission.findMany({
      where: { id: { in: chunk.map((row) => row.submissionId) } },
      select: {
        id: true,
        userId: true,
        materialId: true,
        sourceMaterialId: true,
        courseId: true,
        classId: true,
        code: true,
      },
    });

    const created: string[] = [];
    for (const original of originals) {
      if (!original.materialId) continue;
      const material = await tx.material.findUnique({
        where: { id: original.materialId },
        select: {
          title: true,
          position: true,
          programmingExercise: {
            select: {
              gradingRevision: true,
              language: true,
              timeLimitMs: true,
              memoryLimitMb: true,
              testCases: {
                orderBy: { position: "asc" },
                select: {
                  input: true,
                  expectedOutput: true,
                  visibility: true,
                },
              },
            },
          },
          lecture: {
            select: {
              title: true,
              position: true,
              courseModule: {
                select: {
                  title: true,
                  position: true,
                  course: { select: { title: true } },
                },
              },
            },
          },
        },
      });
      const exercise = material?.programmingExercise;
      if (!material || !exercise || exercise.testCases.length === 0) continue;

      const courseModule = material.lecture.courseModule;
      const repair = await tx.submission.create({
        data: {
          userId: original.userId,
          materialId: original.materialId,
          sourceMaterialId: original.sourceMaterialId,
          courseId: original.courseId,
          classId: original.classId,
          regradeRunId: runId,
          gradingRevision: exercise.gradingRevision,
          language: exercise.language,
          timeLimitMs: exercise.timeLimitMs,
          memoryLimitMb: exercise.memoryLimitMb,
          code: original.code,
          totalCount: exercise.testCases.length,
          // The runtime that will actually judge it, exactly as
          // `SubmissionService` stamps it: a repair is graded now, by this
          // deployment, and must say so.
          engineVersion: this.config.get("PYODIDE_VERSION", { infer: true }),
          problemTitle: material.title,
          courseTitle: courseModule.course.title,
          moduleTitle: courseModule.title,
          lectureTitle: material.lecture.title,
          modulePosition: courseModule.position,
          lecturePosition: material.lecture.position,
          problemPosition: material.position,
          gradingCases: {
            create: exercise.testCases.map((testCase, index) => ({
              position: index + 1,
              input: testCase.input,
              expectedOutput: testCase.expectedOutput,
              isSample: testCase.visibility === "SAMPLE",
            })),
          },
        },
        select: { id: true },
      });
      created.push(repair.id);
    }
    return created;
  }

  private async requireProblem(input: {
    academyId: string;
    materialId: string;
  }): Promise<{ material: { title: string }; currentRevision: number }> {
    const material = await this.prisma.material.findFirst({
      where: {
        id: input.materialId,
        lecture: {
          courseModule: { course: { academyId: input.academyId } },
        },
      },
      select: {
        title: true,
        programmingExercise: { select: { gradingRevision: true } },
      },
    });
    if (!material?.programmingExercise) {
      throw new AppException("EXERCISE_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    return {
      material: { title: material.title },
      currentRevision: material.programmingExercise.gradingRevision,
    };
  }

  /**
   * The partial unique index, read back as a refusal an operator understands.
   *
   * Postgres raises this, not a read-then-write, so two operators confirming
   * the same problem at the same moment race in the database and exactly one
   * wins. See `platform_operation_runs_one_in_flight_key`.
   */
  private asInFlightConflict(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return new AppException("OPERATION_ALREADY_RUNNING", HttpStatus.CONFLICT);
    }
    return error;
  }

  private async settle(
    runId: string,
    status: "COMPLETED" | "FAILED",
    failureReason: string | null,
  ): Promise<void> {
    await this.prisma.platformOperationRun.update({
      where: { id: runId },
      data: { status, failureReason, finishedAt: new Date() },
    });
  }

  private async titlesFor(
    materialIds: string[],
  ): Promise<Map<string, string>> {
    if (materialIds.length === 0) return new Map();
    const materials = await this.prisma.material.findMany({
      where: { id: { in: materialIds } },
      select: { id: true, title: true },
    });
    return new Map(materials.map((material) => [material.id, material.title]));
  }

  private toRun(
    run: Prisma.PlatformOperationRunGetPayload<{ include: typeof runInclude }>,
    titles?: Map<string, string>,
  ): OperationRun {
    return {
      id: run.id,
      academyId: run.academyId,
      academySlug: run.academy.slug,
      academyName: run.academy.name,
      operation: run.operation,
      targetType: run.targetType,
      targetId: run.targetId,
      targetTitle: titles?.get(run.targetId) ?? null,
      actorName: run.actor.displayName ?? run.actor.username ?? "—",
      status: run.status,
      plannedCount: run.plannedCount,
      studentCount: run.studentCount,
      dispatchedCount: run.dispatchedCount,
      completedCount: run.completedCount,
      failedCount: run.failedCount,
      failureReason: run.failureReason,
      createdAt: run.createdAt.toISOString(),
      startedAt: run.startedAt?.toISOString() ?? null,
      finishedAt: run.finishedAt?.toISOString() ?? null,
    };
  }
}

/**
 * "You are not a Cove operator" — and nothing else.
 *
 * Only this one code means *try the academy axis instead*. A suspended account
 * or an incomplete profile must propagate: those are true of the caller
 * everywhere, and falling through would re-ask the same question of a different
 * service and answer it with a worse sentence.
 */
function isPlatformDenial(error: unknown): boolean {
  return (
    error instanceof AppException && error.code === "PLATFORM_ACCESS_DENIED"
  );
}

const runInclude = {
  academy: { select: { slug: true, name: true } },
  actor: { select: { displayName: true, username: true } },
} as const;
