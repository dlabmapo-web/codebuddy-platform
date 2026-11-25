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
  "SERVER_SAMPLE_CHECKS",
  "EXAMS",
  "AI_ASSISTANT",
] as const;

export const academyFeatureNameSchema = z.enum(academyFeatureNames);
export type AcademyFeatureName = z.infer<typeof academyFeatureNameSchema>;

/**
 * Features still being rolled out, which a new academy does *not* start with.
 *
 * Tests (exams) and server-checked samples left this set in v2.0.73: they are
 * on for every academy by default, like the rest, and migration 20261124100000
 * turned them on for the academies that already existed. The AI assistant
 * starts here, switched on academy by academy.
 *
 * Server-checked samples send to the judge only the Python problems the browser
 * cannot judge itself (`comparesSampleLocally`): weighted grading and ignored
 * input prompts. Python samples run there one at a time, and the slot reserved
 * for submissions keeps official grading safe.
 */
export const academyRolloutFeatures: ReadonlySet<AcademyFeatureName> = new Set<AcademyFeatureName>(["AI_ASSISTANT"]);

/**
 * Features only a platform operator may switch.
 *
 * Cove pays for every AI call, so an academy's own manager neither sees nor
 * changes this one; the console's feature board does.
 */
export const academyOperatorFeatures: ReadonlySet<AcademyFeatureName> = new Set<AcademyFeatureName>(["AI_ASSISTANT"]);

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
