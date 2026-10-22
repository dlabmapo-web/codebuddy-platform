import { z } from "zod";
import {
  multipleChoiceSchema,
  publicChoiceSchema,
  type PublicChoiceDefinition,
} from "./multiple-choice.js";
export const manualTypes = [
  "TURTLE_EXERCISE",
  "WRITTEN_RESPONSE",
  "MULTIPLE_CHOICE",
] as const;
export const sourceFilesSchema = z
  .record(z.string(), z.string())
  .superRefine((files, ctx) => {
    const entries = Object.entries(files);
    if (
      entries.length > 64 ||
      entries.reduce(
        (sum, [, code]) => sum + new TextEncoder().encode(code).length,
        0,
      ) > 1048576
    )
      ctx.addIssue({
        code: "custom",
        message: "Source exceeds 64 files or 1 MiB",
      });
    for (const [name] of entries)
      if (
        !/^[a-zA-Z0-9_-][a-zA-Z0-9_./ -]{0,127}$/.test(name) ||
        name.split("/").some((p) => !p || p === "." || p === "..") ||
        name === "assets" ||
        name.startsWith("assets/")
      )
        ctx.addIssue({ code: "custom", message: "Invalid source path" });
  });
export const manualAssetsSchema = z
  .array(
    z.object({
      assetId: z.uuid(),
      name: z.string().regex(/^[a-zA-Z0-9_-][a-zA-Z0-9_. -]{0,100}$/),
      byteSize: z.number().int().min(1).max(5242880),
    }),
  )
  .max(64)
  .superRefine((assets, ctx) => {
    if (
      assets.reduce((n, a) => n + a.byteSize, 0) > 20971520 ||
      new Set(assets.map((a) => a.name)).size !== assets.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Assets exceed 20 MiB or have duplicate paths",
      });
  });
export const shortAnswerSchema = z.object({
  version: z.literal(1).default(1),
  question: z.string().trim().min(1).max(1000),
  gradingMode: z.enum(["MANUAL", "EXACT", "REGEX"]),
  expectedAnswer: z.string().max(10000).default(""),
  pattern: z.string().max(2000).default(""),
  explanationEnabled: z.boolean().default(false),
  explanation: z.string().max(100000).default(""),
});
export type ShortAnswerDefinition = z.infer<typeof shortAnswerSchema>;
export function effectiveManualResult<
  T extends { completed: boolean; scoreHundredths: number },
>(attempt?: {
  reviews: T[];
  multipleChoiceAssessment?: {
    status: string;
    completed: boolean;
    scoreHundredths: number;
  } | null;
  shortAnswerAssessment?: {
    status: string;
    completed: boolean | null;
    scoreHundredths: number | null;
  } | null;
}) {
  if (attempt?.reviews[0]) return attempt.reviews[0];
  const result =
    attempt?.multipleChoiceAssessment ?? attempt?.shortAnswerAssessment;
  return result?.status === "GRADED" &&
    result.completed !== null &&
    result.scoreHundredths !== null
    ? { completed: result.completed, scoreHundredths: result.scoreHundredths }
    : undefined;
}
export const manualConfigSchema = z.object({
  multipleChoice: publicChoiceSchema
    .extend({
      correctOptionIds: z.array(z.uuid()).optional(),
      explanation: z.string().optional(),
    })
    .nullable()
    .default(null),
  shortAnswer: shortAnswerSchema.nullable().default(null),
  modelAnswer: z.string().max(10000).default(""),
  solutionAssets: manualAssetsSchema.default([]),
  assets: manualAssetsSchema.default([]),
  description: z.string().max(100000).default(""),
  files: sourceFilesSchema.default({
    "main.py":
      "import turtle\nturtle.Screen().setup(1.0, 1.0)\nt = turtle.Turtle()\nt.shape('turtle')\n\n# Draw here\nturtle.done()\n",
  }),
  entryPoint: z.string().max(128).default("main.py"),
  solutionFiles: sourceFilesSchema.nullable().optional(),
  hint: z.string().max(1000).default(""),
  width: z.number().int().min(320).max(2048).default(1024),
  height: z.number().int().min(320).max(2048).default(640),
  timeLimitSeconds: z.number().int().min(1).max(1800).default(1800),
  memoryLimitMb: z.number().int().min(128).max(512).default(512),
  submitEnabled: z.boolean().default(true),
  includeInScore: z.boolean().default(false),
  maximumHundredths: z.number().int().min(1).max(1000000).default(10000),
});
export const manualTargetSchema = z.object({
  academyId: z.uuid(),
  materialId: z.uuid(),
});
export const saveManualSchema = manualConfigSchema
  .extend({
    academyId: z.uuid(),
    courseId: z.uuid(),
    lectureId: z.uuid(),
    materialId: z.uuid().optional(),
    revision: z.number().int().positive().optional(),
    type: z.enum(manualTypes),
    title: z.string().trim().min(1).max(128),
  })
  .superRefine((x, ctx) => {
    if (
      (x.type === "MULTIPLE_CHOICE") !== Boolean(x.multipleChoice) ||
      (x.multipleChoice && x.shortAnswer)
    )
      ctx.addIssue({
        code: "custom",
        message: "Multiple choice requires its own material and definition",
      });
    if (x.multipleChoice) {
      const parsed = multipleChoiceSchema.safeParse(x.multipleChoice);
      if (!parsed.success)
        for (const issue of parsed.error.issues)
          ctx.addIssue({ ...issue, path: ["multipleChoice", ...issue.path] });
    }
    if (x.shortAnswer) {
      if (x.type !== "WRITTEN_RESPONSE")
        ctx.addIssue({
          code: "custom",
          message: "Short answers require written-response material",
        });
      if (
        x.shortAnswer.gradingMode === "EXACT" &&
        !x.shortAnswer.expectedAnswer.trim()
      )
        ctx.addIssue({ code: "custom", message: "Enter the correct answer" });
      if (x.shortAnswer.gradingMode === "REGEX" && !x.shortAnswer.pattern)
        ctx.addIssue({ code: "custom", message: "Enter a regular expression" });
      if (
        x.shortAnswer.explanationEnabled &&
        !x.shortAnswer.explanation.replace(/<[^>]*>/g, "").trim() &&
        !/<img\b/i.test(x.shortAnswer.explanation)
      )
        ctx.addIssue({ code: "custom", message: "Enter an explanation" });
    }
    if (x.includeInScore && !x.submitEnabled)
      ctx.addIssue({
        code: "custom",
        message: "Score-included work requires Submit",
      });
    if (
      x.type === "TURTLE_EXERCISE" &&
      (!Object.hasOwn(x.files, x.entryPoint) || !x.entryPoint.endsWith(".py"))
    )
      ctx.addIssue({
        code: "custom",
        message: "A Python entry point is required",
      });
  });
