import { z } from "zod";
import { caseComparatorSchema, inputPromptPolicySchema, materialScorePolicySchema, quizSnapshotSchema } from "@cove/shared";

/** Internal only: this contains hidden expectations and must never cross an API boundary. */
export const practiceSnapshotSchema = z.object({
  version: z.literal(1),
  submissionPolicy: z.literal("AUTOMATIC").default("AUTOMATIC"),
  courseId: z.uuid().optional(),
  gradingRevision: z.number().int(),
  timeLimitMs: z.number().int().positive(),
  memoryLimitMb: z.number().int().positive(),
  inputPromptPolicy: inputPromptPolicySchema,
  gradingMode: z.enum(["LEGACY_STDIO", "ELICE_STDIO"]),
  gradingSemanticVersion: z.string(),
  totalTimeLimitMs: z.number().nullable(),
  comparatorTimeLimitMs: z.number().nullable(),
  continuationPolicy: z.enum(["LEGACY_STOP_ON_RESOURCE", "CONTINUE_WITHIN_BUDGET"]),
  exitStatusPolicy: z.literal("FAIL_ON_RUNTIME_ERROR"),
  materialMaximumHundredths: z.number().nullable(),
  materialScorePolicy: materialScorePolicySchema.nullable(),
  gradingPolicySnapshot: z.unknown().optional(),
  quizSnapshot: quizSnapshotSchema.nullable(),
  gradingCases: z.array(z.object({
    position: z.number().int().positive(),
    input: z.string(), expectedOutput: z.string(), isSample: z.boolean(),
    comparator: caseComparatorSchema, weight: z.number(),
    timeLimitMsOverride: z.number().nullable(), softTimeLimitMs: z.number().nullable(),
    softPenalty: z.number().nullable(), label: z.string().nullable(),
    effectiveTimeLimitMs: z.number().nullable(),
  })),
});
export type PracticeSnapshot = z.infer<typeof practiceSnapshotSchema>;
