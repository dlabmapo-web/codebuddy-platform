import { z } from "zod";

import { CONTENT_IMPORT_PREVIEW_VALUE_LENGTH } from "./limits.js";
import { contentImportSheets } from "./sheets.js";

/**
 * Everything that can be wrong with a workbook, as codes rather than sentences.
 *
 * §14 draws the line precisely: the API returns data, the browser owns the
 * words. A server that answered "difficulty를 확인하세요" would be untranslatable
 * for an English Team Lead, ungreppable in a log, and unusable as a condition —
 * and the v1 importer did exactly that. Every code below is looked up in a
 * complete English and Korean catalog, and the downloadable issue report
 * carries the code itself so a Team Lead forwarding it to support is forwarding
 * something both of them can look up.
 *
 * Severity is the other half. §6 is emphatic that Warning and Conflict are
 * *annotations on an action*, not alternative actions: a problem that is being
 * updated while students can see it is still an UPDATE, and it still commits —
 * once somebody has said out loud that they meant to. An ERROR or a CONFLICT
 * blocks the entire session, because §6 does not offer a partial committable
 * subset: importing the half of a curriculum that happened to parse is how a
 * course ends up in a state nobody designed.
 *
 * See §4.5, §6, and §14 of the team lead Excel problem import design.
 */

/* ------------------------------------------------------------- severity */

export const contentImportSeverities = ["ERROR", "CONFLICT", "WARNING"] as const;
export const contentImportSeveritySchema = z.enum(contentImportSeverities);
export type ContentImportSeverity = z.infer<typeof contentImportSeveritySchema>;

/**
 * ERROR and CONFLICT both block; they differ in what the Team Lead has to do.
 *
 * An ERROR is a cell they can fix by looking at the row the issue names — a
 * misspelled difficulty, a missing expected output. A CONFLICT is a
 * disagreement between the workbook and the course that already exists, and
 * fixing it usually means deciding something rather than correcting something.
 * Separating them is what lets the preview say "twelve typos" and "one problem
 * you are trying to move" instead of "thirteen problems".
 */
export function severityBlocks(severity: ContentImportSeverity): boolean {
  return severity !== "WARNING";
}

/* ---------------------------------------------------------------- codes */

/**
 * §5.7 and §6 — a malformed cell, or a row that cannot be read at all.
 *
 * Ordered roughly by where in the pipeline they are produced: shape of the
 * file, then shape of the row, then shape of the value.
 */
export const contentImportErrorCodes = [
  "sheet_missing",
  "column_missing",
  "column_duplicated",
  "row_blank",
  "key_missing",
  "key_invalid",
  "title_missing",
  "title_too_long",
  "text_too_long",
  "code_too_long",
  "difficulty_missing",
  "difficulty_invalid",
  "description_missing",
  "description_format_invalid",
  "boolean_invalid",
  "order_missing",
  "order_invalid",
  "visibility_missing",
  "visibility_invalid",
  "expected_output_missing",
  "hint_content_missing",
  "formula_cell",
  "too_many_problems",
  "too_many_tests",
  "too_many_hints",
  "tests_missing",
  "sample_test_missing",
] as const;
export const contentImportErrorCodeSchema = z.enum(contentImportErrorCodes);
export type ContentImportErrorCode = z.infer<
  typeof contentImportErrorCodeSchema
>;

/**
 * §6 — the workbook and the course disagree about identity or placement.
 *
 * Every one of these is a question only the Team Lead can answer. The importer
 * refusing to answer it for them is the feature: `parent_conflict` exists
 * because §12 does not move content between parents, and a workbook that tries
 * to is far more likely to be a typo in a `lecture_key` than a deliberate
 * restructuring.
 */
export const contentImportConflictCodes = [
  "duplicate_key_in_workbook",
  "parent_conflict",
  "title_conflict",
  "order_conflict",
  "orphan_lecture_reference",
  "orphan_problem_reference",
  "structure_contradiction",
  "duplicate_order_in_workbook",
] as const;
export const contentImportConflictCodeSchema = z.enum(
  contentImportConflictCodes,
);
export type ContentImportConflictCode = z.infer<
  typeof contentImportConflictCodeSchema
>;

/**
 * §6 — something worth a second look that still commits.
 *
 * The list is short on purpose. Every warning here describes an effect on
 * *students*, or on content a Team Lead may not realise they are touching:
 * updating something a class can currently see, replacing a problem's tests
 * mid-term, or clearing hints by leaving a sheet empty. A warning that fires on
 * something harmless trains people to acknowledge without reading, which costs
 * more than it saves.
 */
export const contentImportWarningCodes = [
  "updates_visible_content",
  "replaces_test_cases",
  "clears_hints",
  "unknown_sheet_ignored",
  "unknown_column_ignored",
  "grading_revision_advances",
] as const;
export const contentImportWarningCodeSchema = z.enum(
  contentImportWarningCodes,
);
export type ContentImportWarningCode = z.infer<
  typeof contentImportWarningCodeSchema
>;

export const contentImportIssueCodes = [
  ...contentImportErrorCodes,
  ...contentImportConflictCodes,
  ...contentImportWarningCodes,
] as const;
export const contentImportIssueCodeSchema = z.enum(contentImportIssueCodes);
export type ContentImportIssueCode = z.infer<
  typeof contentImportIssueCodeSchema
>;

/* --------------------------------------------------------------- issues */

/**
 * One issue, located precisely enough to fix without searching.
 *
 * §4.5 lists what a Team Lead needs and this schema is that list: which sheet,
 * which row *as Excel numbers it*, which column, what was received. Anything
 * less turns "fix your workbook" into a scavenger hunt across four sheets.
 *
 * `rowNumber` counts the visible header, so it matches the number in the
 * spreadsheet's own gutter. Off-by-one here is not a cosmetic bug: it sends a
 * Team Lead to the wrong row, where they find a value that looks fine.
 */
export const contentImportIssueSchema = z
  .object({
    severity: contentImportSeveritySchema,
    code: contentImportIssueCodeSchema,
    /** Null for issues about the file as a whole rather than one row. */
    sheet: z.enum(contentImportSheets).nullable(),
    /** One-based and counting the header row, exactly as Excel displays it. */
    rowNumber: z.number().int().min(1).nullable(),
    /** The canonical column name, never a localized one. */
    column: z.string().max(64).nullable(),
    /** Truncated and flattened for display; never re-parsed. */
    received: z.string().max(CONTENT_IMPORT_PREVIEW_VALUE_LENGTH).nullable(),
    /**
     * The stable key the issue belongs to, when there is one.
     *
     * Lets the preview attach an issue to its node in the hierarchy tree rather
     * than only to a row in a flat list, which is what makes "this module has a
     * problem somewhere inside it" visible without expanding everything.
     */
    entityKey: z.string().max(80).nullable(),
  })
  .strict();
export type ContentImportIssue = z.infer<typeof contentImportIssueSchema>;

/** The counts the Review stage leads with. */
export function summarizeIssues(issues: readonly ContentImportIssue[]): {
  errors: number;
  conflicts: number;
  warnings: number;
} {
  return {
    errors: issues.filter((issue) => issue.severity === "ERROR").length,
    conflicts: issues.filter((issue) => issue.severity === "CONFLICT").length,
    warnings: issues.filter((issue) => issue.severity === "WARNING").length,
  };
}

export function hasBlockingIssue(
  issues: readonly ContentImportIssue[],
): boolean {
  return issues.some((issue) => severityBlocks(issue.severity));
}
