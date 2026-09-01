import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import {
  CONTENT_IMPORT_MAX_PROBLEMS,
  CONTENT_IMPORT_PREVIEW_TTL_MS,
  CONTENT_IMPORT_TEMPLATE_VERSION,
  buildBlankWorkbook,
  buildCurrentCourseWorkbook,
  canCommitPlan,
  contentImportPlanSchema,
  countProjectionProblems,
  planContentImport,
  readWorkbookRows,
  stableKeyFromUuid,
  workbookFilename,
  type ContentImportPlan,
  type ContentImportPreview,
  type ContentImportResult,
  type ContentImportResultEntity,
  type CourseProjection,
  type ExistingModule,
  type PlannedLecture,
  type PlannedModule,
  type PlannedProblem,
  type WorkbookLocale,
} from "@cove/shared";

import { AuditService } from "../../academies/audit.service.js";
import type { SupabaseIdentity } from "../../auth/auth.types.js";
import { AcademyAccessService } from "../../authorization/academy-access.service.js";
import { AppException } from "../../common/app-exception.js";
import { PrismaService } from "../../database/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import {
  bumpContentRevision,
  mergePreferredPositions,
  rewritePositions,
} from "../content-positions.js";
import {
  ContentWorkbookError,
  readContentWorkbook,
} from "./content-workbook-reader.js";
import { writeWorkbook } from "../../common/workbook-writer.js";
import { resolveWorkbookDescription } from "./description-html.js";

/**
 * Authorization, previews, and the one transaction that changes a curriculum.
 *
 * Every method here starts from the same three questions — is this person a
 * Team Lead of *this* academy, does this course belong to it, and does this
 * session belong to that course — and none of them trusts the answer the
 * previous call got. §8 requires each operation to verify the session, academy,
 * course, actor, and permission independently, because the alternative is a
 * chain where one weak link grants the whole feature.
 *
 * The commit is the part worth reading closely. §11 lists twenty ordered steps
 * and they are ordered for a reason: the cheap refusals come first so a stale
 * preview never reaches a transaction, the status claim happens before the
 * transaction opens so two tabs cannot both be inside one, and the revision
 * check happens *again* inside the lock because the version checked outside it
 * is already historical by the time the lock is acquired.
 *
 * Rollback is the database's job. The v1 importer performed many independent
 * writes and simulated rollback by issuing deletes afterwards, which leaves
 * partial data whenever the cleanup itself fails — and the cleanup runs exactly
 * when things are already going wrong. Here every write is in one transaction
 * and a failure leaves the course untouched.
 *
 * See §7.2, §8, and §11 of the team lead Excel problem import design.
 */

const projectionInclude = {
  modules: {
    orderBy: [{ position: "asc" }, { id: "asc" }],
    include: {
      lectures: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        include: {
          materials: {
            orderBy: [{ position: "asc" }, { id: "asc" }],
            include: {
              programmingExercise: {
                include: {
                  testCases: { orderBy: [{ position: "asc" }, { id: "asc" }] },
                  hints: { orderBy: [{ position: "asc" }, { id: "asc" }] },
                },
              },
            },
          },
        },
      },
    },
  },
} as const satisfies Prisma.CourseInclude;

type CourseWithContent = Prisma.CourseGetPayload<{
  include: typeof projectionInclude;
}>;

type RequestContext = { requestId?: string };

@Injectable()
export class ContentImportService {
  private readonly logger = new Logger(ContentImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly audit: AuditService,
  ) {}

  /* ------------------------------------------------------------ downloads */

