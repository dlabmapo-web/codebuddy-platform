import { bigText, isBig, type Big, type CanonicalValue } from "./canonical.js";
import { LOCAL_PREFIX } from "./catalog.js";

/**
 * Merged unit values → row values, per material type: the inverse of the
 * catalog's `materialUnits`. Values here are full (`$t`), never digests.
 */

export type Merged = Record<string, CanonicalValue>;

const text = (value: CanonicalValue | undefined): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (isBig(value)) return bigText(value as Big);
  throw new Error("Expected text");
};
const object = <T>(value: CanonicalValue | undefined) => (value ?? null) as T;

/** Items of one keyed list, in final order, with their merged values. */
export function listItems(
  merged: Merged,
  prefix: string,
  order: readonly string[] | null,
): Array<[string, CanonicalValue]> {
  const present = new Map<string, CanonicalValue>();
  for (const [unitKey, value] of Object.entries(merged))
    if (unitKey.startsWith(prefix))
      present.set(unitKey.slice(prefix.length), value);
  const ordered: Array<[string, CanonicalValue]> = [];
  const seen = new Set<string>();
  for (const key of order ?? []) {
    if (!present.has(key) || seen.has(key)) continue;
    seen.add(key);
    ordered.push([key, present.get(key)!]);
  }
  // Present but unordered (an order unit that predates an item): last, stably.
  for (const key of [...present.keys()].sort())
    if (!seen.has(key)) ordered.push([key, present.get(key)!]);
  return ordered;
}

export type OrderOf = (unitKey: string) => readonly string[] | null;

export function composeExplanation(merged: Merged) {
  const side = merged["explanation.sideBody"];
  return {
    body: text(merged["explanation.body"]),
    sideBody: side === null || side === undefined ? null : text(side),
  };
}

export function composeVideo(merged: Merged) {
  const media = object<{ assetId: string; captions: unknown[] }>(
    merged["video.media"],
  );
  const instructions = object<{ description: Big; assets: unknown[] }>(
    merged["video.instructions"],
  );
  const scoring = object<{
    includeInScore: boolean;
    maximumHundredths: number;
    thresholdBasisPoints: number;
  }>(merged["video.scoring"]);
  return {
    assetId: media.assetId,
    captions: media.captions ?? [],
    description: text(instructions.description as CanonicalValue),
    assets: instructions.assets ?? [],
    placement: merged["video.placement"] as string,
    includeInScore: scoring.includeInScore,
    maximumHundredths: scoring.maximumHundredths,
    thresholdBasisPoints: scoring.thresholdBasisPoints,
  };
}

export function composePdf(merged: Merged) {
  return {
    assetId: object<{ assetId: string }>(merged["pdf.file"]).assetId,
    placement: merged["pdf.placement"] as string,
  };
}

export function composeExercise(
  merged: Merged,
  orderOf: OrderOf,
  referenceLocal: (key: string | null) => string | null,
) {
  const limits = object<Record<string, number | null>>(
    merged["exercise.limits"],
  );
  const profile = object<Record<string, string | number | null>>(
    merged["exercise.gradingProfile"],
  );
  const manual = object<{
    manualMaximumHundredths: number;
    manualIncludeInScore: boolean;
  }>(merged["exercise.manualAssessment"]);
  const testCases = listItems(
    merged,
    "exercise.testCase:",
    orderOf("exercise.testCases@order"),
  ).map(([syncKey, value], index) => {
    const item = object<Record<string, CanonicalValue>>(value);
    return {
      syncKey,
      position: index + 1,
      input: text(item.input),
      expectedOutput: text(item.expectedOutput),
      visibility: item.visibility as "SAMPLE" | "HIDDEN",
      comparator: item.comparator as string,
      weight: item.weight as number,
      timeLimitMsOverride: (item.timeLimitMsOverride ?? null) as number | null,
      softTimeLimitMs: (item.softTimeLimitMs ?? null) as number | null,
      softPenalty: (item.softPenalty ?? null) as number | null,
      label: (item.label ?? null) as string | null,
    };
  });
  const hints = listItems(
    merged,
    "exercise.hint:",
    orderOf("exercise.hints@order"),
  ).map(([syncKey, value], index) => {
    const item = object<{ content: string; triggerExpression: string | null }>(
      value,
    );
    return {
      syncKey,
      position: index + 1,
      content: item.content,
      triggerExpression: item.triggerExpression ?? null,
    };
  });
  const solutions = listItems(
    merged,
    "exercise.solution:",
    orderOf("exercise.solutions@order"),
  ).map(([syncKey, value], index) => {
    const item = object<{ title: string | null; code: Big }>(value);
    return {
      syncKey,
      position: index,
      title: item.title ?? null,
      code: text(item.code as CanonicalValue),
    };
  });
  return {
    difficulty: merged["exercise.difficulty"] as string,
    description: text(merged["exercise.description"]),
    inputFormat: text(merged["exercise.inputFormat"]),
    outputFormat: text(merged["exercise.outputFormat"]),
    constraints: text(merged["exercise.constraints"]),
    starterCode: text(merged["exercise.starterCode"]),
    language: merged["exercise.language"] as string,
    timeLimitMs: limits.timeLimitMs as number,
    memoryLimitMb: limits.memoryLimitMb as number,
    totalTimeLimitMs: (limits.totalTimeLimitMs ?? null) as number | null,
    comparatorTimeLimitMs: (limits.comparatorTimeLimitMs ?? null) as
      | number
      | null,
    gradingMode: profile.gradingMode as string,
    inputPromptPolicy: profile.inputPromptPolicy as string,
    continuationPolicy: profile.continuationPolicy as string,
    exitStatusPolicy: profile.exitStatusPolicy as string,
    materialMaximumHundredths: (profile.materialMaximumHundredths ?? null) as
      | number
      | null,
    materialScorePolicy: (profile.materialScorePolicy ?? null) as string | null,
    submissionPolicy: merged["exercise.submissionPolicy"] as string,
    manualMaximumHundredths: manual.manualMaximumHundredths,
    manualIncludeInScore: manual.manualIncludeInScore,
    feedbackPolicy: (merged["exercise.feedbackPolicy"] ?? null) as unknown,
    sourceProject: (merged["exercise.sourceProject"] ?? null) as unknown,
    aiFeedbackEnabled: merged["exercise.aiFeedback"] as boolean,
    quiz: (merged["exercise.quiz"] ?? null) as unknown,
    referencePdfMaterialId: referenceLocal(
      (merged["exercise.referencePdf"] ?? null) as string | null,
    ),
    solutionCode: solutions[0]?.code ?? null,
    testCases,
    hints,
    solutions,
  };
}

