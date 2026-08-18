import { z } from "zod";

import { academyRoleSchema, academyRoles, type AcademyRole } from "../auth/roles.js";

/**
 * What a member import is, and every rule that decides whether a row may be
 * committed.
 *
 * Import is the most dangerous thing a manager can do to an academy, so the
 * whole module is built around one constraint: **it can only create.** There is
 * no path here that edits a membership, renames an account, or changes a role
 * that already exists. §4 rules out silent updates, and a module with nowhere
 * to express one cannot grow the ability later by accident.
 *
 * The rest follows from that.
 *
 * Every verdict is a stable code, never a sentence. The interface renders each
 * code in the reader's language, the downloadable result CSV carries the code
 * itself, and a manager forwarding that CSV to support is forwarding something
 * both of them can look up. English error text baked into a response would be
 * neither translatable nor greppable.
 *
 * Every row keeps its original value beside its normalized one. `  ALICE@X.COM `
 * and `alice@x.com` are the same person, but a manager checking a preview needs
 * to see that the system agrees — and when it does not, the difference is what
 * tells them the spreadsheet has a problem.
 *
 * Nothing here parses a file. The workbook reader lives in the API, because it
 * deals with bytes and zip containers; this module receives cells that are
 * already strings and decides what they mean. That split is what lets every
 * rule below be tested without a fixture file.
 *
 * See §11 and §17 of the manager control tower and scalable people operations
 * design.
 */

/* --------------------------------------------------------------- limits */

/** §11 — the upload cap, before any parsing is attempted. */
export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
/** §11 — data rows, excluding the header. */
export const IMPORT_MAX_ROWS = 500;
/**
 * §17 — a single cell longer than this is refused rather than truncated.
 *
 * Truncation would silently import a different value than the one in the file,
 * which is exactly the class of surprise an import preview exists to prevent.
 * The bound is generous for a name or an address and far below the size at
 * which a crafted cell becomes a memory problem.
 */
export const IMPORT_MAX_CELL_LENGTH = 1_000;
/** §17 — more sheets than this is not a member list, it is something else. */
export const IMPORT_MAX_SHEETS = 8;
/** §8.2 — a preview older than this describes a roster that has moved on. */
export const IMPORT_PREVIEW_TTL_MS = 30 * 60 * 1_000;

/* -------------------------------------------------------------- template */

/**
 * The template's columns, in order.
 *
 * Snake case and English regardless of the reader's language. The header row is
 * an interface between a spreadsheet and a parser, and localizing it would mean
 * a Korean manager's file could not be opened by an English colleague — while
 * the *instructions* around it are translated, which is where the reader
 * actually needs their own language.
 */
export const importColumns = [
  "email",
  "role",
  "display_name",
  "send_invitation",
] as const;
export type ImportColumn = (typeof importColumns)[number];

export const requiredImportColumns: readonly ImportColumn[] = ["email", "role"];

/**
 * Header spellings accepted for each column.
 *
 * Real spreadsheets arrive with `Email`, `E-mail`, and `이메일` in the first
 * row, and refusing all three teaches managers that the importer is brittle
 * rather than that their file is wrong. The canonical name is what the template
 * ships with; these are what it will also understand.
 */
const headerAliases: Record<ImportColumn, readonly string[]> = {
  email: ["email", "e-mail", "email address", "이메일", "메일"],
  role: ["role", "역할", "권한"],
  display_name: ["display name", "name", "displayname", "이름", "성명"],
  send_invitation: ["send invitation", "invite", "sendinvitation", "초대"],
};

/** A header cell, reduced to something comparable. */
export function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase().replace(/[_\s]+/g, " ");
}

/**
 * Which column each header cell is, or null for one nobody asked for.
 *
 * Unknown columns are ignored rather than refused. A school's own export will
 * carry a student number and a class name, and demanding a stripped-down file
 * before the importer will look at it is how an import feature goes unused.
 */
export function mapHeaderRow(cells: string[]): (ImportColumn | null)[] {
  return cells.map((cell) => {
    const normalized = normalizeHeader(cell);
    const match = importColumns.find((column) =>
      headerAliases[column].includes(normalized),
    );
    return match ?? null;
  });
}

