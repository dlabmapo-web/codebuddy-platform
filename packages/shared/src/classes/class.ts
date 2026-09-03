import { z } from "zod";

import { academyRoleSchema } from "../auth/roles.js";
import { userStatusSchema } from "../auth/session.js";
import { membershipStatusSchema } from "../memberships/status.js";
import { memberAvatarUrlsShape } from "../profile/avatar.js";

export const classStatuses = ["ACTIVE", "ARCHIVED"] as const;
export const classStatusSchema = z.enum(classStatuses);
export type ClassStatus = z.infer<typeof classStatusSchema>;

/**
 * Class names are deliberately not unique. An academy reuses "Level 1" every
 * term, so the UUID is the identity and the name is only a label.
 */
const classNameSchema = z.string().trim().min(1).max(120);
const classDescriptionSchema = z.string().trim().max(2_000);

/** How many classes one mutation may touch at a time. */
export const classCourseAssignmentLimit = 100;
export const classEnrollmentBatchLimit = 100;

export const assignedCourseSummarySchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  /** Assigning a hidden course is allowed; students still cannot open it. */
  isVisible: z.boolean(),
});
export type AssignedCourseSummary = z.infer<typeof assignedCourseSummarySchema>;

export const enrolledStudentSummarySchema = z.object({
  membershipId: z.uuid(),
  userId: z.uuid(),
  displayName: z.string().nullable(),
  email: z.email().nullable(),
  /** The membership as it stands now, which is what actually grants access. */
  membershipStatus: membershipStatusSchema,
  role: academyRoleSchema,
  enrolledAt: z.iso.datetime(),
  ...memberAvatarUrlsShape,
});
export type EnrolledStudentSummary = z.infer<
  typeof enrolledStudentSummarySchema
>;

export const eligibleStudentSummarySchema = z.object({
  membershipId: z.uuid(),
  userId: z.uuid(),
  displayName: z.string().nullable(),
  email: z.email().nullable(),
  ...memberAvatarUrlsShape,
});
export type EligibleStudentSummary = z.infer<
  typeof eligibleStudentSummarySchema
>;

/**
 * The membership stored on the class, reported as it stands now. The status
 * and role travel with it because a stored assignment can outlive the
 * eligibility that created it, and the client must not read access off the
 * presence of an ID.
 */
export const assignedTeacherSummarySchema = z.object({
  membershipId: z.uuid(),
  userId: z.uuid(),
  displayName: z.string().nullable(),
  userStatus: userStatusSchema,
  membershipStatus: membershipStatusSchema,
  /** The member's highest role. */
  role: academyRoleSchema,
  /** Every role they hold, which is what decides whether they may teach. */
  roles: z.array(academyRoleSchema).min(1),
});
export type AssignedTeacherSummary = z.infer<
  typeof assignedTeacherSummarySchema
>;

/** The list gets by on a name; the detail page names the person exactly. */
export const assignedTeacherDetailSchema = assignedTeacherSummarySchema.extend({
  email: z.email().nullable(),
});
export type AssignedTeacherDetail = z.infer<typeof assignedTeacherDetailSchema>;

/**
 * How many teachers one class may carry: a homeroom teacher and two
 * assistants. A cap rather than an open list, because the number exists to
 * keep a class's teaching staff a thing a manager can hold in their head —
 * not because anything technical breaks at four.
 */
export const CLASS_MAX_TEACHERS = 3;
/** The same cap, counted as the dialog counts it: everyone but the homeroom. */
export const CLASS_MAX_ASSISTANT_TEACHERS = CLASS_MAX_TEACHERS - 1;

/**
 * One of a class's teachers, homeroom or assistant.
 *
 * `isHomeroom` rather than a separate list, so a caller that only wants to
 * show who teaches here cannot accidentally show one group and forget the
 * other. Exactly one entry carries it, or none while the class is unassigned.
 */
export const classTeacherSummarySchema = assignedTeacherSummarySchema.extend({
  /**
   * Whether this is the person answerable for the class. Assistants teach it
   * on identical terms; what they lack is being the one named for it, which
   * is what monitoring, points, and the student's "your teacher" report.
   */
  isHomeroom: z.boolean(),
});
export type ClassTeacherSummary = z.infer<typeof classTeacherSummarySchema>;

/**
 * The detail page names each teacher exactly and shows their face; the list
 * gets by on a name.
 *
 * The photo is on the detail alone for the same reason the email is: a page of
 * classes would pay for a signed URL per teacher to draw a disc the size of a
 * table cell.
 */
