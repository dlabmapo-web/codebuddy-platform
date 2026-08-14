import { z } from "zod";

import { academyRoleSchema } from "../auth/roles.js";
import { membershipStatusSchema } from "../memberships/status.js";
import { profileImageSchema } from "./profile.js";
import { optionalBirthDate, optionalPhone, optionalText } from "./text.js";
import {
  codingInterestLimit,
  codingInterestSchema,
  guardianRelationshipSchema,
  teachingLanguageLimit,
  teachingLanguageSchema,
  teachingSpecialtyLimit,
  teachingSpecialtySchema,
} from "./vocabulary.js";

/**
 * The academy half of My Page, and the whole of the manager's member-profile
 * route.
 *
 * One account can hold a different role in two academies, so an academy
 * profile is scoped to a *membership*, never to a user. That boundary is the
 * reason this file exists separately from `profile.ts`: it is what stops one
 * academy's manager from editing a person as they appear in another.
 */

export const academyProfileSectionSchema = z.enum([
  "COMMON",
  "STUDENT_DETAILS",
  "STUDENT_SELF_EXPRESSION",
  "STAFF",
]);
export type AcademyProfileSection = z.infer<typeof academyProfileSectionSchema>;

/* --------------------------------------------------------------- responses */

export const academyProfileContextSchema = z.object({
  membershipId: z.uuid(),
  academyId: z.uuid(),
  academyName: z.string().min(1),
  userId: z.uuid(),
  /** Shown so the reader can tell an override from the value beneath it. */
  globalDisplayName: z.string().nullable(),
  email: z.email().nullable(),
  username: z.string().nullable(),
  role: academyRoleSchema,
  status: membershipStatusSchema,
  joinedAt: z.iso.datetime().nullable(),
});
export type AcademyProfileContext = z.infer<typeof academyProfileContextSchema>;

/**
 * Fields both the member and an active manager may write.
 *
 * `updatedAt` is null until the row is created, which happens the first time
 * anyone saves. A client that has never seen a row sends null and a client
 * holding a stale row sends a stale timestamp; both are answered correctly.
 */
export const academyCommonProfileSchema = z.object({
  academyDisplayName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  image: profileImageSchema.nullable(),
  updatedAt: z.iso.datetime().nullable(),
});
export type AcademyCommonProfile = z.infer<typeof academyCommonProfileSchema>;

/**
 * The student's academy record.
 *
 * Guardian and emergency details are academy-private: self, active managers,
 * and nothing else. A teacher does not receive them merely because they teach
 * the class. `studentNumber` is manager-owned and read-only to the student.
 */
export const studentAcademyProfileSchema = z.object({
  dateOfBirth: z.iso.date().nullable(),
  schoolName: z.string().nullable(),
  schoolGrade: z.string().nullable(),
  guardianName: z.string().nullable(),
  guardianRelationship: guardianRelationshipSchema.nullable(),
  guardianPhone: z.string().nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactPhone: z.string().nullable(),
  /** The student's own expression. A manager reads it and does not rewrite it. */
  codingInterests: z.array(codingInterestSchema),
  learningGoal: z.string().nullable(),
  studentNumber: z.string().nullable(),
  updatedAt: z.iso.datetime().nullable(),
});
export type StudentAcademyProfile = z.infer<typeof studentAcademyProfileSchema>;

/**
 * One shape for `TEACHER`, `TEAM_LEAD`, and `MANAGER`. The difference between
 * those roles is authority, not biography, and three near-identical models
 * would only give three places for a field to drift.
 */
export const staffAcademyProfileSchema = z.object({
  bio: z.string().nullable(),
  specialties: z.array(teachingSpecialtySchema),
  teachingLanguages: z.array(teachingLanguageSchema),
  /** Manager-owned: what the academy says this person is responsible for. */
  academyTitle: z.string().nullable(),
  employeeNumber: z.string().nullable(),
  updatedAt: z.iso.datetime().nullable(),
});
export type StaffAcademyProfile = z.infer<typeof staffAcademyProfileSchema>;

/** Read-only learning context. Links, counts, and nothing sensitive. */
export const academyClassSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  courseCount: z.number().int().nonnegative(),
  studentCount: z.number().int().nonnegative(),
});
export type AcademyClassSummary = z.infer<typeof academyClassSummarySchema>;

export const academyCourseSummarySchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  className: z.string().min(1),
});
export type AcademyCourseSummary = z.infer<typeof academyCourseSummarySchema>;

