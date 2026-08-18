import { z } from "zod";

import { academyRoleSchema } from "../auth/roles.js";
import { membershipStatusSchema, membershipStatuses } from "./status.js";
import { academyRoles } from "../auth/roles.js";

/**
 * Bulk mutations: what a manager may ask for, and what they are told before it
 * happens.
 *
 * §12's rules, expressed as types wherever a type can carry them.
 *
 * A selection is a filter, never a list of two thousand ids. "Select all
 * matching results" sends the normalized filter plus the rows the manager
 * unticked, and the server resolves it inside the same transaction that
 * mutates. Expanding it in the browser would be both the payload the directory
 * was built to avoid and a lie the moment somebody else changes a membership
 * mid-scroll.
 *
 * Nothing is applied without a preview. Every kind here has consequences a
 * manager cannot see from the table — suspending a teacher strands the classes
 * they run, changing a Student to a Teacher drops their enrolments — and §12
 * requires those on screen *before* the confirmation, not in the result.
 *
 * Every request carries an idempotency key. A bulk mutation whose response was
 * lost on the wire is the one case where "just try again" is catastrophic, and
 * a durable key is the only answer that works when the first attempt did in
 * fact commit.
 */

/* ------------------------------------------------------------------ kinds */

export const peopleBulkKinds = [
  "ENROLL",
  "ROLE_CHANGE",
  "SUSPEND",
  "RESTORE",
] as const;
export const peopleBulkKindSchema = z.enum(peopleBulkKinds);
export type PeopleBulkKind = z.infer<typeof peopleBulkKindSchema>;

/** §15 — no single operation may touch more than this in one transaction. */
export const BULK_MAX_TARGETS = 500;

/* -------------------------------------------------------------- selection */

/**
 * Who an operation applies to.
 *
 * Two shapes, and they are not interchangeable. `ids` is what ticking eight
 * checkboxes produces; `filter` is what "select all 1,840 matching results"
 * produces, and it carries the exclusions because a manager who selected
 * everything and then unticked two people means exactly that.
 *
 * A discriminated union rather than an optional-everything object: a request
 * that supplied both would have no defensible meaning, and this makes writing
 * one impossible rather than merely discouraged.
 */
export const peopleSelectionSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("ids"),
      membershipIds: z.array(z.uuid()).min(1).max(BULK_MAX_TARGETS),
    })
    .strict(),
  z
    .object({
      mode: z.literal("filter"),
      search: z.string().trim().max(120).default(""),
      roles: z.array(academyRoleSchema).max(academyRoles.length).default([]),
      statuses: z
        .array(membershipStatusSchema)
        .max(membershipStatuses.length)
        .default([]),
      /** Rows the manager unticked after selecting everything. */
      excludedMembershipIds: z
        .array(z.uuid())
        .max(BULK_MAX_TARGETS)
        .default([]),
    })
    .strict(),
]);
export type PeopleSelection = z.infer<typeof peopleSelectionSchema>;

/* ------------------------------------------------------------ consequences */

/**
 * The things a manager should know before confirming.
 *
 * Each one is a fact about what the mutation will break, not a warning about
 * the mutation itself. They exist because the directory cannot show them: a
 * table of names has no column for "runs three classes", and suspending that
 * person without saying so leaves three classes unstaffed and nobody informed.
 */
export const bulkConsequenceKinds = [
  /** A target teaches active classes that will lose their teacher. */
  "teacher_assignments_stranded",
  /** A target is enrolled in active classes they will be removed from. */
  "enrollments_dropped",
  /** A target is already in the requested state; nothing will change. */
  "already_in_state",
  /** A target is the last active manager and cannot be changed. */
  "last_manager_blocked",
  /** A target is not eligible — wrong role, or an inactive membership. */
  "ineligible",
  /** Live monitoring sessions that will be revoked after the commit. */
  "monitoring_revoked",
] as const;
export const bulkConsequenceKindSchema = z.enum(bulkConsequenceKinds);
export type BulkConsequenceKind = z.infer<typeof bulkConsequenceKindSchema>;

export const bulkConsequenceSchema = z
  .object({
    kind: bulkConsequenceKindSchema,
    /** How many of the selected people this applies to. */
    count: z.number().int().nonnegative(),
    /** At most five names, so the manager recognises who is affected. */
    sample: z.array(z.string().min(1).max(200)).max(5),
  })
  .strict();
export type BulkConsequence = z.infer<typeof bulkConsequenceSchema>;

/**
 * What a confirmation dialog says.
 *
 * `affected` is the exact count the operation will change, resolved on the
 * server — §10 requires the confirmation to display it before the mutation,
 * because "suspend about 1,800 people" is not a thing anybody should be asked
 * to approve.
 *
 * `blocked` is separate from `affected` rather than subtracted from it. A
 * manager needs to know both that 38 people will be suspended and that 2 were
 * refused, and one number cannot say both.
 */
export const bulkPreviewSchema = z
  .object({
    kind: peopleBulkKindSchema,
    affected: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
    consequences: z.array(bulkConsequenceSchema),
    /** §8.1 — the revision this preview was resolved against. */
    peopleRevision: z.number().int().nonnegative(),
  })
  .strict();
export type BulkPreview = z.infer<typeof bulkPreviewSchema>;

