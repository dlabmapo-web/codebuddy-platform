import { oc } from "@orpc/contract";

import {
  listPlatformRankingInputSchema,
  listPlatformRankingResultSchema,
} from "../../platform/class-ranking.js";

/**
 * Every academy's classes, ordered by what their students earned.
 *
 * One method, and it reads. The board an operator opens from a row is
 * `points.getClassBoard` and the ledger they open from the board is
 * `points.getPage` — both already answer an operator through the platform
 * branch of `AcademyAccessService`, so this contract deliberately has no twin
 * of either. A platform copy of a ranking would be a second implementation of
 * the thing that must never have two: a manager, a teacher, a student and an
 * operator comparing screens have to see the same third place.
 *
 * Nothing here returns a student. Rows are class aggregates — counts and sums —
 * which is what lets this sit behind `platform.analytics.read` while reading a
 * child's ledger stays behind the wider `platform.academies.inspect`.
 */
export const platformRankingContract = {
  classes: oc
    .input(listPlatformRankingInputSchema)
    .output(listPlatformRankingResultSchema),
};