  /**
   * §4.3 — the two workbooks the Prepare stage offers.
   *
   * Both require `content.import` rather than the weaker review permission,
   * because the current-course workbook contains Hidden test inputs and
   * expected outputs. A Manager who can read the curriculum still cannot
   * download the answers to it.
   */
  async buildTemplate(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      courseId: string;
      kind: "current" | "blank";
      locale: WorkbookLocale;
      moduleIds: string[];
      lectureIds: string[];
    },
  ): Promise<{ filename: string; bytes: Buffer }> {
    await this.requireImporter(identity, input.academyId);
    const course = await this.requireCourse(input.academyId, input.courseId);

    if (input.kind === "blank") {
      return {
        filename: workbookFilename({ courseTitle: course.title, kind: "blank" }),
        bytes: writeWorkbook(buildBlankWorkbook(input.locale)),
      };
    }

    const projection = scopeProjection(toProjection(course), input);
    /*
     * §4.3 — Cove never offers a workbook its own importer would refuse.
     *
     * A course past the 200-problem cap is exported branch by branch, and the
     * Prepare stage asks for that selection before enabling the download. If a
     * request arrives without one anyway, refusing is the honest answer:
     * silently truncating would hand a team lead a file that looks complete and
     * clears the tests of every problem it left out.
     */
    if (countProjectionProblems(projection) > CONTENT_IMPORT_MAX_PROBLEMS) {
      throw new AppException(
        "CONTENT_IMPORT_VALIDATION_FAILED",
        HttpStatus.BAD_REQUEST,
        "too_many_problems",
      );
    }

    return {
      filename: workbookFilename({ courseTitle: course.title, kind: "current" }),
      bytes: writeWorkbook(
        buildCurrentCourseWorkbook({ course: projection, locale: input.locale }),
      ),
    };
  }

  /* -------------------------------------------------------------- preview */

  /**
   * §4.2 — the upload, which changes nothing.
   *
   * Reading the workbook, planning against the course, and storing the result
   * is the whole of it. A team lead who uploads the wrong file has done nothing
   * they need to undo, and that is what makes the wizard safe to explore.
   */
  async createPreview(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      courseId: string;
      filename: string;
      bytes: Buffer;
    },
    context: RequestContext = {},
  ): Promise<ContentImportPreview> {
    const actor = await this.requireImporter(identity, input.academyId);
    const course = await this.requireCourse(input.academyId, input.courseId);

    const started = Date.now();
    const workbook = this.read(input.bytes);

    if (workbook.templateVersion === null) {
      throw new AppException(
        "CONTENT_IMPORT_TEMPLATE_UNSUPPORTED",
        HttpStatus.BAD_REQUEST,
        "template_version_missing",
      );
    }
    if (workbook.templateVersion !== CONTENT_IMPORT_TEMPLATE_VERSION) {
      throw new AppException(
        "CONTENT_IMPORT_TEMPLATE_UNSUPPORTED",
        HttpStatus.BAD_REQUEST,
        `template_version_${workbook.templateVersion}`,
      );
    }

    const rows = readWorkbookRows({
      Structure: workbook.sheets.get("Structure") ?? [],
      Problems: workbook.sheets.get("Problems") ?? [],
      "Test Cases": workbook.sheets.get("Test Cases") ?? [],
      Hints: workbook.sheets.get("Hints") ?? [],
      unknownSheets: workbook.unknownSheets,
    });

    const projection = toProjection(course);
    const plan = planContentImport({
      workbook: rows,
      course: projection,
      resolveDescription: resolveWorkbookDescription,
    });

    const expiresAt = new Date(Date.now() + CONTENT_IMPORT_PREVIEW_TTL_MS);
    const session = await this.prisma.contentImportSession.create({
      data: {
        academyId: input.academyId,
        courseId: input.courseId,
        actorUserId: actor.userId,
        originalFilename: input.filename,
        // The bytes themselves are never stored or logged: they hold hidden
        // expected outputs and problem text. A checksum answers "was this the
        // same file" without keeping any of it.
        checksumSha256: createHash("sha256").update(input.bytes).digest("hex"),
        templateVersion: workbook.templateVersion,
        createCount: plan.counts.create,
        updateCount: plan.counts.update,
        unchangedCount: plan.counts.unchanged,
        warningCount: plan.counts.warnings,
        conflictCount: plan.counts.conflicts,
        errorCount: plan.counts.errors,
        plan: plan as unknown as Prisma.InputJsonValue,
        capturedContentRevision: course.contentRevision,
        expiresAt,
        idempotencyKey: randomUUID(),
      },
    });

    this.logger.log({
      message: "content import previewed",
      requestId: context.requestId,
      academyId: input.academyId,
      courseId: input.courseId,
      sessionId: session.id,
      bytes: input.bytes.byteLength,
      durationMs: Date.now() - started,
      ...plan.counts,
    });

    return toPreview(session, plan);
  }

  /** §8 — the stored plan, re-read by a page that was reloaded. */
  async getPreview(
    identity: SupabaseIdentity,
    input: { academyId: string; courseId: string; sessionId: string },
  ): Promise<ContentImportPreview> {
    const actor = await this.requireImporter(identity, input.academyId);
    const session = await this.requireSession({
      ...input,
      actorUserId: actor.userId,
    });
    const plan = parsePlan(session.plan);

    // Expiry is evaluated on read rather than swept by a job. A session nobody
    // asks about does not need to have been noticed.
    if (
      session.status === "PREVIEW_READY" &&
      session.expiresAt.getTime() < Date.now()
    ) {
      return toPreview({ ...session, status: "EXPIRED" }, plan);
    }
    return toPreview(session, plan);
  }

  /** §4.6 — the receipt, for a page that came back after the commit. */
  async getResult(
    identity: SupabaseIdentity,
    input: { academyId: string; courseId: string; sessionId: string },
  ): Promise<ContentImportResult> {
    const actor = await this.requireImporter(identity, input.academyId);
    const session = await this.requireSession({
      ...input,
      actorUserId: actor.userId,
    });
    const stored = session.result as ContentImportResult | null;
    if (!stored) {
      throw new AppException(
        "CONTENT_IMPORT_NOT_COMMITTABLE",
        HttpStatus.CONFLICT,
        "not_committed",
      );
    }
    return stored;
  }

  /* --------------------------------------------------------------- commit */

  /**
   * §11 — the twenty steps, in order.
   *
   * The ordering is the safety property. Steps 1–7 are refusals that cost a
   * query each and prevent a doomed transaction from ever opening. Step 8
   * claims the session with a conditional update, so of two tabs holding one
   * preview exactly one proceeds. Steps 9–20 run inside a single transaction
   * against a locked course row, and step 11 re-checks the revision that step 7
   * already checked — because between those two steps the lock had not been
   * acquired yet, and everything checked before a lock is history.
   */
  async commit(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      courseId: string;
      sessionId: string;
      contentRevision: number;
      acknowledgeWarnings: boolean;
    },
    context: RequestContext = {},
  ): Promise<ContentImportResult> {
    const actor = await this.requireImporter(identity, input.academyId);
    const session = await this.requireSession({
      ...input,
      actorUserId: actor.userId,
    });

    // Step 3 — a completed session answers with what it already did. This is
    // the case §4.6 names: the transaction committed and the response was lost.
    if (session.status === "COMPLETED" && session.result) {
      return session.result as ContentImportResult;
    }
    if (session.status === "COMMITTING") {
      throw new AppException(
        "CONTENT_IMPORT_IN_PROGRESS",
        HttpStatus.CONFLICT,
        "committing",
      );
    }
    if (session.status === "FAILED" || session.status === "EXPIRED") {
      throw new AppException(
        "CONTENT_IMPORT_NOT_COMMITTABLE",
        HttpStatus.CONFLICT,
        session.status.toLowerCase(),
      );
    }
    if (session.expiresAt.getTime() < Date.now()) {
      throw new AppException(
        "CONTENT_IMPORT_PREVIEW_EXPIRED",
        HttpStatus.CONFLICT,
        "expired",
      );
    }

    const plan = parsePlan(session.plan);
    if (
      !canCommitPlan({
        counts: plan.counts,
        acknowledgeWarnings: input.acknowledgeWarnings,
      })
    ) {
      throw new AppException(
        "CONTENT_IMPORT_NOT_COMMITTABLE",
        HttpStatus.CONFLICT,
        plan.counts.errors + plan.counts.conflicts > 0
          ? "blocking_issues"
          : "warnings_unacknowledged",
      );
    }

    if (input.contentRevision !== session.capturedContentRevision) {
      throw new AppException(
        "CONTENT_IMPORT_REVISION_CONFLICT",
        HttpStatus.CONFLICT,
        "browser_revision",
      );
    }

    // Step 8 — the conditional claim. `updateMany` with the expected status in
    // its filter is an atomic compare-and-set: the loser's count comes back
    // zero rather than both callers proceeding.
    const claimed = await this.prisma.contentImportSession.updateMany({
      where: { id: session.id, status: "PREVIEW_READY" },
      data: { status: "COMMITTING" },
    });
    if (claimed.count === 0) {
      throw new AppException(
        "CONTENT_IMPORT_IN_PROGRESS",
        HttpStatus.CONFLICT,
        "claimed",
      );
    }

    const started = Date.now();
    try {
      const receipt = await this.prisma.$transaction(async (tx) => {
        // Step 10 — the course row, locked. Two imports for the same course
        // serialize here, and the second one finds its captured revision stale.
        await tx.$queryRaw`SELECT id FROM courses WHERE id = ${input.courseId}::uuid FOR UPDATE`;

        const current = await tx.course.findFirst({
          where: { id: input.courseId, academyId: input.academyId },
          include: projectionInclude,
        });
        if (!current) {
          throw new AppException("COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
        }
        if (current.contentRevision !== session.capturedContentRevision) {
          throw new AppException(
            "CONTENT_IMPORT_REVISION_CONFLICT",
            HttpStatus.CONFLICT,
            "locked_revision",
          );
        }

        const entities = await this.applyPlan(tx, {
          plan,
          course: current,
          academyId: input.academyId,
          courseId: input.courseId,
          actorUserId: actor.userId,
          requestId: context.requestId,
        });

        // Step 18 — one increment for the whole import, not one per entity. The
        // course moved once, and a preview taken before it should be refused
        // once rather than by a number that reveals how large the import was.
        const contentRevision = await bumpContentRevision(tx, input.courseId);

        await this.audit.write(tx, {
          actorUserId: actor.userId,
          academyId: input.academyId,
          action: "content.curriculum_import.committed",
          targetType: "Course",
          targetId: input.courseId,
          requestId: context.requestId,
          after: {
            sessionId: session.id,
            checksumSha256: session.checksumSha256,
            templateVersion: session.templateVersion,
            create: plan.counts.create,
            update: plan.counts.update,
            unchanged: plan.counts.unchanged,
            contentRevision,
          },
        });

        const committedAt = new Date();
        const receipt: ContentImportResult = {
          sessionId: session.id,
          status: "COMPLETED",
          created: entities.filter((entity) => entity.action === "CREATE").length,
          updated: entities.filter((entity) => entity.action === "UPDATE").length,
          unchanged: entities.filter(
            (entity) => entity.action === "UNCHANGED",
          ).length,
          failed: 0,
          entities,
          contentRevision,
          committedAt: committedAt.toISOString(),
          failureCode: null,
        };

        // The durable receipt is part of the curriculum transaction. If this
        // write fails, every curriculum write rolls back with it; if it
        // succeeds, a lost HTTP response can be answered idempotently.
        await tx.contentImportSession.update({
          where: { id: session.id },
          data: {
            status: "COMPLETED",
            committedAt,
            result: receipt as unknown as Prisma.InputJsonValue,
          },
        });

        return receipt;
      });

      this.logger.log({
        message: "content import committed",
        requestId: context.requestId,
        academyId: input.academyId,
        courseId: input.courseId,
        sessionId: session.id,
        durationMs: Date.now() - started,
        created: receipt.created,
        updated: receipt.updated,
        unchanged: receipt.unchanged,
      });

      return receipt;
    } catch (failure) {
      /*
       * The transaction already rolled back; the course is exactly as it was.
       * The session is marked FAILED rather than returned to PREVIEW_READY,
       * because a plan that failed once was computed against a course whose
       * state is no longer certain — and a second attempt should re-read it.
       */
      const failureCode =
        failure instanceof AppException ? failure.code : "CONTENT_IMPORT_FAILED";
      await this.prisma.contentImportSession.updateMany({
        where: { id: session.id, status: "COMMITTING" },
        data: { status: "FAILED", failureCode },
      });
      this.logger.warn({
        message: "content import failed",
        requestId: context.requestId,
        academyId: input.academyId,
        courseId: input.courseId,
        sessionId: session.id,
        failureCode,
      });
      throw failure;
    }
  }

  /* ---------------------------------------------------------- plan writer */

  /**
   * The plan, applied in dependency order.
   *
   * Modules before lectures before problems, because a lecture cannot be
   * created under a module that does not exist yet and the plan expresses that
   * relationship structurally rather than through ids. Every key is re-resolved
   * against the freshly locked read rather than trusted from the session: step
   * 12 exists because the ids in a preview are half an hour old.
   */
  private async applyPlan(
    tx: Prisma.TransactionClient,
    input: {
      plan: ContentImportPlan;
      course: CourseWithContent;
      academyId: string;
      courseId: string;
      actorUserId: string;
      requestId?: string;
    },
  ): Promise<ContentImportResultEntity[]> {
    const entities: ContentImportResultEntity[] = [];

    const modulesByKey = new Map(
      input.course.modules.map((module) => [module.externalKey, module]),
    );
    const lecturesByKey = new Map(
      input.course.modules.flatMap((module) =>
        module.lectures.map((lecture) => [lecture.externalKey, lecture] as const),
      ),
    );
    const materialsByKey = new Map(
      input.course.modules.flatMap((module) =>
        module.lectures.flatMap((lecture) =>
          lecture.materials
            .filter((material) => material.programmingExercise)
            .map(
              (material) =>
                [material.programmingExercise!.externalKey, material] as const,
            ),
        ),
      ),
    );
    const moduleIdsByKey = new Map(
      input.course.modules.map((module) => [module.externalKey, module.id]),
    );
    const lectureIdsByKey = new Map(
      input.course.modules.flatMap((module) =>
        module.lectures.map((lecture) => [lecture.externalKey, lecture.id] as const),
      ),
    );
    const materialIdsByKey = new Map(
      input.course.modules.flatMap((module) =>
        module.lectures.flatMap((lecture) =>
          lecture.materials
            .filter((material) => material.programmingExercise)
            .map(
              (material) =>
                [material.programmingExercise!.externalKey, material.id] as const,
            ),
        ),
      ),
    );

    for (const planned of input.plan.modules) {
      const moduleId = await this.writeModule(tx, {
        planned,
        existing: modulesByKey.get(planned.key) ?? null,
        courseId: input.courseId,
        academyId: input.academyId,
        actorUserId: input.actorUserId,
        requestId: input.requestId,
      });
      moduleIdsByKey.set(planned.key, moduleId);
      entities.push({
        kind: "MODULE",
        key: planned.key,
        title: planned.title,
        action: planned.action,
        id: moduleId,
        lectureId: null,
      });

      for (const lecture of planned.lectures) {
        const lectureId = await this.writeLecture(tx, {
          planned: lecture,
          existing: lecturesByKey.get(lecture.key) ?? null,
          moduleId,
          academyId: input.academyId,
          actorUserId: input.actorUserId,
          requestId: input.requestId,
        });
        lectureIdsByKey.set(lecture.key, lectureId);
        entities.push({
          kind: "LECTURE",
          key: lecture.key,
          title: lecture.title,
          action: lecture.action,
          id: lectureId,
          lectureId: null,
        });

        for (const problem of lecture.problems) {
          const materialId = await this.writeProblem(tx, {
            planned: problem,
            existing: materialsByKey.get(problem.key) ?? null,
            lectureId,
            academyId: input.academyId,
            actorUserId: input.actorUserId,
            requestId: input.requestId,
          });
          materialIdsByKey.set(problem.key, materialId);
          entities.push({
            kind: "PROBLEM",
            key: problem.key,
            title: problem.title,
            action: problem.action,
            id: materialId,
            lectureId,
          });
        }
      }
    }

    /*
     * Step 17 — apply workbook order after every entity exists.
     *
     * Creates use a free append position so intermediate writes never collide.
     * This pass then merges explicit workbook positions with omitted/blank
     * siblings and uses the same two-phase rewrite as manual reordering.
     */
    if (
      input.plan.modules.some(
        (module) => module.action === "CREATE" || module.order !== null,
      )
    ) {
      const current = await tx.courseModule.findMany({
        where: { courseId: input.courseId },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      const ordered = mergePreferredPositions(
        current.map((record) => record.id),
        input.plan.modules.map((module) => ({
          id: moduleIdsByKey.get(module.key)!,
          position: module.order,
        })),
      );
      await rewritePositions(tx, "module", ordered);
    }

    for (const module of input.plan.modules) {
      const moduleId = moduleIdsByKey.get(module.key)!;
      if (
        module.lectures.some(
          (lecture) => lecture.action === "CREATE" || lecture.order !== null,
        )
      ) {
        const current = await tx.lecture.findMany({
          where: { courseModuleId: moduleId },
          orderBy: [{ position: "asc" }, { id: "asc" }],
          select: { id: true },
        });
        const ordered = mergePreferredPositions(
          current.map((record) => record.id),
          module.lectures.map((lecture) => ({
            id: lectureIdsByKey.get(lecture.key)!,
            position: lecture.order,
          })),
        );
        await rewritePositions(tx, "lecture", ordered);
      }

      for (const lecture of module.lectures) {
        if (
          !lecture.problems.some(
            (problem) => problem.action === "CREATE" || problem.order !== null,
          )
        ) {
          continue;
        }
        const lectureId = lectureIdsByKey.get(lecture.key)!;
        const current = await tx.material.findMany({
          where: { lectureId },
          orderBy: [{ position: "asc" }, { id: "asc" }],
          select: { id: true },
        });
        const ordered = mergePreferredPositions(
          current.map((record) => record.id),
          lecture.problems.map((problem) => ({
            id: materialIdsByKey.get(problem.key)!,
            position: problem.order,
          })),
        );
        await rewritePositions(tx, "material", ordered);
      }
    }

    return entities;
  }

  private async writeModule(
    tx: Prisma.TransactionClient,
    input: {
      planned: PlannedModule;
      existing: CourseWithContent["modules"][number] | null;
      courseId: string;
      academyId: string;
      actorUserId: string;
      requestId?: string;
    },
  ): Promise<string> {
    const { planned, existing } = input;

    if (existing && planned.action === "UNCHANGED") return existing.id;

    if (!existing) {
      const created = await tx.courseModule.create({
        data: {
          courseId: input.courseId,
          externalKey: planned.key,
          title: planned.title,
          description: planned.description,
          position: await this.freePosition(
            tx,
            "module",
            input.courseId,
            planned.order,
          ),
          // §12 — new content arrives hidden at every level. The team lead
          // reviews it in the builder and reveals it deliberately.
          isVisible: false,
        },
      });
      await this.audit.write(tx, {
        actorUserId: input.actorUserId,
        academyId: input.academyId,
        action: "content.course_module.created",
        targetType: "CourseModule",
        targetId: created.id,
        requestId: input.requestId,
        after: { title: created.title, externalKey: planned.key, isVisible: false },
      });
      return created.id;
    }

    const updated = await tx.courseModule.update({
      where: { id: existing.id },
      data: {
        title: planned.title,
        description: planned.description,
        // §12 — visibility is preserved. It is not an import column, and an
        // update never reveals or hides anything.
      },
    });
    await this.audit.write(tx, {
      actorUserId: input.actorUserId,
      academyId: input.academyId,
      action: "content.course_module.updated",
      targetType: "CourseModule",
      targetId: existing.id,
      requestId: input.requestId,
      before: { title: existing.title, description: existing.description },
      after: { title: updated.title, description: updated.description },
    });
    return existing.id;
  }

  private async writeLecture(
    tx: Prisma.TransactionClient,
    input: {
      planned: PlannedLecture;
      existing: CourseWithContent["modules"][number]["lectures"][number] | null;
      moduleId: string;
      academyId: string;
      actorUserId: string;
      requestId?: string;
    },
  ): Promise<string> {
    const { planned, existing } = input;
    if (existing && planned.action === "UNCHANGED") return existing.id;

    if (!existing) {
      const created = await tx.lecture.create({
        data: {
          courseModuleId: input.moduleId,
          externalKey: planned.key,
          title: planned.title,
          description: planned.description,
          position: await this.freePosition(
            tx,
            "lecture",
            input.moduleId,
            planned.order,
          ),
          isVisible: false,
        },
      });
      await this.audit.write(tx, {
        actorUserId: input.actorUserId,
        academyId: input.academyId,
        action: "content.lecture.created",
        targetType: "Lecture",
        targetId: created.id,
        requestId: input.requestId,
        after: { title: created.title, externalKey: planned.key, isVisible: false },
      });
      return created.id;
    }

    const updated = await tx.lecture.update({
      where: { id: existing.id },
      data: { title: planned.title, description: planned.description },
    });
    await this.audit.write(tx, {
      actorUserId: input.actorUserId,
      academyId: input.academyId,
      action: "content.lecture.updated",
      targetType: "Lecture",
      targetId: existing.id,
      requestId: input.requestId,
      before: { title: existing.title, description: existing.description },
      after: { title: updated.title, description: updated.description },
    });
    return existing.id;
  }

  /**
   * One problem, with its tests and hints replaced wholesale.
   *
   * §5.5 and §5.6 make the workbook's rows the complete collection for every
   * included problem, so the write is delete-then-create rather than a diff.
   * That is safe *because* it is scoped to the child rows: the Material and the
   * ProgrammingExercise keep their ids, so every submission, draft, solve
   * session, and progress record that points at them survives untouched. §12 is
   * explicit that learner history is never deleted or reassigned, and keeping
   * the parent rows is what makes that true.
   */
  private async writeProblem(
    tx: Prisma.TransactionClient,
    input: {
      planned: PlannedProblem;
      existing:
        | CourseWithContent["modules"][number]["lectures"][number]["materials"][number]
        | null;
      lectureId: string;
      academyId: string;
      actorUserId: string;
      requestId?: string;
    },
  ): Promise<string> {
    const { planned, existing } = input;
    if (existing && planned.action === "UNCHANGED") return existing.id;

    const exerciseFields = {
      difficulty: planned.difficulty,
      description: planned.description,
      inputFormat: planned.inputFormat,
      outputFormat: planned.outputFormat,
      constraints: planned.constraints,
      starterCode: planned.starterCode,
      solutionCode: planned.solutionCode,
      aiFeedbackEnabled: planned.aiFeedbackEnabled,
    };

    if (!existing) {
      const material = await tx.material.create({
        data: {
          lectureId: input.lectureId,
          type: "PROGRAMMING_EXERCISE",
          title: planned.title,
          position: await this.freePosition(
            tx,
            "material",
            input.lectureId,
            planned.order,
          ),
          // §5.4 — the manual defaults, verbatim. An importer with its own
          // opinion about time limits is a second content system.
          isRequired: true,
          isVisible: false,
          programmingExercise: {
            create: {
              externalKey: planned.key,
              legacyProblemNo: null,
              language: "PYTHON",
              timeLimitMs: 3000,
              memoryLimitMb: 256,
              gradingRevision: 1,
              ...exerciseFields,
              testCases: { create: planned.testCases },
              hints: { create: planned.hints },
            },
          },
        },
      });
      await this.audit.write(tx, {
        actorUserId: input.actorUserId,
        academyId: input.academyId,
        action: "content.programming_exercise.created",
        targetType: "Material",
        targetId: material.id,
        requestId: input.requestId,
        after: {
          title: planned.title,
          externalKey: planned.key,
          difficulty: planned.difficulty,
          isVisible: false,
          testCaseCount: planned.testCases.length,
          hintCount: planned.hints.length,
        },
      });
      return material.id;
    }

    const currentExercise = existing.programmingExercise;
    await tx.material.update({
      where: { id: existing.id },
      data: { title: planned.title },
    });

    // §11 step 16 — the revision advances only when the grading definition
    // moved. The planner decided that against the same values; re-deriving it
    // here could disagree with the number the team lead acknowledged.
    await tx.programmingExercise.update({
      where: { materialId: existing.id },
      data: {
        ...exerciseFields,
        ...(planned.gradingChanged
          ? { gradingRevision: { increment: 1 } }
          : {}),
      },
    });

    await tx.exerciseTestCase.deleteMany({
      where: { exerciseMaterialId: existing.id },
    });
    await tx.exerciseTestCase.createMany({
      data: planned.testCases.map((testCase) => ({
        exerciseMaterialId: existing.id,
        ...testCase,
      })),
    });

    await tx.exerciseHint.deleteMany({
      where: { exerciseMaterialId: existing.id },
    });
    if (planned.hints.length > 0) {
      await tx.exerciseHint.createMany({
        data: planned.hints.map((hint) => ({
          exerciseMaterialId: existing.id,
          ...hint,
        })),
      });
    }

    await this.audit.write(tx, {
      actorUserId: input.actorUserId,
      academyId: input.academyId,
      action: "content.programming_exercise.updated",
      targetType: "Material",
      targetId: existing.id,
      requestId: input.requestId,
      before: {
        title: existing.title,
        difficulty: currentExercise?.difficulty,
        testCaseCount: currentExercise?.testCases.length ?? 0,
        hintCount: currentExercise?.hints.length ?? 0,
      },
      after: {
        title: planned.title,
        difficulty: planned.difficulty,
        testCaseCount: planned.testCases.length,
        hintCount: planned.hints.length,
        gradingChanged: planned.gradingChanged,
        changedFields: planned.changedFields,
      },
    });

    return existing.id;
  }

  /**
   * A position that is free right now, preferring the one the workbook asked
   * for.
   *
   * §5.3 lets a blank order mean "append", and an explicit one that is already
   * taken is a conflict the planner has already reported — so by the time a
   * write happens the only remaining collisions are between two *new* entities
   * appended in the same import. Appending past the current maximum keeps every
   * create legal, and the compaction pass afterwards turns the result back into
   * a contiguous `1..n` in the intended order.
   */
  private async freePosition(
    tx: Prisma.TransactionClient,
    kind: "module" | "lecture" | "material",
    parentId: string,
    preferred: number | null = null,
  ): Promise<number> {
    const max =
      kind === "module"
        ? (
            await tx.courseModule.aggregate({
              where: { courseId: parentId },
              _max: { position: true },
            })
          )._max.position
        : kind === "lecture"
          ? (
              await tx.lecture.aggregate({
                where: { courseModuleId: parentId },
                _max: { position: true },
              })
            )._max.position
          : (
              await tx.material.aggregate({
                where: { lectureId: parentId },
                _max: { position: true },
              })
            )._max.position;

    const next = (max ?? 0) + 1;
    return preferred !== null && preferred > (max ?? 0) ? preferred : next;
  }

  /* --------------------------------------------------------------- guards */

  /**
   * §4.1 — Team Lead, and nobody else.
   *
   * `content.import` is held only by TEAM_LEAD, and every server operation
   * checks it independently of whether the interface offered the action. Hiding
   * the button is a convenience; this is the boundary.
   */
  private requireImporter(identity: SupabaseIdentity, academyId: string) {
    return this.access.requirePermission(
      identity.authUserId,
      academyId,
      "content.import",
    );
  }

  private async requireCourse(academyId: string, courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, academyId },
      include: projectionInclude,
    });
    if (!course) {
      throw new AppException("COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    return course;
  }

  /**
   * §8 — one answer for every way a session can fail to be yours.
   *
   * A session that never existed, one belonging to another course, and one
   * belonging to another academy all produce `CONTENT_IMPORT_SESSION_NOT_FOUND`.
   * Distinguishing them would let a team lead in Academy A confirm that a
   * session id is real, which is an existence oracle across a tenant boundary —
   * and the information it leaks is worth nothing to the person who legitimately
   * owns the session.
   */
  private async requireSession(input: {
    academyId: string;
    courseId: string;
    sessionId: string;
    actorUserId: string;
  }) {
    const session = await this.prisma.contentImportSession.findFirst({
      where: {
        id: input.sessionId,
        academyId: input.academyId,
        courseId: input.courseId,
        actorUserId: input.actorUserId,
      },
    });
    if (!session) {
      throw new AppException(
        "CONTENT_IMPORT_SESSION_NOT_FOUND",
        HttpStatus.NOT_FOUND,
      );
    }
    return session;
  }

  private read(bytes: Buffer) {
    try {
      return readContentWorkbook(bytes);
    } catch (failure) {
      if (failure instanceof ContentWorkbookError) {
        throw new AppException(
          "CONTENT_IMPORT_FILE_REJECTED",
          HttpStatus.BAD_REQUEST,
          failure.reason,
        );
      }
      throw failure;
    }
  }
}

/* ---------------------------------------------------------- projection */

/**
 * The course, as the planner needs to see it.
 *
 * Only programming exercises are projected. §17 keeps quizzes, videos, and
 * documents out of this slice, and a Material with no `programmingExercise` is
 * one of those — projecting it would give the planner a problem with no key to
 * match on and no fields to compare.
 */
function toProjection(course: CourseWithContent): CourseProjection {
  return {
    contentRevision: course.contentRevision,
    isVisible: course.isVisible,
    modules: course.modules.map((module) => ({
      id: module.id,
      key: module.externalKey,
      title: module.title,
      description: module.description,
      position: module.position,
      isVisible: module.isVisible,
      lectures: module.lectures.map((lecture) => ({
        id: lecture.id,
        key: lecture.externalKey,
        title: lecture.title,
        description: lecture.description,
        position: lecture.position,
        isVisible: lecture.isVisible,
        problems: lecture.materials
          .filter((material) => material.programmingExercise !== null)
          .map((material) => {
            const exercise = material.programmingExercise!;
            return {
              materialId: material.id,
              key: exercise.externalKey,
              title: material.title,
              position: material.position,
              isVisible: material.isVisible,
              difficulty: exercise.difficulty,
              description: exercise.description,
              inputFormat: exercise.inputFormat,
              outputFormat: exercise.outputFormat,
              constraints: exercise.constraints,
              starterCode: exercise.starterCode,
              solutionCode: exercise.solutionCode,
              aiFeedbackEnabled: exercise.aiFeedbackEnabled,
              testCases: exercise.testCases.map((testCase) => ({
                position: testCase.position,
                input: testCase.input,
                expectedOutput: testCase.expectedOutput,
                visibility: testCase.visibility,
              })),
              hints: exercise.hints.map((hint) => ({
                position: hint.position,
                content: hint.content,
                triggerExpression: hint.triggerExpression,
              })),
            };
          }),
      })),
    })),
  };
}

/**
 * §4.3 — the branches a large course exports one at a time.
 *
 * An empty selection means the whole course, which is the common case. A
 * selection keeps a module if it was named, and keeps a lecture if it or its
 * module was — so naming a module exports everything under it without listing
 * every lecture inside.
 */
function scopeProjection(
  projection: CourseProjection,
  scope: { moduleIds: string[]; lectureIds: string[] },
): CourseProjection {
  if (scope.moduleIds.length === 0 && scope.lectureIds.length === 0) {
    return projection;
  }
  const modules = new Set(scope.moduleIds);
  const lectures = new Set(scope.lectureIds);

  const scoped: ExistingModule[] = [];
  for (const module of projection.modules) {
    const wholeModule = modules.has(module.id);
    const kept = module.lectures.filter(
      (lecture) => wholeModule || lectures.has(lecture.id),
    );
    if (kept.length === 0) continue;
    scoped.push({ ...module, lectures: kept });
  }

  return { ...projection, modules: scoped };
}

/* -------------------------------------------------------------- mapping */

function parsePlan(stored: unknown): ContentImportPlan {
  // Parsed rather than cast. The row was written by an older deploy's planner,
  // and a shape change between then and now should fail here — where it names
  // the field — rather than three layers deeper inside the commit.
  return contentImportPlanSchema.parse(stored);
}

function toPreview(
  session: {
    id: string;
    academyId: string;
    courseId: string;
    status: string;
    originalFilename: string;
    templateVersion: number;
    capturedContentRevision: number;
    expiresAt: Date;
    createdAt: Date;
  },
  plan: ContentImportPlan,
): ContentImportPreview {
  return {
    sessionId: session.id,
    academyId: session.academyId,
    courseId: session.courseId,
    status: session.status as ContentImportPreview["status"],
    originalFilename: session.originalFilename,
    templateVersion: session.templateVersion,
    plan,
    counts: plan.counts,
    contentRevision: session.capturedContentRevision,
    expiresAt: session.expiresAt.toISOString(),
    createdAt: session.createdAt.toISOString(),
  };
}

/** Re-exported for the controller, which needs it before the service runs. */
export { stableKeyFromUuid };