export const academyProfileResponseSchema = z.object({
  context: academyProfileContextSchema,
  common: academyCommonProfileSchema,
  /** Present only for a `STUDENT` membership; the shape follows the role. */
  student: studentAcademyProfileSchema.nullable(),
  /** Present only for a staff membership. */
  staff: staffAcademyProfileSchema.nullable(),
  classes: z.array(academyClassSummarySchema),
  courses: z.array(academyCourseSummarySchema),
  /**
   * What the caller may write here. The server decides; the browser renders.
   * Hidden controls are a layout decision, never an authorization one.
   */
  editableSections: z.array(academyProfileSectionSchema),
});
export type AcademyProfileResponse = z.infer<
  typeof academyProfileResponseSchema
>;

/* ------------------------------------------------------------------ inputs */

const academyScopeSchema = z.object({ academyId: z.uuid() });
const managerScopeSchema = academyScopeSchema.extend({
  membershipId: z.uuid(),
});

/** Null means "this section has never been saved", not "skip the check". */
const sectionRevisionSchema = z.iso.datetime().nullable();

const commonFieldsSchema = z.object({
  academyDisplayName: optionalText(60),
  contactPhone: optionalPhone,
});

const studentDetailFieldsSchema = z.object({
  dateOfBirth: optionalBirthDate,
  schoolName: optionalText(120),
  schoolGrade: optionalText(40),
  guardianName: optionalText(60),
  guardianRelationship: guardianRelationshipSchema.nullable(),
  guardianPhone: optionalPhone,
  emergencyContactName: optionalText(60),
  emergencyContactPhone: optionalPhone,
});

const studentSelfExpressionFieldsSchema = z.object({
  codingInterests: z.array(codingInterestSchema).max(codingInterestLimit),
  learningGoal: optionalText(280),
});

const staffSelfFieldsSchema = z.object({
  bio: optionalText(280),
  specialties: z.array(teachingSpecialtySchema).max(teachingSpecialtyLimit),
  teachingLanguages: z
    .array(teachingLanguageSchema)
    .max(teachingLanguageLimit),
});

/** Employment facts the academy maintains, never the person themselves. */
const managerOwnedFieldsSchema = z.object({
  studentNumber: optionalText(40),
  academyTitle: optionalText(80),
  employeeNumber: optionalText(40),
});

export const getAcademyProfileSchema = academyScopeSchema;
export const getManagedAcademyProfileSchema = managerScopeSchema;

export const updateMyAcademyProfileSchema = academyScopeSchema
  .extend(commonFieldsSchema.shape)
  .extend({ expectedUpdatedAt: sectionRevisionSchema });

export const updateMyStudentDetailsSchema = academyScopeSchema
  .extend(studentDetailFieldsSchema.shape)
  .extend({ expectedUpdatedAt: sectionRevisionSchema });

export const updateMyStudentSelfExpressionSchema = academyScopeSchema
  .extend(studentSelfExpressionFieldsSchema.shape)
  .extend({ expectedUpdatedAt: sectionRevisionSchema });

export const updateMyStaffProfileSchema = academyScopeSchema
  .extend(staffSelfFieldsSchema.shape)
  .extend({ expectedUpdatedAt: sectionRevisionSchema });

/**
 * The manager's save.
 *
 * One payload with explicitly separated blocks rather than a flat object: the
 * server can then reject a `student` block on a staff membership outright
 * instead of silently ignoring fields, and the audit record names the section
 * a change belongs to. The student's self-expression fields are absent by
 * construction — a manager reads them, and there is no field here to write.
 */
export const updateManagedAcademyProfileSchema = managerScopeSchema.extend({
  common: commonFieldsSchema,
  commonUpdatedAt: sectionRevisionSchema,
  student: studentDetailFieldsSchema
    .extend(managerOwnedFieldsSchema.pick({ studentNumber: true }).shape)
    .nullable(),
  studentUpdatedAt: sectionRevisionSchema,
  staff: staffSelfFieldsSchema
    .extend(
      managerOwnedFieldsSchema.pick({ academyTitle: true, employeeNumber: true })
        .shape,
    )
    .nullable(),
  staffUpdatedAt: sectionRevisionSchema,
});

/* ----------------------------------------------------------------- helpers */

export const staffRoles = ["TEACHER", "TEAM_LEAD", "MANAGER"] as const;

export function isStaffRole(role: z.infer<typeof academyRoleSchema>): boolean {
  return (staffRoles as readonly string[]).includes(role);
}
