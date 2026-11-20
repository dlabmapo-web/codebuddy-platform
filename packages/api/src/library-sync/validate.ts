import {
  isCompiledLanguage,
  saveExplanationSchema,
  saveManualSchema,
  savePdfSchema,
  saveVideoSchema,
  updateProgrammingExerciseSchema,
} from "@cove/shared";
import type { ZodType } from "zod";

import { MANUAL_TYPES } from "./catalog.js";
import {
  composeExercise,
  composeExplanation,
  composeManual,
  composePdf,
  composeVideo,
  type Merged,
} from "./compose.js";

/**
 * Post-merge invariants (design §8.3, catalog §5), on one material: a merged
 * one, or one the library adds.
 *
 * The complete definition goes through the editor's own save schema, so a
 * merge of two individually valid versions cannot exceed a limit the editor
 * enforces (64 source files, 200 test cases, 10 solutions, …), plus the
 * cross-field rules the schemas do not hold. Additions are checked the same
 * way: arriving verbatim from the library is no exemption.
 *
 * Older content the platform still supports is accepted as it is, by the
 * documented rules in `OLDER_CONTENT` (catalog §5.1), never altered to pass.
 * Anything else that fails does not get written: the runner holds back every
 * library unit it applied there, or holds an addition for review, as one
 * grouped `INVALID_RESULT` decision, then checks again. What the academy
 * already had is never made worse by sync, and never rejected for being the
 * academy's own: an issue the copy's current version already has does not
 * count against the merge.
 */

export type ValidationContext = {
  courseLanguage?: string;
  /** Whether a PDF node key resolves to a PDF an exercise may reference in the merged copy. */
  pdfAvailable(key: string): boolean;
};

export type Issue = { key: string; message: string };

const LESSON_IMAGE = /src="cove-asset:([0-9a-f-]{36})"/gi;
/** Ids the editors' schemas require but a merged material has no use for. */
const PLACEHOLDER = "00000000-0000-4000-8000-000000000000";
const placeholders = {
  academyId: PLACEHOLDER,
  courseId: PLACEHOLDER,
  lectureId: PLACEHOLDER,
};

/**
 * Older definitions the platform supports as they are (catalog §5.1). Each
 * rule names the editor issue it covers and checks the definition itself, so
 * a reworded message never widens it: an unmatched issue fails, the safe way.
 */
export const OLDER_CONTENT: ReadonlyArray<{
  id: string;
  covers(type: string, issue: Issue, merged: Merged): boolean;
}> = [
  {
    // Reference answers became required after most problems were written
    // (840 of 991 dev-database exercises have none). Grading uses the test
    // cases, never the answer, and the importer keeps such a problem as it
    // is. Sync keeps it answerless rather than invent an answer.
    id: "unanswered-problem",
    covers: (type, issue, merged) =>
      type === "PROGRAMMING_EXERCISE" &&
      issue.key === "schema:solutions:A correct answer is required." &&
      !Object.keys(merged).some((unitKey) =>
        unitKey.startsWith("exercise.solution:"),
      ),
  },
  {
    // A half-written problem: automatic grading with no cases yet. Students
    // cannot submit (`SubmissionService` refuses with EXERCISE_NOT_AVAILABLE)
    // and the console counts it under problems without tests. Sync keeps its
    // policy rather than change it to pass.
    id: "automatic-problem-without-cases",
    covers: (type, issue, merged) =>
      type === "PROGRAMMING_EXERCISE" &&
      issue.key ===
        "schema:testCases:Add at least one test case for automatic grading." &&
      merged["exercise.submissionPolicy"] === "AUTOMATIC" &&
      !Object.keys(merged).some((unitKey) =>
        unitKey.startsWith("exercise.testCase:"),
      ),
  },
];

const isSupportedOlderContent = (type: string, issue: Issue, merged: Merged) =>
  OLDER_CONTENT.some((rule) => rule.covers(type, issue, merged));

/**
 * The first problem this definition has that is neither supported older
 * content nor already in the copy's current version (`before`), or null.
 * An addition has no `before`: every unsupported issue counts.
 */
