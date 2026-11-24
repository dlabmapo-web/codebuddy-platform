import { z } from "zod";

import { addLocalDays, isLocalDate } from "../content/academy-time.js";

/** How long hourly public Turtle usage is kept, and the widest range one read covers. */
export const TURTLE_USAGE_RETENTION_DAYS = 180;
/** A device seen within this window is using public Turtle now. */
export const TURTLE_ACTIVE_WINDOW_MS = 5 * 60_000;

const usageDateSchema = z
  .string()
  .refine((value) => isLocalDate(value) && addLocalDays(value, 0) === value, "Not a calendar date");

/** Whole academy-local days, both ends included. */
export const turtleUsageInputSchema = z
  .object({
    from: usageDateSchema,
    to: usageDateSchema,
    academyId: z.uuid().optional(),
  })
  .refine((value) => value.from <= value.to, { path: ["to"], message: "The range ends before it starts" })
  .refine((value) => value.to < addLocalDays(value.from, TURTLE_USAGE_RETENTION_DAYS), {
    path: ["from"],
    message: "The range is too long",
  });
export type TurtleUsageInput = z.infer<typeof turtleUsageInputSchema>;

const count = z.number().int().nonnegative();

export const turtleUsageAcademySchema = z.object({
  academyId: z.uuid(),
  name: z.string(),
  slug: z.string(),
  activeNow: count,
  /** Distinct anonymous browsers. Not people, and never matched across academies. */
  devices: count,
  entries: count,
  runs: count,
  /** Within the retention window, whatever range was asked for. */
  lastUsedAt: z.iso.datetime().nullable(),
});
export type TurtleUsageAcademy = z.infer<typeof turtleUsageAcademySchema>;

export const turtleUsageBucketSchema = z.object({
  /** The start of the local hour or day, as an instant. */
  at: z.iso.datetime(),
  devices: count,
  entries: count,
  runs: count,
});
export type TurtleUsageBucket = z.infer<typeof turtleUsageBucketSchema>;

export const turtleUsageResultSchema = z.object({
  asOf: z.iso.datetime(),
  unit: z.enum(["hour", "day"]),
  academies: z.array(turtleUsageAcademySchema),
  /** Every hour or day of the range, empty ones included. */
  series: z.array(turtleUsageBucketSchema),
});
export type TurtleUsageResult = z.infer<typeof turtleUsageResultSchema>;
