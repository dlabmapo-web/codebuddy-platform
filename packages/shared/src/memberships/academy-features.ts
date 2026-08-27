import { z } from "zod";

/**
 * Per-academy feature switches.
 *
 * An enum rather than a free string so a typo cannot silently read as "off"
 * for every academy — the failure a string key produces is a feature that
 * quietly never appears, which is the hardest kind to notice.
 *
 * Every feature is on for a new academy. They began as rollout gates, default
 * off, from a time when each was reaching its first academy; that time has
 * passed, and the gates outlived it — an academy created today would find
 * monitoring and ranking dead with no way to revive them, because nothing in
 * the application could write these rows. A manager now decides, and the
 * decision starts where an academy that wants the whole product would put it.
 */
export const academyFeatureNames = [
  "TEACHER_LIVE_MONITORING",
  "STUDENT_CLASS_STANDING",
  "STUDENT_POINTS",
  "STUDENT_CLASS_LEADERBOARD",
] as const;

export const academyFeatureNameSchema = z.enum(academyFeatureNames);
export type AcademyFeatureName = z.infer<typeof academyFeatureNameSchema>;

/**
 * The named class board is computed from the point ledger, so it cannot stand
 * on its own: with points off there is nothing to rank. Enforced rather than
 * merely documented, because the pair that disagrees renders an empty board
 * and reads as a bug.
 */
export const academyFeatureRequires: Partial<
  Record<AcademyFeatureName, AcademyFeatureName>
> = {
  STUDENT_CLASS_LEADERBOARD: "STUDENT_POINTS",
};

export const academyFeatureStateSchema = z.object({
  feature: academyFeatureNameSchema,
  isEnabled: z.boolean(),
});
export type AcademyFeatureState = z.infer<typeof academyFeatureStateSchema>;

export const academyFeatureListSchema = z.object({
  features: z.array(academyFeatureStateSchema),
});
export type AcademyFeatureList = z.infer<typeof academyFeatureListSchema>;

export const listAcademyFeaturesSchema = z.object({ academyId: z.uuid() });

export const setAcademyFeatureSchema = z.object({
  academyId: z.uuid(),
  feature: academyFeatureNameSchema,
  isEnabled: z.boolean(),
});
