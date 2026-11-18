import { randomUUID } from "node:crypto";
import { semanticVersionForMode } from "@cove/shared";

import { Prisma } from "../generated/prisma/client.js";
import { bulkUpdate, rewriteSiblings } from "./bulk.js";
import type { CanonicalValue } from "./canonical.js";
import {
  isGradingUnit,
  isLocalKey,
  MANUAL_TYPES,
  type NodeKind,
  type SyncNode,
} from "./catalog.js";
import {
  composeExercise,
  composeExplanation,
  composeManual,
  composePdf,
  composeVideo,
  localIdOf,
  type Merged,
} from "./compose.js";
import type {
  OursNodeView,
  Plan,
  PlannedUnit,
  ReleaseNodeView,
} from "./merge/plan.js";

/**
 * Applying a validated plan to one copy, inside the run's transaction
 * (design §§8.4, 9–11). Every table costs a bounded number of statements,
 * however many rows change.
 */

type Tx = Prisma.TransactionClient;

export type VisibilityPolicy = "SYNC_ADDITION" | "ADOPTION";

export type WriteInput = {
  copyCourseId: string;
  courseKey: string;
  plan: Plan;
  theirs: ReadonlyMap<string, ReleaseNodeView>;
  ours: ReadonlyMap<string, OursNodeView>;
  /** Full-mode copy nodes for every node the plan writes. */
  oursFull: ReadonlyMap<string, SyncNode>;
  /** Full values by hash for every theirs unit the plan applies or adds. */
  values: ReadonlyMap<string, CanonicalValue>;
  /** Live links: node key → local id. */
  linked: ReadonlyMap<string, string>;
  /** MC option maps by material node key: library option key → local option id. */
  optionMaps: ReadonlyMap<string, Record<string, string>>;
  existingKeys: {
    modules: Set<string>;
    lectures: Set<string>;
    exercises: Set<string>;
  };
  visibility: VisibilityPolicy;
};

export type WriteResult = {
  wroteContent: boolean;
  /** New local id of every addition. */
  addedIds: Map<string, string>;
  /** MC option maps that changed, by material node key. */
  optionMaps: Map<string, Record<string, string>>;
  /** Materials whose grading changed, with their previous and next revision. */
  gradingChanged: Array<{ localId: string; previous: number; next: number }>;
  archivedLocalIds: string[];
};

const PRESERVED_VISIBILITY_FOR_ADOPTION = new Set(["VIDEO_LESSON"]);

/** Each material type's own row, the one its editor's stale-save check reads. */
const VERSIONED_TYPE_TABLES: Record<string, string> = {
  EXPLANATION: "explanation_materials",
  VIDEO_LESSON: "video_lessons",
  PDF_DOCUMENT: "pdf_documents",
  PROGRAMMING_EXERCISE: "programming_exercises",
  TURTLE_EXERCISE: "manual_materials",
  WRITTEN_RESPONSE: "manual_materials",
  MULTIPLE_CHOICE: "manual_materials",
};

/** Whether a newly arriving node is visible (D3 for sync; unchanged policy for adoption). */
function arrivesVisible(
  policy: VisibilityPolicy,
  kind: NodeKind,
  materialType: string | null,
  merged: Merged,
) {
  if (policy === "SYNC_ADDITION") return true;
  if (kind !== "MATERIAL") return true;
  // `copyCourseTree`'s ACADEMY_ADOPTION rule: video, short-answer and multiple
  // choice materials arrive hidden.
  if (PRESERVED_VISIBILITY_FOR_ADOPTION.has(materialType ?? "")) return false;
  if (materialType === "MULTIPLE_CHOICE") return false;
  if (materialType === "WRITTEN_RESPONSE")
    return !(merged["sa.rule"] as { present?: boolean } | null)?.present;
  return true;
}

export function mergedUnitsFor(
  input: Pick<WriteInput, "theirs" | "oursFull" | "values" | "plan">,
  nodeKey: string,
  decisions: ReadonlyMap<string, PlannedUnit[]>,
  added: boolean,
): Merged {
  const merged: Merged = {};
  if (added) {
    const theirs = input.theirs.get(nodeKey)!;
    for (const [unitKey, hash] of Object.entries(theirs.unitHashes))
      merged[unitKey] = requireValue(input.values, hash);
    return merged;
  }
  Object.assign(merged, input.oursFull.get(nodeKey)?.units ?? {});
  for (const unit of decisions.get(nodeKey) ?? []) {
    if (unit.outcome !== "APPLIED") continue;
    if (unit.theirsHash === null) delete merged[unit.unitKey];
    else merged[unit.unitKey] = requireValue(input.values, unit.theirsHash);
  }
  const orders = input.plan.itemOrders.get(nodeKey);
  for (const [unitKey, order] of orders ?? []) merged[unitKey] = order;
  return merged;
}

