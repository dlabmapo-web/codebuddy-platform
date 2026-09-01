import { z } from "zod";

import { classStatusSchema } from "../classes/class.js";
import { academyScaleSchema } from "../content/manager-overview.js";
import { academyRoleSchema } from "../auth/roles.js";
import { membershipStatusSchema } from "../memberships/status.js";

/**
 * What the console may read about a person's participation, and only that.
 *
 * §3.4 of the console people operations design moves the directory's privacy
 * line from *identity vs. learning* to *structure and totals vs. person and
 * artefact*: an operator may see which classes a student sits in and how much
 * they have solved, never the guardian details in `StudentAcademyProfile` and
 * never a line of submitted source code. Anyone extending this file should
 * read that section before adding a field — a count is a fact about the
 * platform's operation, and the work behind it is the student's.
 *
 * Every read here is gated on `platform.users.participation.read`, apart from
 * `platform.users.read`, and a student membership card is audited when it is
 * opened (§3.5). Nothing here is ever fetched eagerly with the directory or
 * the account header — only lazily, per membership, on first expand.
 */

/** One class this person sits in, and the courses it teaches. */
export const participationClassSchema = z.object({
  classId: z.uuid(),
  name: z.string().min(1),
  status: classStatusSchema,
  enrolledAt: z.iso.datetime(),
  teacherName: z.string().nullable(),
  courses: z.array(
    z.object({ courseId: z.uuid(), title: z.string().min(1) }),
  ),
});
export type ParticipationClass = z.infer<typeof participationClassSchema>;

/** What a student has actually done, as totals. Never an artefact. §3.4. */
export const studentParticipationSchema = z.object({
  classes: z.array(participationClassSchema),
  solvedCount: z.number().int().nonnegative(),
  attemptedCount: z.number().int().nonnegative(),
  totalAttempts: z.number().int().nonnegative(),
  /** Summed from `StudentCourseLearningDay`, academy-local days. */
  activeSeconds: z.number().int().nonnegative(),
  activeDays: z.number().int().nonnegative(),
  /** Consecutive academy-local days ending today or yesterday, else 0. */
  streakDays: z.number().int().nonnegative(),
  pointsEarned: z.number().int().nonnegative(),
  lastActiveAt: z.iso.datetime().nullable(),
  /** Per course, so a stalled course is visible rather than averaged away. */
  courses: z.array(
    z.object({
      courseId: z.uuid(),
      title: z.string().min(1),
      solved: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
      activeSeconds: z.number().int().nonnegative(),
    }),
  ),
});
export type StudentParticipation = z.infer<typeof studentParticipationSchema>;

/** The classes a teacher runs, the courses in them, and their roster reach. */
export const teacherParticipationSchema = z.object({
  classes: z.array(
    participationClassSchema.extend({
      studentCount: z.number().int().nonnegative(),
    }),
  ),
  studentReach: z.number().int().nonnegative(),
  courseCount: z.number().int().nonnegative(),
});
export type TeacherParticipation = z.infer<typeof teacherParticipationSchema>;

/** The curriculum a team lead has authored, and how many classes teach it. */
export const leadParticipationSchema = z.object({
  courses: z.array(
    z.object({
      courseId: z.uuid(),
      title: z.string().min(1),
      isVisible: z.boolean(),
      classCount: z.number().int().nonnegative(),
      updatedAt: z.iso.datetime(),
    }),
  ),
});
export type LeadParticipation = z.infer<typeof leadParticipationSchema>;

/**
 * Deliberately the thinnest of the four. The academy's own console page
 * already answers everything a manager card would restate — this exists so
 * the card is not empty, and links to where the detail lives.
 */
export const managerParticipationSchema = z.object({
  scale: academyScaleSchema,
  classCount: z.number().int().nonnegative(),
  courseCount: z.number().int().nonnegative(),
});
export type ManagerParticipation = z.infer<typeof managerParticipationSchema>;

/**
 * One membership, and its participation.
 *
 * Exactly one of the four branches is populated — the one matching `role`. A
 * discriminated union would be tidier to write and worse to render: the card
 * shell (academy name, role chip, status, joined date) is identical for all
 * four and only the body differs, so four nullable branches keep one
 * component with one switch rather than four components repeating a header.
 * §5.3.
 */
export const membershipParticipationSchema = z.object({
  membershipId: z.uuid(),
  academyId: z.uuid(),
  academySlug: z.string().min(1),
  academyName: z.string().min(1),
  role: academyRoleSchema,
  status: membershipStatusSchema,
  joinedAt: z.iso.datetime().nullable(),
  student: studentParticipationSchema.nullable(),
  teacher: teacherParticipationSchema.nullable(),
  lead: leadParticipationSchema.nullable(),
  manager: managerParticipationSchema.nullable(),
});
export type MembershipParticipation = z.infer<
  typeof membershipParticipationSchema
>;

/** What a membership card asks for, once expanded. */
export const getMembershipParticipationInputSchema = z
  .object({
    userId: z.uuid(),
    membershipId: z.uuid(),
  })
  .strict();
export type GetMembershipParticipationInput = z.infer<
  typeof getMembershipParticipationInputSchema
>;
