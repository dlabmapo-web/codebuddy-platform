import { z } from 'zod';

export const programmingAssessmentSnapshotSchema = z.object({
  version: z.literal(1), messageVersion: z.literal(1),
  maximumHundredths: z.number().int().min(1).max(1000000),
  includeInScore: z.boolean(),
});
export const programmingAssessmentSchema = programmingAssessmentSnapshotSchema.extend({
  state: z.enum(['AWAITING_REVIEW', 'GRADED']),
  scoreHundredths: z.number().int().nonnegative().nullable(),
  completed: z.boolean().nullable(), feedback: z.string(),
  reviewerName: z.string().nullable(), reviewedAt: z.iso.datetime().nullable(),
  reviewVersion: z.number().int().nonnegative(),
}).superRefine((value, ctx) => {
  const pending = value.state === 'AWAITING_REVIEW';
  if (pending ? (value.reviewVersion !== 0 || value.scoreHundredths !== null || value.completed !== null || value.reviewedAt !== null || value.reviewerName !== null || value.feedback !== '') :
      (value.reviewVersion === 0 || value.scoreHundredths === null || value.scoreHundredths > value.maximumHundredths || value.completed === null || value.reviewedAt === null || value.reviewerName === null)) {
    ctx.addIssue({code: 'custom', message: 'Inconsistent programming assessment state.'});
  }
});
export type ProgrammingAssessment = z.infer<typeof programmingAssessmentSchema>;
export const programmingReviewInputSchema = z.object({
  academyId: z.uuid(), classId: z.uuid(), submissionId: z.uuid(),
  expectedVersion: z.number().int().nonnegative(), requestId: z.uuid(),
  scoreHundredths: z.number().int().min(0).max(1000000),
  completed: z.boolean(), feedback: z.string().max(10000),
  reason: z.string().trim().max(1000).default(''),
});
export type ProgrammingReviewInput = z.infer<typeof programmingReviewInputSchema>;
export const programmingReviewVersionSchema = z.object({
  version: z.number().int().positive(), scoreHundredths: z.number().int(),
  completed: z.boolean(), feedback: z.string(), reason: z.string(),
  reviewerName: z.string(), createdAt: z.iso.datetime(),
  previousScoreHundredths: z.number().int().nullable(), deltaHundredths: z.number().int().nullable(),
});
export const programmingReviewViewSchema = z.object({
  canPublishReview: z.boolean(), assessment: programmingAssessmentSchema,
  reviews: z.array(programmingReviewVersionSchema),
});