/* -------------------------------------------------------------- requests */

/**
 * What each kind needs beyond a selection.
 *
 * Discriminated so an enrolment cannot be sent without a class and a role
 * change cannot be sent without a role. The alternative — one object with two
 * optional fields — would push both checks into the service, where a missing
 * one is a runtime error rather than a compile error.
 */
export const bulkOptionsSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ENROLL"), classId: z.uuid() }).strict(),
  z.object({ kind: z.literal("ROLE_CHANGE"), role: academyRoleSchema }).strict(),
  z.object({ kind: z.literal("SUSPEND") }).strict(),
  z.object({ kind: z.literal("RESTORE") }).strict(),
]);
export type BulkOptions = z.infer<typeof bulkOptionsSchema>;

export const previewBulkInputSchema = z
  .object({
    academyId: z.uuid(),
    selection: peopleSelectionSchema,
    options: bulkOptionsSchema,
  })
  .strict();
export type PreviewBulkInput = z.infer<typeof previewBulkInputSchema>;

/**
 * An idempotency key.
 *
 * Generated by the browser when the confirmation opens, not when it is
 * submitted: a manager who double-clicks Confirm sends the same key twice and
 * gets one operation, which is the entire point.
 */
export const idempotencyKeySchema = z.string().min(8).max(128);

export const runBulkInputSchema = z
  .object({
    academyId: z.uuid(),
    selection: peopleSelectionSchema,
    options: bulkOptionsSchema,
    idempotencyKey: idempotencyKeySchema,
    /** §8.1 — refuse rather than apply to a roster that moved underneath. */
    peopleRevision: z.number().int().nonnegative(),
  })
  .strict();
export type RunBulkInput = z.infer<typeof runBulkInputSchema>;

/* ---------------------------------------------------------------- results */

export const bulkOutcomeSchema = z.enum(["changed", "skipped", "blocked"]);
export type BulkOutcome = z.infer<typeof bulkOutcomeSchema>;

export const bulkResultRowSchema = z
  .object({
    membershipId: z.uuid(),
    displayName: z.string().min(1).max(200),
    outcome: bulkOutcomeSchema,
    /** A stable code. The exported CSV carries this verbatim. */
    code: z.string().max(64),
  })
  .strict();
export type BulkResultRow = z.infer<typeof bulkResultRowSchema>;

export const bulkResultSchema = z
  .object({
    operationId: z.uuid(),
    kind: peopleBulkKindSchema,
    status: z.enum(["PENDING", "COMPLETED", "FAILED"]),
    requested: z.number().int().nonnegative(),
    succeeded: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    rows: z.array(bulkResultRowSchema).max(BULK_MAX_TARGETS),
    /**
     * True when this response replayed a previous run rather than performing
     * one. Shown to the manager, because "nothing happened, and that is
     * correct" is otherwise indistinguishable from a bug.
     */
    replayed: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type BulkResult = z.infer<typeof bulkResultSchema>;

/* ------------------------------------------------------------ derivations */

/**
 * Whether a membership may receive this operation at all.
 *
 * Pure, and shared by the preview and the commit so the count a manager
 * approves is the count that changes. Two implementations of eligibility is how
 * a confirmation says 40 and a result says 37.
 *
 * Every rule here is about the *membership*, not about the academy: the
 * last-active-manager rule needs to count the whole academy and therefore lives
 * in the service, where it can hold a lock while it counts.
 */
export function bulkEligibility(
  member: { role: string; status: string },
  options: BulkOptions,
): { eligible: boolean; code: string } {
  switch (options.kind) {
    case "ENROLL":
      // §12 — active Students only. A Teacher enrolled as a pupil in their own
      // academy would appear on their own roster, which is not a state any
      // other part of the product knows how to render.
      if (member.role !== "STUDENT") return { eligible: false, code: "not_a_student" };
      if (member.status !== "ACTIVE") return { eligible: false, code: "not_active" };
      return { eligible: true, code: "ok" };
    case "ROLE_CHANGE":
      if (member.status !== "ACTIVE") return { eligible: false, code: "not_active" };
      if (member.role === options.role) {
        return { eligible: false, code: "already_in_state" };
      }
      return { eligible: true, code: "ok" };
    case "SUSPEND":
      if (member.status === "SUSPENDED") {
        return { eligible: false, code: "already_in_state" };
      }
      if (member.status !== "ACTIVE") return { eligible: false, code: "not_active" };
      return { eligible: true, code: "ok" };
    case "RESTORE":
      if (member.status === "ACTIVE") {
        return { eligible: false, code: "already_in_state" };
      }
      if (member.status !== "SUSPENDED") {
        return { eligible: false, code: "not_suspended" };
      }
      return { eligible: true, code: "ok" };
  }
}

/**
 * The last-active-manager rule, as arithmetic.
 *
 * §12 protects it for both role change and suspension, which is why it is one
 * function rather than two checks that could drift. It counts what would remain
 * rather than what is being removed: "are we about to leave this academy with
 * nobody who can administer it" is the question, and phrasing it any other way
 * gets the edge case wrong when a manager selects every manager including
 * themselves.
 */
export function wouldStrandAcademy(input: {
  activeManagers: number;
  managersLosingTheRole: number;
}): boolean {
  return input.activeManagers - input.managersLosingTheRole < 1;
}
