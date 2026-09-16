import { z } from "zod";

import { leaderboardIneligibleReasonSchema } from "../points/points.js";
import { memberAvatarUrlsSchema } from "../profile/avatar.js";

/**
 * The teacher's students, as a roster rather than as a measurement.
 *
 * A sibling of `teacher-students.ts`, not a mode of it. That one answers "who
 * needs me this week" and is built to be narrowed — by course, by lecture, by
 * a range of days. This one answers "who is in my classes, and where do they
 * stand", which is a question about identity and standing and is not narrowed
 * by anything except the class.
 *
 * Both are served from the same authorization unit, so the two views can never
 * disagree about which students exist.
 *
 * ## Whole, and grouped by class
 *
 * A teacher's scope is bounded by assignment — the analytics service's own
 * comment puts it at "hundreds of students, not millions" — so the whole
 * roster is returned at once rather than a page at a time. That is what lets a
 * class carry a complete ranking: a position computed over one page of a class
 * would renumber itself as the reader turned pages.
 *
 * It is grouped by class because a board is per class, and a standing belongs
 * to the cohort it was won in. The table flattens those groups into one row
 * per seat and pages them in the browser — a student in two of this teacher's
 * classes is two rows, because they have two standings — but that is a
 * decision about reading, and the grouping is the decision about meaning.
 */

/** Past this, the response says so rather than growing. See `truncated`. */
export const TEACHER_ROSTER_MAX_STUDENTS = 500;

export const teacherRosterStudentSchema = z
  .object({
    membershipId: z.uuid(),
    displayName: z.string().min(1).max(200),
    /** The sign-in name, shown under "ID" (아이디). */
    username: z.string().nullable(),
    joinedAt: z.iso.datetime().nullable(),
    avatar: memberAvatarUrlsSchema,
    /**
     * Absent when the academy does not run points.
     *
     * Never zero in that case. Zero is a real score a student can have, and a
     * table that printed it for an academy which keeps no score would be
     * inventing a fact about every child in it.
     */
    points: z.number().int().nonnegative().optional(),
    /** Absent when the class has no ranked board, or points are off. */
    position: z.number().int().positive().optional(),
    /**
     * Always present, points or not.
     *
     * Measured by `student-facts`, the unit the analytics view uses, so the
     * same student's solved count cannot differ between the two views. It is
     * also what the table has left to say when an academy runs no points.
     */
    solvedProblems: z.number().int().nonnegative(),
  })
  .strict();
export type TeacherRosterStudent = z.infer<typeof teacherRosterStudentSchema>;

/**
 * Whether this class has a ranking, and why not when it does not.
 *
 * A reason rather than a bare `false`, because the three cases read very
 * differently to a teacher: nobody has earned anything yet, or the board could
 * not be read. Saying which is the difference between an answer and a shrug.
 */
export const teacherRosterBoardSchema = z.discriminatedUnion("ranked", [
  z.object({ ranked: z.literal(true) }).strict(),
  z
    .object({
      ranked: z.literal(false),
      reason: leaderboardIneligibleReasonSchema,
    })
    .strict(),
]);
export type TeacherRosterBoard = z.infer<typeof teacherRosterBoardSchema>;

export const teacherRosterClassSchema = z
  .object({
    classId: z.uuid(),
    name: z.string().min(1).max(200),
    students: z.array(teacherRosterStudentSchema),
    /**
     * Absent when the academy runs no points at all.
     *
     * Every reason this union carries is a statement about a board — nobody
     * has earned anything yet, or it could not be read — and an academy that
     * keeps no score has no board for any of them to be true or false about.
     * Sending `NO_ACTIVITY_YET` there would tell a teacher their students have
     * earned nothing, which is a claim about the students rather than about a
     * feature nobody switched on.
     */
    board: teacherRosterBoardSchema.optional(),
  })
  .strict();
export type TeacherRosterClass = z.infer<typeof teacherRosterClassSchema>;

export const teacherRosterSchema = z
  .object({
    classes: z.array(teacherRosterClassSchema),
    /**
     * Every class this teacher is assigned, filtered or not.
     *
     * Separate from `classes`, which holds only what the current filter let
     * through. The picker has to keep offering the others, or narrowing to one
     * class would remove the control that narrowed it — and the truncation
     * notice, which asks the reader to narrow by class, would be advice with
     * nothing to act on.
     */
    classOptions: z.array(
      z.object({ value: z.uuid(), label: z.string().min(1).max(200) }).strict(),
    ),
    /** The academy runs points at all. Off means two columns do not exist. */
    pointsEnabled: z.boolean(),
    /** The cap was reached and the roster is incomplete. */
    truncated: z.boolean(),
    generatedAt: z.iso.datetime(),
  })
  .strict();
export type TeacherRoster = z.infer<typeof teacherRosterSchema>;

export const teacherRosterInputSchema = z
  .object({
    academyId: z.uuid(),
    /** One class, or every assigned class when absent. */
    classId: z.uuid().optional(),
    search: z.string().trim().max(120).optional(),
  })
  .strict();
export type TeacherRosterInput = z.infer<typeof teacherRosterInputSchema>;
