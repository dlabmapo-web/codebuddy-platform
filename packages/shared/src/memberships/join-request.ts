import { z } from "zod";

import { academyRoleSchema } from "../auth/roles.js";

export const createAcademyJoinRequestSchema = z.object({
  academyId: z.uuid(),
  message: z.string().trim().max(1_000).optional(),
});

export const reviewAcademyJoinRequestSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("APPROVE"),
    role: academyRoleSchema,
    reason: z.string().trim().max(1_000).optional(),
  }),
  z.object({
    decision: z.literal("REJECT"),
    reason: z.string().trim().min(1).max(1_000),
  }),
]);