/** The sample rows the downloadable template ships with. */
export const importTemplateSamples: readonly string[][] = [
  ["student@example.com", "STUDENT", "Kim Minji", "true"],
  ["teacher@example.com", "TEACHER", "Park Jisoo", "true"],
];

/* ---------------------------------------------------------------- codes */

/**
 * Every reason a row cannot be committed.
 *
 * Stable strings, ordered from "the file is wrong" to "the academy already
 * disagrees". A code is added here before it can be produced anywhere, which is
 * what keeps the localized copy and the result CSV in step with the parser.
 */
export const importErrorCodes = [
  "email_missing",
  "email_invalid",
  "role_missing",
  "role_invalid",
  "duplicate_in_file",
  "membership_exists",
  "cell_too_long",
  "row_empty",
] as const;
export const importErrorCodeSchema = z.enum(importErrorCodes);
export type ImportErrorCode = z.infer<typeof importErrorCodeSchema>;

/**
 * Every reason a row deserves a second look but may still be committed.
 *
 * The distinction is exact: a warning describes something the manager might not
 * have intended, an error describes something the system cannot do. "This
 * person already has a pending invitation" is the first — importing them again
 * is a legitimate choice that resends nothing and creates nothing.
 */
export const importWarningCodes = [
  "invitation_pending",
  "display_name_normalized",
  "invitation_suppressed",
] as const;
export const importWarningCodeSchema = z.enum(importWarningCodes);
export type ImportWarningCode = z.infer<typeof importWarningCodeSchema>;

/** Why a whole workbook was refused, before any row was judged. */
export const importFileErrorCodes = [
  "file_too_large",
  "file_empty",
  "unsupported_format",
  "too_many_sheets",
  "too_many_rows",
  "missing_header",
  "missing_required_column",
  "unreadable",
] as const;
export const importFileErrorCodeSchema = z.enum(importFileErrorCodes);
export type ImportFileErrorCode = z.infer<typeof importFileErrorCodeSchema>;

/* ----------------------------------------------------------------- rows */

export const importRowStatuses = ["READY", "WARNING", "ERROR"] as const;
export const importRowStatusSchema = z.enum(importRowStatuses);
export type ImportRowStatus = z.infer<typeof importRowStatusSchema>;

export const importRowSchema = z
  .object({
    /** One-based, and counting the header, so it matches the spreadsheet. */
    rowNumber: z.number().int().min(1),
    status: importRowStatusSchema,
    /** Exactly as the cell read, for the preview's left-hand column. */
    original: z
      .object({
        email: z.string().max(IMPORT_MAX_CELL_LENGTH),
        role: z.string().max(IMPORT_MAX_CELL_LENGTH),
        displayName: z.string().max(IMPORT_MAX_CELL_LENGTH),
        sendInvitation: z.string().max(IMPORT_MAX_CELL_LENGTH),
      })
      .strict(),
    /** What would actually be created. Null where the row cannot be read. */
    normalized: z
      .object({
        email: z.email().nullable(),
        role: academyRoleSchema.nullable(),
        displayName: z.string().max(200).nullable(),
        sendInvitation: z.boolean(),
      })
      .strict(),
    errors: z.array(importErrorCodeSchema),
    warnings: z.array(importWarningCodeSchema),
  })
  .strict();
export type ImportRow = z.infer<typeof importRowSchema>;

/* ---------------------------------------------------------- normalization */

/**
 * A cell, made safe to look at.
 *
 * §17's formula rule lives here as well as in the parser. A cell beginning with
 * `=`, `+`, `-`, `@`, a tab, or a carriage return is a formula injection
 * payload the moment the result is opened in Excel, and the defence is applied
 * on the way *in* as well as on the way out: the value is kept as literal text
 * and never interpreted, so nothing downstream can be tricked into evaluating
 * it.
 */
export function sanitizeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // Control characters other than tab are stripped rather than preserved: they
  // cannot appear in a name, an email, or a role, and they are how a crafted
  // file smuggles a line break into a CSV export.
  return text.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "");
}

