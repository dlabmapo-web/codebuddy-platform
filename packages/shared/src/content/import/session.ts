import { z } from "zod";

import { toCsv } from "../../memberships/people-import.js";
import {
  contentImportIssueSchema,
  type ContentImportIssue,
} from "./issues.js";
import {
  CONTENT_IMPORT_MAX_RESULT_ENTITIES,
  CONTENT_IMPORT_TEMPLATE_VERSION,
} from "./limits.js";
import {
  contentImportCountsSchema,
  contentImportPlanSchema,
} from "./plan.js";

/**
 * The durable side of an import: the session, the preview it holds, and the
 * receipt it becomes.
 *
 * §9.3 makes the session a database row rather than a cache entry, and the
 * reason is §4.6's last paragraph: if the commit response is lost on the wire
 * *after* the transaction committed, retrying must return what happened rather
 * than importing the course a second time. A session that lived in memory could
 * not answer that question after a deploy, and a Team Lead refreshing the page
 * would be shown a preview of changes that had already been applied.
 *
 * The session is academy- and course-owned, and §8 is deliberate about what the
 * failure looks like when it is not yours: one code covers a session that never
 * existed, one belonging to another course, and one belonging to another
 * academy. Three distinguishable answers would let a Team Lead in Academy A
 * discover that a session id is real, which is an existence oracle across a
 * tenant boundary.
 *
 * See §8 and §9.3 of the team lead Excel problem import design.
 */

export const contentImportStatuses = [
  "PREVIEW_READY",
  "COMMITTING",
  "COMPLETED",
  "FAILED",
  "EXPIRED",
] as const;
export const contentImportStatusSchema = z.enum(contentImportStatuses);
export type ContentImportStatus = z.infer<typeof contentImportStatusSchema>;

/* -------------------------------------------------------------- preview */

export const contentImportPreviewSchema = z
  .object({
    sessionId: z.uuid(),
    academyId: z.uuid(),
    courseId: z.uuid(),
    status: contentImportStatusSchema,
    originalFilename: z.string().min(1).max(255),
    templateVersion: z.number().int().positive(),
    plan: contentImportPlanSchema,
    counts: contentImportCountsSchema,
    /**
     * §9.2 — the course revision the plan was computed against.
     *
     * Round-tripped through the browser and compared again inside the commit
     * transaction. `Course.updatedAt` could not do this job: adding a test case
     * to a problem does not touch the course row, so a preview would survive an
     * edit that invalidated it.
     */
    contentRevision: z.number().int().nonnegative(),
    expiresAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type ContentImportPreview = z.infer<typeof contentImportPreviewSchema>;

/* --------------------------------------------------------------- result */

/**
 * One entity the commit touched, and where to find it.
 *
 * §4.6 links from the Result stage straight to the affected problems, because
 * the next thing a Team Lead does after importing forty problems is look at
 * one. Carrying the ids here means that link needs no second round trip.
 */
export const contentImportResultEntitySchema = z
  .object({
    kind: z.enum(["MODULE", "LECTURE", "PROBLEM"]),
    key: z.string().max(80),
    title: z.string().max(200),
    action: z.enum(["CREATE", "UPDATE", "UNCHANGED"]),
    /** The Material id for a problem, the entity's own id otherwise. */
    id: z.uuid(),
    /** Populated for problems, so the result can link into the builder. */
    lectureId: z.uuid().nullable(),
  })
  .strict();
export type ContentImportResultEntity = z.infer<
  typeof contentImportResultEntitySchema
>;

export const contentImportResultSchema = z
  .object({
    sessionId: z.uuid(),
    status: contentImportStatusSchema,
    created: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    entities: z
      .array(contentImportResultEntitySchema)
      .max(CONTENT_IMPORT_MAX_RESULT_ENTITIES),
    /** The revision the course reached, for the builder's next read. */
    contentRevision: z.number().int().nonnegative(),
    committedAt: z.iso.datetime().nullable(),
    failureCode: z.string().max(64).nullable(),
  })
  .strict();
export type ContentImportResult = z.infer<typeof contentImportResultSchema>;

/* -------------------------------------------------------------- inputs */

export const contentImportSessionInputSchema = z
  .object({
    academyId: z.uuid(),
    courseId: z.uuid(),
    sessionId: z.uuid(),
  })
  .strict();
export type ContentImportSessionInput = z.infer<
  typeof contentImportSessionInputSchema
>;

export const commitContentImportInputSchema = contentImportSessionInputSchema
  .extend({
    /**
     * §11 step 7 — the revision the browser was showing.
     *
     * Sent by the client rather than read from the session, so a preview opened
     * in two tabs cannot have one tab's commit succeed against the other tab's
     * understanding of the course.
     */
    contentRevision: z.number().int().nonnegative(),
    /** §4.5 — explicit, and refused when the plan holds warnings without it. */
    acknowledgeWarnings: z.boolean().default(false),
  })
  .strict();
export type CommitContentImportInput = z.infer<
  typeof commitContentImportInputSchema
>;

/**
 * §4.3 — which workbook the Prepare stage is asking for.
 *
 * The scope arrays exist because §4.3 caps a generated workbook at the same 200
 * problems the importer accepts. A larger course is exported branch by branch
 * rather than being handed a file that cannot be uploaded again — Cove never
 * generates something its own importer would refuse.
 */
export const contentImportTemplateQuerySchema = z
  .object({
    academyId: z.uuid(),
    courseId: z.uuid(),
    kind: z.enum(["current", "blank"]),
    locale: z.enum(["en", "ko"]).default("en"),
    moduleIds: z.array(z.uuid()).max(200).default([]),
    lectureIds: z.array(z.uuid()).max(500).default([]),
  })
  .strict();
export type ContentImportTemplateQuery = z.infer<
  typeof contentImportTemplateQuerySchema
>;

/* ---------------------------------------------------------- issue report */

/**
 * §4.5 — the issue list as a file, for the error sets nobody scrolls through.
 *
 * The header is English and canonical for the same reason the workbook's is: a
 * Team Lead forwarding this to support is forwarding something both of them can
 * read. Cells go through the shared CSV escaper, which prefixes anything
 * starting with `=`, `+`, `-`, or `@` — the report is a file people are
 * explicitly invited to open in Excel, and a `received` value came from an
 * untrusted workbook.
 */
export function issuesToCsv(issues: readonly ContentImportIssue[]): string {
  return toCsv([
    ["severity", "code", "sheet", "row", "column", "key", "received"],
    ...issues.map((issue) => [
      issue.severity,
      issue.code,
      issue.sheet ?? "",
      issue.rowNumber ?? "",
      issue.column ?? "",
      issue.entityKey ?? "",
      issue.received ?? "",
    ]),
  ]);
}

/** The filename the browser saves an issue report under. */
export function issueReportFilename(originalFilename: string): string {
  const base = originalFilename.replace(/\.[^.]+$/, "").slice(0, 80);
  return `${base || "import"}-issues.csv`;
}

/** Re-exported so callers need one import to know which workbook they hold. */
export const contentImportTemplateVersion = CONTENT_IMPORT_TEMPLATE_VERSION;

export const contentImportIssueListSchema = z.array(contentImportIssueSchema);
