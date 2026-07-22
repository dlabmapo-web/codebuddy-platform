import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("cove-api"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const databaseReadinessResponseSchema = healthResponseSchema.extend({
  database: z.literal("reachable"),
});

export type DatabaseReadinessResponse = z.infer<
  typeof databaseReadinessResponseSchema
>;
