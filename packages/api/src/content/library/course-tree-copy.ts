import { AppException } from "../../common/app-exception.js";
import { randomUUID } from "node:crypto";
import { ConflictException, HttpStatus } from "@nestjs/common";
import { multipleChoiceSchema } from "@cove/shared";
import { lockPdfAsset } from "../../documents/pdf-document.service.js";
import { Prisma } from "../../generated/prisma/client.js";

function remapChoiceDefinition(raw: unknown) {
  const definition = multipleChoiceSchema.parse(raw);
  const ids = new Map(
    definition.options.map((option) => [option.id, randomUUID()]),
  );
  return {
    ...definition,
    options: definition.options.map((option) => ({
      ...option,
      id: ids.get(option.id)!,
    })),
    correctOptionIds: definition.correctOptionIds.map((id) => ids.get(id)!),
  };
}

export const courseCopyInclude = {
  modules: {
    orderBy: [{ position: "asc" }, { id: "asc" }],
    include: {
      lectures: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        include: {
          materials: {
            orderBy: [{ position: "asc" }, { id: "asc" }],
            include: {
              manualMaterial: true,
              videoLesson: { include: { asset: true } },
              pdfDocument: { include: { asset: true } },
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

export type CourseCopySource = Prisma.CourseGetPayload<{
  include: typeof courseCopyInclude;
}>;
export type CourseCopyPolicy = "ACADEMY_ADOPTION" | "PRESERVE_VISIBILITY";

/** Copies authored descendants only; authorization and course ownership stay with callers. */
export async function copyCourseTree(
  tx: Prisma.TransactionClient,
  source: CourseCopySource,
  courseId: string,
  policy: CourseCopyPolicy,
): Promise<void> {
  const modules: Prisma.CourseModuleCreateManyInput[] = [];
  const lectures: Prisma.LectureCreateManyInput[] = [];
  const materials: Prisma.MaterialCreateManyInput[] = [];
  const documents: Prisma.PdfDocumentCreateManyInput[] = [];
  const videos: Prisma.VideoLessonCreateManyInput[] = [];
  const manuals: Prisma.ManualMaterialCreateManyInput[] = [];
  const exercises: Prisma.ProgrammingExerciseCreateManyInput[] = [];
  const testCases: Prisma.ExerciseTestCaseCreateManyInput[] = [];
  const hints: Prisma.ExerciseHintCreateManyInput[] = [];

  for (const courseModule of source.modules) {
    const moduleId = randomUUID();
    modules.push({
      id: moduleId,
      courseId,
      externalKey: courseModule.externalKey,
      title: courseModule.title,
      description: courseModule.description,
      position: courseModule.position,
      isVisible:
        policy === "PRESERVE_VISIBILITY" ? courseModule.isVisible : true,
    });

    for (const lecture of courseModule.lectures) {
      const lectureId = randomUUID();
      lectures.push({
        id: lectureId,
        courseModuleId: moduleId,
        externalKey: lecture.externalKey,
        title: lecture.title,
        description: lecture.description,
        position: lecture.position,
        isVisible: policy === "PRESERVE_VISIBILITY" ? lecture.isVisible : true,
      });

      for (const material of lecture.materials) {
        const materialId = randomUUID();
        materials.push({
          id: materialId,
          lectureId,
          type: material.type,
          title: material.title,
          position: material.position,
          isRequired: material.isRequired,
          isVisible:
            policy === "PRESERVE_VISIBILITY"
              ? material.isVisible
              : !material.videoLesson &&
                !material.manualMaterial?.shortAnswer &&
                !material.manualMaterial?.multipleChoice,
        });

        if (material.videoLesson) {
          const {
            assetId,
            description,
            placement,
            includeInScore,
            maximumHundredths,
            thresholdBasisPoints,
            captions,
            assets,
          } = material.videoLesson;
          videos.push({
            materialId,
            assetId,
            description,
            placement,
            includeInScore,
            maximumHundredths,
            thresholdBasisPoints,
            assets: assets as Prisma.InputJsonValue,
            captions: captions as Prisma.InputJsonValue,
            revision: 1,
            requestKey: randomUUID(),
          });
        }
        if (material.pdfDocument)
          documents.push({
            materialId,
            assetId: material.pdfDocument.assetId,
            placement: material.pdfDocument.placement,
          });
        if (material.manualMaterial) {
          const {
            multipleChoice,
            shortAnswer,
            solutionAssets,
            solutionFiles,
            files,
            assets,
            ...manual
          } = material.manualMaterial;
          manuals.push({
            ...manual,
            multipleChoice: multipleChoice
              ? remapChoiceDefinition(multipleChoice)
              : Prisma.DbNull,
            shortAnswer: shortAnswer
              ? (shortAnswer as Prisma.InputJsonValue)
              : Prisma.DbNull,
            materialId,
            revision: 1,
            files: files as Prisma.InputJsonValue,
            assets: assets as Prisma.InputJsonValue,
            solutionAssets: solutionAssets as Prisma.InputJsonValue,
            solutionFiles: solutionFiles
              ? (solutionFiles as Prisma.InputJsonValue)
              : Prisma.DbNull,
          });
        }
        const exercise = material.programmingExercise;
        if (!exercise) continue;
        exercises.push({
          materialId,
          externalKey: exercise.externalKey,
          difficulty: exercise.difficulty,
          description: exercise.description,
          inputFormat: exercise.inputFormat,
          outputFormat: exercise.outputFormat,
          constraints: exercise.constraints,
          ...(exercise.quiz ? { quiz: exercise.quiz } : {}),
          starterCode: exercise.starterCode,
          solutionCode: exercise.solutionCode,
          language: exercise.language,
          timeLimitMs: exercise.timeLimitMs,
          memoryLimitMb: exercise.memoryLimitMb,
          aiFeedbackEnabled: exercise.aiFeedbackEnabled,
          feedbackPolicy:
            exercise.feedbackPolicy == null
              ? Prisma.DbNull
              : exercise.feedbackPolicy,
          gradingMode: exercise.gradingMode,
          gradingSemanticVersion: exercise.gradingSemanticVersion,
          totalTimeLimitMs: exercise.totalTimeLimitMs,
          comparatorTimeLimitMs: exercise.comparatorTimeLimitMs,
          continuationPolicy: exercise.continuationPolicy,
          exitStatusPolicy: exercise.exitStatusPolicy,
          materialMaximumHundredths: exercise.materialMaximumHundredths,
          materialScorePolicy: exercise.materialScorePolicy,
        });
        for (const testCase of exercise.testCases) {
          testCases.push({
            exerciseMaterialId: materialId,
            position: testCase.position,
            input: testCase.input,
            expectedOutput: testCase.expectedOutput,
            visibility: testCase.visibility,
            comparator: testCase.comparator,
            weight: testCase.weight,
            timeLimitMsOverride: testCase.timeLimitMsOverride,
            softTimeLimitMs: testCase.softTimeLimitMs,
            softPenalty: testCase.softPenalty,
            label: testCase.label,
          });
        }
        for (const hint of exercise.hints) {
          hints.push({
            exerciseMaterialId: materialId,
            position: hint.position,
            content: hint.content,
            triggerExpression: hint.triggerExpression,
          });
        }
      }
    }
  }

  if (modules.length) await tx.courseModule.createMany({ data: modules });
  if (lectures.length) await tx.lecture.createMany({ data: lectures });
  if (materials.length) await tx.material.createMany({ data: materials });
  for (const assetId of [...new Set(documents.map((d) => d.assetId))].sort())
    await lockPdfAsset(tx, assetId);
  for (const assetId of [...new Set(videos.map((v) => v.assetId))].sort()) {
    await tx.$queryRaw`SELECT id FROM video_assets WHERE id=${assetId}::uuid FOR UPDATE`;
    const asset = await tx.videoAsset.findUnique({ where: { id: assetId } });
    if (asset?.state !== "READY") {
      if (policy === "PRESERVE_VISIBILITY")
        throw new AppException(
          "LIBRARY_IMPORT_CONTENT_INVALID",
          HttpStatus.CONFLICT,
        );
      throw new ConflictException("Only ready video lessons can be adopted");
    }
  }
  if (videos.length) await tx.videoLesson.createMany({ data: videos });
  if (documents.length) await tx.pdfDocument.createMany({ data: documents });
  if (manuals.length) await tx.manualMaterial.createMany({ data: manuals });
  if (exercises.length) {
    await tx.programmingExercise.createMany({ data: exercises });
  }
  if (testCases.length) {
    await tx.exerciseTestCase.createMany({ data: testCases });
  }
  if (hints.length) await tx.exerciseHint.createMany({ data: hints });
}
