import {
  exerciseLanguagesFor,
  exerciseProjectIssues,
  exerciseProjectSchema,
  gradingSemanticVersionSchema,
  hasExplanationContent,
  isCompiledLanguage,
  multipleChoiceSchema,
  quizDefinitionSchema,
  saveManualSchema,
  saveVideoSchema,
  starterBundleFor,
  type ExerciseSolutionEntry,
  type LibraryImportBlocker,
  type LibraryImportField,
  type LibraryImportWarning,
  type MultipleChoiceDefinition,
  type QuizDefinition,
  type SaveManual,
  type SaveVideo,
} from "@cove/shared";
import { HttpStatus } from "@nestjs/common";
import { AppException } from "../../common/app-exception.js";
import { sanitizeExplanation } from "../../explanations/explanation-html.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { sanitizeChoiceHtml } from "../../manual/multiple-choice.service.js";
import { privateSolutions } from "../exercise-solutions.js";
import { lessonImageIds } from "../lesson-images.js";
import { starterDigest, type CourseImportPreviewSource } from "./course-import-preview.js";
import type { CourseCopySource } from "./course-tree-copy.js";

type Source = CourseCopySource | CourseImportPreviewSource;
type Material = Source["modules"][number]["lectures"][number]["materials"][number];
type Report = (reason: LibraryImportBlocker["reason"], field: LibraryImportField, mediaState?: LibraryImportBlocker["mediaState"]) => void;
type Asset = { assetId: string; name: string; byteSize: number };

export type PreparedCopyMaterial = {
  explanation?: { body: string; sideBody: string | null };
  manual?: Omit<SaveManual, "multipleChoice"> & { multipleChoice: MultipleChoiceDefinition | null };
  video?: SaveVideo;
  quiz?: QuizDefinition;
  solutions?: ExerciseSolutionEntry[];
};

function manualField(path: readonly PropertyKey[]): LibraryImportField {
  switch (path[0]) {
    case "multipleChoice":
      if (path[1] === "options") return "choice_options";
      if (path[1] === "correctOptionIds") return "choice_answer";
      if (path[1] === "explanation") return "choice_explanation";
      return "choice";
    case "shortAnswer":
      if (path[1] === "explanation") return "short_answer_explanation";
      if (path[1] === "expectedAnswer" || path[1] === "pattern") return "short_answer_key";
      return "short_answer";
    case "assets": return "public_assets";
    case "solutionAssets": return "solution_assets";
    case "entryPoint": return "turtle_entry";
    case "files": return "files";
    case "solutionFiles":
    case "modelAnswer": return "solution";
    case "description": return "instructions";
    default: return "material";
  }
}

function prepareManual(source: Source, material: Material, report: Report): PreparedCopyMaterial["manual"] {
  const row = material.manualMaterial;
  if (!row) return;
  const parsed = saveManualSchema.safeParse({
    ...row,
    type: material.type,
    title: material.title,
    academyId: source.academyId,
    courseId: source.id,
    lectureId: material.lectureId,
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues)
      report("INVALID_DEFINITION", manualField(issue.path));
    return;
  }

  const config = parsed.data;
  if (!config.multipleChoice) return { ...config, multipleChoice: null };
  // The nested authoring schema strips keys before its refinement. Validate the
  // stored definition as the assessment reader does, then copy this parsed form.
  const choice = multipleChoiceSchema.safeParse(row.multipleChoice);
  if (!choice.success) {
    for (const issue of choice.error.issues)
      report("INVALID_DEFINITION", manualField(["multipleChoice", ...issue.path]));
    return;
  }

  const definition = choice.data;
  const sanitized = multipleChoiceSchema.safeParse({
    ...definition,
    problemDescription: sanitizeChoiceHtml(definition.problemDescription),
    options: definition.options.map((option) => ({ ...option, content: sanitizeChoiceHtml(option.content) })),
    explanation: sanitizeChoiceHtml(definition.explanation),
  });
  if (!sanitized.success) {
    for (const issue of sanitized.error.issues)
      report("INVALID_DEFINITION", manualField(["multipleChoice", ...issue.path]));
    return;
  }
  return { ...config, description: sanitizeChoiceHtml(config.description), multipleChoice: sanitized.data };
}

