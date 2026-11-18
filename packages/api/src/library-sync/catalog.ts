import type { CanonicalValue } from "./canonical.js";
import type {
  ProjectedCourse,
  ProjectedExercise,
  ProjectedManual,
  ProjectedMaterial,
  ProjectedVideo,
} from "./projection.js";

/**
 * The merge unit catalog as code
 * (docs/superpowers/specs/2026-11-18-library-course-sync-merge-units.md).
 *
 * `projectNodes` turns a projected course into nodes, each with its content
 * units. Structure — a node's parent and its order among siblings — is
 * carried as `parentKey`/`ordinal` and merged by the structure module, not
 * hashed as content. Keyed lists inside a material produce one unit per item
 * plus an `@order` unit.
 *
 * A copy's local ids are translated to master keys here, so the same unit of
 * a master and of its copy compares equal when the content is equal.
 */

export type NodeKind = "COURSE" | "MODULE" | "LECTURE" | "MATERIAL";
export type MaterialType =
  | "EXPLANATION"
  | "VIDEO_LESSON"
  | "PROGRAMMING_EXERCISE"
  | "PDF_DOCUMENT"
  | "TURTLE_EXERCISE"
  | "WRITTEN_RESPONSE"
  | "MULTIPLE_CHOICE";

export const MANUAL_TYPES: ReadonlySet<string> = new Set([
  "TURTLE_EXERCISE",
  "WRITTEN_RESPONSE",
  "MULTIPLE_CHOICE",
]);

export type SyncNode = {
  key: string;
  /** The row this node is in the projected course: master row or copy row. */
  localId: string;
  kind: NodeKind;
  materialType: MaterialType | null;
  parentKey: string | null;
  ordinal: number;
  isVisible: boolean;
  /**
   * Content units, plus `@`-prefixed meta units the planner carries but never
   * decides: `@externalKey` (import identity, needed when a node is added).
   */
  units: Record<string, CanonicalValue>;
  /** Local bookkeeping read by the writer, never hashed. */
  meta?: { gradingRevision?: number };
};

/** Meta units ride along in snapshots but are never merged or counted. */
export const isMetaUnit = (unitKey: string) => unitKey.startsWith("@");

/** How a projected course's ids become node keys. */
export type KeyMap = {
  courseKey: string;
  /** A row's node key: its link's key in a copy, its own id in a master. */
  keyOf(kind: NodeKind, localId: string): string;
  /** MC option id → item key, for one material (identity in a master). */
  optionKeyOf(materialLocalId: string, localOptionId: string): string;
};

export const LOCAL_PREFIX = "local:";
export const isLocalKey = (key: string) => key.startsWith(LOCAL_PREFIX);

/** The identity map a master uses: node keys are its own row ids. */
export function masterKeyMap(courseId: string): KeyMap {
  return {
    courseKey: courseId,
    keyOf: (_kind, localId) => localId,
    optionKeyOf: (_material, optionId) => optionId,
  };
}

/**
 * The map a copy uses: live links name their master key, anything else is
 * local. Option maps live on the material's link.
 */
export function copyKeyMap(
  course: ProjectedCourse,
  libraryCourseId: string,
): KeyMap {
  const byLocal = new Map<
    string,
    { nodeKey: string; optionMap: Record<string, string> }
  >();
  for (const link of course.links) {
    if (!link.localId) continue;
    if (link.state !== "LINKED" && link.state !== "ARCHIVED") continue;
    byLocal.set(`${link.kind}:${link.localId}`, {
      nodeKey: link.nodeKey,
      optionMap: link.meta?.optionMap ?? {},
    });
  }
  const inverseOptions = new Map<string, Map<string, string>>();
  return {
    courseKey: libraryCourseId,
    keyOf: (kind, localId) =>
      byLocal.get(`${kind}:${localId}`)?.nodeKey ?? `${LOCAL_PREFIX}${localId}`,
    optionKeyOf: (materialLocalId, localOptionId) => {
      let inverse = inverseOptions.get(materialLocalId);
      if (!inverse) {
        inverse = new Map(
          Object.entries(
            byLocal.get(`MATERIAL:${materialLocalId}`)?.optionMap ?? {},
          ).map(([libraryId, localId]) => [localId, libraryId]),
        );
        inverseOptions.set(materialLocalId, inverse);
      }
      return inverse.get(localOptionId) ?? `${LOCAL_PREFIX}${localOptionId}`;
    },
  };
}