export type ManualAssetItem = {
  assetId: string;
  name: string;
  byteSize: number;
};

export function composeManual(
  merged: Merged,
  type: string,
  orderOf: OrderOf,
  optionLocal: (key: string) => string,
) {
  const scoring = object<{
    submitEnabled: boolean;
    includeInScore: boolean;
    maximumHundredths: number;
    isRequired: boolean;
  }>(merged["manual.scoring"]);
  const canvas = object<{ width: number; height: number }>(
    merged["manual.canvas"],
  );
  const execution = object<{
    timeLimitSeconds: number;
    memoryLimitMb: number;
    runtimeVersion: string;
  }>(merged["manual.execution"]);
  const files: Record<string, string> = {};
  for (const [path, value] of listItems(merged, "manual.file:", null))
    files[path] = text(value);
  let solutionFiles: Record<string, string> | null = null;
  if (merged["manual.solutionFiles@presence"] === true) {
    solutionFiles = {};
    for (const [path, value] of listItems(merged, "manual.solutionFile:", null))
      solutionFiles[path] = text(value);
  }
  const manifest = (prefix: string, orderKey: string): ManualAssetItem[] =>
    listItems(merged, prefix, orderOf(orderKey)).map(([assetId, value]) => {
      const item = object<{ name: string; byteSize: number }>(value);
      return { assetId, name: item.name, byteSize: item.byteSize };
    });

  let shortAnswer: Record<string, unknown> | null = null;
  if (type === "WRITTEN_RESPONSE") {
    const rule = object<{
      present: boolean;
      version?: number;
      gradingMode?: string;
      expectedAnswer?: string;
      pattern?: string;
    }>(merged["sa.rule"]);
    if (rule?.present) {
      const explanation = object<{
        explanationEnabled: boolean;
        explanation: string;
      }>(merged["sa.explanation"]);
      shortAnswer = {
        version: rule.version ?? 1,
        question: (merged["sa.prompt"] ?? "") as string,
        gradingMode: rule.gradingMode,
        expectedAnswer: rule.expectedAnswer ?? "",
        pattern: rule.pattern ?? "",
        explanationEnabled: explanation?.explanationEnabled ?? false,
        explanation: explanation?.explanation ?? "",
      };
    }
  }

  let multipleChoice: Record<string, unknown> | null = null;
  if (type === "MULTIPLE_CHOICE") {
    const structure = object<{
      version: number;
      selectionMode: string;
      options: string[];
      correct: string[];
      shuffleOptions: boolean;
    } | null>(merged["mc.structure"]);
    if (structure) {
      const prompt = object<{ question: string; problemDescription: string }>(
        merged["mc.prompt"],
      );
      const explanation = object<{
        explanationEnabled: boolean;
        explanation: string;
      }>(merged["mc.explanation"]);
      multipleChoice = {
        version: structure.version ?? 1,
        question: prompt?.question ?? "",
        problemDescription: prompt?.problemDescription ?? "",
        selectionMode: structure.selectionMode,
        options: structure.options.map((key) => ({
          id: optionLocal(key),
          content: (merged[`mc.option:${key}`] ?? "") as string,
        })),
        shuffleOptions: structure.shuffleOptions,
        explanationEnabled: explanation?.explanationEnabled ?? false,
        correctOptionIds: structure.correct.map(optionLocal),
        explanation: explanation?.explanation ?? "",
      };
    }
  }

  return {
    description: text(merged["manual.description"]),
    files,
    entryPoint: (merged["manual.entryPoint"] ?? "main.py") as string,
    assets: manifest("manual.asset:", "manual.assets@order"),
    modelAnswer: (merged["manual.modelAnswer"] ?? "") as string,
    solutionAssets: manifest(
      "manual.solutionAsset:",
      "manual.solutionAssets@order",
    ),
    solutionFiles,
    hint: (merged["manual.hint"] ?? "") as string,
    width: canvas.width,
    height: canvas.height,
    timeLimitSeconds: execution.timeLimitSeconds,
    memoryLimitMb: execution.memoryLimitMb,
    runtimeVersion: execution.runtimeVersion,
    submitEnabled: scoring.submitEnabled,
    includeInScore: scoring.includeInScore,
    maximumHundredths: scoring.maximumHundredths,
    isRequired: scoring.isRequired,
    shortAnswer,
    multipleChoice,
  };
}

/** A node key or local reference back to a local row id. */
export function localIdOf(
  key: string,
  linked: ReadonlyMap<string, string>,
): string | null {
  if (key.startsWith(LOCAL_PREFIX)) return key.slice(LOCAL_PREFIX.length);
  return linked.get(key) ?? null;
}
