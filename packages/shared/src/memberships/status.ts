import { z } from "zod";

export const membershipStatuses = [
  "INVITED",
  "ACTIVE",
  "SUSPENDED",
  "LEFT",
] as const;
export const membershipStatusSchema = z.enum(membershipStatuses);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

export const invitationStatuses = [
  "PENDING",
  "ACCEPTED",
  "REVOKED",
  "EXPIRED",
] as const;
export const invitationStatusSchema = z.enum(invitationStatuses);
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

export const joinRequestStatuses = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;
export const joinRequestStatusSchema = z.enum(joinRequestStatuses);
export type JoinRequestStatus = z.infer<typeof joinRequestStatusSchema>;