/** Whether a cell is longer than §17 allows. Checked before anything else. */
export function cellExceedsLimit(value: string): boolean {
  return value.length > IMPORT_MAX_CELL_LENGTH;
}

/**
 * An email, in the one form the platform stores.
 *
 * The same normalization the invitation service already applies, so a row that
 * previews as `alice@x.com` collides with the pending invitation for
 * `Alice@X.com` rather than creating a second one.
 */
export function normalizeImportEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * A deliberately conservative address check.
 *
 * Not RFC 5322 — a full-fidelity regex accepts addresses no mail provider will
 * route and is famously unreadable. This rejects what a spreadsheet actually
 * gets wrong: missing `@`, spaces, a missing dot in the domain, trailing
 * punctuation from a copy-paste.
 */
const emailPattern = /^[^\s@,;]+@[^\s@,;.]+(?:\.[^\s@,;.]+)+$/;

export function isImportableEmail(value: string): boolean {
  return value.length <= 200 && emailPattern.test(value);
}

/**
 * A role, from whatever the spreadsheet called it.
 *
 * Stable enum values are what the template ships and what the codes are, but
 * "Student", "student", and "학생" all arrive in real files. Accepting them is
 * not leniency for its own sake: the alternative is 500 error rows and a
 * manager retyping a column, which is the work the importer exists to remove.
 *
 * Anything not on this list is an error rather than a guess. A row that said
 * "Assistant" must not quietly become a Teacher.
 */
const roleAliases: Record<AcademyRole, readonly string[]> = {
  STUDENT: ["student", "학생", "수강생"],
  TEACHER: ["teacher", "선생님", "강사", "교사"],
  TEAM_LEAD: ["team_lead", "team lead", "teamlead", "lead", "팀리드", "팀장"],
  MANAGER: ["manager", "관리자", "매니저"],
};

export function normalizeImportRole(value: string): AcademyRole | null {
  const cleaned = value.trim().toLowerCase().replace(/[_\s]+/g, " ");
  if (cleaned.length === 0) return null;
  return (
    academyRoles.find(
      (role) =>
        role.toLowerCase().replace(/_/g, " ") === cleaned ||
        roleAliases[role].some(
          (alias) => alias.replace(/_/g, " ") === cleaned,
        ),
    ) ?? null
  );
}

/**
 * A display name, trimmed and collapsed.
 *
 * Returns the normalized name and whether it differs from what was typed. The
 * difference is a warning rather than a silent fix: double spaces in a name
 * usually mean the spreadsheet has a column-merge problem, and a manager who
 * sees "Kim  Minji → Kim Minji" learns something about their file.
 */
export function normalizeDisplayName(
  value: string,
): { value: string | null; changed: boolean } {
  const collapsed = value.trim().replace(/\s+/g, " ").slice(0, 200);
  if (collapsed.length === 0) return { value: null, changed: false };
  return { value: collapsed, changed: collapsed !== value };
}

/**
 * Whether to send this person an invitation. Absent means yes.
 *
 * The default is the useful one: a manager importing a class list wants those
 * people invited, and a column they left blank should not silently create
 * memberships nobody was told about. `false`, `no`, `0`, and `아니오` opt out.
 */
export function normalizeSendInvitation(value: string): boolean {
  const cleaned = value.trim().toLowerCase();
  if (cleaned.length === 0) return true;
  return !["false", "no", "n", "0", "off", "아니오", "아니요"].includes(cleaned);
}

/* -------------------------------------------------------------- verdicts */

/**
 * One row, judged on the file alone.
 *
 * Deliberately blind to the academy. Whether an email is well-formed and
 * whether a role exists are properties of the row; whether that person is
 * already a member is a property of the database, and mixing the two would make
 * this untestable without one. `applyAcademyFacts` below adds the second half.
 */
