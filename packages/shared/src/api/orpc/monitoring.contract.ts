import { oc } from "@orpc/contract";
import { z } from "zod";

import { workspaceNavigatorContextSchema } from "../../content/learn.js";
import {
  listFeedbackInputSchema,
  listMyFeedbackInputSchema,
  markMyFeedbackReadInputSchema,
  monitoringAcademyInputSchema,
  monitoringClassInputSchema,
  monitoringClassRosterSchema,
  monitoringClassSummarySchema,
  monitoringExercisePreviewSchema,
  monitoringFeedbackSchema,
  monitoringMaterialInputSchema,
  monitoringStudentContextInputSchema,
  monitoringStudentContextSchema,
} from "../../monitoring/monitoring.js";

/**
 * The durable half of live monitoring.
 *
 * Everything reachable here works without a socket: the class list, the
 * roster, the student's exercise, and the feedback history are ordinary
 * authorized reads. Only connection-sensitive state — who is online right now,
 * cursors, live code — belongs to the monitoring namespace. Splitting them
 * this way keeps the pages testable and stops a realtime outage from emptying
 * a roster.
 *
 * Kept apart from `academyClassesContract`, which is the management surface
 * for Team Leads and Managers: these operations answer to the effective
 * assigned teacher and to nobody else.
 */
export const monitoringContract = {
  /**
   * Returns the flag rather than an error so the teacher's own page can
   * explain that monitoring is not enabled yet instead of rendering a denial
   * that reads like a bug.
   */
  listAssignedClasses: oc.input(monitoringAcademyInputSchema).output(
    z.object({
      featureEnabled: z.boolean(),
      classes: z.array(monitoringClassSummarySchema),
    }),
  ),
  getClassRoster: oc
    .input(monitoringClassInputSchema)
    .output(monitoringClassRosterSchema),
  getStudentContext: oc
    .input(monitoringStudentContextInputSchema)
    .output(monitoringStudentContextSchema),
  /**
   * The monitored student's own course, as the navigator draws it.
   *
   * Returns that student's progress, which is why it is here rather than on
   * the learn contract: `learn.getExerciseBootstrap` derives its subject from
   * the caller's identity and structurally cannot report somebody else's.
   */
  getStudentCurriculum: oc
    .input(monitoringMaterialInputSchema)
    .output(workspaceNavigatorContextSchema),
  /**
   * One exercise the teacher wants to read, without leaving the live watch.
   *
   * The public projection only. It has no draft id, so the preview surface has
   * nothing to join a collaboration room with even by mistake.
   */
  getExercisePreview: oc
    .input(monitoringMaterialInputSchema)
    .output(monitoringExercisePreviewSchema),
  listFeedback: oc.input(listFeedbackInputSchema).output(
    z.object({
      feedback: z.array(monitoringFeedbackSchema),
      /** Null when the page reached the beginning of the history. */
      nextBefore: z.iso.datetime().nullable(),
    }),
  ),
  /**
   * The student's own feedback, for the student.
   *
   * The only operation in this contract that does not answer to an assigned
   * teacher: it answers to the recipient. It reads through the caller's
   * identity and takes no membership, so the authorization here shares nothing
   * with `listFeedback` beyond the row shape it returns.
   */
  listMyFeedback: oc.input(listMyFeedbackInputSchema).output(
    z.object({
      feedback: z.array(monitoringFeedbackSchema),
      nextBefore: z.iso.datetime().nullable(),
    }),
  ),
  markMyFeedbackRead: oc
    .input(markMyFeedbackReadInputSchema)
    .output(z.object({ readCount: z.number().int().nonnegative() })),
};