function mediaState(state: string): LibraryImportBlocker["mediaState"] {
  switch (state) {
    case "PENDING":
    case "UPLOADING":
    case "PROCESSING": return "processing";
    case "FAILED": return "failed";
    case "DELETING": return "deleting";
    default: return "unavailable";
  }
}

/** The same issue shape covers preview readiness and revalidation under lock. */
export function importMediaIssue(
  material: Pick<Material, "id" | "title">,
  field: "pdf" | "video",
  state: string | undefined,
): LibraryImportBlocker | undefined {
  const context = { materialId: material.id, materialTitle: material.title, field };
  if (!state) return { ...context, reason: "ASSET_MISSING" };
  if (state !== "READY") return { ...context, reason: "ASSET_NOT_READY", mediaState: mediaState(state) };
}

export function invalidLibraryImport(blockers: LibraryImportBlocker[]) {
  return new AppException("LIBRARY_IMPORT_CONTENT_INVALID", HttpStatus.CONFLICT, undefined, { blockers });
}

/** Validates the exact representations used for the write. Only diagnostics leave the server. */
export async function validateLibraryImport(
  tx: Pick<Prisma.TransactionClient, "manualAsset" | "videoCaption">,
  source: Source,
) {
  const entries = source.modules.flatMap((module) =>
    module.lectures.flatMap((lecture) => lecture.materials.map((material) => ({
      material,
      visible: module.isVisible && lecture.isVisible && material.isVisible,
    }))),
  );
  const materialsById = new Map(entries.map((entry) => [entry.material.id, entry]));
  const blockers: LibraryImportBlocker[] = [];
  const warnings: LibraryImportWarning[] = [];
  const prepared = new Map<string, PreparedCopyMaterial>();
  const assetIds = new Set<string>();
  const captionIds = new Set<string>();
  const assetChecks: Array<{ id: string; asset?: Asset; image: boolean; check: Report; field: LibraryImportField }> = [];
  const captionChecks: Array<{ video: NonNullable<Material["videoLesson"]>; captions: SaveVideo["captions"]; check: Report }> = [];

  for (const { material, visible } of entries) {
    const context = { materialId: material.id, materialTitle: material.title };
    const seen = new Set<string>();
    const report: Report = (reason, field, state) => {
      const key = `${reason}:${field}`;
      if (seen.has(key)) return;
      seen.add(key);
      blockers.push({ ...context, reason, field, ...(state ? { mediaState: state } : {}) });
    };
    const addManifest = (manifest: Asset[], field: LibraryImportField) => {
      for (const asset of manifest) {
        const id = asset.assetId.toLowerCase();
        assetIds.add(id);
        assetChecks.push({ id, asset, image: false, check: report, field });
      }
    };
    const addImages = (html: string | null, field: LibraryImportField, manifest?: Asset[]) => {
      for (const id of lessonImageIds(html)) {
        if (manifest && !manifest.some((asset) => asset.assetId.toLowerCase() === id)) {
          report("ASSET_UNREFERENCED", field);
          continue;
        }
        assetIds.add(id);
        assetChecks.push({ id, image: true, check: report, field });
      }
    };

    const values: PreparedCopyMaterial = {};
    prepared.set(material.id, values);
    const { type, programmingExercise, manualMaterial, explanationMaterial, pdfDocument, videoLesson } = material;
    const isManual = type === "TURTLE_EXERCISE" || type === "WRITTEN_RESPONSE" || type === "MULTIPLE_CHOICE";
    if ((type === "PROGRAMMING_EXERCISE" && !programmingExercise)
        || (type === "EXPLANATION" && !explanationMaterial)
        || (type === "PDF_DOCUMENT" && !pdfDocument)
        || (type === "VIDEO_LESSON" && !videoLesson)
        || (isManual && !manualMaterial))
      report("SUBTYPE_MISSING", "material");
    if ((programmingExercise && type !== "PROGRAMMING_EXERCISE")
        || (explanationMaterial && type !== "EXPLANATION")
        || (manualMaterial && !isManual))
      report("SUBTYPE_UNSUPPORTED", "material");

    if (programmingExercise && type === "PROGRAMMING_EXERCISE") {
      const exercise = programmingExercise;
      const facts = "facts" in exercise ? exercise.facts : {
        hasTests: exercise.testCases.length > 0,
        hasSolutions: exercise.solutions.length > 0,
        invalidSolutions: exercise.solutions.some((solution) => !solution.code.trim()),
        hasLegacySolution: Boolean(exercise.solutionCode?.trim()),
        starterDigest: exercise.sourceProject == null ? null : starterDigest(exercise.starterCode),
      };
      if (exercise.quiz != null) {
        const quiz = quizDefinitionSchema.safeParse(exercise.quiz);
        if (quiz.success) {
          values.quiz = quiz.data;
        } else {
          for (const { path } of quiz.error.issues) {
            const field = path[0] === "choices" ? "quiz_choices"
              : path[0] === "correctChoiceId" ? "quiz_answer"
              : path[0] === "explanation" ? "quiz_explanation"
              : "quiz";
            report("INVALID_DEFINITION", field);
          }
        }
        if (exercise.submissionPolicy !== "AUTOMATIC" || facts.hasTests || facts.hasSolutions
            || exercise.sourceProject != null || exercise.gradingMode !== "LEGACY_STDIO")
          report("INVALID_DEFINITION", "quiz");
      } else {
        if (!exerciseLanguagesFor(source.language).includes(exercise.language))
          report("INVALID_DEFINITION", "grading");
        if (exercise.submissionPolicy === "AUTOMATIC" && !facts.hasTests)
          warnings.push({ ...context, reason: "TESTS_MISSING", field: "tests" });
        if (exercise.submissionPolicy === "AUTOMATIC" && facts.hasTests
            && !gradingSemanticVersionSchema.safeParse(exercise.gradingSemanticVersion).success)
          report("INVALID_DEFINITION", "grading");
        if (facts.invalidSolutions) report("INVALID_DEFINITION", "solution");
        if (!("facts" in exercise)) {
          values.solutions = privateSolutions(exercise.solutions);
          // Same compatibility projection as the migration to numbered answers.
          if (!facts.hasSolutions && facts.hasLegacySolution)
            values.solutions = [{ title: null, code: exercise.solutionCode! }];
        }
      }
      if (exercise.sourceProject != null) {
        const project = exerciseProjectSchema.safeParse(exercise.sourceProject);
        if (!project.success || !isCompiledLanguage(exercise.language)
            || exerciseProjectIssues(project.data, exercise.language).length > 0)
          report("INVALID_DEFINITION", "project");
        else if (starterDigest(starterBundleFor(project.data)) !== facts.starterDigest)
          report("INVALID_DEFINITION", "starter_bundle");
      }
      addImages(exercise.description, "instructions");
      if (exercise.referencePdfMaterialId) {
        const target = materialsById.get(exercise.referencePdfMaterialId);
        const pdf = target?.material.pdfDocument;
        if (exercise.quiz != null || !pdf || pdf.placement === "MAIN")
          report("PDF_REFERENCE_INVALID", "pdf_reference");
        else if (pdf.asset.state !== "READY")
          report("ASSET_NOT_READY", "pdf_reference", mediaState(pdf.asset.state));
        else if (visible && !target?.visible)
          warnings.push({ ...context, reason: "PDF_REFERENCE_HIDDEN", field: "pdf_reference" });
      }
    }

    if (manualMaterial && isManual) {
      if (type === "TURTLE_EXERCISE" && source.language === "WEB")
        report("SUBTYPE_UNSUPPORTED", "material");
      const config = prepareManual(source, material, report);
      if (config) {
        values.manual = config;
        addManifest(config.assets, "public_assets");
        addManifest(config.solutionAssets, "solution_assets");
        addImages(config.description, "instructions", config.assets);
        const choice = config.multipleChoice;
        if (choice) {
          addImages(choice.problemDescription, "choice", config.assets);
          for (const option of choice.options) addImages(option.content, "choice_options", config.assets);
          addImages(choice.explanation, "choice_explanation", config.solutionAssets);
        }
        if (config.shortAnswer)
          addImages(config.shortAnswer.explanation, "short_answer_explanation", config.solutionAssets);
      }
    }

    if (explanationMaterial) {
      const sanitize = (html: string, field: "explanation_main" | "explanation_side") => {
        try {
          const body = sanitizeExplanation(html);
          addImages(body, field);
          return body;
        } catch (error) {
          if (!(error instanceof AppException) || error.code !== "CONTENT_VALIDATION_FAILED")
            throw error;
          report("INVALID_DEFINITION", field);
          return null;
        }
      };
      const { body, sideBody } = explanationMaterial;
      const main = sanitize(body, "explanation_main");
      const side = sideBody && hasExplanationContent(sideBody) ? sanitize(sideBody, "explanation_side") : null;
      if (main !== null) values.explanation = { body: main, sideBody: side };
    }

    if (pdfDocument) {
      const issue = importMediaIssue(material, "pdf", pdfDocument.asset.state);
      if (issue) report(issue.reason, "pdf", issue.mediaState);
    }
    if (videoLesson) {
      const issue = importMediaIssue(material, "video", videoLesson.asset.state);
      if (issue) report(issue.reason, "video", issue.mediaState);
      const parsed = saveVideoSchema.safeParse({
        ...videoLesson,
        academyId: source.academyId,
        courseId: source.id,
        lectureId: material.lectureId,
        title: material.title,
      });
      if (!parsed.success) {
        for (const issue of parsed.error.issues)
          report(issue.path[0] === "captions" ? "CAPTION_INVALID" : "INVALID_DEFINITION", issue.path[0] === "captions" ? "captions" : "video");
      } else {
        const config = { ...parsed.data, description: sanitizeChoiceHtml(parsed.data.description) };
        values.video = config;
        addManifest(config.assets, "public_assets");
        addImages(config.description, "instructions", config.assets);
        for (const caption of config.captions) captionIds.add(caption.id);
        captionChecks.push({ video: videoLesson, captions: config.captions, check: report });
      }
    }
  }

  const [assets, captions] = await Promise.all([
    assetIds.size ? tx.manualAsset.findMany({
      where: { id: { in: [...assetIds] } },
      select: { id: true, name: true, byteSize: true, mimeType: true },
    }) : [],
    captionIds.size ? tx.videoCaption.findMany({
      where: { id: { in: [...captionIds] } },
      select: { id: true, assetId: true, language: true, label: true, objectKey: true },
    }) : [],
  ]);
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const captionsById = new Map(captions.map((caption) => [caption.id, caption]));
  for (const { id, asset, image, check, field } of assetChecks) {
    const stored = assetsById.get(id);
    if (!stored || (asset && (stored.name !== asset.name || stored.byteSize !== asset.byteSize)))
      check("ASSET_MISSING", field);
    else if (image && !stored.mimeType.startsWith("image/"))
      check("ASSET_INCOMPATIBLE", field);
  }
  for (const { video, captions, check } of captionChecks) {
    const invalid = captions.some((caption) => {
      const stored = captionsById.get(caption.id);
      return !stored || stored.assetId !== video.assetId || stored.language !== caption.language
        || stored.label !== caption.label
        || stored.objectKey !== `${video.asset.academyId}/${video.asset.id}/${caption.path}`;
    });
    if (invalid) check("CAPTION_INVALID", "captions");
  }

  const order = new Map(entries.map(({ material }, index) => [material.id, index]));
  blockers.sort((left, right) => order.get(left.materialId)! - order.get(right.materialId)!);
  return { blockers, warnings, prepared };
}
