import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  addClassStudentsSchema,
  classDetailSchema,
  classIdInputSchema,
  classSummarySchema,
  createClassSchema,
  eligibleStudentSummarySchema,
  listClassesSchema,
  removeClassStudentSchema,
  setClassCoursesSchema,
  setClassStatusSchema,
  updateClassSchema,
} from "../../classes/class.js";

/**
 * Course assignment and enrollment both return the full class detail: the
 * counts, the roster, and `updatedAt` all move together, so a mutation that
 * returned only its own slice would leave the page inconsistent.
 */
export const academyClassesContract = {
  list: oc
    .input(listClassesSchema)
    .output(z.object({ classes: z.array(classSummarySchema) })),
  get: oc.input(classIdInputSchema).output(classDetailSchema),
  create: oc.input(createClassSchema).output(classDetailSchema),
  update: oc.input(updateClassSchema).output(classDetailSchema),
  setStatus: oc.input(setClassStatusSchema).output(classDetailSchema),
  setCourses: oc.input(setClassCoursesSchema).output(classDetailSchema),
  listEligibleStudents: oc
    .input(classIdInputSchema)
    .output(z.object({ students: z.array(eligibleStudentSummarySchema) })),
  addStudents: oc.input(addClassStudentsSchema).output(classDetailSchema),
  removeStudent: oc.input(removeClassStudentSchema).output(classDetailSchema),
};