export const manualWorkSchema = manualTargetSchema.extend({
  files: sourceFilesSchema,
  answer: z.string().max(10000).default(""),
  revision: z.number().int().nonnegative(),
});
export const manualSubmitSchema = manualWorkSchema
  .extend({
    contentRevision: z.number().int().positive(),
    classId: z.uuid(),
    requestKey: z.uuid(),
    selectedOptionIds: z.array(z.uuid()).max(20).optional(),
    displayOrder: z.array(z.uuid()).max(20).optional(),
  })
  .strict();
export const manualReviewSchema = manualTargetSchema.extend({
  submissionId: z.uuid(),
  expectedVersion: z.number().int().nonnegative(),
  scoreHundredths: z.number().int().nonnegative(),
  completed: z.boolean(),
  feedback: z.string().max(10000),
});
export type ManualConfig = z.infer<typeof manualConfigSchema>;
export type SaveManual = z.infer<typeof saveManualSchema>;
export type ManualWork = z.infer<typeof manualWorkSchema>;
export type ManualSubmit = z.infer<typeof manualSubmitSchema>;
export type ManualReviewInput = z.infer<typeof manualReviewSchema>;
export type ManualSession = {
  readOnly?: boolean;
  watchId?: string;
  id: string;
  state: string;
  token: string;
  output: string;
  expiresAt: number;
  displayUrl: string;
  exitCode?: number;
};
export type ManualAttempt = {
  id: string;
  userId: string;
  classId: string;
  files: Record<string, string>;
  answer: string;
  createdAt: string;
  maximumHundredths: number;
  includeInScore: boolean;
  reviewVersion: number;
  reviews: Array<{
    id: string;
    scoreHundredths: number;
    completed: boolean;
    feedback: string;
    version: number;
    createdAt: string;
  }>;
  shortAnswerAssessment?: {
    status: string;
    verdict: string | null;
    scoreHundredths: number | null;
    completed: boolean | null;
  } | null;
  multipleChoiceAssessment?: {
    status: string;
    verdict: string;
    scoreHundredths: number;
    completed: boolean;
    definition: PublicChoiceDefinition;
    selectedOptionIds: string[];
    displayOrder: string[];
  } | null;
  learnerName?: string;
};
export type ManualWorkspace = {
  staff?: {
    canAuthor: boolean;
    canViewSolutions: boolean;
    canTutor: boolean;
    lectureId: string;
    classes: Array<{ classId: string; name: string }>;
  };
  practice?: boolean;
  definitionLocked?: boolean;
  submissionUnavailable?: boolean;
  classes: Array<{ classId: string; name: string }>;
  materialId: string;
  title: string;
  type: (typeof manualTypes)[number];
  config: ManualConfig & { revision: number; runtimeVersion: string };
  draft: {
    files: Record<string, string>;
    answer: string;
    revision: number;
  } | null;
  attempts: ManualAttempt[];
  course: { id: string; title: string };
  materials: Array<{
    materialId: string;
    title: string;
    type: string;
    lectureId: string;
  }>;
};
