import { z } from 'zod';

/** The newest accepted attempt, independently of best scores/history selection. */
export const latestSubmissionSchema = z.object({
  submissionId: z.uuid(),
  createdAt: z.iso.datetime(),
  status: z.enum(['PENDING', 'GRADED', 'AWAITING_REVIEW', 'RECORDED', 'ERROR', 'CANCELLED']),
  scoreHundredths: z.number().int().nonnegative().nullable(),
  maximumHundredths: z.number().int().positive(),
});
export type LatestSubmission = z.infer<typeof latestSubmissionSchema>;

export const latestSubmissionInputSchema = z.object({
  academyId: z.uuid(), materialId: z.uuid(), classId: z.uuid().optional(),
  mode: z.enum(['student', 'staff-practice']), preview: z.boolean().optional(),
  gradingRevision: z.number().int().positive().optional(),
});

export function shouldPollLatestSubmission(value: LatestSubmission | null | undefined, now: number) {
  return Boolean(value && ['PENDING', 'AWAITING_REVIEW'].includes(value.status) && now - Date.parse(value.createdAt) < 120000);
}
