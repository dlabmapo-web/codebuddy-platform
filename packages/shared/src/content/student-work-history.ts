import { z } from "zod";
import { materialTypeSchema } from "./course.js";
import { sourceFilesSchema } from "./manual.js";
import { publicChoiceSchema } from "./multiple-choice.js";
import { teacherSubmissionReviewSchema } from "./teacher-progress.js";

const count = z.number().int().nonnegative();
export const historyScopeSchema = z.object({
  academyId: z.uuid(),
  classId: z.uuid(),
});
export const historyStudentSchema = historyScopeSchema.extend({
  membershipId: z.uuid(),
});
export const historyPageSchema = z.object({
  page: count.min(1),
  pageCount: count,
  totalCount: count,
  pageSize: count.min(1),
});
export const historySearchSchema = z.object({
  q: z.string().trim().max(120).optional(),
  page: count.min(1).default(1),
});
export const historyFilterSchema = historyStudentSchema.extend({
  courseId: z.uuid().optional(),
  moduleId: z.uuid().optional(),
  lectureId: z.uuid().optional(),
  type: materialTypeSchema.optional(),
  status: z
    .enum([
      "not_started",
      "in_progress",
      "completed",
      "pending",
      "previous_revision",
      "unrecorded",
    ])
    .optional(),
  ...historySearchSchema.shape,
});
export const historyIdentitySchema = z.object({
  membershipId: z.uuid(),
  name: z.string(),
  identifier: z.string().nullable(),
});
const option = z.object({ id: z.uuid(), title: z.string() });
export const historyMaterialSchema = z.object({
  materialId: z.uuid(),
  title: z.string(),
  type: materialTypeSchema,
  courseId: z.uuid(),
  courseTitle: z.string(),
  moduleId: z.uuid(),
  moduleTitle: z.string(),
  lectureId: z.uuid(),
  lectureTitle: z.string(),
  lectureCompleted: count,
  lectureEligible: count,
  required: z.boolean(),
  includedInScore: z.boolean(),
  revision: count,
  status: historyFilterSchema.shape.status.unwrap(),
  /** Assessment and learning completion are independent; no code/feedback in lists. */
  manualReview: z.object({state:z.enum(['AWAITING_REVIEW','GRADED']),completed:z.boolean().nullable()}).optional(),
  submissions: count,
  score: z.number().nullable(),
  maximum: z.number().nullable(),
  latestAt: z.iso.datetime().nullable(),
  watchedMs: count.nullable(),
});
export const historySummarySchema = z.object({
  student: historyIdentitySchema,
  className: z.string(),
  courses: z.array(option),
  modules: z.array(option.extend({ courseId: z.uuid() })),
  lectures: z.array(option.extend({ moduleId: z.uuid(), courseId: z.uuid() })),
  asOf: z.iso.datetime(),
  enrolledAt: z.iso.datetime().nullable().default(null),
  totalScore: z.number().nonnegative().default(0),
  maximumScore: z.number().nonnegative().default(0),
  courseProgress: z
    .array(
      z.object({
        id: z.uuid(),
        title: z.string(),
        completed: count,
        eligible: count,
      }),
    )
    .default([]),
  learningDays: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        activeSeconds: count,
      }),
    )
    .default([]),
  completed: count,
  eligible: count,
  programmingCompleted: count,
  manualCompleted: count,
  programmingSubmissions: count,
  manualSubmissions: count,
  averageScore: z.number().nullable(),
  evaluatedItems: count,
  activeSeconds: count,
  firstRecordedAt: z.iso.datetime().nullable(),
  lastActiveAt: z.iso.datetime().nullable(),
  latestSubmissionAt: z.iso.datetime().nullable(),
});
export const historyAttemptSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["programming", "manual"]),
  createdAt: z.iso.datetime(),
  score: z.number().nullable(),
  maximum: z.number(),
  completed: z.boolean().nullable(),
  status: z.string(),
  currentRevision: z.boolean(),
  /** C/C++ only: this attempt did not compile. */
  compileFailed: z.boolean().optional(),
});
export const historyAttemptTargetSchema = historyStudentSchema.extend({
  materialId: z.uuid(),
});
export const historySubmissionTargetSchema = historyAttemptTargetSchema.extend({
  submissionId: z.uuid(),
  kind: z.enum(["programming", "manual"]),
});
export const historySubmissionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("programming"),
    review: teacherSubmissionReviewSchema,
  }),
  z.object({
    kind: z.literal("manual"),
    submissionId: z.uuid(),
    materialId: z.uuid(),
    membershipId: z.uuid(),
    studentName: z.string(),
    title: z.string(),
    type: materialTypeSchema,
    createdAt: z.iso.datetime(),
    files: sourceFilesSchema,
    answer: z.string(),
    description: z.string(),
    entryPoint: z.string(),
    question: z.string().nullable(),
    score: z.number().nullable(),
    maximum: z.number(),
    includeInScore: z.boolean().optional(),
    completed: z.boolean().nullable(),
    status: z.string(),
    feedback: z.string(),
    explanation: z.string().nullable().default(null),
    choice: z
      .object({
        definition: publicChoiceSchema,
        selectedOptionIds: z.array(z.string()),
        displayOrder: z.array(z.string()),
      })
      .nullable(),
  }),
]);
export const historyReviewRunSchema = historySubmissionTargetSchema
  .extend({
    // No submission means an explicitly private copy of the current saved draft.
    submissionId: z.uuid().optional(),
    kind: z.literal("manual"),
    reviewId: z.uuid(),
    files: sourceFilesSchema,
  })
  .strict();
export type HistoryFilter = z.infer<typeof historyFilterSchema>;
export type HistoryMaterial = z.infer<typeof historyMaterialSchema>;
export type HistorySummary = z.infer<typeof historySummarySchema>;
export type HistorySubmission = z.infer<typeof historySubmissionSchema>;
export type HistoryAttempt = z.infer<typeof historyAttemptSchema>;
export type HistoryReviewRun = z.infer<typeof historyReviewRunSchema>;