export function judgeImportRow(input: {
  rowNumber: number;
  email: string;
  role: string;
  displayName: string;
  sendInvitation: string;
}): ImportRow {
  const original = {
    email: input.email,
    role: input.role,
    displayName: input.displayName,
    sendInvitation: input.sendInvitation,
  };
  const errors: ImportErrorCode[] = [];
  const warnings: ImportWarningCode[] = [];

  const oversized = Object.values(original).some(cellExceedsLimit);
  if (oversized) {
    return {
      rowNumber: input.rowNumber,
      status: "ERROR",
      original,
      normalized: {
        email: null,
        role: null,
        displayName: null,
        sendInvitation: true,
      },
      errors: ["cell_too_long"],
      warnings: [],
    };
  }

  // A row where every cell is blank is a spreadsheet artefact — the trailing
  // rows Excel keeps after a deletion — not a member somebody failed to fill
  // in. It is reported so the count adds up, and never as four separate errors.
  const blank = Object.values(original).every(
    (cell) => cell.trim().length === 0,
  );
  if (blank) {
    return {
      rowNumber: input.rowNumber,
      status: "ERROR",
      original,
      normalized: {
        email: null,
        role: null,
        displayName: null,
        sendInvitation: true,
      },
      errors: ["row_empty"],
      warnings: [],
    };
  }

  const emailText = normalizeImportEmail(input.email);
  let email: string | null = null;
  if (emailText.length === 0) errors.push("email_missing");
  else if (!isImportableEmail(emailText)) errors.push("email_invalid");
  else email = emailText;

  const roleText = input.role.trim();
  let role: AcademyRole | null = null;
  if (roleText.length === 0) errors.push("role_missing");
  else {
    role = normalizeImportRole(roleText);
    if (role === null) errors.push("role_invalid");
  }

  const name = normalizeDisplayName(input.displayName);
  if (name.changed) warnings.push("display_name_normalized");

  const sendInvitation = normalizeSendInvitation(input.sendInvitation);

  return {
    rowNumber: input.rowNumber,
    status: errors.length > 0 ? "ERROR" : warnings.length > 0 ? "WARNING" : "READY",
    original,
    normalized: {
      email,
      role,
      displayName: name.value,
      sendInvitation,
    },
    errors,
    warnings,
  };
}

/**
 * The second half of the verdict: what the academy already knows.
 *
 * Applied as a separate pass so the file rules above stay pure, and so the
 * database is consulted once for the whole workbook rather than once per row.
 *
 * `duplicate_in_file` marks *every* row of a colliding group, not just the
 * later ones. A manager whose spreadsheet has the same address twice needs to
 * find both, and flagging only the second implies the first is the good one —
 * which nobody has established.
 */
export function applyAcademyFacts(
  rows: ImportRow[],
  facts: {
    existingMemberEmails: ReadonlySet<string>;
    pendingInvitationEmails: ReadonlySet<string>;
  },
): ImportRow[] {
  const seen = new Map<string, number>();
  for (const row of rows) {
    const email = row.normalized.email;
    if (!email) continue;
    seen.set(email, (seen.get(email) ?? 0) + 1);
  }

  return rows.map((row) => {
    const email = row.normalized.email;
    if (!email) return row;

    const errors = [...row.errors];
    const warnings = [...row.warnings];

    if ((seen.get(email) ?? 0) > 1 && !errors.includes("duplicate_in_file")) {
      errors.push("duplicate_in_file");
    }
    if (facts.existingMemberEmails.has(email)) {
      errors.push("membership_exists");
    }
    if (facts.pendingInvitationEmails.has(email)) {
      warnings.push("invitation_pending");
      // The row commits, and creates nothing. Saying so in the preview is what
      // stops a manager concluding the import silently failed for this person.
      if (!warnings.includes("invitation_suppressed")) {
        warnings.push("invitation_suppressed");
      }
    }

    return {
      ...row,
      errors,
      warnings,
      status:
        errors.length > 0 ? "ERROR" : warnings.length > 0 ? "WARNING" : "READY",
    };
  });
}

/** The three counts a preview leads with. */
export function summarizeRows(rows: ImportRow[]): {
  total: number;
  ready: number;
  warning: number;
  error: number;
} {
  return {
    total: rows.length,
    ready: rows.filter((row) => row.status === "READY").length,
    warning: rows.filter((row) => row.status === "WARNING").length,
    error: rows.filter((row) => row.status === "ERROR").length,
  };
}

