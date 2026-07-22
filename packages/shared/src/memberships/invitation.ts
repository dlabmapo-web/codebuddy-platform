import { z } from "zod";

import { academyRoleSchema } from "../auth/roles.js";
import { invitationStatusSchema } from "./status.js";

export const createAcademyInvitationSchema = z.object({
  academyId: z.uuid(),
  email: z.email().transform((email) => email.trim().toLowerCase()),
  role: academyRoleSchema,
});
export type CreateAcademyInvitation = z.infer<
  typeof createAcademyInvitationSchema
>;

export const academyInvitationSchema = z.object({
  id: z.uuid(),
  academyId: z.uuid(),
  email: z.email(),
  role: academyRoleSchema,
  status: invitationStatusSchema,
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});

export const acceptAcademyInvitationSchema = z.object({
  token: z.string().min(32).max(512),
});