function requireValue(
  values: ReadonlyMap<string, CanonicalValue>,
  hash: string,
): CanonicalValue {
  if (!values.has(hash))
    throw new Error(`Library sync value ${hash} is missing from the store`);
  return values.get(hash)!;
}

export function decisionsByNode(plan: Plan) {
  const byNode = new Map<string, PlannedUnit[]>();
  for (const unit of plan.units)
    byNode.set(unit.nodeKey, [...(byNode.get(unit.nodeKey) ?? []), unit]);
  return byNode;
}

export async function applyPlan(
  tx: Tx,
  input: WriteInput,
): Promise<WriteResult> {
  const { plan } = input;
  const decisions = decisionsByNode(plan);
  const result: WriteResult = {
    wroteContent: false,
    addedIds: new Map(),
    optionMaps: new Map(),
    gradingChanged: [],
    archivedLocalIds: [],
  };

  // Ids first, so every level of an addition knows its parent.
  for (const key of plan.adds) result.addedIds.set(key, randomUUID());
  const localOf = (key: string | null): string | null => {
    if (key === null) return null;
    if (key === input.courseKey) return input.copyCourseId;
    return result.addedIds.get(key) ?? localIdOf(key, input.linked);
  };

  const touched = new Set<string>();
  for (const unit of plan.units)
    if (unit.outcome === "APPLIED") touched.add(unit.nodeKey);
  for (const key of plan.itemOrders.keys()) touched.add(key);
  for (const key of plan.restores) touched.add(key);

  const optionLocalFor = (nodeKey: string) => {
    const map = { ...(input.optionMaps.get(nodeKey) ?? {}) };
    let changed = false;
    return {
      local(key: string) {
        if (isLocalKey(key)) return key.slice("local:".length);
        if (!map[key]) {
          map[key] = randomUUID();
          changed = true;
        }
        return map[key]!;
      },
      finish() {
        if (changed || !input.optionMaps.has(nodeKey))
          result.optionMaps.set(nodeKey, map);
      },
    };
  };

  // ---------------------------------------------------------------- additions
  const tempPosition = (index: number) => 1_500_000_000 + index;
  const modules: Prisma.CourseModuleCreateManyInput[] = [];
  const lectures: Prisma.LectureCreateManyInput[] = [];
  const materials: Prisma.MaterialCreateManyInput[] = [];
  const explanations: Prisma.ExplanationMaterialCreateManyInput[] = [];
  const videos: Prisma.VideoLessonCreateManyInput[] = [];
  const pdfs: Prisma.PdfDocumentCreateManyInput[] = [];
  const manuals: Prisma.ManualMaterialCreateManyInput[] = [];
  const exercises: Prisma.ProgrammingExerciseCreateManyInput[] = [];
  const testCases: Prisma.ExerciseTestCaseCreateManyInput[] = [];
  const hints: Prisma.ExerciseHintCreateManyInput[] = [];
  const solutions: Prisma.ProgrammingExerciseSolutionCreateManyInput[] = [];
  const pdfAssets = new Set<string>();
  const videoAssets = new Set<string>();
  const uniqueKey = (pool: Set<string>, key: string) => {
    const chosen = pool.has(key) ? randomUUID() : key;
    pool.add(chosen);
    return chosen;
  };

  plan.adds.forEach((key, index) => {
    const theirs = input.theirs.get(key)!;
    const id = result.addedIds.get(key)!;
    const parentId = localOf(theirs.parentKey)!;
    const merged = mergedUnitsFor(input, key, decisions, true);
    const isVisible = arrivesVisible(
      input.visibility,
      theirs.kind,
      theirs.materialType,
      merged,
    );
    if (theirs.kind === "MODULE") {
      modules.push({
        id,
        courseId: parentId,
        externalKey: uniqueKey(
          input.existingKeys.modules,
          externalKeyOf(merged, key),
        ),
        title: merged["module.title"] as string,
        description: (merged["module.description"] ?? "") as string,
        position: tempPosition(index),
        isVisible,
      });
      return;
    }
    if (theirs.kind === "LECTURE") {
      lectures.push({
        id,
        courseModuleId: parentId,
        externalKey: uniqueKey(
          input.existingKeys.lectures,
          externalKeyOf(merged, key),
        ),
        title: merged["lecture.title"] as string,
        description: (merged["lecture.description"] ?? "") as string,
        position: tempPosition(index),
        isVisible,
      });
      return;
    }
    if (theirs.kind !== "MATERIAL") return;
    const type = theirs.materialType!;
    const material: Prisma.MaterialCreateManyInput = {
      id,
      lectureId: parentId,
      type: type as never,
      title: merged["material.title"] as string,
      position: tempPosition(index),
      isRequired: false,
      isVisible,
    };
    materials.push(material);
    writeTypeRow({ id, key, type, merged, isNew: true });
  });

  // ------------------------------------------------------------- content edits
  const courseRows: Record<string, unknown>[] = [];
  const moduleRows: Record<string, unknown>[] = [];
  const lectureRows: Record<string, unknown>[] = [];
  const materialRows: Record<string, unknown>[] = [];
  const explanationRows: Record<string, unknown>[] = [];
  const videoRows: Record<string, unknown>[] = [];
  const pdfRows: Record<string, unknown>[] = [];
  const manualRows: Record<string, unknown>[] = [];
  const exerciseRows: Record<string, unknown>[] = [];
  const replacedLists: string[] = [];
  /** Type rows whose content stays but whose editor must see a new version. */
  const revisionOnly = new Map<string, string[]>();

  function writeTypeRow(args: {
    id: string;
    key: string;
    type: string;
    merged: Merged;
    isNew: boolean;
  }) {
    const { id, key, type, merged, isNew } = args;
    const isRequired = MANUAL_TYPES.has(type)
      ? ((merged["manual.scoring"] as { isRequired?: boolean } | null)
          ?.isRequired ?? false)
      : ((merged["material.required"] ?? false) as boolean);
    const applied = (decisions.get(key) ?? [])
      .filter((unit) => unit.outcome === "APPLIED")
      .map((unit) => unit.unitKey);
    if (isNew) {
      const material = materials.find((row) => row.id === id)!;
      material.isRequired = isRequired;
    } else {
      materialRows.push({
        id,
        title: merged["material.title"],
        is_required: isRequired,
      });
      // A title or required-flag change alone does not rewrite the type's own
      // row, but it does re-version it: every editor saves the title together
      // with its type row and checks that row's version, so an editor opened
      // before this sync must not write the old title back unnoticed.
      const typeChanged =
        applied.some((unitKey) => !unitKey.startsWith("material.")) ||
        input.plan.itemOrders.has(key) ||
        input.plan.restores.includes(key);
      if (!typeChanged) {
        const table = VERSIONED_TYPE_TABLES[type];
        if (table)
          revisionOnly.set(table, [...(revisionOnly.get(table) ?? []), id]);
        return;
      }
    }
    const listsChanged =
      isNew ||
      input.plan.itemOrders.has(key) ||
      applied.some((unitKey) =>
        /^exercise\.(testCase|hint|solution)[:s]/.test(unitKey),
      );

    if (type === "EXPLANATION") {
      const row = composeExplanation(merged);
      if (isNew)
        explanations.push({
          materialId: id,
          body: row.body,
          sideBody: row.sideBody,
          revision: 1,
        });
      else
        explanationRows.push({
          material_id: id,
          body: row.body,
          side_body: row.sideBody,
        });
      return;
    }
    if (type === "VIDEO_LESSON") {
      const row = composeVideo(merged);
      videoAssets.add(row.assetId);
      const data = {
        assetId: row.assetId,
        description: row.description,
        placement: row.placement,
        includeInScore: row.includeInScore,
        maximumHundredths: row.maximumHundredths,
        thresholdBasisPoints: row.thresholdBasisPoints,
        captions: row.captions as Prisma.InputJsonValue,
        assets: row.assets as Prisma.InputJsonValue,
      };
      if (isNew)
        videos.push({
          materialId: id,
          ...data,
          revision: 1,
          requestKey: randomUUID(),
        });
      else
        videoRows.push({
          material_id: id,
          asset_id: row.assetId,
          description: row.description,
          placement: row.placement,
          include_in_score: row.includeInScore,
          maximum_hundredths: row.maximumHundredths,
          threshold_basis_points: row.thresholdBasisPoints,
          captions: row.captions,
          assets: row.assets,
        });
      return;
    }
    if (type === "PDF_DOCUMENT") {
      const row = composePdf(merged);
      pdfAssets.add(row.assetId);
      if (isNew)
        pdfs.push({
          materialId: id,
          assetId: row.assetId,
          placement: row.placement as never,
        });
      else
        pdfRows.push({
          material_id: id,
          asset_id: row.assetId,
          placement: row.placement,
        });
      return;
    }
    if (type === "PROGRAMMING_EXERCISE") {
      const row = composeExercise(
        merged,
        (unitKey) => (merged[unitKey] as string[] | undefined) ?? null,
        localOf,
      );
      const previous = input.oursFull.get(key)?.units;
      const gradingChanged =
        !isNew &&
        exerciseGradingChanged(decisions.get(key) ?? [], previous, merged);
      const priorRevision = isNew ? 1 : currentGradingRevision(input, key);
      const profileApplied = (decisions.get(key) ?? []).some(
        (unit) =>
          unit.outcome === "APPLIED" &&
          unit.unitKey === "exercise.gradingProfile",
      );
      // A copy grades under the semantics its master's profile was authored
      // at: carried on insert, and taken again only when the profile applies.
      // A test-only change keeps the stored version (design §11 step 1).
      const theirsSemantic = isNew
        ? merged["@semanticVersion"]
        : profileApplied
          ? input.values.get(
              input.theirs.get(key)?.unitHashes["@semanticVersion"] ?? "",
            )
          : undefined;
      const semantic =
        typeof theirsSemantic === "string"
          ? theirsSemantic
          : isNew || profileApplied
            ? semanticVersionForMode(
                row.gradingMode as never,
                row.inputPromptPolicy as never,
              )
            : null;
      const columns = {
        difficulty: row.difficulty,
        description: row.description,
        input_format: row.inputFormat,
        output_format: row.outputFormat,
        constraints: row.constraints,
        starter_code: row.starterCode,
        language: row.language,
        time_limit_ms: row.timeLimitMs,
        memory_limit_mb: row.memoryLimitMb,
        total_time_limit_ms: row.totalTimeLimitMs,
        comparator_time_limit_ms: row.comparatorTimeLimitMs,
        grading_mode: row.gradingMode,
        input_prompt_policy: row.inputPromptPolicy,
        continuation_policy: row.continuationPolicy,
        exit_status_policy: row.exitStatusPolicy,
        material_maximum_hundredths: row.materialMaximumHundredths,
        material_score_policy: row.materialScorePolicy,
        submission_policy: row.submissionPolicy,
        manual_maximum_hundredths: row.manualMaximumHundredths,
        manual_include_in_score: row.manualIncludeInScore,
        feedback_policy: row.feedbackPolicy,
        ai_feedback_enabled: row.aiFeedbackEnabled,
        quiz: row.quiz,
        reference_pdf_material_id: row.referencePdfMaterialId,
        solution_code: row.solutionCode,
      };
      if (isNew) {
        exercises.push({
          materialId: id,
          externalKey: uniqueKey(
            input.existingKeys.exercises,
            externalKeyOf(merged, key),
          ),
          difficulty: row.difficulty as never,
          description: row.description,
          inputFormat: row.inputFormat,
          outputFormat: row.outputFormat,
          constraints: row.constraints,
          starterCode: row.starterCode,
          language: row.language as never,
          timeLimitMs: row.timeLimitMs,
          memoryLimitMb: row.memoryLimitMb,
          totalTimeLimitMs: row.totalTimeLimitMs,
          comparatorTimeLimitMs: row.comparatorTimeLimitMs,
          gradingMode: row.gradingMode as never,
          inputPromptPolicy: row.inputPromptPolicy as never,
          continuationPolicy: row.continuationPolicy as never,
          exitStatusPolicy: row.exitStatusPolicy as never,
          materialMaximumHundredths: row.materialMaximumHundredths,
          materialScorePolicy: row.materialScorePolicy as never,
          gradingSemanticVersion: semantic!,
          submissionPolicy: row.submissionPolicy as never,
          manualMaximumHundredths: row.manualMaximumHundredths,
          manualIncludeInScore: row.manualIncludeInScore,
          feedbackPolicy:
            row.feedbackPolicy === null
              ? Prisma.DbNull
              : (row.feedbackPolicy as Prisma.InputJsonValue),
          aiFeedbackEnabled: row.aiFeedbackEnabled,
          quiz:
            row.quiz === null
              ? Prisma.DbNull
              : (row.quiz as Prisma.InputJsonValue),
          referencePdfMaterialId: row.referencePdfMaterialId,
          solutionCode: row.solutionCode,
          gradingRevision: 1,
        });
      } else {
        exerciseRows.push({
          material_id: id,
          ...columns,
          grading_semantic_version: semantic,
          grading_revision: gradingChanged ? priorRevision + 1 : priorRevision,
        });
        if (gradingChanged)
          result.gradingChanged.push({
            localId: id,
            previous: priorRevision,
            next: priorRevision + 1,
          });
        if (listsChanged) replacedLists.push(id);
      }
      if (!listsChanged) return;
      for (const item of row.testCases)
        testCases.push({
          exerciseMaterialId: id,
          syncKey: item.syncKey,
          position: item.position,
          input: item.input,
          expectedOutput: item.expectedOutput,
          visibility: item.visibility,
          comparator: item.comparator as never,
          weight: item.weight,
          timeLimitMsOverride: item.timeLimitMsOverride,
          softTimeLimitMs: item.softTimeLimitMs,
          softPenalty: item.softPenalty,
          label: item.label,
        });
      for (const item of row.hints)
        hints.push({
          exerciseMaterialId: id,
          syncKey: item.syncKey,
          position: item.position,
          content: item.content,
          triggerExpression: item.triggerExpression,
        });
      for (const item of row.solutions)
        solutions.push({
          materialId: id,
          syncKey: item.syncKey,
          position: item.position,
          title: item.title,
          code: item.code,
        });
      return;
    }
    if (MANUAL_TYPES.has(type)) {
      const options = optionLocalFor(key);
      const row = composeManual(
        merged,
        type,
        (unitKey) => (merged[unitKey] as string[] | undefined) ?? null,
        options.local,
      );
      options.finish();
      if (isNew)
        manuals.push({
          materialId: id,
          description: row.description,
          files: row.files as Prisma.InputJsonValue,
          entryPoint: row.entryPoint,
          assets: row.assets as Prisma.InputJsonValue,
          modelAnswer: row.modelAnswer,
          solutionAssets: row.solutionAssets as Prisma.InputJsonValue,
          solutionFiles:
            row.solutionFiles === null
              ? Prisma.DbNull
              : (row.solutionFiles as Prisma.InputJsonValue),
          hint: row.hint,
          width: row.width,
          height: row.height,
          timeLimitSeconds: row.timeLimitSeconds,
          memoryLimitMb: row.memoryLimitMb,
          runtimeVersion: row.runtimeVersion,
          submitEnabled: row.submitEnabled,
          includeInScore: row.includeInScore,
          maximumHundredths: row.maximumHundredths,
          shortAnswer:
            row.shortAnswer === null
              ? Prisma.DbNull
              : (row.shortAnswer as Prisma.InputJsonValue),
          multipleChoice:
            row.multipleChoice === null
              ? Prisma.DbNull
              : (row.multipleChoice as Prisma.InputJsonValue),
          revision: 1,
        });
      else
        manualRows.push({
          material_id: id,
          description: row.description,
          files: row.files,
          entry_point: row.entryPoint,
          assets: row.assets,
          model_answer: row.modelAnswer,
          solution_assets: row.solutionAssets,
          solution_files: row.solutionFiles,
          hint: row.hint,
          width: row.width,
          height: row.height,
          time_limit_seconds: row.timeLimitSeconds,
          memory_limit_mb: row.memoryLimitMb,
          runtime_version: row.runtimeVersion,
          submit_enabled: row.submitEnabled,
          include_in_score: row.includeInScore,
          maximum_hundredths: row.maximumHundredths,
          short_answer: row.shortAnswer,
          multiple_choice: row.multipleChoice,
        });
    }
  }

  for (const key of touched) {
    const view = input.ours.get(key);
    if (!view) continue;
    const merged = mergedUnitsFor(input, key, decisions, false);
    const id = view.localId;
    if (view.kind === "COURSE")
      courseRows.push({
        id,
        title: merged["course.title"],
        description: merged["course.description"],
      });
    else if (view.kind === "MODULE")
      moduleRows.push({
        id,
        title: merged["module.title"],
        description: merged["module.description"],
      });
    else if (view.kind === "LECTURE")
      lectureRows.push({
        id,
        title: merged["lecture.title"],
        description: merged["lecture.description"],
      });
    else
      writeTypeRow({ id, key, type: view.materialType!, merged, isNew: false });
  }

  // Assets a written row newly points at must exist and be ready, locked in
  // id order (the copier's rule).
  if (pdfAssets.size) {
    const ids = [...pdfAssets].sort();
    const rows = await tx.$queryRaw<
      Array<{ state: string }>
    >`SELECT state::text AS state FROM pdf_assets WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;
    if (rows.length !== ids.length || rows.some((row) => row.state !== "READY"))
      throw new SyncWriteError("ASSET_NOT_READY");
  }
  if (videoAssets.size) {
    const ids = [...videoAssets].sort();
    const rows = await tx.$queryRaw<
      Array<{ state: string }>
    >`SELECT state FROM video_assets WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;
    if (rows.length !== ids.length || rows.some((row) => row.state !== "READY"))
      throw new SyncWriteError("ASSET_NOT_READY");
  }

  // ------------------------------------------------------------------ inserts
  if (modules.length) await tx.courseModule.createMany({ data: modules });
  if (lectures.length) await tx.lecture.createMany({ data: lectures });
  if (materials.length) await tx.material.createMany({ data: materials });
  if (explanations.length)
    await tx.explanationMaterial.createMany({ data: explanations });
  if (videos.length) await tx.videoLesson.createMany({ data: videos });
  if (pdfs.length) await tx.pdfDocument.createMany({ data: pdfs });
  if (manuals.length) await tx.manualMaterial.createMany({ data: manuals });

  // ------------------------------------------------------------------ updates
  await bulkUpdate(
    tx,
    {
      table: "courses",
      key: ["id", "uuid"],
      columns: [
        ["title", "text"],
        ["description", "text"],
      ],
      also: ["updated_at = now()"],
    },
    courseRows,
  );
  await bulkUpdate(
    tx,
    {
      table: "course_modules",
      key: ["id", "uuid"],
      columns: [
        ["title", "text"],
        ["description", "text"],
      ],
      also: ["updated_at = now()"],
    },
    moduleRows,
  );
  await bulkUpdate(
    tx,
    {
      table: "lectures",
      key: ["id", "uuid"],
      columns: [
        ["title", "text"],
        ["description", "text"],
      ],
      also: ["updated_at = now()"],
    },
    lectureRows,
  );
  await bulkUpdate(
    tx,
    {
      table: "materials",
      key: ["id", "uuid"],
      columns: [
        ["title", "text"],
        ["is_required", "boolean"],
      ],
      also: ["updated_at = now()"],
    },
    materialRows,
  );
  await bulkUpdate(
    tx,
    {
      table: "explanation_materials",
      key: ["material_id", "uuid"],
      columns: [
        ["body", "text"],
        ["side_body", "text"],
      ],
      also: ["revision = t.revision + 1", "updated_at = now()"],
    },
    explanationRows,
  );
  await bulkUpdate(
    tx,
    {
      table: "video_lessons",
      key: ["material_id", "uuid"],
      columns: [
        ["asset_id", "uuid"],
        ["description", "text"],
        ["placement", "text"],
        ["include_in_score", "boolean"],
        ["maximum_hundredths", "int"],
        ["threshold_basis_points", "int"],
        ["captions", "jsonb"],
        ["assets", "jsonb"],
      ],
      also: ["revision = t.revision + 1"],
    },
    videoRows,
  );
  await bulkUpdate(
    tx,
    {
      table: "pdf_documents",
      key: ["material_id", "uuid"],
      columns: [
        ["asset_id", "uuid"],
        ["placement", `"PdfPlacement"`],
      ],
      also: ["revision = t.revision + 1"],
    },
    pdfRows,
  );
  await bulkUpdate(
    tx,
    {
      table: "manual_materials",
      key: ["material_id", "uuid"],
      columns: [
        ["description", "text"],
        ["files", "jsonb"],
        ["entry_point", "text"],
        ["assets", "jsonb"],
        ["model_answer", "text"],
        ["solution_assets", "jsonb"],
        ["solution_files", "jsonb"],
        ["hint", "text"],
        ["width", "int"],
        ["height", "int"],
        ["time_limit_seconds", "int"],
        ["memory_limit_mb", "int"],
        ["runtime_version", "text"],
        ["submit_enabled", "boolean"],
        ["include_in_score", "boolean"],
        ["maximum_hundredths", "int"],
        ["short_answer", "jsonb"],
        ["multiple_choice", "jsonb"],
      ],
      also: ["revision = t.revision + 1"],
    },
    manualRows,
  );
  // Exercises: `grading_semantic_version` keeps its stored value unless the
  // profile was applied (design §11 step 1).
  await bulkUpdate(
    tx,
    {
      table: "programming_exercises",
      key: ["material_id", "uuid"],
      columns: [
        ["difficulty", `"ExerciseDifficulty"`],
        ["description", "text"],
        ["input_format", "text"],
        ["output_format", "text"],
        ["constraints", "text"],
        ["starter_code", "text"],
        ["language", `"ExerciseLanguage"`],
        ["time_limit_ms", "int"],
        ["memory_limit_mb", "int"],
        ["total_time_limit_ms", "int"],
        ["comparator_time_limit_ms", "int"],
        ["grading_mode", `"GradingProfileMode"`],
        ["input_prompt_policy", `"InputPromptPolicy"`],
        ["continuation_policy", `"ContinuationPolicy"`],
        ["exit_status_policy", `"ExitStatusPolicy"`],
        ["material_maximum_hundredths", "int"],
        ["material_score_policy", `"MaterialScorePolicy"`],
        ["submission_policy", `"SubmissionPolicy"`],
        ["manual_maximum_hundredths", "int"],
        ["manual_include_in_score", "boolean"],
        ["feedback_policy", "jsonb"],
        ["ai_feedback_enabled", "boolean"],
        ["quiz", "jsonb"],
        ["reference_pdf_material_id", "uuid"],
        ["solution_code", "text"],
        ["grading_revision", "int"],
      ],
      recordOnly: [["grading_semantic_version", "text"]],
      also: [
        `"grading_semantic_version" = coalesce(v."grading_semantic_version", t."grading_semantic_version")`,
        "updated_at = now()",
      ],
    },
    exerciseRows,
  );
  if (exercises.length)
    await tx.programmingExercise.createMany({ data: exercises });
  for (const [table, ids] of revisionOnly) {
    // The exercise editor's version is `updated_at`; the others keep a counter.
    const bump =
      table === "programming_exercises"
        ? Prisma.sql`updated_at = now()`
        : Prisma.sql`revision = revision + 1`;
    await tx.$executeRaw(
      Prisma.sql`UPDATE ${Prisma.raw(table)} SET ${bump} WHERE material_id = ANY(${ids}::uuid[])`,
    );
  }

  if (replacedLists.length) {
    await tx.exerciseTestCase.deleteMany({
      where: { exerciseMaterialId: { in: replacedLists } },
    });
    await tx.exerciseHint.deleteMany({
      where: { exerciseMaterialId: { in: replacedLists } },
    });
    await tx.programmingExerciseSolution.deleteMany({
      where: { materialId: { in: replacedLists } },
    });
  }
  if (testCases.length)
    await tx.exerciseTestCase.createMany({ data: testCases });
  if (hints.length) await tx.exerciseHint.createMany({ data: hints });
  if (solutions.length)
    await tx.programmingExerciseSolution.createMany({ data: solutions });

  // D2: progress rolls forward to the new revision and is never reset.
  if (result.gradingChanged.length) {
    const payload = JSON.stringify(
      result.gradingChanged.map((row) => ({
        id: row.localId,
        previous: row.previous,
        next: row.next,
      })),
    );
    await tx.$executeRaw`
      UPDATE student_exercise_progress AS p SET grading_revision = v.next
      FROM jsonb_to_recordset(${payload}::jsonb) AS v(id uuid, previous int, next int)
      WHERE p.material_id = v.id AND p.grading_revision = v.previous`;
  }

  // ---------------------------------------------------------------- structure
  await writeStructure(tx, input, localOf);

  // ------------------------------------------------------- archive / restore
  const archive = plan.archives
    .map((key) => input.ours.get(key)!)
    .filter(Boolean);
  const restore = plan.restores
    .map((key) => input.ours.get(key)!)
    .filter(Boolean);
  for (const kind of ["MODULE", "LECTURE", "MATERIAL"] as const) {
    const table =
      kind === "MODULE"
        ? "course_modules"
        : kind === "LECTURE"
          ? "lectures"
          : "materials";
    const rows = archive
      .filter((node) => node.kind === kind)
      .map((node) => ({ id: node.localId, is_visible: false }));
    await bulkUpdate(
      tx,
      { table, key: ["id", "uuid"], columns: [["is_visible", "boolean"]] },
      rows,
    );
  }
  // Archival changes availability. Invalidate every open editor even though
  // the authored body is retained. A pre-archive save must not republish it.
  const archivedMaterials = archive.filter((n) => n.kind === "MATERIAL");
  const versionRows = (types: string[]) =>
    archivedMaterials
      .filter((n) => types.includes(n.materialType ?? ""))
      .map((n) => ({ material_id: n.localId }));
  await bulkUpdate(
    tx,
    {
      table: "programming_exercises",
      key: ["material_id", "uuid"],
      columns: [],
      also: ["updated_at = now()"],
    },
    versionRows(["PROGRAMMING_EXERCISE"]),
  );
  await bulkUpdate(
    tx,
    {
      table: "explanation_materials",
      key: ["material_id", "uuid"],
      columns: [],
      also: ["revision = t.revision + 1", "updated_at = now()"],
    },
    versionRows(["EXPLANATION"]),
  );
  await bulkUpdate(
    tx,
    {
      table: "manual_materials",
      key: ["material_id", "uuid"],
      columns: [],
      also: ["revision = t.revision + 1"],
    },
    versionRows(["TURTLE_EXERCISE", "WRITTEN_RESPONSE", "MULTIPLE_CHOICE"]),
  );
  await bulkUpdate(
    tx,
    {
      table: "pdf_documents",
      key: ["material_id", "uuid"],
      columns: [],
      also: ["revision = t.revision + 1"],
    },
    versionRows(["PDF_DOCUMENT"]),
  );
  await bulkUpdate(
    tx,
    {
      table: "video_lessons",
      key: ["material_id", "uuid"],
      columns: [],
      also: ["revision = t.revision + 1"],
    },
    versionRows(["VIDEO_LESSON"]),
  );
  result.archivedLocalIds = archive.map((node) => node.localId);
  // Restoration's saved visibility is applied by the runner, which holds the
  // link rows that recorded it.
  void restore;

  result.wroteContent =
    plan.adds.length > 0 ||
    plan.archives.length > 0 ||
    plan.restores.length > 0 ||
    courseRows.length +
      moduleRows.length +
      lectureRows.length +
      materialRows.length >
      0 ||
    plan.orders.size > 0 ||
    plan.parents.size > 0;
  return result;
}

