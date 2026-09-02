import { z } from "zod";

import { isSupportedTimeZone } from "../content/manager-overview.js";
import { academyInvitationDetailSchema } from "../memberships/academy.js";

export const academyStatuses = ["ACTIVE", "SUSPENDED", "ARCHIVED"] as const;
export const academyStatusSchema = z.enum(academyStatuses);
export type AcademyStatus = z.infer<typeof academyStatusSchema>;

/**
 * Which academies may move where.
 *
 * `ARCHIVED` is terminal. An academy is referenced by its courses, classes,
 * submissions, and audit history, so archiving is how one ends; reversing it
 * would mean deciding what to do about everything that assumed it was over. If
 * a genuine un-archive need appears it should be its own named, audited
 * operation rather than an edge that makes `ARCHIVED` quietly non-terminal.
 */
export const academyStatusTransitions = {
  ACTIVE: ["SUSPENDED", "ARCHIVED"],
  SUSPENDED: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: [],
} as const satisfies Record<AcademyStatus, readonly AcademyStatus[]>;

export function canTransitionAcademyStatus(
  from: AcademyStatus,
  to: AcademyStatus,
): boolean {
  return (
    academyStatusTransitions[from] as readonly AcademyStatus[]
  ).includes(to);
}

/**
 * Whether anybody is actually running this academy.
 *
 * The reason the platform list is worth opening. `awaiting_first_manager` is
 * the expected state of a freshly created academy and clears itself when the
 * invitation is accepted; `no_active_manager` is the one that needs a human,
 * because it means an academy that was running no longer has anyone who can
 * invite, enroll, or approve.
 */
export const academyManagerStates = [
  "active",
  "awaiting_first_manager",
  "no_active_manager",
] as const;
export const academyManagerStateSchema = z.enum(academyManagerStates);
export type AcademyManagerState = z.infer<typeof academyManagerStateSchema>;

export function deriveAcademyManagerState(counts: {
  activeManagers: number;
  /** Manager memberships in any status, including LEFT and SUSPENDED. */
  everManagers: number;
}): AcademyManagerState {
  if (counts.activeManagers > 0) return "active";
  return counts.everManagers > 0 ? "no_active_manager" : "awaiting_first_manager";
}

/**
 * How urgently a row wants an operator's attention, lowest first.
 *
 * Sorting is a property of the data rather than of the table that renders it,
 * so the list arrives already ordered and a second surface cannot disagree
 * about which academies are the worrying ones.
 */
export function academyAttentionRank(row: {
  status: AcademyStatus;
  managerState: AcademyManagerState;
}): number {
  if (row.status === "ARCHIVED") return 4;
  if (row.managerState === "no_active_manager") return 0;
  if (row.managerState === "awaiting_first_manager") return 1;
  if (row.status === "SUSPENDED") return 2;
  return 3;
}

/* ------------------------------------------------------------------ slugs */

export const academySlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "invalid_slug");

/**
 * A slug proposed from the academy's name.
 *
 * Offered to the operator and editable before submit rather than applied
 * silently: a slug is permanent in URLs people bookmark and paste, so the last
 * moment to catch a wrong one is before it exists.
 */
export function slugifyAcademyName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/* ---------------------------------------------------------------- reading */

export const platformAcademySummarySchema = z
  .object({
    id: z.uuid(),
    name: z.string().min(1),
    slug: z.string().min(1),
    status: academyStatusSchema,
    timeZone: z.string().min(1),
    managerState: academyManagerStateSchema,
    memberCounts: z.object({
      total: z.number().int().nonnegative(),
      managers: z.number().int().nonnegative(),
      teamLeads: z.number().int().nonnegative(),
      teachers: z.number().int().nonnegative(),
      students: z.number().int().nonnegative(),
    }),
    /** The pending first-manager invitation, when one is outstanding. */
    pendingManagerInvitation: z
      .object({
        email: z.email(),
        expiresAt: z.iso.datetime(),
        isExpired: z.boolean(),
      })
      .nullable(),
    createdAt: z.iso.datetime(),
    statusChangedAt: z.iso.datetime().nullable(),
  })
  .strict();
