import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  historyScopeSchema,
  historyStudentSchema,
  historyPageSchema,
  historySearchSchema,
  historyFilterSchema,
  historyIdentitySchema,
  historyMaterialSchema,
  historySummarySchema,
  historyAttemptSchema,
  historyAttemptTargetSchema,
  historySubmissionTargetSchema,
  historySubmissionSchema,
} from "../../content/student-work-history.js";

/** Saved work reads only. Source is returned by getSubmission, never a list. */
export const studentWorkHistoryContract = {
  listClasses: oc
    .input(z.object({ academyId: z.uuid(), ...historySearchSchema.shape }))
    .output(
      z.object({
        rows: z.array(z.object({ id: z.uuid(), title: z.string() })),
        pagination: historyPageSchema,
      }),
    ),
  listStudentRoster: oc
    .input(historyScopeSchema.extend(historySearchSchema.shape))
    .output(
      z.object({
        rows: z.array(historyIdentitySchema),
        pagination: historyPageSchema,
      }),
    ),
  getStudentSummary: oc
    .input(historyStudentSchema.extend({ courseId: z.uuid().optional() }))
    .output(historySummarySchema),
  listStudentMaterials: oc.input(historyFilterSchema).output(
    z.object({
      rows: z.array(historyMaterialSchema),
      pagination: historyPageSchema,
    }),
  ),
  listMaterialStudents: oc
    .input(
      historyScopeSchema.extend({
        materialId: z.uuid(),
        submitted: z.boolean().optional(),
        ...historySearchSchema.shape,
      }),
    )
    .output(
      z.object({
        rows: z.array(
          historyIdentitySchema.extend({
            submissions: z.number().int().nonnegative(),
            score: z.number().nullable().default(null),
            maximum: z.number().nullable().default(null),
            completed: z.boolean().nullable().default(null),
            latestAt: z.iso.datetime().nullable().default(null),
          }),
        ),
        pagination: historyPageSchema,
      }),
    ),
  listAttempts: oc
    .input(
      historyAttemptTargetSchema.extend({
        page: z.number().int().positive().default(1),
      }),
    )
    .output(
      z.object({
        attempts: z.array(historyAttemptSchema),
        material: historyMaterialSchema
          .pick({ materialId: true, title: true, type: true })
          .optional(),
        pagination: historyPageSchema,
      }),
    ),
  getSubmission: oc
    .input(historySubmissionTargetSchema)
    .output(historySubmissionSchema),
};