async function writeStructure(
  tx: Tx,
  input: WriteInput,
  localOf: (key: string | null) => string | null,
) {
  const nodeKind = (key: string): NodeKind | null =>
    input.ours.get(key)?.kind ?? input.theirs.get(key)?.kind ?? null;
  const rows: Record<
    "course_modules" | "lectures" | "materials",
    Array<{ id: string; parentId: string; position: number }>
  > = {
    course_modules: [],
    lectures: [],
    materials: [],
  };
  const tableOf = (kind: NodeKind | null) =>
    kind === "MODULE"
      ? "course_modules"
      : kind === "LECTURE"
        ? "lectures"
        : kind === "MATERIAL"
          ? "materials"
          : null;
  for (const [parentKey, order] of input.plan.orders) {
    const parentId = localOf(parentKey);
    if (!parentId) continue;
    order.forEach((childKey, index) => {
      const table = tableOf(nodeKind(childKey));
      const id = localOf(childKey);
      if (!table || !id) return;
      rows[table].push({ id, parentId, position: index + 1 });
    });
  }
  await rewriteSiblings(tx, "course_modules", "course_id", rows.course_modules);
  await rewriteSiblings(tx, "lectures", "course_module_id", rows.lectures);
  await rewriteSiblings(tx, "materials", "lecture_id", rows.materials);
}

