import { exerciseSolutionRows, privateSolutions, prepareExerciseSolutions, solutionOrder } from "../exercise-solutions.js";
import { AppException } from "../../common/app-exception.js";
import { randomUUID } from "node:crypto";
import { ConflictException, HttpStatus } from "@nestjs/common";
import { multipleChoiceSchema, type MultipleChoiceDefinition } from "@cove/shared";
import { readLockedPdfAssetStates } from "../../documents/pdf-document.service.js";
import { Prisma } from "../../generated/prisma/client.js";

import { importMediaIssue, invalidLibraryImport, type PreparedCopyMaterial } from "./library-import-validation.js";

function remapChoiceDefinition(definition: MultipleChoiceDefinition) {
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
          // A test's settings travel with it; class schedules and attempts never do.
          test: true,
          materials: {
            orderBy: [{ position: "asc" }, { id: "asc" }],
            include: {
              explanationMaterial: true,
              manualMaterial: true,
              videoLesson: { include: { asset: true } },
              pdfDocument: { include: { asset: true } },
              programmingExercise: {
                include: {
                  solutions: solutionOrder,
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
  prepared?: ReadonlyMap<string, PreparedCopyMaterial>,
): Promise<void> {
  const modules: Prisma.CourseModuleCreateManyInput[] = [];
  const lectures: Prisma.LectureCreateManyInput[] = [];
  const materials: Prisma.MaterialCreateManyInput[] = [];
  const documents: Prisma.PdfDocumentCreateManyInput[] = [];
  const explanations: Prisma.ExplanationMaterialCreateManyInput[] = [];
  const materialIds = new Map<string, string>();
  const references: Array<{ exercise: Prisma.ProgrammingExerciseCreateManyInput; referenceId: string }> = [];
  const media: Array<{ id: string; title: string; field: "pdf" | "video"; assetId: string }> = [];
  const copiedSolutions: Prisma.ProgrammingExerciseSolutionCreateManyInput[] = [];
  const videos: Prisma.VideoLessonCreateManyInput[] = [];
  const manuals: Prisma.ManualMaterialCreateManyInput[] = [];
  const exercises: Prisma.ProgrammingExerciseCreateManyInput[] = [];
  const testCases: Prisma.ExerciseTestCaseCreateManyInput[] = [];
  const hints: Prisma.ExerciseHintCreateManyInput[] = [];
  const tests: Array<{ row: Prisma.LectureTestCreateManyInput; points: Record<string, number> }> = [];

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
        kind: lecture.kind,
      });
      if (lecture.kind === "TEST" && lecture.test) {
        const { lectureId: _source, createdAt: _created, updatedAt: _updated, points, ...settings } = lecture.test;
        tests.push({ row: { ...settings, lectureId }, points: (points ?? {}) as Record<string, number> });
      }

      for (const material of lecture.materials) {
        const materialId = randomUUID();
        const values = prepared?.get(material.id);
        materialIds.set(material.id, materialId);
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

        const explanation = values?.explanation ?? material.explanationMaterial;
        if (explanation) explanations.push({ materialId, body: explanation.body, sideBody: explanation.sideBody, revision: 1 });
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
          } = values?.video ?? material.videoLesson;
          media.push({ id: material.id, title: material.title, field: "video", assetId });
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
        if (material.pdfDocument) {
          media.push({ id: material.id, title: material.title, field: "pdf", assetId: material.pdfDocument.assetId });
          documents.push({
            materialId,
            assetId: material.pdfDocument.assetId,
            placement: material.pdfDocument.placement,
          });
        }
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
          const config = values?.manual;
          const choice = config
            ? config.multipleChoice
            : multipleChoice ? multipleChoiceSchema.parse(multipleChoice) : null;
          const answer = config ? config.shortAnswer : shortAnswer;
          const answerFiles = config ? config.solutionFiles : solutionFiles;
          manuals.push({
            ...manual,
            ...(config && {
              description: config.description,
              entryPoint: config.entryPoint,
              hint: config.hint,
              modelAnswer: config.modelAnswer,
            }),
            multipleChoice: choice ? remapChoiceDefinition(choice) : Prisma.DbNull,
            shortAnswer: answer == null ? Prisma.DbNull : (answer as Prisma.InputJsonValue),
            materialId,
            revision: 1,
            files: (config?.files ?? files) as Prisma.InputJsonValue,
            assets: (config?.assets ?? assets) as Prisma.InputJsonValue,
            solutionAssets: (config?.solutionAssets ?? solutionAssets) as Prisma.InputJsonValue,
            solutionFiles: answerFiles == null ? Prisma.DbNull : (answerFiles as Prisma.InputJsonValue),
          });
        }
        const exercise = material.programmingExercise;
        if (!exercise) continue;
        const preparedSolutions = values
          ? exerciseSolutionRows(materialId, values.solutions ?? [])
          : prepareExerciseSolutions(materialId, privateSolutions(exercise.solutions));
        copiedSolutions.push(...preparedSolutions.rows);
        const copiedExercise: Prisma.ProgrammingExerciseCreateManyInput = {
          materialId,
          externalKey: exercise.externalKey,
          difficulty: exercise.difficulty,
          description: exercise.description,
          inputFormat: exercise.inputFormat,
          outputFormat: exercise.outputFormat,
          constraints: exercise.constraints,
          ...(exercise.quiz ? { quiz: values?.quiz ?? exercise.quiz } : {}),
          starterCode: exercise.starterCode,
          sourceProject: exercise.sourceProject == null ? Prisma.DbNull : exercise.sourceProject,
          solutionCode: preparedSolutions.solutionCode,
          language: exercise.language,
          timeLimitMs: exercise.timeLimitMs,
          memoryLimitMb: exercise.memoryLimitMb,
          aiFeedbackEnabled: exercise.aiFeedbackEnabled,
          feedbackPolicy:
            exercise.feedbackPolicy == null
              ? Prisma.DbNull
              : exercise.feedbackPolicy,
          manualMaximumHundredths: exercise.manualMaximumHundredths ?? 10000,
          manualIncludeInScore: exercise.manualIncludeInScore ?? false,
          submissionPolicy: exercise.submissionPolicy ?? (exercise.referencePdfMaterialId && !exercise.testCases.length ? "PRACTICE_ONLY" : "AUTOMATIC"),
          gradingMode: exercise.gradingMode,
          inputPromptPolicy: exercise.inputPromptPolicy,
          gradingSemanticVersion: exercise.gradingSemanticVersion,
          totalTimeLimitMs: exercise.totalTimeLimitMs,
          comparatorTimeLimitMs: exercise.comparatorTimeLimitMs,
          continuationPolicy: exercise.continuationPolicy,
          exitStatusPolicy: exercise.exitStatusPolicy,
          materialMaximumHundredths: exercise.materialMaximumHundredths,
          materialScorePolicy: exercise.materialScorePolicy,
        };
        exercises.push(copiedExercise);
        if (exercise.referencePdfMaterialId) references.push({ exercise: copiedExercise, referenceId: exercise.referencePdfMaterialId });
        for (const testCase of exercise.testCases) {
          testCases.push({
            exerciseMaterialId: materialId,
            // Carried verbatim: a copy's items are its source's items.
            syncKey: testCase.syncKey,
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
            syncKey: hint.syncKey,
            position: hint.position,
            content: hint.content,
            triggerExpression: hint.triggerExpression,
          });
        }
      }
    }
  }

  // Lock in the same order for every copy. Report against source materials,
  // including every item that shares a newly unavailable asset.
  const assetIds = (field: "pdf" | "video") =>
    [...new Set(media.filter((item) => item.field === field).map((item) => item.assetId))];
  const pdfStates = await readLockedPdfAssetStates(tx, assetIds("pdf"));
  const videoIds = assetIds("video");
  const videoRows = videoIds.length
    ? await tx.$queryRaw<Array<{ id: string; state: string }>>`
        SELECT id, state FROM video_assets WHERE id = ANY(${videoIds}::uuid[]) ORDER BY id FOR UPDATE`
    : [];
  const videoStates = new Map(videoRows.map((row) => [row.id, row.state]));
  const unavailable = media.flatMap((item) => {
    const states = item.field === "pdf" ? pdfStates : videoStates;
    const issue = importMediaIssue(item, item.field, states.get(item.assetId));
    return issue ? [issue] : [];
  });
  if (unavailable.length) {
    if (policy === "PRESERVE_VISIBILITY") throw invalidLibraryImport(unavailable);
    if (unavailable.some((issue) => issue.field === "pdf"))
      throw new AppException("PDF_UPLOAD_EXPIRED", HttpStatus.CONFLICT);
    throw new ConflictException("Only ready video lessons can be adopted");
  }

  if (modules.length) await tx.courseModule.createMany({ data: modules });
  if (lectures.length) await tx.lecture.createMany({ data: lectures });
  if (materials.length) await tx.material.createMany({ data: materials });
  // Points are keyed by material id, so they follow each problem to its copy.
  if (tests.length)
    await tx.lectureTest.createMany({
      data: tests.map(({ row, points }) => ({
        ...row,
        points: Object.fromEntries(
          Object.entries(points).flatMap(([id, value]) => {
            const target = materialIds.get(id);
            return target ? [[target, value]] : [];
          }),
        ),
      })),
    });
  if (explanations.length) await tx.explanationMaterial.createMany({ data: explanations });
  if (videos.length) await tx.videoLesson.createMany({ data: videos });
  if (documents.length) await tx.pdfDocument.createMany({ data: documents });
  if (manuals.length) await tx.manualMaterial.createMany({ data: manuals });
  // Remapped only now that every material has its new id, since an exercise can
  // precede the PDF it reads; the copied documents are inserted above, so the
  // exercises can carry the reference in the same bulk insert.
  for (const { exercise, referenceId } of references) {
    const target = materialIds.get(referenceId);
    if (!target) throw new ConflictException("Reference PDF is outside the copied course");
    exercise.referencePdfMaterialId = target;
  }
  if (exercises.length) {
    await tx.programmingExercise.createMany({ data: exercises });
  }
  if (copiedSolutions.length) await tx.programmingExerciseSolution.createMany({ data: copiedSolutions });
  if (testCases.length) {
    await tx.exerciseTestCase.createMany({ data: testCases });
  }
  if (hints.length) await tx.exerciseHint.createMany({ data: hints });
}
