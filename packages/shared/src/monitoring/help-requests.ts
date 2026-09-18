import { z } from 'zod';

export const helpRequestStatusSchema = z.enum(['WAITING', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED']);
export const helpRequestSchema = z.object({
  id: z.uuid(), academyId: z.uuid(), classId: z.uuid(),
  studentMembershipRef: z.uuid(), studentName: z.string().nullable(),
  materialId: z.uuid(), problemTitle: z.string().nullable(),
  teacherMembershipRef: z.uuid().nullable(), teacherName: z.string().nullable(),
  status: helpRequestStatusSchema, version: z.number().int().positive(),
  requestedAt: z.iso.datetime(), claimedAt: z.iso.datetime().nullable(),
  closedAt: z.iso.datetime().nullable(), closeReason: z.string().nullable(),
});
export type HelpRequest = z.infer<typeof helpRequestSchema>;
export const helpClassInputSchema = z.object({ academyId: z.uuid(), classId: z.uuid() });
export const requestHelpInputSchema = helpClassInputSchema.extend({ materialId: z.uuid(), idempotencyKey: z.uuid() });
export const changeHelpRequestInputSchema = z.object({
  academyId: z.uuid(), requestId: z.uuid(), expectedVersion: z.number().int().positive(), idempotencyKey: z.uuid(),
});
export type ChangeHelpRequestInput = z.infer<typeof changeHelpRequestInputSchema>;
export const helpMutationResultSchema = z.object({
  conflict: z.boolean(), request: helpRequestSchema.nullable(), serverTime: z.iso.datetime(),
});
export type HelpMutationResult = z.infer<typeof helpMutationResultSchema>;
export const helpCursorSchema = z.object({ time: z.iso.datetime(), id: z.uuid() });
export const listHelpRequestsInputSchema = helpClassInputSchema.extend({
  status: z.enum(['WAITING', 'IN_PROGRESS']), cursor: helpCursorSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export const helpQueueSchema = z.object({
  requests: z.array(helpRequestSchema), waitingCount: z.number().int(), inProgressCount: z.number().int(),
  nextCursor: helpCursorSchema.nullable(), serverTime: z.iso.datetime(),
});
export const myHelpRequestSchema = z.object({
  request: helpRequestSchema.nullable(), latestClosed: helpRequestSchema.nullable(),
  teacherAssigned: z.boolean(), serverTime: z.iso.datetime(),
});
export const helpRequestChangedSchema = helpClassInputSchema;

/** Age until the current claim; a returned request resumes from its original time. */
export function helpWaitSeconds(request: Pick<HelpRequest, 'requestedAt' | 'claimedAt' | 'status'>, now: number): number {
  const end = request.status === 'IN_PROGRESS' && request.claimedAt ? Date.parse(request.claimedAt) : now;
  return Math.max(0, Math.floor((end - Date.parse(request.requestedAt)) / 1000));
}
