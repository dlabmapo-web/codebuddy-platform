import { ManualPracticeService } from "./manual-practice.service.js";
import type { AcademyAccess } from "../authorization/academy-access.service.js";
import { randomInt } from "node:crypto";
import {
  MultipleChoiceService,
  sanitizeChoiceHtml,
  choiceAssetIds,
} from "./multiple-choice.service.js";
import { ShortAnswerService } from "./short-answer.service.js";
import { PointAwardService } from "../points/point-award.service.js";
import type { Request } from "express";
import { ManualAssetsService } from "./manual-assets.service.js";
import {
  Injectable,
  Optional,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import type {
  SaveManual,
  ManualWork,
  ManualSubmit,
  ManualReviewInput,
  ManualWorkspace,
  ManualSession,
} from "@cove/shared";
import {
  multipleChoiceSchema,
  publicChoice,
  shortAnswerSchema,
  effectiveManualResult,
  sourceFilesSchema,
  manualConfigSchema,
  rolesHavePermission,
  roleCanMonitor,
  roleCanTeachAcademy,
} from "@cove/shared";
import { PrismaService } from "../database/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AuditService } from "../academies/audit.service.js";
import {
  learningScopeFor,
  enrolledClassWhere,
  taughtClassWhere,
} from "../classes/assigned-course-access.js";
import { academyTeachingClassWhere } from "../classes/assigned-class-access.js";
import {
  bumpContentRevision,
  nextMaterialPosition,
  compactMaterialPositions,
} from "../content/content-positions.js";
import { visibleCurriculumInclude } from "../learn/curriculum-outline.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { GuiClientService } from "./gui-client.service.js";
type Target = { academyId: string; materialId: string };
@Injectable()
export class ManualService {
  private readonly watches = new Map<
    string,
    {
      target: Target;
      classId: string;
      learnerId: string;
      userId: string;
      runtimeId: string;
      token: string;
    }
  >();
  private readonly sessions = new Map<
    string,
    { target: Target; userId: string; preview: boolean }
  >();
  constructor(
    private readonly db: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly audit: AuditService,
    private readonly gui: GuiClientService,
    private readonly assets: ManualAssetsService,
    private readonly points: PointAwardService,
    private readonly shortAnswers: ShortAnswerService,
    private readonly choices: MultipleChoiceService,
    @Optional() private readonly practice?: ManualPracticeService,
  ) {}
  private async material(
    identity: SupabaseIdentity,
    input: Target & { classId?: string },
    preview = false,
  ) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      preview ? "curriculum.review" : "curriculum.read",
    );
    const scope = learningScopeFor(input.academyId, actor);
    const row = await this.db.material.findFirst({
      where: {
        id: input.materialId,
        type: {
          in: ["TURTLE_EXERCISE", "WRITTEN_RESPONSE", "MULTIPLE_CHOICE"],
        },
        AND: [
          preview
            ? scope.material
            : {
                ...scope.material,
                isVisible: true,
                lecture: {
                  AND: [
                    scope.material.lecture ?? {},
                    {
                      isVisible: true,
                      courseModule: {
                        isVisible: true,
                        course: { academyId: input.academyId, isVisible: true },
                      },
                    },
                  ],
                },
              },
          {
            lecture: {
              courseModule: { course: { academyId: input.academyId } },
            },
          },
        ],
      },
      include: {
        manualMaterial: true,
        lecture: { include: { courseModule: { include: { course: true } } } },
      },
    });
    if (!row?.manualMaterial)
      throw new NotFoundException("Material is not available");
    return { actor, row, config: row.manualMaterial };
  }
  async upload(
    identity: SupabaseIdentity,
    input: { academyId: string; courseId: string },
    name: string,
    request: Request,
  ) {
    await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.manage",
    );
    if (
      !(await this.db.course.findFirst({
        where: { id: input.courseId, academyId: input.academyId },
      }))
    )
      throw new NotFoundException();
    return this.assets.upload(input.academyId, input.courseId, name, request);
  }
  async save(identity: SupabaseIdentity, input: SaveManual) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.manage",
    );
    if (input.type === "TURTLE_EXERCISE") this.gui.assertEnabled();
    if (input.shortAnswer) {
      input = {
        ...input,
        shortAnswer: {
          ...input.shortAnswer,
          expectedAnswer:
            input.shortAnswer.gradingMode === "EXACT"
              ? input.shortAnswer.expectedAnswer
              : "",
          pattern:
            input.shortAnswer.gradingMode === "REGEX"
              ? input.shortAnswer.pattern
              : "",
        },
      };
      this.shortAnswers.assertEnabled();
      if (input.shortAnswer!.gradingMode === "REGEX") {
        try {
          await this.shortAnswers.evaluator.evaluate(input.shortAnswer!, "");
        } catch (error) {
          throw new BadRequestException(
            error instanceof Error ? error.message : "Invalid pattern",
          );
        }
      }
    }
    if (input.multipleChoice) {
      this.choices.assertEnabled();
      input = {
        ...input,
        description: sanitizeChoiceHtml(input.description),
        multipleChoice: this.choices.normalize(
          input.multipleChoice,
          input.assets.map((a) => a.assetId),
          input.solutionAssets.map((a) => a.assetId),
        ),
      };
      if (
        choiceAssetIds(input.description).some(
          (id) => !input.assets.some((a) => a.assetId === id),
        )
      )
        throw new BadRequestException("Instruction image is not authorized");
    }
    const runtimeVersion =
      input.type === "TURTLE_EXERCISE"
        ? await this.gui.runtimeVersion()
        : "manual-response-v1";
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM courses WHERE id = ${input.courseId}::uuid FOR UPDATE`;
      if (
        !(await tx.lecture.findFirst({
          where: {
            id: input.lectureId,
            courseModule: {
              courseId: input.courseId,
              course: { academyId: input.academyId },
            },
          },
        }))
      )
        throw new NotFoundException();
      const {
        academyId,
        courseId,
        lectureId,
        materialId,
        title,
        type,
        revision,
        solutionFiles,
        ...config
      } = input;
      const previous = materialId
        ? await tx.manualMaterial.findUnique({ where: { materialId } })
        : null;
      const old = manualConfigSchema.parse(previous ?? {});
      const existingAssets = [...old.assets, ...old.solutionAssets];
      for (const asset of [...config.assets, ...config.solutionAssets]) {
        const stored = await tx.manualAsset.findUnique({
          where: { id: asset.assetId },
        });
        if (
          !stored ||
          stored.name !== asset.name ||
          stored.byteSize !== asset.byteSize ||
          (!(stored.academyId === academyId && stored.courseId === courseId) &&
            !existingAssets.some((a) => a.assetId === asset.assetId))
        )
          throw new BadRequestException("Asset does not belong to this course");
      }
      const data = {
        ...config,
        multipleChoice: config.multipleChoice
          ? (config.multipleChoice as Prisma.InputJsonValue)
          : Prisma.DbNull,
        shortAnswer: config.shortAnswer
          ? (config.shortAnswer as Prisma.InputJsonValue)
          : Prisma.DbNull,
        runtimeVersion,
        assets: config.assets as Prisma.InputJsonValue,
        solutionAssets: config.solutionAssets as Prisma.InputJsonValue,
        files: config.files as Prisma.InputJsonValue,
        solutionFiles: solutionFiles
          ? (solutionFiles as Prisma.InputJsonValue)
          : Prisma.DbNull,
      };
      let id = materialId;
      if (id) {
        const current = await tx.material.findFirst({
          where: { id, lectureId, type },
          include: { manualMaterial: true },
        });
        if (
          !current?.manualMaterial ||
          current.manualMaterial.revision !== revision
        )
          throw new ConflictException("Content changed; reload before saving");
        if (input.multipleChoice) {
          const oldChoice = multipleChoiceSchema.parse(
            current.manualMaterial.multipleChoice,
          );
          const structural = (d: typeof oldChoice) =>
            JSON.stringify([
              d.selectionMode,
              d.options.map((o) => o.id),
              d.correctOptionIds,
              d.shuffleOptions,
            ]);
          if (
            structural(oldChoice) !==
              structural(multipleChoiceSchema.parse(input.multipleChoice)) &&
            (current.isVisible ||
              (await tx.manualSubmission.count({ where: { materialId: id } })))
          )
            throw new ConflictException(
              "Published or submitted answer definitions are locked; create a new question",
            );
        }
        const before = current.manualMaterial.shortAnswer;
        const next = input.shortAnswer;
        const oldDefinition = before ? shortAnswerSchema.parse(before) : null;
        const changedRule =
          JSON.stringify(
            oldDefinition && [
              oldDefinition.gradingMode,
              oldDefinition.expectedAnswer,
              oldDefinition.pattern,
            ],
          ) !==
          JSON.stringify(
            next && [next.gradingMode, next.expectedAnswer, next.pattern],
          );
        const conversion = Boolean(before) !== Boolean(next);
        if (
          (changedRule || conversion) &&
          (current.isVisible ||
            (await tx.manualSubmission.count({ where: { materialId: id } })))
        )
          throw new ConflictException(
            "Published or submitted answer definitions are locked; create a new question",
          );
        await tx.manualMaterial.update({
          where: { materialId: id },
          data: { ...data, revision: { increment: 1 } },
        });
        await tx.material.update({
          where: { id },
          data: { title, isRequired: input.includeInScore },
        });
      } else {
        const row = await tx.material.create({
          data: {
            lectureId,
            type,
            title,
            isRequired: input.includeInScore,
            position: await nextMaterialPosition(tx, lectureId),
            manualMaterial: { create: data },
          },
        });
        id = row.id;
      }
      await bumpContentRevision(tx, courseId);
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId,
        action: materialId
          ? "content.manual.updated"
          : "content.manual.created",
        targetType: "Material",
        targetId: id,
        after: { type, revision: (revision ?? 0) + 1 },
      });
      return { materialId: id };
    });
  }
  async mutate(identity: SupabaseIdentity, input: Target, visible?: boolean) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.manage",
    );
    const { row } = await this.material(identity, input, true);
    return this.db.$transaction(async (tx) => {
      const courseId = row.lecture.courseModule.course.id;
      await tx.$queryRaw`SELECT id FROM courses WHERE id = ${courseId}::uuid FOR UPDATE`;
      if (visible === undefined) {
        if (await tx.manualSubmission.count({ where: { materialId: row.id } }))
          throw new ConflictException(
            "Submitted work must be hidden rather than deleted",
          );
        await tx.material.delete({ where: { id: row.id } });
        await compactMaterialPositions(tx, row.lectureId);
      } else
        await tx.material.update({
          where: { id: row.id },
          data: { isVisible: visible },
        });
      await bumpContentRevision(tx, courseId);
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.manual.visibility",
        targetType: "Material",
        targetId: row.id,
        after: { visible: visible ?? false },
      });
      return { ok: true };
    });
  }
  async workspace(
    identity: SupabaseIdentity,
    input: Target & { classId?: string },
    preview = false,
  ): Promise<ManualWorkspace> {
    const { actor, row, config } = await this.material(
      identity,
      input,
      preview,
    );
    const staffPractice = !preview && Boolean(this.practice?.allowed(actor));
    const privatePractice = staffPractice ? await this.practice!.read(input.academyId, actor.userId, row.id) : null;
    const roles = actor.roles ?? [actor.role];
    const canViewSolutions = rolesHavePermission(roles, "curriculum.review");
    const canTutor = actor.via === "membership" && roles.some(roleCanMonitor) &&
      rolesHavePermission(roles, "submissions.assigned.review");
    const canAuthor = rolesHavePermission(roles, "curriculum.manage") &&
      (actor.via === "membership" || await this.access.requirePermission(
        identity.authUserId, input.academyId, "curriculum.manage",
      ).then(() => true, () => false));
    const [outline, draft, attempts, classes, tutoringClasses] = await Promise.all([
      this.db.course.findUnique({
        where: { id: row.lecture.courseModule.course.id },
        include: visibleCurriculumInclude,
      }),
      staffPractice || config.shortAnswer || config.multipleChoice
        ? Promise.resolve(null)
        : this.db.manualDraft.findUnique({
            where: {
              materialId_userId: { materialId: row.id, userId: actor.userId },
            },
          }),
      staffPractice ? Promise.resolve([]) : this.db.manualSubmission.findMany({
        where: {
          materialId: row.id,
          userId: actor.userId,
          classId: input.classId,
        },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          shortAnswerAssessment: true,
          multipleChoiceAssessment: true,
          reviews: { orderBy: { version: "desc" } },
        },
      }),
      actor.role === "STUDENT"
        ? this.db.class.findMany({
            where: {
              ...enrolledClassWhere(input.academyId, actor.userId),
              courseAssignments: {
                some: { courseId: row.lecture.courseModule.course.id },
              },
            },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      canTutor ? this.db.class.findMany({
        where: {
          ...this.reviewScope(actor, input.academyId),
          courseAssignments: { some: { courseId: row.lecture.courseModule.course.id } },
        },
        select: { id: true, name: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }) : Promise.resolve([]),
    ]);
    const materials: ManualWorkspace["materials"] = [];
    for (const module of outline?.modules ?? [])
      for (const lecture of module.lectures)
        for (const item of lecture.materials)
          if (
            item.programmingExercise ||
            item.manualMaterial ||
            (item.videoLesson?.asset.state === "READY" && item.videoLesson.placement !== "SUPPLEMENTARY") ||
            (item.pdfDocument?.asset.state === "READY" &&
              item.pdfDocument.placement !== "SUPPLEMENTARY")
          )
            materials.push({
              materialId: item.id,
              title: item.title,
              type: item.type,
              lectureId: lecture.id,
            });
    const parsed = manualConfigSchema.parse({
      ...config,
      multipleChoice: config.multipleChoice
        ? (() => {
            const definition = multipleChoiceSchema.parse(
              config.multipleChoice,
            );
            const safe = preview ? definition : publicChoice(definition);
            const options = [...safe.options];
            if (!preview && safe.shuffleOptions)
              for (let i = options.length - 1; i > 0; i--) {
                const j = randomInt(i + 1);
                [options[i], options[j]] = [options[j], options[i]];
              }
            return { ...safe, options };
          })()
        : null,
      shortAnswer: config.shortAnswer
        ? (() => {
            const definition = shortAnswerSchema.parse(config.shortAnswer);
            return preview
              ? definition
              : {
                  ...definition,
                  expectedAnswer: "",
                  pattern: "",
                  explanation: "",
                };
          })()
        : null,
      files: sourceFilesSchema.parse(config.files),
      solutionFiles: preview ? config.solutionFiles : null,
      solutionAssets: preview ? config.solutionAssets : [],
      modelAnswer: preview ? config.modelAnswer : "",
    });
    if (
      input.classId &&
      actor.role === "STUDENT" &&
      !classes.some((c) => c.id === input.classId)
    )
      throw new NotFoundException();
    return {
      ...(canViewSolutions ? { staff: {
        canAuthor, canViewSolutions, canTutor, lectureId: row.lectureId,
        classes: tutoringClasses.map(c => ({ classId: c.id, name: c.name })),
      } } : {}),
      definitionLocked: preview
        ? row.isVisible ||
          Boolean(
            await this.db.manualSubmission.count({
              where: { materialId: row.id },
            }),
          )
        : undefined,
      submissionUnavailable: Boolean(
        (parsed.shortAnswer && !this.shortAnswers.enabled()) ||
        (parsed.multipleChoice && !this.choices.enabled()),
      ),
      classes: classes.map((c) => ({ classId: c.id, name: c.name })),
      materialId: row.id,
      title: row.title,
      type: row.type as ManualWorkspace["type"],
      config: {
        ...parsed,
        revision: config.revision,
        runtimeVersion: config.runtimeVersion,
      },
      course: {
        id: row.lecture.courseModule.course.id,
        title: row.lecture.courseModule.course.title,
      },
      materials,
      draft:
        draft && !config.shortAnswer && !config.multipleChoice
          ? {
              files: sourceFilesSchema.parse(draft.files),
              answer: draft.answer,
              revision: draft.revision,
            }
          : null,
      attempts: privatePractice?.attempts ?? attempts.map((attempt) => this.publicAttempt(attempt)),
      practice: staffPractice,
      ...(privatePractice ? { draft: privatePractice.draft } : {}),
    };
  }
  private publicAttempt(row: {
    id: string;
    userId: string;
    classId: string;
    files: Prisma.JsonValue;
    answer: string;
    createdAt: Date;
    maximumHundredths: number;
    includeInScore: boolean;
    reviewVersion: number;
    multipleChoiceAssessment?: {
      definition: Prisma.JsonValue;
      selectedOptionIds: Prisma.JsonValue;
      displayOrder: Prisma.JsonValue;
      status: string;
      verdict: string;
      scoreHundredths: number;
      completed: boolean;
    } | null;
    shortAnswerAssessment?: {
      status: string;
      verdict: string | null;
      scoreHundredths: number | null;
      completed: boolean | null;
    } | null;
    reviews: Array<{
      id: string;
      scoreHundredths: number;
      completed: boolean;
      feedback: string;
      version: number;
      createdAt: Date;
    }>;
  }) {
    return {
      id: row.id,
      userId: row.userId,
      classId: row.classId,
      files: sourceFilesSchema.parse(row.files),
      answer: row.answer,
      createdAt: row.createdAt.toISOString(),
      maximumHundredths: row.maximumHundredths,
      includeInScore: row.includeInScore,
      reviewVersion: row.reviewVersion,
      multipleChoiceAssessment: row.multipleChoiceAssessment
        ? {
            status: row.multipleChoiceAssessment.status,
            verdict: row.multipleChoiceAssessment.verdict,
            scoreHundredths: row.multipleChoiceAssessment.scoreHundredths,
            completed: row.multipleChoiceAssessment.completed,
            definition: publicChoice(
              multipleChoiceSchema.parse(
                row.multipleChoiceAssessment.definition,
              ),
            ),
            selectedOptionIds: row.multipleChoiceAssessment
              .selectedOptionIds as string[],
            displayOrder: row.multipleChoiceAssessment.displayOrder as string[],
          }
        : null,
      shortAnswerAssessment: row.shortAnswerAssessment
        ? {
            status: row.shortAnswerAssessment.status,
            verdict: row.shortAnswerAssessment.verdict,
            scoreHundredths: row.shortAnswerAssessment.scoreHundredths,
            completed: row.shortAnswerAssessment.completed,
          }
        : null,
      reviews: row.reviews.map((review) => ({
        id: review.id,
        scoreHundredths: review.scoreHundredths,
        completed: review.completed,
        feedback: review.feedback,
        version: review.version,
        createdAt: review.createdAt.toISOString(),
      })),
    };
  }
  async draft(identity: SupabaseIdentity, input: ManualWork) {
    const { actor, config } = await this.material(identity, input);
    if (this.practice?.allowed(actor)) return this.practice.draft(actor, input);
    const writer = await this.access.requirePermission(identity.authUserId, input.academyId, "submissions.own.create");
    if (writer.via && writer.via !== "membership") throw new ForbiddenException();
    if (config.shortAnswer || config.multipleChoice)
      throw new BadRequestException(
        "Short answers use explicit Submit; drafts are unavailable",
      );
    return this.db
      .$transaction(
        async (tx) => {
          const current = await tx.manualDraft.findUnique({
            where: {
              materialId_userId: {
                materialId: input.materialId,
                userId: actor.userId,
              },
            },
          });
          if ((current?.revision ?? 0) !== input.revision)
            throw new ConflictException("Draft changed in another workspace");
          const data = {
            files: input.files as Prisma.InputJsonValue,
            answer: input.answer,
            revision: (current?.revision ?? 0) + 1,
          };
          const row = await tx.manualDraft.upsert({
            where: {
              materialId_userId: {
                materialId: input.materialId,
                userId: actor.userId,
              },
            },
            create: {
              materialId: input.materialId,
              userId: actor.userId,
              ...data,
            },
            update: data,
          });
          return { revision: row.revision };
        },
        { isolationLevel: "Serializable" },
      )
      .catch((error) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ["P2034", "P2002"].includes(error.code)
        )
          throw new ConflictException("Draft changed in another workspace");
        throw error;
      });
  }
  async submitPractice(identity: SupabaseIdentity, input: Omit<ManualSubmit, "classId">) {
    const { actor, config } = await this.material(identity, input);
    if (!this.practice || !this.practice.allowed(actor)) throw new ForbiddenException();
    if (config.revision !== input.contentRevision) throw new ConflictException("Content changed; reload");
    return this.practice.submit(actor, input, config);
  }
  async submit(identity: SupabaseIdentity, input: ManualSubmit) {
    const { actor, row, config } = await this.material(identity, input);
    await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "submissions.own.create",
    );

    if (actor.role !== "STUDENT" || !config.submitEnabled)
      throw new ForbiddenException("Submission is not enabled");
    if (
      !(await this.db.class.findFirst({
        where: {
          id: input.classId,
          ...enrolledClassWhere(input.academyId, actor.userId),
          courseAssignments: {
            some: { courseId: row.lecture.courseModule.course.id },
          },
        },
      }))
    )
      throw new NotFoundException();
    if (
      row.type === "WRITTEN_RESPONSE" &&
      !(config.shortAnswer ? input.answer.length : input.answer.trim())
    )
      throw new BadRequestException("Enter an answer");
    if (
      row.type === "TURTLE_EXERCISE" &&
      !Object.hasOwn(input.files, config.entryPoint)
    )
      throw new BadRequestException("Entry point is missing");
    if (
      row.type !== "MULTIPLE_CHOICE" &&
      (input.selectedOptionIds || input.displayOrder)
    )
      throw new BadRequestException(
        "Choices require a multiple-choice material",
      );
    if (config.multipleChoice) this.choices.assertEnabled();
    const sameChoiceRequest = (attempt: {
      revision: number;
      materialId: string;
      classId: string;
      multipleChoiceAssessment: {
        selectedOptionIds: Prisma.JsonValue;
        displayOrder: Prisma.JsonValue;
      } | null;
    }) =>
      attempt.materialId === row.id &&
      attempt.classId === input.classId &&
      attempt.revision === input.contentRevision &&
      JSON.stringify(attempt.multipleChoiceAssessment?.selectedOptionIds) ===
        JSON.stringify(input.selectedOptionIds) &&
      JSON.stringify(attempt.multipleChoiceAssessment?.displayOrder) ===
        JSON.stringify(input.displayOrder);
    const existing = await this.db.manualSubmission.findUnique({
      where: {
        userId_requestKey: {
          userId: actor.userId,
          requestKey: input.requestKey,
        },
      },
      include: { multipleChoiceAssessment: true },
    });
    if (existing) {
      if (config.multipleChoice && !sameChoiceRequest(existing))
        throw new ConflictException(
          "Request key already used for different work",
        );
      if (existing.materialId !== row.id || existing.classId !== input.classId)
        throw new ConflictException();
      if (config.shortAnswer) {
        this.shortAnswers.assertEnabled();
        await this.db.shortAnswerAssessment.updateMany({
          where: { submissionId: existing.id, status: "ERROR" },
          data: { status: "PENDING" },
        });
      }
      return { submissionId: existing.id };
    }
    if (input.contentRevision !== config.revision)
      throw new ConflictException("Content changed; reload before submitting");
    if (config.shortAnswer) this.shortAnswers.assertEnabled();
    const submission = await this.db
      .$transaction(async (tx) => {
        const courseId = row.lecture.courseModule.course.id;
        await tx.$queryRaw`SELECT id FROM courses WHERE id = ${courseId}::uuid FOR UPDATE`;
        const fresh = await tx.manualMaterial.findUnique({
          where: { materialId: row.id },
        });
        const visible = await tx.material.findFirst({
          where: {
            id: row.id,
            isVisible: true,
            lecture: {
              isVisible: true,
              courseModule: {
                isVisible: true,
                course: { academyId: input.academyId, isVisible: true },
              },
            },
          },
          select: { isVisible: true },
        });
        if (!visible?.isVisible || fresh?.revision !== input.contentRevision)
          throw new ConflictException(
            "Content changed; reload before submitting",
          );
        const choiceDefinition = fresh.multipleChoice
          ? multipleChoiceSchema.parse(fresh.multipleChoice)
          : null;
        const correct = choiceDefinition
          ? this.choices.evaluate(
              choiceDefinition,
              input.selectedOptionIds ?? [],
              input.displayOrder ?? [],
            )
          : false;
        const admitted = await tx.manualSubmission.create({
          data: {
            materialId: row.id,
            userId: actor.userId,
            classId: input.classId,
            files: row.type === "TURTLE_EXERCISE" ? input.files : {},
            answer: choiceDefinition ? "" : input.answer,
            multipleChoiceAssessment: choiceDefinition
              ? {
                  create: {
                    definition: choiceDefinition as Prisma.InputJsonValue,
                    selectedOptionIds: input.selectedOptionIds!,
                    displayOrder: input.displayOrder!,
                    status: "GRADED",
                    verdict: correct ? "CORRECT" : "INCORRECT",
                    scoreHundredths: correct ? fresh.maximumHundredths : 0,
                    completed: correct,
                  },
                }
              : undefined,
            shortAnswerAssessment: config.shortAnswer
              ? {
                  create: {
                    definition: config.shortAnswer as Prisma.InputJsonValue,
                    status:
                      shortAnswerSchema.parse(config.shortAnswer)
                        .gradingMode === "MANUAL"
                        ? "MANUAL"
                        : "PENDING",
                  },
                }
              : undefined,
            profile: JSON.parse(
              JSON.stringify({
                ...config,
                multipleChoice: null,
                shortAnswer: null,
                solutionFiles: null,
                solutionAssets: [],
                modelAnswer: "",
              }),
            ),
            revision: config.revision,
            maximumHundredths: config.maximumHundredths,
            includeInScore: config.includeInScore,
            requestKey: input.requestKey,
          },
        });
        if (choiceDefinition)
          await this.points.awardManualCompletion(tx, {
            materialId: row.id,
            userId: actor.userId,
            classId: input.classId,
            now: new Date(),
          });
        return admitted;
      })
      .catch(async (error) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          const replay = await this.db.manualSubmission.findUniqueOrThrow({
            where: {
              userId_requestKey: {
                userId: actor.userId,
                requestKey: input.requestKey,
              },
            },
            include: { multipleChoiceAssessment: true },
          });
          if (config.multipleChoice && !sameChoiceRequest(replay))
            throw new ConflictException(
              "Request key already used for different work",
            );
          if (replay.materialId === row.id && replay.classId === input.classId)
            return replay;
          throw new ConflictException();
        }
        throw error;
      });
    return { submissionId: submission.id };
  }
  capabilities() {
    return {
      shortAnswer: this.shortAnswers.enabled(),
      multipleChoice: this.choices.enabled(),
    };
  }
  async choicePreview(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      definition: unknown;
      selectedOptionIds: string[];
      displayOrder: string[];
    },
  ) {
    await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.manage",
    );
    this.choices.assertEnabled();
    return {
      correct: this.choices.evaluate(
        multipleChoiceSchema.parse(input.definition),
        input.selectedOptionIds,
        input.displayOrder,
      ),
    };
  }
  async choiceImage(
    identity: SupabaseIdentity,
    input: Target & {
      assetId: string;
      classId?: string;
      submissionId?: string;
      preview?: boolean;
    },
  ) {
    const { actor, config } = await this.material(
      identity,
      input,
      Boolean(input.preview),
    );
    let publicHtml: string[] = [];
    let privateHtml = "";
    if (input.submissionId) {
      if (input.preview && input.classId)
        await this.reviewer(identity, input, input.classId);
      const attempt = await this.db.manualSubmission.findFirst({
        where: {
          id: input.submissionId,
          materialId: input.materialId,
          ...(input.preview ? {} : { userId: actor.userId }),
          classId: input.classId,
        },
        include: {
          multipleChoiceAssessment: true,
          reviews: { orderBy: { version: "desc" } },
        },
      });
      if (!attempt?.multipleChoiceAssessment || !input.classId)
        throw new NotFoundException();
      if (!input.preview)
        await this.explanation(identity, {
          ...input,
          classId: input.classId,
          submissionId: input.submissionId,
        });
      const definition = multipleChoiceSchema.parse(
        attempt.multipleChoiceAssessment.definition,
      );
      publicHtml = [
        definition.problemDescription,
        ...definition.options.map((o) => o.content),
        (attempt.profile as { description?: string }).description ?? "",
      ];
      if (
        effectiveManualResult(attempt)?.completed &&
        definition.explanationEnabled
      )
        privateHtml = definition.explanation;
    } else if (config.multipleChoice) {
      const definition = multipleChoiceSchema.parse(config.multipleChoice);
      publicHtml = [
        config.description,
        definition.problemDescription,
        ...definition.options.map((o) => o.content),
      ];
      if (input.preview) privateHtml = definition.explanation;
    }
    if (
      ![...publicHtml, privateHtml].some((html) =>
        choiceAssetIds(html).includes(input.assetId),
      )
    )
      throw new NotFoundException();
    const asset = await this.db.manualAsset.findUnique({
      where: { id: input.assetId },
    });
    if (!asset?.mimeType.startsWith("image/")) throw new NotFoundException();
    return {
      url: `data:${asset.mimeType};base64,${await this.assets.bytes(input.assetId)}`,
    };
  }
  async matchingPreview(
    identity: SupabaseIdentity,
    input: { academyId: string; definition: unknown; answer: string },
  ) {
    await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.manage",
    );
    this.shortAnswers.assertEnabled();
    try {
      return {
        correct: await this.shortAnswers.evaluator.evaluate(
          shortAnswerSchema.parse(input.definition),
          input.answer,
        ),
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Matching unavailable",
      );
    }
  }
  async explanation(
    identity: SupabaseIdentity,
    input: Target & { classId: string; submissionId: string },
  ) {
    const { actor, row } = await this.material(identity, input);
    if (
      !(await this.db.class.findFirst({
        where: {
          id: input.classId,
          ...enrolledClassWhere(input.academyId, actor.userId),
          courseAssignments: {
            some: { courseId: row.lecture.courseModule.course.id },
          },
        },
      }))
    )
      throw new NotFoundException();
    const attempt = await this.db.manualSubmission.findFirst({
      where: {
        id: input.submissionId,
        materialId: input.materialId,
        classId: input.classId,
        userId: actor.userId,
      },
      include: {
        shortAnswerAssessment: true,
        multipleChoiceAssessment: true,
        reviews: { orderBy: { version: "desc" } },
      },
    });
    if (!attempt) throw new NotFoundException();
    const definition = attempt.multipleChoiceAssessment
      ? multipleChoiceSchema.parse(attempt.multipleChoiceAssessment.definition)
      : attempt.shortAnswerAssessment
        ? shortAnswerSchema.parse(attempt.shortAnswerAssessment.definition)
        : null;
    return {
      explanation:
        definition?.explanationEnabled &&
        effectiveManualResult(attempt)?.completed
          ? definition.explanation
          : null,
    };
  }
  async retryEvaluation(
    identity: SupabaseIdentity,
    input: Target & { classId: string; submissionId: string },
  ) {
    await this.explanation(identity, input); // checks own attempt and current delivery access
    this.shortAnswers.assertEnabled();
    await this.db.shortAnswerAssessment.updateMany({
      where: { submissionId: input.submissionId, status: "ERROR" },
      data: { status: "PENDING" },
    });
    return { submissionId: input.submissionId };
  }
  private reviewScope(actor: AcademyAccess, academyId: string) {
    if (actor.via === "membership" && actor.roles.some(roleCanTeachAcademy)) {
      return academyTeachingClassWhere({ academyId, userId: actor.userId });
    }
    if (actor.via === "membership" && !actor.roles.includes("TEACHER")) {
      throw new NotFoundException();
    }
    return actor.via === "membership" || actor.role === "TEACHER"
      ? taughtClassWhere(academyId, actor.userId)
      : { academyId, status: "ACTIVE" as const };
  }
  private async reviewer(
    identity: SupabaseIdentity,
    target: Target,
    classId: string,
  ) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      target.academyId,
      "submissions.assigned.review",
    );
    const where = this.reviewScope(actor, target.academyId);
    if (
      !(await this.db.class.findFirst({
        where: {
          id: classId,
          ...where,
          courseAssignments: {
            some: {
              course: {
                modules: {
                  some: {
                    lectures: {
                      some: { materials: { some: { id: target.materialId } } },
                    },
                  },
                },
              },
            },
          },
        },
      }))
    )
      throw new NotFoundException();
    return actor;
  }
  async classMaterials(
    identity: SupabaseIdentity,
    input: { academyId: string; classId: string },
  ) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "submissions.assigned.review",
    );
    const where = this.reviewScope(actor, input.academyId);
    const row = await this.db.class.findFirst({
      where: { id: input.classId, ...where },
      include: {
        courseAssignments: {
          include: { course: { include: visibleCurriculumInclude } },
        },
      },
    });
    if (!row) throw new NotFoundException();
    return row.courseAssignments.flatMap((a) =>
      a.course.modules.flatMap((m) =>
        m.lectures.flatMap((l) =>
          l.materials
            .filter((x) => x.manualMaterial)
            .map((x) => ({
              materialId: x.id,
              title: x.title,
              type: x.type,
              courseTitle: a.course.title,
              includeInScore: x.manualMaterial!.includeInScore,
            })),
        ),
      ),
    );
  }
  async roster(
    identity: SupabaseIdentity,
    input: Target & { classId: string; userId?: string },
  ) {
    await this.reviewer(identity, input, input.classId);
    const definition = await this.db.manualMaterial.findUnique({
      where: { materialId: input.materialId },
      select: { shortAnswer: true, multipleChoice: true },
    });
    const seats = await this.db.classEnrollment.findMany({
      where: {
        classId: input.classId,
        membership: {
          academyId: input.academyId,
          status: "ACTIVE",
          role: "STUDENT",
          userId: input.userId,
        },
      },
      include: {
        membership: {
          include: { user: { select: { id: true, displayName: true } } },
        },
      },
    });
    const ids = seats.map((s) => s.membership.userId);
    const drafts = await this.db.manualDraft.findMany({
      where: { materialId: input.materialId, userId: { in: ids } },
      select: {
        userId: true,
        revision: true,
        files: Boolean(input.userId),
        answer: Boolean(input.userId),
      },
    });
    const submitted = await this.db.manualSubmission.findMany({
      where: {
        materialId: input.materialId,
        classId: input.classId,
        userId: { in: ids },
      },
      orderBy: { createdAt: "desc" },
      take: input.userId ? 30 : undefined,
      distinct: input.userId ? undefined : ["userId"],
      select: {
        id: true,
        userId: true,
        classId: true,
        createdAt: true,
        maximumHundredths: true,
        includeInScore: true,
        reviewVersion: true,
        files: Boolean(input.userId),
        answer: Boolean(input.userId),
        shortAnswerAssessment: true,
        multipleChoiceAssessment: true,
        reviews: {
          orderBy: { version: "desc" },
          ...(input.userId ? {} : { take: 1 }),
        },
      },
    });
    const draftByUser = new Map(drafts.map((d) => [d.userId, d]));
    const attemptsByUser = new Map<
      string,
      ReturnType<ManualService["publicAttempt"]>[]
    >();
    for (const attempt of submitted) {
      const history = attemptsByUser.get(attempt.userId) ?? [];
      history.push(
        this.publicAttempt({
          ...attempt,
          files: attempt.files ?? {},
          answer: attempt.answer ?? "",
        }),
      );
      attemptsByUser.set(attempt.userId, history);
    }
    return seats.map((s) => {
      const draft = draftByUser.get(s.membership.userId);
      return {
        userId: s.membership.userId,
        learnerName: s.membership.user.displayName,
        draft:
          draft && !definition?.shortAnswer && !definition?.multipleChoice
            ? {
                files: sourceFilesSchema.parse(draft.files ?? {}),
                answer: draft.answer ?? "",
                revision: draft.revision,
              }
            : null,
        attempts: attemptsByUser.get(s.membership.userId) ?? [],
      };
    });
  }
  async watch(
    identity: SupabaseIdentity,
    input: Target & { classId: string; userId: string },
  ) {
    const actor = await this.reviewer(identity, input, input.classId);
    const definition = await this.db.manualMaterial.findUnique({
      where: { materialId: input.materialId },
      select: { shortAnswer: true, multipleChoice: true },
    });
    if (definition?.shortAnswer || definition?.multipleChoice)
      throw new BadRequestException("Short answers have no editable draft");
    if (
      !(await this.db.classEnrollment.findFirst({
        where: {
          classId: input.classId,
          membership: {
            academyId: input.academyId,
            userId: input.userId,
            status: "ACTIVE",
            role: "STUDENT",
          },
        },
      }))
    )
      throw new NotFoundException();
    const entry = [...this.sessions].find(
      ([, session]) =>
        !session.preview &&
        session.target.academyId === input.academyId &&
        session.target.materialId === input.materialId &&
        session.userId === input.userId,
    );
    if (!entry) throw new NotFoundException("Learner has no active drawing");
    const view = await this.gui.request(
      `/sessions/${entry[0]}/view`,
      "POST",
      {},
    );
    const id = crypto.randomUUID();
    this.watches.set(id, {
      target: input,
      classId: input.classId,
      learnerId: input.userId,
      userId: actor.userId,
      runtimeId: entry[0],
      token: view.token,
    });
    setTimeout(() => this.watches.delete(id), 1860000).unref();
    return { ...view, id: entry[0], watchId: id, readOnly: true };
  }
  async watchStatus(identity: SupabaseIdentity, id: string) {
    const watch = this.watches.get(id);
    if (!watch) throw new NotFoundException();
    const actor = await this.reviewer(identity, watch.target, watch.classId);
    if (actor.userId !== watch.userId) throw new NotFoundException();
    if (
      !(await this.db.classEnrollment.findFirst({
        where: {
          classId: watch.classId,
          membership: {
            academyId: watch.target.academyId,
            userId: watch.learnerId,
            status: "ACTIVE",
            role: "STUDENT",
          },
        },
      }))
    )
      throw new NotFoundException();
    const view = await this.gui.request(
      `/sessions/${watch.runtimeId}/view`,
      "POST",
      { token: watch.token },
    );
    return { ...view, watchId: id, readOnly: true };
  }
  async teacherDraft(
    identity: SupabaseIdentity,
    input: Target & {
      classId: string;
      userId: string;
      files: Record<string, string>;
      answer: string;
      revision: number;
    },
  ) {
    const actor = await this.reviewer(identity, input, input.classId);
    const definition = await this.db.manualMaterial.findUnique({
      where: { materialId: input.materialId },
      select: { shortAnswer: true, multipleChoice: true },
    });
    if (definition?.shortAnswer || definition?.multipleChoice)
      throw new BadRequestException("Short answers have no editable draft");
    if (
      !(await this.db.classEnrollment.findFirst({
        where: {
          classId: input.classId,
          membership: {
            academyId: input.academyId,
            userId: input.userId,
            status: "ACTIVE",
            role: "STUDENT",
          },
        },
      }))
    )
      throw new NotFoundException();
    return this.db.$transaction(async (tx) => {
      const saved = await tx.manualDraft.updateMany({
        where: {
          materialId: input.materialId,
          userId: input.userId,
          revision: input.revision,
        },
        data: {
          files: input.files,
          answer: input.answer,
          revision: { increment: 1 },
        },
      });
      if (saved.count !== 1)
        throw new ConflictException(
          "Learner draft changed; reload before editing",
        );
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "manual.draft.teacher_edited",
        targetType: "Material",
        targetId: input.materialId,
        after: { learnerId: input.userId, revision: input.revision + 1 },
      });
      return { revision: input.revision + 1 };
    });
  }
  async listReviews(
    identity: SupabaseIdentity,
    input: Target & { classId: string },
  ) {
    await this.reviewer(identity, input, input.classId);
    const rows = await this.db.manualSubmission.findMany({
      where: { materialId: input.materialId, classId: input.classId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        shortAnswerAssessment: true,
        multipleChoiceAssessment: true,
        user: { select: { displayName: true } },
        reviews: { orderBy: { version: "desc" } },
      },
    });
    return rows.map(({ user, ...row }) => ({
      ...this.publicAttempt(row),
      learnerName: user.displayName,
    }));
  }
  async review(identity: SupabaseIdentity, input: ManualReviewInput) {
    const submission = await this.db.manualSubmission.findFirst({
      where: { id: input.submissionId, materialId: input.materialId },
    });
    if (!submission) throw new NotFoundException();
    const actor = await this.reviewer(identity, input, submission.classId);
    if (input.scoreHundredths > submission.maximumHundredths)
      throw new BadRequestException("Score exceeds maximum");
    return this.db.$transaction(async (tx) => {
      const claimed = await tx.manualSubmission.updateMany({
        where: { id: submission.id, reviewVersion: input.expectedVersion },
        data: { reviewVersion: { increment: 1 } },
      });
      if (claimed.count !== 1)
        throw new ConflictException("Review changed; reload");
      const review = await tx.manualReview.create({
        data: {
          submissionId: submission.id,
          reviewerId: actor.userId,
          scoreHundredths: input.scoreHundredths,
          completed: input.completed,
          feedback: input.feedback,
          version: input.expectedVersion + 1,
        },
      });
      await this.points.awardManualCompletion(tx, {
        materialId: submission.materialId,
        userId: submission.userId,
        classId: submission.classId,
        now: new Date(),
      });
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "manual.review.published",
        targetType: "ManualSubmission",
        targetId: submission.id,
        after: {
          version: review.version,
          completed: review.completed,
          scoreHundredths: review.scoreHundredths,
        },
      });
      return { version: review.version };
    });
  }
  async start(
    identity: SupabaseIdentity,
    input: ManualWork & {
      contentRevision: number;
      preview?: boolean;
      submissionId?: string;
      solution?: boolean;
    },
  ): Promise<ManualSession> {
    const { actor, row, config } = await this.material(
      identity,
      input,
      input.preview,
    );
    if (!input.submissionId && input.contentRevision !== config.revision)
      throw new ConflictException("Content changed; reload before running");
    if (row.type !== "TURTLE_EXERCISE")
      throw new BadRequestException("This material has no GUI runtime");
    let files = input.files,
      profile = config;
    if (input.submissionId) {
      const submission = await this.db.manualSubmission.findFirst({
        where: { id: input.submissionId, materialId: row.id },
      });
      if (!submission) throw new NotFoundException();
      await this.reviewer(identity, input, submission.classId);
      files = sourceFilesSchema.parse(submission.files);
      const snapshot = submission.profile as Prisma.JsonObject;
      profile = {
        ...config,
        ...manualConfigSchema.parse(submission.profile),
        runtimeVersion:
          typeof snapshot.runtimeVersion === "string"
            ? snapshot.runtimeVersion
            : config.runtimeVersion,
      };
    }
    if (input.solution) {
      if (!input.preview || !config.solutionFiles)
        throw new ForbiddenException();
      files = sourceFilesSchema.parse(config.solutionFiles);
    }
    if (!Object.hasOwn(files, profile.entryPoint))
      throw new BadRequestException("Entry point is missing");
    const assetFiles = await Promise.all(
      (input.solution
        ? manualConfigSchema.parse(profile).solutionAssets
        : manualConfigSchema.parse(profile).assets
      ).map(async (a) => ({
        name: a.name,
        data: await this.assets.bytes(a.assetId),
      })),
    );
    const session = await this.gui.request("/sessions", "POST", {
      runtimeVersion: profile.runtimeVersion,
      assets: assetFiles,
      files,
      entryPoint: profile.entryPoint,
      width: profile.width,
      height: profile.height,
      timeLimitSeconds: profile.timeLimitSeconds,
      memoryLimitMb: profile.memoryLimitMb,
      owner: `${actor.userId}:${row.id}`,
    });
    setTimeout(
      () => this.sessions.delete(session.id),
      (config.timeLimitSeconds + 120) * 1000,
    ).unref();
    this.sessions.set(session.id, {
      target: { academyId: input.academyId, materialId: row.id },
      userId: actor.userId,
      preview: input.preview ?? false,
    });
    return session;
  }
  async session(
    identity: SupabaseIdentity,
    id: string,
    method = "GET",
    text?: string,
  ) {
    const session = this.sessions.get(id);
    if (!session) throw new NotFoundException();
    const user = await this.db.user.findUnique({
      where: { authUserId: identity.authUserId },
      select: { id: true },
    });
    if (user?.id !== session.userId) throw new NotFoundException();
    try {
      await this.material(identity, session.target, session.preview);
    } catch (error) {
      await this.gui.request(`/sessions/${id}`, "DELETE").catch(() => {});
      this.sessions.delete(id);
      throw error;
    }
    const result = await this.gui.request(
      `/sessions/${id}${text === undefined ? "" : "/input"}`,
      method,
      text === undefined ? undefined : { text },
    );
    if (method === "DELETE") this.sessions.delete(id);
    return result;
  }
}