export const classTeacherDetailSchema = classTeacherSummarySchema.extend({
  email: z.email().nullable(),
  ...memberAvatarUrlsShape,
});
export type ClassTeacherDetail = z.infer<typeof classTeacherDetailSchema>;

export const eligibleTeacherSummarySchema = z.object({
  membershipId: z.uuid(),
  userId: z.uuid(),
  displayName: z.string().nullable(),
  email: z.email().nullable(),
  ...memberAvatarUrlsShape,
});
export type EligibleTeacherSummary = z.infer<
  typeof eligibleTeacherSummarySchema
>;

export const classSummarySchema = z.object({
  id: z.uuid(),
  academyId: z.uuid(),
  name: classNameSchema,
  description: classDescriptionSchema,
  status: classStatusSchema,
  courses: z.array(assignedCourseSummarySchema),
  studentCount: z.number().int().nonnegative(),
  /**
   * The homeroom teacher, or null while the class runs unassigned. Nothing
   * about a class depends on having one.
   *
   * Kept beside `teachers` rather than derived from it because it is a
   * different question: `teachers` is who teaches here, this is who is
   * answerable, and every reader wants exactly one of the two.
   */
  assignedTeacher: assignedTeacherSummarySchema.nullable(),
  /**
   * Everyone who teaches this class, homeroom first, then assistants by name.
   * At most `CLASS_MAX_TEACHERS`, and empty only for an unassigned class with
   * no assistants either.
   */
  teachers: z.array(classTeacherSummarySchema).max(CLASS_MAX_TEACHERS),
  createdAt: z.iso.datetime(),
  /** Moves on course and roster changes too, not only on a name edit. */
  updatedAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().nullable(),
});
export type ClassSummary = z.infer<typeof classSummarySchema>;

/* --------------------------------------------------------------- schedule */

/** Minutes from academy-local midnight of the last instant a slot may end. */
export const CLASS_SCHEDULE_MAX_MINUTE = 2 * 24 * 60;
/** More windows than this on one class is a data problem, not a timetable. */
export const CLASS_SCHEDULE_MAX_SLOTS = 21;

/**
 * When one class meets, as a recurring academy-local rule.
 *
 * Minutes from local midnight rather than instants, because the rule is
 * "Tuesdays at four" and not `2026-09-01T07:00Z`. Stored as an instant it
 * would be wrong the first time an academy changed timezone, and unreadable to
 * the manager who typed it.
 *
 * `endMinute` may exceed 1440 for a class that crosses midnight. It never
 * wraps — a window that wrapped would be two windows wearing one row, and the
 * attendance check would have to guess which one a student's first minute fell
 * inside. §8.1 of the student points design.
 */
export const classScheduleSlotSchema = z.object({
  id: z.uuid(),
  /** 1 = Monday … 7 = Sunday, ISO-8601, academy-local. */
  weekday: z.number().int().min(1).max(7),
  /** Minutes from academy-local midnight. 16:00 is 960. */
  startMinute: z.number().int().min(0).max(CLASS_SCHEDULE_MAX_MINUTE),
  endMinute: z.number().int().min(1).max(CLASS_SCHEDULE_MAX_MINUTE),
});
export type ClassScheduleSlot = z.infer<typeof classScheduleSlotSchema>;

/** One row of a submitted timetable, before the server has given it an id. */
export const classScheduleSlotInputSchema = classScheduleSlotSchema
  .omit({ id: true })
  .refine((slot) => slot.endMinute > slot.startMinute, {
    message: "A class window must end after it starts.",
    path: ["endMinute"],
  });
export type ClassScheduleSlotInput = z.infer<
  typeof classScheduleSlotInputSchema
>;

export const classDetailSchema = classSummarySchema.extend({
  students: z.array(enrolledStudentSummarySchema),
  assignedTeacher: assignedTeacherDetailSchema.nullable(),
  teachers: z.array(classTeacherDetailSchema).max(CLASS_MAX_TEACHERS),
  /**
   * When the class meets. Empty is a valid timetable and means one specific
   * thing: this class never pays attendance points. Nothing else about it
   * changes, which is what lets the schedule arrive without a backfill.
   */
  schedule: z.array(classScheduleSlotSchema),
});
export type ClassDetail = z.infer<typeof classDetailSchema>;

/* ------------------------------------------------------------------ inputs */