export type PlatformAcademySummary = z.infer<
  typeof platformAcademySummarySchema
>;

export const platformAcademyDetailSchema = platformAcademySummarySchema
  .extend({
    organization: z.object({
      id: z.uuid(),
      name: z.string().min(1),
      slug: z.string().min(1),
    }),
    contactEmail: z.string().nullable(),
    contactPhone: z.string().nullable(),
    locality: z.string().nullable(),
    countryCode: z.string().nullable(),
    profileUpdatedAt: z.iso.datetime().nullable(),
    createdBy: z
      .object({
        id: z.uuid(),
        email: z.email().nullable(),
        displayName: z.string().nullable(),
      })
      .nullable(),

    /**
     * What this academy actually runs, counted.
     *
     * The member counts on the summary say who belongs to it; these say
     * whether it is working. An academy with forty students, no class, and no
     * published course is not a healthy academy — and until now the console
     * could not tell that apart from a thriving one, because it only ever
     * counted people.
     */
    classes: z.object({
      total: z.number().int().nonnegative(),
      active: z.number().int().nonnegative(),
      archived: z.number().int().nonnegative(),
      /** Active classes with no usable teacher assignment. The condition a
       *  manager is asked about most, and the one nobody chose. */
      withoutTeacher: z.number().int().nonnegative(),
      /** Active classes teaching nothing, so their students have no work. */
      withoutCourse: z.number().int().nonnegative(),
    }),
    content: z.object({
      courses: z.number().int().nonnegative(),
      publishedCourses: z.number().int().nonnegative(),
      lectures: z.number().int().nonnegative(),
      problems: z.number().int().nonnegative(),
      /** Problems with no test case: authored, and unable to grade anything. */
      problemsWithoutTests: z.number().int().nonnegative(),
    }),
    /** Enrolments, not people: one student in two classes counts twice, which
     *  is what "seats filled" means to whoever sizes a campus. */
    enrolments: z.number().int().nonnegative(),
    /** Support sessions opened against this academy, ever, and live now. */
    support: z.object({
      total: z.number().int().nonnegative(),
      live: z.number().int().nonnegative(),
    }),
  })
  .strict();
export type PlatformAcademyDetail = z.infer<typeof platformAcademyDetailSchema>;

export const listPlatformAcademiesInputSchema = z
  .object({
    /** Matches name or slug. Absent means every academy. */
    query: z.string().trim().max(120).optional(),
    status: academyStatusSchema.optional(),
    /** Only the rows that want attention, for the operator's default view. */
    needsAttention: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().nonnegative().default(0),
  })
  .strict();
export type ListPlatformAcademiesInput = z.input<
  typeof listPlatformAcademiesInputSchema
>;

/* ---------------------------------------------------------------- writing */

/**
 * The two identity fields, and only those.
 *
 * Everything else about an academy belongs to its manager, who edits address,
 * phone, contact email and time zone through `academy.settings.manage`. Two
 * editors of one field is how the two drift apart, so a platform admin gets
 * exactly what nobody else can reach.
 *
 * The slug rules are `academySlugSchema`, the same object creation uses: two
 * definitions of what a slug is would eventually disagree, and the one that
 * disagreed would let a URL through that the other had refused.
 */
export const updatePlatformAcademyInputSchema = z
  .object({
    academyId: z.uuid(),
    name: z.string().trim().min(2).max(120),
    slug: academySlugSchema,
  })
  .strict();
export type UpdatePlatformAcademyInput = z.infer<
  typeof updatePlatformAcademyInputSchema
>;

/** Asked when a URL carries a slug no academy answers to any more. */
export const resolveAcademySlugInputSchema = z
  .object({ slug: academySlugSchema })
  .strict();

