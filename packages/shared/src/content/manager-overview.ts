import { z } from "zod";

import { academyRoleSchema } from "../auth/roles.js";
import { memberAvatarUrlsShape } from "../profile/avatar.js";
import {
  difficultProblemSchema,
  overviewAttentionReasonSchema,
  overviewPeriodSchema,
  overviewRangeSchema,
  sharePercent,
  type OverviewPeriod,
} from "./teacher-overview.js";
import {
  addLocalDays,
  localDateRange,
  localDaysBetween,
  type LocalDate,
} from "./academy-time.js";

/**
 * What a manager's academy overview is made of, and how every number in it is
 * decided.
 *
 * The teacher overview next door answers "who needs me today". This one answers
 * a different question — "is this place running" — and the difference shows up
 * in what the file refuses to do. A manager is one step further from the
 * classroom than a teacher is, which makes an opaque summary far more tempting
 * and far more damaging: nobody downstream of it can check it. So the rules here
 * are stricter about the same thing §4 of the design rules out. Every rate
 * publishes its own numerator and denominator. Every attention row carries the
 * measurement that triggered it. The class highlight names the metric and the
 * period it won on, and there is nowhere in any schema to put a score.
 *
 * The arithmetic lives here rather than in SQL or React for the reason it
 * always does: a rule inside a query cannot be tested at its boundaries, and a
 * rule inside a chart is a rule the accessible table beside it will state
 * differently.
 *
 * See §9 of the manager control tower and scalable people operations design.
 */

const labelSchema = z.string().trim().min(1).max(200);
const countSchema = z.number().int().nonnegative();
const percentSchema = z.number().int().min(0).max(100);
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/* ------------------------------------------------------------------ bounds */

/** §15 — a preview is five records, on every section that has one. */
export const MANAGER_MAX_PREVIEW_ROWS = 5;
/** §15 — the displayed class comparison is bounded; academy totals are not. */
export const MANAGER_MAX_CLASS_ROWS = 100;
/** §9.6 — below this many active students a class rate is a coincidence. */
export const HIGHLIGHT_MIN_ACTIVE_STUDENTS = 5;
/** §9.3 — an invitation this close to expiry is operational work. */
export const INVITATION_EXPIRY_WARNING_DAYS = 7;
/** §9.7 — a problem fewer students than this attempted proves nothing. */
export const MIN_STUDENTS_FOR_PROBLEM_SIGNAL = 3;

/* ---------------------------------------------------------- academy profile */

/**
 * The profile fields a manager must fill in before the academy is presentable.
 *
 * Deliberately short. The completion prompt on the overview is an interruption,
 * and an interruption that asks for a region code and a second address line
 * is one managers learn to dismiss — at which point it stops working for the
 * fields that do matter. These four are what a parent needs to find the place
 * and reach somebody in it.
 *
 * `timeZone` is not here because it is never absent: it carries a default, and
 * a prompt for a field that is always filled is a prompt that is always wrong.
 */
export const requiredAcademyProfileFields = [
  "addressLine1",
  "locality",
  "contactPhone",
  "contactEmail",
] as const;
export const academyProfileFieldSchema = z.enum(requiredAcademyProfileFields);
export type AcademyProfileField = z.infer<typeof academyProfileFieldSchema>;

