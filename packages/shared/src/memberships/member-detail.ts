import { z } from "zod";

import { academyRoleSchema } from "../auth/roles.js";
import { memberAvatarUrlsSchema } from "../profile/avatar.js";
import { rosterViewerSchema } from "./people-directory.js";
import { rosterClassRefSchema } from "./student-roster.js";
import { membershipStatusSchema } from "./status.js";

/**
 * One member, read by somebody who may look them up but not necessarily change
 * them.
 *
 * Two pages, several roles, one contract each. A Manager, a Team Lead and a
 * Teacher open the same student page and are answered with different sections
 * of it; three separate contracts would be three places for the same field to
 * drift, and the difference between those readers is authority, not biography.
 *
 * ## Absent, never empty
 *
 * A section the reader may not have is **omitted**. It is not sent as `null`,
 * not sent with nulled fields, and the page draws no heading for it. The
 * distinction is the same one the rosters make and it matters more here: a
 * "Guardian" heading over an em dash tells a Team Lead that this child has no
 * guardian on file, and a heading with a lock tells them which children do.
 * Both are answers to a question they may not ask. Nothing is the only honest
 * rendering.
 *
 * ## What these pages are not
 *
 * Not the whole record. A student number, a school, a coding interest and a
 * learning goal are all written on the manager's editor and read there; this
 * page carries only what one of its three readers opens it to find out, which
 * is who somebody is, what they are being taught, and how they are doing.
 *
 * ## Read-only
 *
 * Neither page writes. The manager's editor at `/people/[membershipId]` keeps
 * every write it has, and these pages link to it rather than reproducing it —
 * a viewer that is also an editor is two components wearing one name.
 */

/* ------------------------------------------------------------- shared bits */

/** Who a member is, for every reader either page admits. */
export const memberIdentitySchema = z
  .object({
    membershipId: z.uuid(),
    userId: z.uuid(),
    displayName: z.string().min(1).max(200),
    /** The sign-in name, shown under "ID" (아이디). */
    username: z.string().nullable(),
    status: membershipStatusSchema,
    joinedAt: z.iso.datetime().nullable(),
    avatar: memberAvatarUrlsSchema,
  })
  .strict();
export type MemberIdentity = z.infer<typeof memberIdentitySchema>;

export const memberDetailInputSchema = z
  .object({ academyId: z.uuid(), membershipId: z.uuid() })
  .strict();
export type MemberDetailInput = z.infer<typeof memberDetailInputSchema>;

/* ----------------------------------------------------------- student detail */

/**
 * Where a student sits, and who teaches them there.
 *
 * The teacher's name is here because the question this page answers for a Team
 * Lead is often "who should I talk to about 지호", and an id would make them go
 * and look it up. Null when the class has no usable assignment — the same
 * condition the class roster calls `class_teacher_unavailable`.
 */
/**
 * A class as either member page describes it.
 *
 * The same two facts on both, because they answer the same question from two
 * sides: a manager reading a teacher wants to know how big the room is and
 * what is taught in it, and a manager reading a student wants exactly that
 * about the rooms the child sits in. One shape, so the two pages cannot come
 * to describe a class differently.
 */
export const memberClassRefSchema = rosterClassRefSchema
  .extend({
    /**
     * Active students holding a seat here.
     *
     * The size of the room, which is what turns a position into a fact: 3rd is
     * a different result in a class of four than in a class of thirty, and a
     * standing cannot say which without it.
     */
    studentCount: z.number().int().nonnegative(),
    /** The visible curriculum this class is assigned. */
    courses: z.array(
      z.object({ courseId: z.uuid(), title: z.string() }).strict(),
    ),
  })
  .strict();
export type MemberClassRef = z.infer<typeof memberClassRefSchema>;

export const studentClassRefSchema = memberClassRefSchema
  .extend({ teacherName: z.string().min(1).max(200).nullable() })
  .strict();
export type StudentClassRef = z.infer<typeof studentClassRefSchema>;

/**
 * A standing, per class, at the all-time period.
 *
 * Per class rather than per student because that is the only cohort the
 * platform ranks within. A student in two classes has two positions, and
 * collapsing them into one number would invent a cohort nobody competes in.
 */
export const studentStandingSchema = z
  .object({
    classId: z.uuid(),
    className: z.string().min(1).max(200),
    points: z.number().int().nonnegative(),
    /** Absent when the class has no ranked board — see `teacher-roster.ts`. */
    position: z.number().int().positive().optional(),
  })
  .strict();
