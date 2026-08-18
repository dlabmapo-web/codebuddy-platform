import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  academyInvitationDetailSchema,
} from "../../memberships/academy.js";
import {
  invitationDeliverySchema,
  resendInvitationInputSchema,
} from "../../memberships/invitation-delivery.js";
import {
  bulkPreviewSchema,
  bulkResultSchema,
  previewBulkInputSchema,
  runBulkInputSchema,
} from "../../memberships/people-bulk.js";
import {
  commitImportInputSchema,
  getImportSessionInputSchema,
  importPreviewSchema,
  importResultSchema,
} from "../../memberships/people-import.js";

/**
 * The Stage 2 people operations: import, bulk mutations, and delivery.
 *
 * The upload itself is deliberately absent. A workbook is five megabytes of
 * binary and the contract model carries JSON — base64 in a JSON string is a
 * third larger and has to be decoded twice — so the file is posted to a plain
 * controller, exactly as profile images are, and everything *after* the bytes
 * lands lives here.
 *
 * The two-call shape of both import and bulk is the design, not an accident of
 * HTTP. §11 and §12 require a manager to be shown what will happen and to
 * approve it, so "work out what this would do" and "do it" are separate
 * procedures with separate authorization and separate rate limits. A single
 * endpoint with a `dryRun` flag would put the safety of the whole feature on
 * one boolean.
 *
 * The exported results are procedures rather than files. The browser builds the
 * CSV from the rows, using the shared escaping in `people-import.ts`, which
 * keeps the one place that decides how a cell is quoted the same for both.
 */
export const academyPeopleImportContract = {
  /** The session created by the upload controller, or its committed result. */
  get: oc.input(getImportSessionInputSchema).output(importPreviewSchema),
  commit: oc.input(commitImportInputSchema).output(importResultSchema),
  result: oc.input(getImportSessionInputSchema).output(importResultSchema),
};

export const academyPeopleBulkContract = {
  preview: oc.input(previewBulkInputSchema).output(bulkPreviewSchema),
  run: oc.input(runBulkInputSchema).output(bulkResultSchema),
};

export const academyInvitationDeliveryContract = {
  /**
   * Invitations with their latest delivery attempt.
   *
   * A separate read from `academyInvitations.list` rather than a widening of
   * it: that endpoint is used by surfaces that have no business knowing a
   * parent's email bounced, and delivery evidence should be asked for.
   */
  list: oc
    .input(z.object({ academyId: z.uuid() }).strict())
    .output(
      z.object({
        invitations: z.array(
          z
            .object({
              invitation: academyInvitationDetailSchema,
              delivery: invitationDeliverySchema.nullable(),
            })
            .strict(),
        ),
      }),
    ),
  resend: oc
    .input(resendInvitationInputSchema)
    .output(
      z
        .object({
          invitation: academyInvitationDetailSchema,
          delivery: invitationDeliverySchema,
        })
        .strict(),
    ),
};