export const classIdInputSchema = z.object({
  academyId: z.uuid(),
  classId: z.uuid(),
});

export const listClassesSchema = z.object({
  academyId: z.uuid(),
  status: classStatusSchema.optional(),
});

export const createClassSchema = z.object({
  academyId: z.uuid(),
  name: classNameSchema,
  description: classDescriptionSchema.default(""),
});

export const updateClassSchema = classIdInputSchema.extend({
  name: classNameSchema,
  description: classDescriptionSchema.default(""),
  /**
   * The class revision the editor loaded. A stale value fails rather than
   * silently overwriting a colleague working on the same class.
   */
  expectedUpdatedAt: z.iso.datetime(),
});

export const setClassStatusSchema = classIdInputSchema.extend({
  status: classStatusSchema,
});

export const setClassCoursesSchema = classIdInputSchema.extend({
  /** The complete desired set. The server derives additions and removals. */
  courseIds: z.array(z.uuid()).max(classCourseAssignmentLimit),
  expectedUpdatedAt: z.iso.datetime(),
});

/**
 * The complete desired timetable, replacing whatever is there.
 *
 * A set rather than add/edit/remove, for the same reason `setCourses` is one:
 * three operations would need the concurrency check, the authorization, and
 * the audit entry written three times for three shapes of one decision — when
 * does this class meet.
 */
export const setClassScheduleSchema = classIdInputSchema.extend({
  slots: z.array(classScheduleSlotInputSchema).max(CLASS_SCHEDULE_MAX_SLOTS),
  expectedUpdatedAt: z.iso.datetime(),
});
export type SetClassScheduleInput = z.infer<typeof setClassScheduleSchema>;

export const addClassStudentsSchema = classIdInputSchema.extend({
  membershipIds: z.array(z.uuid()).min(1).max(classEnrollmentBatchLimit),
});

export const removeClassStudentSchema = classIdInputSchema.extend({
  membershipId: z.uuid(),
});

/**
 * One nullable operation covers assign, replace, and remove. Splitting it
 * would duplicate the concurrency, authorization, and audit logic three times
 * for three shapes of the same decision: who is responsible for this class.
 */
export const setClassTeacherSchema = classIdInputSchema.extend({
  teacherMembershipId: z.uuid().nullable(),
  expectedUpdatedAt: z.iso.datetime(),
});

/**
 * The complete desired set of assistants, replacing whatever is there — the
 * same shape as `setCourses` and `setSchedule`, and for the same reason: add
 * and remove would each need their own concurrency check, authorization, and
 * audit entry for one decision, who teaches this class.
 *
 * The homeroom teacher is not in this list. Moving somebody between the two
 * roles is two decisions with two audit entries, which is what an auditor
 * asking "who became answerable for this class" needs to see.
 */
export const setClassAssistantTeachersSchema = classIdInputSchema.extend({
  teacherMembershipIds: z.array(z.uuid()).max(CLASS_MAX_ASSISTANT_TEACHERS),
  expectedUpdatedAt: z.iso.datetime(),
});
export type SetClassAssistantTeachersInput = z.infer<
  typeof setClassAssistantTeachersSchema
>;

/* ----------------------------------------------------------------- helpers */

/**
 * A membership grants class access only while it is still an active student
 * membership. Enrollment rows for a suspended or promoted member stay on the
 * roster so a Manager can see and clear them, but they grant nothing.
 */
export function enrollmentGrantsAccess(
  student: Pick<EnrolledStudentSummary, "membershipStatus" | "role">,
): boolean {
  return student.membershipStatus === "ACTIVE" && student.role === "STUDENT";
}

/**
 * The membership half of the effective-assignment predicate. Suspending the
 * assigned member or taking the `TEACHER` role away revokes their access
 * without erasing the assignment, so the stored row stays visible to managers
 * as unavailable rather than vanishing. The API pairs this with the class
 * academy and status; never treat it as the whole authorization check.
 *
 * Asks the role *set*, not the highest role. A director who also teaches
 * stores `role = MANAGER`, and comparing that marked a perfectly valid
 * assignment "no longer a teacher" the moment they were given a second role.
 */
export function assignmentGrantsAccess(
  teacher: Pick<
    AssignedTeacherSummary,
    "membershipStatus" | "roles" | "userStatus"
  > | null,
): boolean {
  return (
    teacher?.userStatus === "ACTIVE" &&
    teacher.membershipStatus === "ACTIVE" &&
    teacher.roles.includes("TEACHER")
  );
}
