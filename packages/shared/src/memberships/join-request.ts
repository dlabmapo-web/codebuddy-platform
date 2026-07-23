import { z } from "zod";

import { academyRoleSchema } from "../auth/roles.js";

export const createAcademyJoinRequestSchema = z.object({
  academyId: z.uuid(),
  message: z.string().trim().max(1_000).optional(),
});
export type CreateAcademyJoinRequest = z.infer<
  typeof createAcademyJoinRequestSchema
>;

export const cancelAcademyJoinRequestSchema = z.object({
  requestId: z.uuid(),
});

export const reviewAcademyJoinRequestSchema = z.discriminatedUnion("decision", [
  z.object({
    academyId: z.uuid(),
    requestId: z.uuid(),
    decision: z.literal("APPROVE"),
    role: academyRoleSchema,
    reason: z.string().trim().max(1_000).optional(),
  }),
  z.object({
    academyId: z.uuid(),
    requestId: z.uuid(),
    decision: z.literal("REJECT"),
    reason: z.string().trim().min(1).max(1_000),
  }),
]);
export type ReviewAcademyJoinRequest = z.infer<
  typeof reviewAcademyJoinRequestSchema
>;
