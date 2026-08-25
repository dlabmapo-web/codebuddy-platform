import { oc } from "@orpc/contract";

import {
  commitContentImportInputSchema,
  contentImportPreviewSchema,
  contentImportResultSchema,
  contentImportSessionInputSchema,
} from "../../content/import/session.js";

/**
 * The typed half of the curriculum importer.
 *
 * The upload and the two workbook downloads are absent on purpose. §8 posts the
 * workbook as raw bytes to an ordinary controller, exactly as the member
 * importer and profile images do: the contract layer carries JSON, and ten
 * megabytes of spreadsheet base64-encoded into a JSON string is a third larger
 * and gets decoded twice. Everything *after* the bytes land is an ordinary
 * typed call and lives here.
 *
 * Preview and commit are separate procedures rather than one call with a
 * `dryRun` flag. §4.2 forbids skipping Review, and a boolean is a poor place to
 * keep the safety of a feature that rewrites a curriculum — the two have
 * different authorization, different rate limits, and different consequences,
 * and separating them makes each of those explicit rather than conditional.
 *
 * `result` exists beside `commit` for the case §4.6 names: the commit
 * succeeded and the response was lost. Retrying `commit` with the same session
 * returns the stored result rather than importing twice, and `result` is how a
 * reloaded page asks the same question without sending a mutation at all.
 */
export const academyContentImportsContract = {
  /** The stored plan for a session, as it was computed at upload. */
  getPreview: oc
    .input(contentImportSessionInputSchema)
    .output(contentImportPreviewSchema),
  commit: oc
    .input(commitContentImportInputSchema)
    .output(contentImportResultSchema),
  getResult: oc
    .input(contentImportSessionInputSchema)
    .output(contentImportResultSchema),
};
