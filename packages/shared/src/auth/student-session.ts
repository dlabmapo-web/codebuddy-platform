import { z } from "zod";

/** The authoritative student inactivity window from §9.1. */
export const STUDENT_INACTIVITY_LIMIT_MS = 30 * 60_000;

/** Browser/server synchronization shares the learning heartbeat cadence. */
export const STUDENT_SESSION_SYNC_CADENCE_MS = 15_000;

export const studentSessionDeadlineSchema = z.object({
  deadline: z.iso.datetime(),
});
export type StudentSessionDeadline = z.infer<
  typeof studentSessionDeadlineSchema
>;
