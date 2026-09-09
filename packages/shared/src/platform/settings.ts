import { z } from "zod";

import { academyFeatureStateSchema } from "../memberships/academy-features.js";
import { pointPolicySchema } from "../points/policy.js";
import { academySlugSchema, academyStatusSchema } from "./academy.js";

/**
 * Every academy's configuration, side by side.
 *
 * The console's questions are the plural of the academy's own. A manager asks
 * *what does my academy have on*; an operator asks *which academies have points
 * on*, and *why does this one pay less for a hard problem than that one*. The
 * same rows answer both, and only the second needs them all at once.
 *
 * No pagination. These boards are read across, not down — the whole point is
 * comparing academies to each other, and a page break in the middle of that
 * comparison hides exactly what the reader came for. `PLATFORM_SETTINGS_MAX`
 * is the ceiling that keeps the promise honest; past it the board says so
 * rather than quietly answering about a subset.
 */
export const PLATFORM_SETTINGS_MAX = 200;

const academyIdentitySchema = {
  academyId: z.uuid(),
  academySlug: academySlugSchema,
  academyName: z.string().min(1),
  status: academyStatusSchema,
};

export const listPlatformSettingsInputSchema = z
  .object({
    /** Matches name or slug. Absent means every academy. */
    search: z.string().trim().max(120).optional(),
  })
  .strict();
export type ListPlatformSettingsInput = z.infer<
  typeof listPlatformSettingsInputSchema
>;

export const platformAcademyFeatureRowSchema = z
  .object({
    ...academyIdentitySchema,
    /**
     * Every feature, including the ones this academy has never written a row
     * for. A board with gaps where the defaults are would read as missing data
     * rather than as "off", and the operator cannot tell those apart.
     */
    features: z.array(academyFeatureStateSchema),
  })
  .strict();
export type PlatformAcademyFeatureRow = z.infer<
  typeof platformAcademyFeatureRowSchema
>;

export const platformAcademyPointPolicyRowSchema = z
  .object({
    ...academyIdentitySchema,
    /**
     * Whether the numbers below pay anybody. A policy exists for every academy
     * — the defaults are real values — so without this the board would show
     * forty academies paying 10 for a hard problem and none of them doing it.
     */
    pointsEnabled: z.boolean(),
    /** True where no row was ever saved, so these are the platform defaults. */
    isDefault: z.boolean(),
    policy: pointPolicySchema,
  })
  .strict();
export type PlatformAcademyPointPolicyRow = z.infer<
  typeof platformAcademyPointPolicyRowSchema
>;

const boardSchema = <T extends z.ZodTypeAny>(row: T) =>
  z
    .object({
      rows: z.array(row),
      /** Academies matching the search, which may exceed the rows returned. */
      total: z.number().int().nonnegative(),
      /** True when `total` outran the ceiling and the board is a subset. */
      truncated: z.boolean(),
    })
    .strict();

export const platformFeatureBoardSchema = boardSchema(
  platformAcademyFeatureRowSchema,
);
export type PlatformFeatureBoard = z.infer<typeof platformFeatureBoardSchema>;

export const platformPointPolicyBoardSchema = boardSchema(
  platformAcademyPointPolicyRowSchema,
);
export type PlatformPointPolicyBoard = z.infer<
  typeof platformPointPolicyBoardSchema
>;
