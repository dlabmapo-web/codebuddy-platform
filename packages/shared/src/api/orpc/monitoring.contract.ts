import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  listFeedbackInputSchema,
  monitoringAcademyInputSchema,
  monitoringClassInputSchema,
  monitoringClassRosterSchema,
  monitoringClassSummarySchema,
  monitoringFeedbackSchema,
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
  listFeedback: oc.input(listFeedbackInputSchema).output(
    z.object({
      feedback: z.array(monitoringFeedbackSchema),
      /** Null when the page reached the beginning of the history. */
      nextBefore: z.iso.datetime().nullable(),
    }),
  ),
};