export function validateMaterial(
  type: string,
  merged: Merged,
  context: ValidationContext,
  before: Merged | null,
): string | null {
  const after = materialIssues(type, merged, context).filter(
    (issue) => !isSupportedOlderContent(type, issue, merged),
  );
  if (!after.length) return null;
  const existing = before
    ? new Set(materialIssues(type, before, context).map((issue) => issue.key))
    : new Set<string>();
  return after.find((issue) => !existing.has(issue.key))?.message ?? null;
}

/** Every issue of a definition: cross-field rules, then the editor's schema. */
export function materialIssues(
  type: string,
  merged: Merged,
  context: ValidationContext,
): Issue[] {
  try {
    return [
      ...ruleIssues(type, merged, context),
      ...schemaIssues(type, merged),
    ];
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid merged material";
    return [{ key: `compose:${message}`, message }];
  }
}

const rule = (message: string): Issue => ({ key: `rule:${message}`, message });

/** Rules beyond the editors' schemas: cross-field limits, references and image manifests. */
function ruleIssues(
  type: string,
  merged: Merged,
  context: ValidationContext,
): Issue[] {
  const issues: Issue[] = [];
  if (type === "PROGRAMMING_EXERCISE") {
    const row = composeExercise(merged, orderOf(merged), (key) => key);
    if (
      context.courseLanguage &&
      (context.courseLanguage === "WEB" ||
        (context.courseLanguage === "PYTHON" && row.language !== "PYTHON") ||
        (context.courseLanguage === "C_CPP" &&
          !isCompiledLanguage(row.language as never)))
    )
      issues.push(
        rule("The exercise language is outside this course's language family."),
      );
    for (const testCase of row.testCases) {
      const hard = testCase.timeLimitMsOverride ?? row.timeLimitMs;
      if (
        testCase.softTimeLimitMs !== null &&
        !(testCase.softTimeLimitMs > 0 && testCase.softTimeLimitMs < hard)
      )
        issues.push(
          rule("A case's soft time limit must be below its hard limit."),
        );
    }
    if (
      !row.quiz &&
      row.submissionPolicy !== "MANUAL_REVIEW" &&
      isCompiledLanguage(row.language as never) &&
      (row.gradingMode !== "ELICE_STDIO" || row.inputPromptPolicy !== "INCLUDE")
    )
      issues.push(
        rule("C and C++ problems use weighted grading and keep input prompts."),
      );
    const reference = merged["exercise.referencePdf"];
    if (typeof reference === "string" && !context.pdfAvailable(reference))
      issues.push(rule("The reference PDF is not available in this course."));
  } else if (type === "VIDEO_LESSON") {
    const row = composeVideo(merged);
    const manifest = new Set(
      (row.assets as Array<{ assetId: string }>).map((asset) => asset.assetId),
    );
    for (const match of row.description.matchAll(LESSON_IMAGE))
      if (!manifest.has(match[1]!))
        issues.push(
          rule("Every instruction image must be in the video's manifest."),
        );
  } else if (type === "TURTLE_EXERCISE" && context.courseLanguage === "WEB") {
    issues.push(rule("Turtle exercises are not part of web courses."));
  } else if (type === "MULTIPLE_CHOICE") {
    const row = composeManual(merged, type, orderOf(merged), (key) => key);
    const definition = row.multipleChoice as {
      problemDescription?: string;
      options: Array<{ content: string }>;
    } | null;
    if (definition) {
      const manifest = new Set(row.assets.map((asset) => asset.assetId));
      for (const text of [
        String(definition.problemDescription ?? ""),
        ...definition.options.map((option) => option.content),
      ])
        for (const match of text.matchAll(LESSON_IMAGE))
          if (!manifest.has(match[1]!))
            issues.push(
              rule(
                "Question image must belong to its authorized asset manifest.",
              ),
            );
    }
  }
  return issues;
}