export function projectNodes(
  course: ProjectedCourse,
  keys: KeyMap,
): SyncNode[] {
  const nodes: SyncNode[] = [
    {
      key: keys.courseKey,
      localId: course.id,
      kind: "COURSE",
      materialType: null,
      parentKey: null,
      ordinal: 0,
      isVisible: course.isVisible,
      units: {
        "course.title": course.title,
        "course.description": course.description,
      },
    },
  ];
  // Material keys first: an exercise's reference PDF may sit in another lecture.
  const materialKeys = new Map<string, string>();
  for (const courseModule of course.modules)
    for (const lecture of courseModule.lectures)
      for (const material of lecture.materials)
        materialKeys.set(material.id, keys.keyOf("MATERIAL", material.id));

  course.modules.forEach((courseModule, moduleIndex) => {
    const moduleKey = keys.keyOf("MODULE", courseModule.id);
    nodes.push({
      key: moduleKey,
      localId: courseModule.id,
      kind: "MODULE",
      materialType: null,
      parentKey: keys.courseKey,
      ordinal: moduleIndex,
      isVisible: courseModule.isVisible,
      units: {
        "module.title": courseModule.title,
        "module.description": courseModule.description,
        "@externalKey": courseModule.externalKey,
      },
    });
    courseModule.lectures.forEach((lecture, lectureIndex) => {
      const lectureKey = keys.keyOf("LECTURE", lecture.id);
      nodes.push({
        key: lectureKey,
        localId: lecture.id,
        kind: "LECTURE",
        materialType: null,
        parentKey: moduleKey,
        ordinal: lectureIndex,
        isVisible: lecture.isVisible,
        units: {
          "lecture.title": lecture.title,
          "lecture.description": lecture.description,
          "@externalKey": lecture.externalKey,
        },
      });
      lecture.materials.forEach((material, materialIndex) => {
        nodes.push({
          key: materialKeys.get(material.id)!,
          localId: material.id,
          kind: "MATERIAL",
          materialType: material.type as MaterialType,
          parentKey: lectureKey,
          ordinal: materialIndex,
          isVisible: material.isVisible,
          units: materialUnits(material, {
            referenceKey: (id) =>
              id === null
                ? null
                : (materialKeys.get(id) ?? `${LOCAL_PREFIX}${id}`),
            optionKey: (optionId) => keys.optionKeyOf(material.id, optionId),
          }),
          ...(material.exercise
            ? { meta: { gradingRevision: material.exercise.gradingRevision } }
            : {}),
        });
      });
    });
  });
  return nodes;
}

type MaterialContext = {
  referenceKey(localMaterialId: string | null): string | null;
  optionKey(localOptionId: string): string;
};

export function materialUnits(
  material: ProjectedMaterial,
  context: MaterialContext,
): Record<string, CanonicalValue> {
  const units: Record<string, CanonicalValue> = {
    "material.title": material.title,
  };
  if (!MANUAL_TYPES.has(material.type))
    units["material.required"] = material.isRequired;

  if (material.explanation) {
    units["explanation.body"] = material.explanation.body;
    units["explanation.sideBody"] = material.explanation.sideBody;
  }
  if (material.video) Object.assign(units, videoUnits(material.video));
  if (material.pdf) {
    units["pdf.file"] = { assetId: material.pdf.assetId };
    units["pdf.placement"] = material.pdf.placement;
  }
  if (material.exercise)
    Object.assign(units, exerciseUnits(material.exercise, context));
  if (material.manual)
    Object.assign(units, manualUnits(material, material.manual, context));
  return units;
}

function videoUnits(video: ProjectedVideo): Record<string, CanonicalValue> {
  return {
    "video.media": {
      assetId: video.assetId,
      captions: video.captions as CanonicalValue,
    },
    "video.instructions": {
      description: video.description,
      assets: video.assets as CanonicalValue,
    },
    "video.placement": video.placement,
    "video.scoring": {
      includeInScore: video.includeInScore,
      maximumHundredths: video.maximumHundredths,
      thresholdBasisPoints: video.thresholdBasisPoints,
    },
  };
}