export const academyMediaSchema = z
  .object({
    id: z.uuid(),
    assetId: z.uuid(),
    kind: z.enum(["COVER", "GALLERY"]),
    position: z.number().int().nonnegative(),
    altText: z.string().max(300).nullable(),
    isDecorative: z.boolean(),
    url: z.url(),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export type AcademyMedia = z.infer<typeof academyMediaSchema>;

export const academyProfileSchema = z
  .object({
    id: z.uuid(),
    name: labelSchema,
    slug: z.string().min(1).max(80),
    addressLine1: z.string().max(200).nullable(),
    addressLine2: z.string().max(200).nullable(),
    locality: z.string().max(120).nullable(),
    region: z.string().max(120).nullable(),
    postalCode: z.string().max(20).nullable(),
    /** ISO 3166-1 alpha-2, upper case. */
    countryCode: z.string().length(2).nullable(),
    contactPhone: z.string().max(40).nullable(),
    contactEmail: z.string().max(200).nullable(),
    timeZone: z.string().min(1).max(64),
    profileUpdatedAt: z.iso.datetime().nullable(),
    /** §8.1 — what a later bulk mutation must still agree with. */
    peopleRevision: z.number().int().nonnegative(),
    cover: academyMediaSchema.nullable().default(null),
    gallery: z.array(academyMediaSchema).max(6).default([]),
  })
  .strict();
export type AcademyProfile = z.infer<typeof academyProfileSchema>;

export const academyProfileCompletionSchema = z
  .object({
    isComplete: z.boolean(),
    missing: z.array(academyProfileFieldSchema),
  })
  .strict();
export type AcademyProfileCompletion = z.infer<
  typeof academyProfileCompletionSchema
>;

/**
 * Which required fields are still empty.
 *
 * Whitespace counts as empty. A profile saved with a space in the phone field
 * is not a profile with a phone number, and the prompt that says so is more
 * use than a green tick that is technically correct.
 */
export function academyProfileCompletion(
  profile: Pick<AcademyProfile, AcademyProfileField>,
): AcademyProfileCompletion {
  const missing = requiredAcademyProfileFields.filter(
    (field) => (profile[field] ?? "").trim().length === 0,
  );
  return { isComplete: missing.length === 0, missing: [...missing] };
}

/* ------------------------------------------------------------ scale ledger */

/**
 * §9.2 — the academy by role, counted once each.
 *
 * Mutually exclusive by construction: an academy membership holds exactly one
 * role, so these four sum to the active population and a stacked bar drawn from
 * them is honest at every width. Suspended memberships are their own figure
 * rather than a fifth slice — they are a state, not a role, and folding them in
 * would make "how many teachers do we have" unanswerable.
 */
export const academyScaleSchema = z
  .object({
    students: countSchema,
    teachers: countSchema,
    teamLeads: countSchema,
    managers: countSchema,
    /** The four above, summed once so the bar and the total cannot disagree. */
    activeMembers: countSchema,
    suspendedMembers: countSchema,
    activeClasses: countSchema,
    archivedClasses: countSchema,
  })
  .strict();
export type AcademyScale = z.infer<typeof academyScaleSchema>;

/* ------------------------------------------------------ active learner rate */

/**
 * §9.5's rate, and the two numbers that produced it.
 *
 * The name is the design decision. "Learning rate" was rejected because it
 * reads as how fast children learn, which this does not measure and could not:
 * it is the share of enrolled students who did anything at all in the period.
 *
 * `state` exists so an empty academy cannot be rendered as a failing one. A
 * denominator of zero is not 0% — it is "no enrolled students", and the two
 * look identical on a dial while meaning opposite things about the manager's
 * next action.
 */
export const activeLearnerRateSchema = z
  .object({
    state: z.enum(["measured", "no_students"]),
    percent: percentSchema.nullable(),
    /** Distinct active students with counted activity or a submission. */
    activeStudents: countSchema,
    /** Distinct active students enrolled in an active class. */
    enrolledStudents: countSchema,
  })
  .strict();
export type ActiveLearnerRate = z.infer<typeof activeLearnerRateSchema>;

export function activeLearnerRate(input: {
  activeStudents: number;
  enrolledStudents: number;
}): ActiveLearnerRate {
  if (input.enrolledStudents <= 0) {
    return {
      state: "no_students",
      percent: null,
      activeStudents: 0,
      enrolledStudents: 0,
    };
  }
  return {
    state: "measured",
    // Never above 100: a student counted active must also be counted enrolled,
    // but the two figures reach here from different queries and a rate above
    // 100% would discredit the whole panel rather than the one query at fault.
    percent: sharePercent(
      Math.min(input.activeStudents, input.enrolledStudents),
      input.enrolledStudents,
    ),
    activeStudents: input.activeStudents,
    enrolledStudents: input.enrolledStudents,
  };
}

/** Solved assigned student/exercise pairs, including unattempted work below the line. */
export function exerciseCompletion(input: {
  solvedProblems: number;
  enrolledStudents: number;
  assignedExercises: number;
}): number | null {
  const assignedPairs = input.enrolledStudents * input.assignedExercises;
  if (assignedPairs <= 0) return null;
  return sharePercent(Math.min(input.solvedProblems, assignedPairs), assignedPairs);
}

/* ------------------------------------------------------- incomplete classes */

/**
 * §9.3 — the three ways an active class is not yet ready to teach.
 *
 * Each one is a missing prerequisite with an obvious fix, which is what makes
 * them worth a manager's attention: no teacher means nobody is responsible, no
 * students means nobody is in the room, no course means there is nothing to do
 * in it. None of them is a judgement about the class.
 */
export const classGapKinds = [
  "no_teacher",
  "no_students",
  "no_course",
] as const;
export const classGapKindSchema = z.enum(classGapKinds);
export type ClassGapKind = z.infer<typeof classGapKindSchema>;

export const incompleteClassSchema = z
  .object({
    classId: z.uuid(),
    className: labelSchema,
    /** Every reason at once — §9.3, one row per class however many apply. */
    gaps: z.array(classGapKindSchema).min(1),
    enrolledStudents: countSchema,
  })
  .strict();
export type IncompleteClass = z.infer<typeof incompleteClassSchema>;

/**
 * Which prerequisites a class is missing.
 *
 * Order is fixed rather than derived so the same class reads identically on
 * every request. Teacher first: a class with nobody responsible for it is the
 * one gap that blocks fixing the other two.
 */
export function classGaps(input: {
  hasActiveTeacher: boolean;
  enrolledStudents: number;
  assignedCourses: number;
}): ClassGapKind[] {
  const gaps: ClassGapKind[] = [];
  if (!input.hasActiveTeacher) gaps.push("no_teacher");
  if (input.enrolledStudents <= 0) gaps.push("no_students");
  if (input.assignedCourses <= 0) gaps.push("no_course");
  return gaps;
}

/**
 * Most incomplete first, then the emptiest, then by name.
 *
 * Name before id so two equally incomplete classes appear in the order a
 * manager would look for them, and id last so the list never reshuffles
 * between two identical requests.
 */
export function compareIncompleteClasses(
  left: IncompleteClass,
  right: IncompleteClass,
): number {
  return (
    right.gaps.length - left.gaps.length ||
    left.enrolledStudents - right.enrolledStudents ||
    left.className.localeCompare(right.className) ||
    left.classId.localeCompare(right.classId)
  );
}

/* ------------------------------------------------------------ action queue */

/**
 * §9.3 — everything waiting on a manager, as counts with a way in.
 *
 * Counts and a bounded preview rather than the rows themselves. The queue's job
 * is to route: a manager who has fourteen pending applications does not need
 * fourteen names on the overview, they need to know it is fourteen and land on
 * the page that reviews them.
 */
export const managerActionQueueSchema = z
  .object({
    pendingApplications: countSchema,
    /** Pending invitations whose expiry falls inside the warning window. */
    expiringInvitations: countSchema,
    pendingInvitations: countSchema,
    incompleteClasses: z
      .object({
        total: countSchema,
        preview: z.array(incompleteClassSchema).max(MANAGER_MAX_PREVIEW_ROWS),
      })
      .strict(),
    studentsNeedingAttention: z
      .object({
        total: countSchema,
        preview: z
          .array(
            z
              .object({
                membershipId: z.uuid(),
                displayName: labelSchema,
                classId: z.uuid().nullable(),
                className: labelSchema.nullable(),
                reasons: z.array(overviewAttentionReasonSchema).min(1),
                ...memberAvatarUrlsShape,
              })
              .strict(),
          )
          .max(MANAGER_MAX_PREVIEW_ROWS),
      })
      .strict(),
  })
  .strict();
export type ManagerActionQueue = z.infer<typeof managerActionQueueSchema>;

/**
 * Whether a pending invitation is close enough to expiry to be work.
 *
 * Whole local days, and an already-expired invitation counts: it is still a
 * seat somebody was promised and did not take, and hiding it the moment it
 * lapses is how an academy accumulates people who think they were invited.
 */
export function invitationIsExpiring(input: {
  expiresAt: Date;
  now: Date;
  withinDays?: number;
}): boolean {
  const withinDays = input.withinDays ?? INVITATION_EXPIRY_WARNING_DAYS;
  const msRemaining = input.expiresAt.getTime() - input.now.getTime();
  return msRemaining <= withinDays * 86_400_000;
}

/* ---------------------------------------------------------- student growth */

export const growthDaySchema = z
  .object({ date: localDateSchema, joined: countSchema })
  .strict();
export type GrowthDay = z.infer<typeof growthDaySchema>;

export const studentGrowthSchema = z
  .object({
    days: z.array(growthDaySchema),
    joined: countSchema,
    /**
     * The same-length period immediately before this one, or null for `all`,
     * which has no previous period to compare against.
     */
    previousJoined: countSchema.nullable(),
    /**
     * Whole-percent change against the previous period.
     *
     * Null when there is nothing to divide by — growing from zero is not an
     * infinite improvement, it is a fact best stated as the count itself.
     */
    changePercent: z.number().int().nullable(),
  })
  .strict();
export type StudentGrowth = z.infer<typeof studentGrowthSchema>;

/**
 * The previous equal-length period, as instants.
 *
 * §9.4 compares like with like: 30 whole local days against the 30 whole local
 * days before them. `all` returns null rather than inventing a baseline — there
 * is no "before the beginning".
 */
export function previousPeriodOf(
  period: OverviewPeriod,
): { startDate: LocalDate; endDate: LocalDate } | null {
  if (period.startDate === null || period.days === null) return null;
  return {
    startDate: addLocalDays(period.startDate, -period.days),
    endDate: addLocalDays(period.startDate, -1),
  };
}

/**
 * One bar per local day in the period, including the days nobody joined.
 *
 * Deriving the axis from the rows that exist would silently close the gaps, and
 * a quiet fortnight would draw as a busy one. `all` has no fixed start, so its
 * axis is taken from the earliest join instead — a chart, not a calendar.
 */
export function buildStudentGrowth(input: {
  joinsByDate: { date: LocalDate; joined: number }[];
  period: OverviewPeriod;
  previousJoined: number | null;
}): StudentGrowth {
  const counts = new Map(
    input.joinsByDate.map((row) => [row.date, row.joined] as const),
  );
  const firstJoin = input.joinsByDate
    .map((row) => row.date)
    .sort()
    .at(0);
  const start = input.period.startDate ?? firstJoin ?? input.period.endDate;
  const axis =
    localDaysBetween(start, input.period.endDate) < 0
      ? [input.period.endDate]
      : localDateRange(start, input.period.endDate);

  const days = axis.map((date) => ({ date, joined: counts.get(date) ?? 0 }));
  const joined = days.reduce((total, day) => total + day.joined, 0);

  return {
    days,
    joined,
    previousJoined: input.previousJoined,
    changePercent: growthChangePercent(joined, input.previousJoined),
  };
}

/** Whole-percent change, or null when the baseline cannot carry one. */
export function growthChangePercent(
  current: number,
  previous: number | null,
): number | null {
  if (previous === null || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export const recentJoinSchema = z
  .object({
    membershipId: z.uuid(),
    displayName: labelSchema,
    role: academyRoleSchema,
    joinedAt: z.iso.datetime(),
    ...memberAvatarUrlsShape,
  })
  .strict();
export type RecentJoin = z.infer<typeof recentJoinSchema>;

/* --------------------------------------------------------- class comparison */

/**
 * §9.6 — one active class, on every metric the manager may sort by.
 *
 * Every measurement is nullable and every nullable one means "not measured",
 * never zero. A class whose students have not submitted anything has no median
 * solve time, and printing `0m` would describe a class that works instantly.
 */
export const classComparisonRowSchema = z
  .object({
    classId: z.uuid(),
    className: labelSchema,
    teacherName: labelSchema.nullable(),
    enrolledStudents: countSchema,
    activeStudents: countSchema,
    activeLearnerRate: percentSchema.nullable(),
    medianActiveSeconds: countSchema.nullable(),
    exerciseCompletion: percentSchema.nullable(),
    conceptMastery: percentSchema.nullable(),
    studentsNeedingAttention: countSchema,
    lastActivityAt: z.iso.datetime().nullable(),
  })
  .strict();
export type ClassComparisonRow = z.infer<typeof classComparisonRowSchema>;

/**
 * §9.6's highlight: the eligible class with the highest Active learner rate.
 *
 * "Eligible" is doing the real work. A two-student class where both logged in
 * is 100%, and putting it above a twenty-student class at 85% would teach
 * managers to distrust the panel within a week — so a class below the floor
 * cannot be highlighted at all, however well it scores.
 *
 * What comes back is a class id and the metric it won on. There is no
 * "best class" in the schema and no way to store one: the label the interface
 * prints names the measurement and the period, because next month, on a
 * different measurement, it is a different class.
 */
export function selectHighlightClass(
  rows: ClassComparisonRow[],
  minimumActiveStudents: number = HIGHLIGHT_MIN_ACTIVE_STUDENTS,
): ClassComparisonRow | null {
  const eligible = rows.filter(
    (row) =>
      row.enrolledStudents >= minimumActiveStudents &&
      row.activeLearnerRate !== null,
  );
  if (eligible.length === 0) return null;
  return [...eligible].sort(
    (left, right) =>
      (right.activeLearnerRate ?? 0) - (left.activeLearnerRate ?? 0) ||
      (right.conceptMastery ?? 0) - (left.conceptMastery ?? 0) ||
      left.className.localeCompare(right.className) ||
      left.classId.localeCompare(right.classId),
  )[0];
}

/** The fields a manager may sort the class table by. */
export const classSortFields = [
  "className",
  "enrolledStudents",
  "activeStudents",
  "activeLearnerRate",
  "medianActiveSeconds",
  "exerciseCompletion",
  "conceptMastery",
  "studentsNeedingAttention",
  "lastActivityAt",
] as const;
export const classSortFieldSchema = z.enum(classSortFields);
export type ClassSortField = z.infer<typeof classSortFieldSchema>;

/* ------------------------------------------------------------ recent audit */

/**
 * §9.9 — what changed in the academy, said safely.
 *
 * A summary is an actor, a verb, a target label, and a time. The before and
 * after values stay in the audit record; a manager overview that printed the
 * old and new value of every field would publish a member's details to a
 * dashboard that is open on a staffroom screen all day.
 */
export const auditSummarySchema = z
  .object({
    id: z.uuid(),
    action: z.string().min(1).max(80),
    actorName: labelSchema.nullable(),
    targetLabel: labelSchema.nullable(),
    targetType: z.string().min(1).max(40),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type AuditSummary = z.infer<typeof auditSummarySchema>;

/* ------------------------------------------------------- partial failure */

/**
 * §14 — the sections that may fail on their own.
 *
 * Academy identity and the scale ledger are not here on purpose: they are the
 * page's core claim, and a control tower missing its own totals is an error
 * page, not a narrower one. Everything below them is evidence, and evidence
 * that could not be gathered says so in its own panel while the rest stands.
 */
export const managerOverviewSections = [
  "attention",
  "growth",
  "learning",
  "problems",
  "activity",
] as const;
export const managerOverviewSectionSchema = z.enum(managerOverviewSections);
export type ManagerOverviewSection = z.infer<
  typeof managerOverviewSectionSchema
>;

/* -------------------------------------------------------------- the payload */

export const getManagerOverviewInputSchema = z
  .object({
    academyId: z.uuid(),
    range: overviewRangeSchema.optional(),
  })
  .strict();
export type GetManagerOverviewInput = z.infer<
  typeof getManagerOverviewInputSchema
>;

/**
 * One bounded snapshot of one academy at one instant.
 *
 * §7.1 — the page never joins five interfaces in the browser. Not for
 * convenience: five independently clocked reads would let the ledger, the
 * queue, and the growth chart describe three different moments while sitting
 * on the same screen, and a manager comparing them would be right that they
 * disagree.
 */
export const managerOverviewSchema = z
  .object({
    academy: academyProfileSchema,
    completion: academyProfileCompletionSchema,
    period: overviewPeriodSchema,
    generatedAt: z.iso.datetime(),
    /** The earliest counted learning signal, or null before there is one. */
    activityTrackedSince: z.iso.datetime().nullable(),
    scale: academyScaleSchema,
    activeLearnerRate: activeLearnerRateSchema,
    queue: managerActionQueueSchema,
    growth: studentGrowthSchema,
    recentJoins: z.array(recentJoinSchema).max(MANAGER_MAX_PREVIEW_ROWS),
    classes: z.array(classComparisonRowSchema).max(MANAGER_MAX_CLASS_ROWS),
    /** True when the academy runs more classes than the table may carry. */
    classesTruncated: z.boolean(),
    highlightClassId: z.uuid().nullable(),
    problems: z.array(difficultProblemSchema).max(MANAGER_MAX_PREVIEW_ROWS),
    recentChanges: z.array(auditSummarySchema).max(MANAGER_MAX_PREVIEW_ROWS),
    unavailable: z.array(managerOverviewSectionSchema),
  })
  .strict();
export type ManagerOverview = z.infer<typeof managerOverviewSchema>;

/* ------------------------------------------------- academy profile editing */

/**
 * What a manager may change about the academy.
 *
 * The name and slug are not here. Renaming an academy changes what every
 * member sees the product called and what its URLs resolve to, and that belongs
 * with organization settings rather than beside a phone number.
 *
 * Empty strings normalize to null on the way in, so clearing a field in the
 * form clears the column rather than storing a blank that reads as an answer.
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable();

export const updateAcademyProfileInputSchema = z
  .object({
    academyId: z.uuid(),
    addressLine1: optionalText(200),
    addressLine2: optionalText(200),
    locality: optionalText(120),
    region: optionalText(120),
    postalCode: optionalText(20),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .or(z.literal("").transform(() => null)),
    contactPhone: optionalText(40),
    contactEmail: z
      .email()
      .max(200)
      .nullable()
      .or(z.literal("").transform(() => null)),
    /**
     * Validated against the runtime's own zone table rather than a list kept
     * here: a hand-maintained list is wrong the first time a government
     * changes its mind, and a bad zone silently moves every period boundary
     * on every analytics surface in the academy.
     */
    timeZone: z.string().min(1).max(64).refine(isSupportedTimeZone, {
      message: "unsupported_time_zone",
    }),
  })
  .strict();
export type UpdateAcademyProfileInput = z.infer<
  typeof updateAcademyProfileInputSchema
>;

export function isSupportedTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------- audit vocabulary */

/**
 * Every audit action the manager's Recent changes panel can name.
 *
 * One list, in `@cove/shared`, because there were three and they disagreed.
 * The services wrote `class.teacher.replaced`, the panel's local list called it
 * `class.teacher.replace`, and the copy was keyed to the panel — so a real
 * change in a real academy rendered as a raw dotted code in a manager's
 * history, and nothing in the type system or the tests could notice.
 *
 * It is the vocabulary the *panel* renders, not every action the platform
 * writes: `content.*` actions are audited too, and they never reach here
 * because `SUMMARISABLE_AUDIT_TARGETS` admits only membership, invitation,
 * application, class, and people-operation targets.
 *
 * Adding an audited change to one of those targets means adding it here. The
 * API's own action helpers are typed against this list and the locale
 * catalogues are tested against it, so both halves fail until it is.
 */
export const academyAuditActions = [
  "academy.invitation.created",
  "academy.invitation.resent",
  "academy.invitation.revoked",
  "academy.invitation.accepted",
  "academy.join_request.approved",
  "academy.join_request.rejected",
  "academy.membership.role_changed",
  "academy.membership.suspended",
  "academy.membership.restored",
  "academy.member_profile.updated",
  "academy.member_profile.image_replaced",
  "academy.member_profile.image_removed",
  "academy.people.imported",
  "academy.people.bulk.enroll",
  "academy.people.bulk.role_change",
  "academy.people.bulk.suspend",
  "academy.people.bulk.restore",
  "class.created",
  "class.updated",
  "class.archived",
  "class.restored",
  "class.courses.updated",
  "class.schedule.updated",
  "class.students.enrolled",
  "class.student.removed",
  "class.teacher.assigned",
  "class.teacher.replaced",
  "class.teacher.removed",
  // Platform acts that land on an academy-scoped invitation row, and so reach
  // the manager's Recent changes panel through its `AcademyInvitation`
  // allow-list. Named here because the first thing a new manager sees would
  // otherwise be their own invitation printed as a raw dotted code.
  "platform.academy.first_manager_invited",
  "platform.academy.first_manager_invitation_resent",
] as const;

export type AcademyAuditAction = (typeof academyAuditActions)[number];

const academyAuditActionSet = new Set<string>(academyAuditActions);

/** Whether this panel has a name for an action, or must print its code. */
export function isAcademyAuditAction(
  action: string,
): action is AcademyAuditAction {
  return academyAuditActionSet.has(action);
}