export type StudentStanding = z.infer<typeof studentStandingSchema>;

/** What the student has done, in the measurements the teaching surfaces use. */
export const studentWorkSchema = z
  .object({
    solvedProblems: z.number().int().nonnegative(),
    submissions: z.number().int().nonnegative(),
    activeSeconds: z.number().int().nonnegative(),
    lastActivityAt: z.iso.datetime().nullable(),
  })
  .strict();
export type StudentWork = z.infer<typeof studentWorkSchema>;

/**
 * Academy-private, and the reason this contract exists in the shape it does.
 *
 * `studentAcademyProfileSchema` states the rule: the student and active
 * managers, nobody else. A Team Lead runs the curriculum and a Teacher teaches
 * the class, and neither of those is a reason to hold a child's home number.
 */
export const studentGuardianSchema = z
  .object({
    guardianName: z.string().nullable(),
    guardianRelationship: z.string().nullable(),
    guardianPhone: z.string().nullable(),
    emergencyContactName: z.string().nullable(),
    emergencyContactPhone: z.string().nullable(),
  })
  .strict();
export type StudentGuardian = z.infer<typeof studentGuardianSchema>;

/**
 * A course this student is actually studying.
 *
 * Their classes' assigned curriculum, de-duplicated: a student in two classes
 * that both teach Python is studying Python once. Hidden courses are left out
 * — a course the academy has not published is not something a child is being
 * taught, and naming it here would be the one place in the studio that said
 * otherwise.
 */
export const studentCourseRefSchema = z
  .object({
    courseId: z.uuid(),
    title: z.string().min(1).max(200),
    /**
     * Which of the classes on this page teach it.
     *
     * The reverse of the list a class carries, and not a repetition of it: a
     * reader looking at a course asks "where is this happening", and a reader
     * looking at a class asks "what are they doing there". One course taught
     * in two of a student's classes is the case that makes both questions
     * worth answering separately.
     */
    classNames: z.array(z.string().min(1).max(200)),
    /**
     * This student's counted learning time on this course, over everything.
     *
     * The one measurement that is genuinely per course — points and solved
     * problems are counted per class and per academy — so it is the thing a
     * course row can say about this child that no other row on the page does.
     */
    activeSeconds: z.number().int().nonnegative(),
  })
  .strict();
export type StudentCourseRef = z.infer<typeof studentCourseRefSchema>;

export const studentDetailSchema = z
  .object({
    identity: memberIdentitySchema,
    /**
     * What they are being taught, across every class this reader may see.
     *
     * This page is opened to answer "how is this child doing", and the courses
     * are the frame that question is asked inside. Where they go to school is
     * an admissions record: it is on the manager's editor, where it is
     * written, and it told no reader of this page anything they came for.
     */
    courses: z.array(studentCourseRefSchema),
    /** Every class for a Manager or Team Lead; the reader's own for a Teacher. */
    classes: z.array(studentClassRefSchema),
    /** Absent when the academy does not run points at all. */
    standing: z.array(studentStandingSchema).optional(),
    work: studentWorkSchema,
    /** Absent for every reader who may not manage members. */
    guardian: studentGuardianSchema.optional(),
    viewer: rosterViewerSchema,
  })
  .strict();
export type StudentDetail = z.infer<typeof studentDetailSchema>;

/* ------------------------------------------------------------- staff detail */

export const staffContactSchema = z
  .object({
    email: z.string().nullable(),
    contactPhone: z.string().nullable(),
    employeeNumber: z.string().nullable(),
  })
  .strict();
export type StaffContact = z.infer<typeof staffContactSchema>;

export const staffDetailSchema = z
  .object({
    identity: memberIdentitySchema,
    /** Every role held, in `academyRoles` order. */
    roles: z.array(academyRoleSchema).min(1),
    academyTitle: z.string().nullable(),
    classes: z
      .object({
        homeroom: z.array(memberClassRefSchema),
        assistant: z.array(memberClassRefSchema),
      })
      .strict(),
    /**
     * Absent for a reader who may not manage members.
     *
     * Withheld in the Staff roster and withheld again here: a field a table
     * does not show is not a field an open row recovers.
     */
    contact: staffContactSchema.optional(),
    viewer: rosterViewerSchema,
  })
  .strict();
export type StaffDetail = z.infer<typeof staffDetailSchema>;