function exerciseUnits(
  exercise: ProjectedExercise,
  context: MaterialContext,
): Record<string, CanonicalValue> {
  const units: Record<string, CanonicalValue> = {
    "@externalKey": exercise.externalKey,
    // The semantics the master's profile was authored at; carried, never merged.
    "@semanticVersion": exercise.gradingSemanticVersion,
    "exercise.difficulty": exercise.difficulty,
    "exercise.description": exercise.description,
    "exercise.inputFormat": exercise.inputFormat,
    "exercise.outputFormat": exercise.outputFormat,
    "exercise.constraints": exercise.constraints,
    "exercise.starterCode": exercise.starterCode,
    "exercise.language": exercise.language,
    "exercise.limits": {
      timeLimitMs: exercise.timeLimitMs,
      memoryLimitMb: exercise.memoryLimitMb,
      totalTimeLimitMs: exercise.totalTimeLimitMs,
      comparatorTimeLimitMs: exercise.comparatorTimeLimitMs,
    },
    "exercise.gradingProfile": {
      gradingMode: exercise.gradingMode,
      inputPromptPolicy: exercise.inputPromptPolicy,
      continuationPolicy: exercise.continuationPolicy,
      exitStatusPolicy: exercise.exitStatusPolicy,
      materialMaximumHundredths: exercise.materialMaximumHundredths,
      materialScorePolicy: exercise.materialScorePolicy,
    },
    "exercise.submissionPolicy": exercise.submissionPolicy,
    "exercise.manualAssessment": {
      manualMaximumHundredths: exercise.manualMaximumHundredths,
      manualIncludeInScore: exercise.manualIncludeInScore,
    },
    "exercise.feedbackPolicy": (exercise.feedbackPolicy ??
      null) as CanonicalValue,
    "exercise.aiFeedback": exercise.aiFeedbackEnabled,
    "exercise.quiz": (exercise.quiz ?? null) as CanonicalValue,
    "exercise.referencePdf": context.referenceKey(
      exercise.referencePdfMaterialId,
    ),
    "exercise.testCases@order": exercise.testCases.map((item) => item.syncKey),
    "exercise.hints@order": exercise.hints.map((item) => item.syncKey),
    "exercise.solutions@order": exercise.solutions.map((item) => item.syncKey),
  };
  for (const item of exercise.testCases)
    units[`exercise.testCase:${item.syncKey}`] = {
      input: item.input,
      expectedOutput: item.expectedOutput,
      visibility: item.visibility,
      comparator: item.comparator,
      weight: item.weight,
      timeLimitMsOverride: item.timeLimitMsOverride,
      softTimeLimitMs: item.softTimeLimitMs,
      softPenalty: item.softPenalty,
      label: item.label,
    };
  for (const item of exercise.hints)
    units[`exercise.hint:${item.syncKey}`] = {
      content: item.content,
      triggerExpression: item.triggerExpression,
    };
  for (const item of exercise.solutions)
    units[`exercise.solution:${item.syncKey}`] = {
      title: item.title,
      code: item.code,
    };
  return units;
}

function manualUnits(
  material: ProjectedMaterial,
  manual: ProjectedManual,
  context: MaterialContext,
): Record<string, CanonicalValue> {
  const units: Record<string, CanonicalValue> = {
    "manual.description": manual.description,
    "manual.hint": manual.hint,
    "manual.modelAnswer": manual.modelAnswer,
    "manual.entryPoint": manual.entryPoint,
    "manual.solutionFiles@presence": manual.solutionFiles !== null,
    "manual.assets@order": manual.assets.map((asset) => asset.assetId),
    "manual.solutionAssets@order": manual.solutionAssets.map(
      (asset) => asset.assetId,
    ),
    "manual.canvas": { width: manual.width, height: manual.height },
    "manual.execution": {
      timeLimitSeconds: manual.timeLimitSeconds,
      memoryLimitMb: manual.memoryLimitMb,
      runtimeVersion: manual.runtimeVersion,
    },
    "manual.scoring": {
      submitEnabled: manual.submitEnabled,
      includeInScore: manual.includeInScore,
      maximumHundredths: manual.maximumHundredths,
      isRequired: material.isRequired,
    },
  };
  for (const [path, content] of Object.entries(manual.files))
    units[`manual.file:${path}`] = content;
  for (const [path, content] of Object.entries(manual.solutionFiles ?? {}))
    units[`manual.solutionFile:${path}`] = content;
  for (const asset of manual.assets)
    units[`manual.asset:${asset.assetId}`] = {
      name: asset.name,
      byteSize: asset.byteSize,
    };
  for (const asset of manual.solutionAssets)
    units[`manual.solutionAsset:${asset.assetId}`] = {
      name: asset.name,
      byteSize: asset.byteSize,
    };

  if (material.type === "WRITTEN_RESPONSE")
    Object.assign(units, shortAnswerUnits(manual.shortAnswer));
  if (material.type === "MULTIPLE_CHOICE")
    Object.assign(units, multipleChoiceUnits(manual.multipleChoice, context));
  return units;
}