/**
 * §11 — any error blocks the commit, and unacknowledged warnings block it too.
 *
 * One function rather than a check at each call site. The commit endpoint, the
 * preview response, and the button's disabled state all have to agree about
 * what "committable" means, and three implementations of that is how a button
 * ends up enabled for a workbook the server will refuse.
 */
export function canCommitPreview(input: {
  rows: ImportRow[];
  warningsAcknowledged: boolean;
}): boolean {
  const summary = summarizeRows(input.rows);
  if (summary.error > 0) return false;
  if (summary.total === 0) return false;
  if (summary.warning > 0 && !input.warningsAcknowledged) return false;
  return true;
}

/* --------------------------------------------------------------- export */

/**
 * §17 — a CSV cell that a spreadsheet will not execute.
 *
 * A value beginning with `=`, `+`, `-`, `@`, tab, or carriage return is a
 * formula the moment the file is double-clicked, and the result export is a
 * file managers are explicitly invited to open. The defence is a leading
 * apostrophe, which Excel, Numbers, and LibreOffice all treat as "the rest is
 * text", followed by normal RFC 4180 quoting.
 *
 * Applied to every cell rather than to the ones that look dangerous: the cells
 * here carry email addresses and names supplied by whoever wrote the workbook,
 * and "which of these came from a user" is not a question this function should
 * have to get right.
 */
export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** A whole CSV, with CRLF line endings so Excel opens it without complaint. */
export function toCsv(rows: (string | number | null)[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

/* -------------------------------------------------------------- contract */

export const importPreviewStatuses = [
  "PREVIEW_READY",
  "COMMITTING",
  "COMPLETED",
  "EXPIRED",
  "FAILED",
] as const;
export const importPreviewStatusSchema = z.enum(importPreviewStatuses);
export type ImportPreviewStatus = z.infer<typeof importPreviewStatusSchema>;

export const importPreviewSchema = z
  .object({
    sessionId: z.uuid(),
    status: importPreviewStatusSchema,
    originalFilename: z.string().min(1).max(255),
    total: z.number().int().nonnegative(),
    ready: z.number().int().nonnegative(),
    warning: z.number().int().nonnegative(),
    error: z.number().int().nonnegative(),
    rows: z.array(importRowSchema).max(IMPORT_MAX_ROWS),
    /** §8.1 — what the commit must still agree with. */
    peopleRevision: z.number().int().nonnegative(),
    expiresAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type ImportPreview = z.infer<typeof importPreviewSchema>;

export const importResultRowSchema = z
  .object({
    rowNumber: z.number().int().min(1),
    email: z.string().max(200),
    outcome: z.enum(["invited", "skipped", "failed"]),
    /** A stable code, never a sentence. The CSV carries this verbatim. */
    code: z.string().max(64),
  })
  .strict();
export type ImportResultRow = z.infer<typeof importResultRowSchema>;

export const importResultSchema = z
  .object({
    sessionId: z.uuid(),
    status: importPreviewStatusSchema,
    invited: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    rows: z.array(importResultRowSchema).max(IMPORT_MAX_ROWS),
    committedAt: z.iso.datetime().nullable(),
  })
  .strict();
export type ImportResult = z.infer<typeof importResultSchema>;

export const commitImportInputSchema = z
  .object({
    academyId: z.uuid(),
    sessionId: z.uuid(),
    /** §11 — explicit, and refused when the preview holds warnings without it. */
    acknowledgeWarnings: z.boolean().default(false),
    /**
     * §8.2 — the revision the manager was looking at.
     *
     * Sent by the browser rather than read from the session so a preview opened
     * in two tabs cannot have one tab's commit succeed against the other tab's
     * understanding of the roster.
     */
    peopleRevision: z.number().int().nonnegative(),
  })
  .strict();
export type CommitImportInput = z.infer<typeof commitImportInputSchema>;

export const getImportSessionInputSchema = z
  .object({ academyId: z.uuid(), sessionId: z.uuid() })
  .strict();