/** The editor's save schema over the complete merged definition. */
function schemaIssues(type: string, merged: Merged): Issue[] {
  const title = merged["material.title"];
  if (type === "EXPLANATION") {
    const row = composeExplanation(merged);
    return parse(saveExplanationSchema, {
      ...placeholders,
      title,
      body: row.body,
      sideBody: row.sideBody,
      isVisible: true,
    });
  }
  if (type === "VIDEO_LESSON") {
    const row = composeVideo(merged);
    return parse(saveVideoSchema, {
      ...placeholders,
      ...row,
      title,
      requestKey: PLACEHOLDER,
    });
  }
  if (type === "PDF_DOCUMENT") {
    const row = composePdf(merged);
    return parse(savePdfSchema, {
      ...placeholders,
      title,
      placement: row.placement,
    });
  }
  if (type === "PROGRAMMING_EXERCISE") {
    const row = composeExercise(merged, orderOf(merged), (key) => key);
    return parse(updateProgrammingExerciseSchema, {
      ...placeholders,
      materialId: PLACEHOLDER,
      expectedUpdatedAt: "2000-01-01T00:00:00.000Z",
      title,
      difficulty: row.difficulty,
      description: row.description,
      inputFormat: row.inputFormat,
      outputFormat: row.outputFormat,
      constraints: row.constraints,
      starterCode: row.starterCode,
      sourceProject: (row.sourceProject ?? null) as never,
      language: row.language,
      solutions: row.solutions.map((solution) => ({
        title: solution.title,
        code: solution.code,
      })),
      aiFeedbackEnabled: row.aiFeedbackEnabled,
      isVisible: true,
      testCases: row.testCases.map(
        ({ syncKey: _syncKey, position: _position, ...testCase }) => testCase,
      ),
      grading: {
        mode: row.gradingMode,
        inputPromptPolicy: row.inputPromptPolicy,
        totalTimeLimitMs: row.totalTimeLimitMs,
        comparatorTimeLimitMs: row.comparatorTimeLimitMs,
        materialMaximumHundredths: row.materialMaximumHundredths,
        materialScorePolicy: row.materialScorePolicy,
      },
      hints: row.hints.map((hint) => ({
        content: hint.content,
        triggerExpression: hint.triggerExpression,
      })),
      manualAssessment: {
        maximumHundredths: row.manualMaximumHundredths,
        includeInScore: row.manualIncludeInScore,
      },
      submissionPolicy: row.submissionPolicy,
      // The reference is a node key here; whether it resolves is a rule above.
      referencePdfMaterialId:
        row.referencePdfMaterialId === null ? null : PLACEHOLDER,
      quiz: row.quiz,
    });
  }
  if (MANUAL_TYPES.has(type)) {
    const row = composeManual(merged, type, orderOf(merged), (key) => key);
    return parse(saveManualSchema, {
      ...placeholders,
      type,
      title,
      multipleChoice: row.multipleChoice
        ? withUuidOptionIds(row.multipleChoice)
        : null,
      shortAnswer: row.shortAnswer,
      modelAnswer: row.modelAnswer,
      solutionAssets: row.solutionAssets,
      assets: row.assets,
      description: row.description,
      files: row.files,
      entryPoint: row.entryPoint,
      solutionFiles: row.solutionFiles,
      hint: row.hint,
      width: row.width,
      height: row.height,
      timeLimitSeconds: row.timeLimitSeconds,
      memoryLimitMb: row.memoryLimitMb,
      submitEnabled: row.submitEnabled,
      includeInScore: row.includeInScore,
      maximumHundredths: row.maximumHundredths,
    });
  }
  return [];
}

function parse(schema: ZodType, value: unknown): Issue[] {
  const parsed = schema.safeParse(value);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => ({
    key: `schema:${issue.path.join(".")}:${issue.message}`,
    message: issue.message,
  }));
}

const orderOf = (merged: Merged) => (unitKey: string) =>
  (merged[unitKey] as string[] | undefined) ?? null;

/** Option keys stand in for ids in a merged definition; the schema needs UUID-shaped ids. */
function withUuidOptionIds(definition: Record<string, unknown>) {
  const options = definition.options as Array<{ id: string; content: string }>;
  const ids = new Map(
    options.map((option, index) => [
      option.id,
      `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    ]),
  );
  return {
    ...definition,
    options: options.map((option) => ({ ...option, id: ids.get(option.id)! })),
    correctOptionIds: (definition.correctOptionIds as string[]).map(
      (id) => ids.get(id) ?? id,
    ),
  };
}
