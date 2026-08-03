import { z } from "zod";

import { academyRoleSchema } from "../auth/roles.js";
import { membershipStatusSchema } from "../memberships/status.js";

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
});
export type EnrolledStudentSummary = z.infer<
  typeof enrolledStudentSummarySchema
>;

export const eligibleStudentSummarySchema = z.object({
  membershipId: z.uuid(),
  userId: z.uuid(),
  displayName: z.string().nullable(),
  email: z.email().nullable(),
});
export type EligibleStudentSummary = z.infer<
  typeof eligibleStudentSummarySchema
>;

export const classSummarySchema = z.object({
  id: z.uuid(),
  academyId: z.uuid(),
  name: classNameSchema,
  description: classDescriptionSchema,
  status: classStatusSchema,
  courses: z.array(assignedCourseSummarySchema),
  studentCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  /** Moves on course and roster changes too, not only on a name edit. */
  updatedAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().nullable(),
});
export type ClassSummary = z.infer<typeof classSummarySchema>;

export const classDetailSchema = classSummarySchema.extend({
  students: z.array(enrolledStudentSummarySchema),
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

export const addClassStudentsSchema = classIdInputSchema.extend({
  membershipIds: z.array(z.uuid()).min(1).max(classEnrollmentBatchLimit),
});

export const removeClassStudentSchema = classIdInputSchema.extend({
  membershipId: z.uuid(),
});

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