type ShortAnswer = {
  version?: number;
  question: string;
  gradingMode: string;
  expectedAnswer?: string;
  pattern?: string;
  explanationEnabled?: boolean;
  explanation?: string;
};

function shortAnswerUnits(raw: unknown): Record<string, CanonicalValue> {
  const definition = (raw ?? null) as ShortAnswer | null;
  if (!definition) {
    return {
      "sa.prompt": null,
      "sa.rule": { present: false },
      "sa.explanation": null,
    };
  }
  return {
    "sa.prompt": definition.question,
    "sa.rule": {
      present: true,
      version: definition.version ?? 1,
      gradingMode: definition.gradingMode,
      expectedAnswer: definition.expectedAnswer ?? "",
      pattern: definition.pattern ?? "",
    },
    "sa.explanation": {
      explanationEnabled: definition.explanationEnabled ?? false,
      explanation: definition.explanation ?? "",
    },
  };
}

type MultipleChoice = {
  version?: number;
  question: string;
  problemDescription?: string;
  selectionMode: string;
  options: Array<{ id: string; content: string }>;
  shuffleOptions?: boolean;
  explanationEnabled?: boolean;
  correctOptionIds?: string[];
  explanation?: string;
};

function multipleChoiceUnits(
  raw: unknown,
  context: MaterialContext,
): Record<string, CanonicalValue> {
  const definition = (raw ?? null) as MultipleChoice | null;
  if (!definition)
    return { "mc.prompt": null, "mc.structure": null, "mc.explanation": null };
  const units: Record<string, CanonicalValue> = {
    "mc.prompt": {
      question: definition.question,
      problemDescription: definition.problemDescription ?? "",
    },
    "mc.structure": {
      version: definition.version ?? 1,
      selectionMode: definition.selectionMode,
      options: definition.options.map((option) => context.optionKey(option.id)),
      correct: (definition.correctOptionIds ?? []).map((id) =>
        context.optionKey(id),
      ),
      shuffleOptions: definition.shuffleOptions ?? false,
    },
    "mc.explanation": {
      explanationEnabled: definition.explanationEnabled ?? false,
      explanation: definition.explanation ?? "",
    },
  };
  for (const option of definition.options)
    units[`mc.option:${context.optionKey(option.id)}`] = option.content;
  return units;
}

/** Keyed lists inside a material: item unit prefix → order unit. */
export const KEYED_LISTS: ReadonlyArray<{
  item: string;
  order: string | null;
}> = [
  { item: "exercise.testCase:", order: "exercise.testCases@order" },
  { item: "exercise.hint:", order: "exercise.hints@order" },
  { item: "exercise.solution:", order: "exercise.solutions@order" },
  { item: "manual.file:", order: null },
  { item: "manual.solutionFile:", order: null },
  { item: "manual.asset:", order: "manual.assets@order" },
  { item: "manual.solutionAsset:", order: "manual.solutionAssets@order" },
  { item: "mc.option:", order: null },
];

export const isItemUnit = (unitKey: string) =>
  KEYED_LISTS.some((list) => unitKey.startsWith(list.item));
export const isOrderUnit = (unitKey: string) =>
  KEYED_LISTS.some((list) => list.order === unitKey);

/**
 * Units whose change alters grading (design §11). Label-only test-case edits
 * do not, matching the editor's comparator; the writer checks that case.
 */
export function isGradingUnit(unitKey: string): boolean {
  return (
    unitKey === "exercise.language" ||
    unitKey === "exercise.limits" ||
    unitKey === "exercise.gradingProfile" ||
    unitKey === "exercise.submissionPolicy" ||
    unitKey === "exercise.manualAssessment" ||
    unitKey === "exercise.quiz" ||
    unitKey === "exercise.testCases@order" ||
    unitKey.startsWith("exercise.testCase:")
  );
}

/** Units that hold an answer key applied in place for future attempts (D1). */
export const isAnswerKeyUnit = (unitKey: string) =>
  unitKey === "mc.structure" || unitKey === "sa.rule";