export const resolveAcademySlugResultSchema = z.object({
  /** The slug this academy answers to now, or null when none ever did. */
  slug: z.string().nullable(),
});
export type ResolveAcademySlugResult = z.infer<
  typeof resolveAcademySlugResultSchema
>;

export const createPlatformAcademyInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: academySlugSchema,
    /**
     * Required rather than defaulted, unlike the column. Every period
     * boundary, growth bucket, and "today" on every manager and teacher
     * surface is drawn from this, and the column's Seoul default exists to
     * keep pre-existing rows working — not to be the answer nobody chose.
     */
    timeZone: z.string().min(1).max(64).refine(isSupportedTimeZone, {
      message: "unsupported_time_zone",
    }),
    /**
     * Where the first manager invitation is sent, when there is one.
     *
     * Optional, and its absence is a *decision* rather than a missing field:
     * the academy is created open, appears on the sign-up page at once, and
     * whoever signs up choosing it waits in the queue an operator reviews. An
     * operator who does not yet know who will run an academy should not have
     * to invent an address to make one — and the address they invent is the
     * address the invitation goes to.
     */
    managerEmail: z.email().max(200).optional(),
    contactEmail: z
      .email()
      .max(200)
      .nullable()
      .or(z.literal("").transform(() => null))
      .default(null),
  })
  .strict();
export type CreatePlatformAcademyInput = z.infer<
  typeof createPlatformAcademyInputSchema
>;

export const createPlatformAcademyResultSchema = z
  .object({
    academy: platformAcademyDetailSchema,
    /** Null when the academy was created open, with nobody invited. */
    invitation: academyInvitationDetailSchema.nullable(),
    /**
     * The plaintext invitation token, returned to its creator and never again.
     *
     * Only the hash is stored, so this is the single moment the link can be
     * shown. The manager's own invitation flow does the same thing for the same
     * reason — and it is what makes the console usable at all wherever email is
     * not configured, which includes every development machine.
     *
     * Nullable alongside `invitation`, and always the same nullness: one shape
     * covers both ways into an academy, so a caller branches on a value rather
     * than on whether a key is present.
     */
    token: z.string().min(32).nullable(),
  })
  .strict();

export const setAcademyStatusInputSchema = z
  .object({
    academyId: z.uuid(),
    status: academyStatusSchema,
    /**
     * Required on every transition. §6.3 of the authorization design asks for
     * a documented reason on privileged intervention, and switching off an
     * academy full of students is exactly that.
     */
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export type SetAcademyStatusInput = z.infer<typeof setAcademyStatusInputSchema>;

export const resendFirstManagerInvitationInputSchema = z
  .object({
    academyId: z.uuid(),
    /**
     * A corrected address, when the first one was wrong — which is the most
     * likely reason an academy is still waiting for its first manager.
     */
    email: z.email().max(200).optional(),
  })
  .strict();
export type ResendFirstManagerInvitationInput = z.infer<
  typeof resendFirstManagerInvitationInputSchema
>;

/**
 * Destroying an academy, and everything it owns.
 *
 * The slug is typed back rather than clicked past. There is no undo, no
 * archive to restore from, and no backup this console can reach — so the
 * confirmation has to be something an operator cannot do by accident, and a
 * second button is exactly that.
 */
export const deletePlatformAcademyInputSchema = z
  .object({
    academyId: z.uuid(),
    /** The academy's current slug, typed by the operator. */
    confirmSlug: z.string().trim().min(1),
    reason: z.string().trim().min(8).max(500),
  })
  .strict();
export type DeletePlatformAcademyInput = z.infer<
  typeof deletePlatformAcademyInputSchema
>;

/** What a deletion destroyed, so the operator sees the size of what they did. */
export const deletePlatformAcademyResultSchema = z.object({
  academyId: z.uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
});
export type DeletePlatformAcademyResult = z.infer<
  typeof deletePlatformAcademyResultSchema
>;