function externalKeyOf(merged: Merged, nodeKey: string): string {
  const key = merged["@externalKey"];
  return typeof key === "string" && key ? key : nodeKey;
}

function currentGradingRevision(input: WriteInput, key: string) {
  return input.oursFull.get(key)?.meta?.gradingRevision ?? 1;
}

/**
 * Whether applying these units changes how the exercise grades. Mirrors the
 * editor's comparators and adds what they omit: exercise-level time and
 * memory limits (findings §11.3). A label-only case edit does not count.
 */
function exerciseGradingChanged(
  decisions: readonly PlannedUnit[],
  previous: Record<string, CanonicalValue> | undefined,
  next: Merged,
): boolean {
  for (const unit of decisions) {
    if (unit.outcome !== "APPLIED" || !isGradingUnit(unit.unitKey)) continue;
    if (unit.unitKey.startsWith("exercise.testCase:")) {
      const before = previous?.[unit.unitKey] as
        | Record<string, unknown>
        | undefined;
      const after = next[unit.unitKey] as Record<string, unknown> | undefined;
      if (!before || !after) return true;
      const { label: _beforeLabel, ...beforeGrading } = before;
      const { label: _afterLabel, ...afterGrading } = after;
      if (
        JSON.stringify(sortKeys(beforeGrading)) !==
        JSON.stringify(sortKeys(afterGrading))
      )
        return true;
      continue;
    }
    return true;
  }
  return false;
}

function sortKeys(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, value[key]]),
  );
}

export class SyncWriteError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
