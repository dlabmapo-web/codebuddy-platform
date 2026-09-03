import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  addClassStudentsSchema,
  classDetailSchema,
  classIdInputSchema,
  classSummarySchema,
  createClassSchema,
  eligibleStudentSummarySchema,
  eligibleTeacherSummarySchema,
  listClassesSchema,
  removeClassStudentSchema,
  setClassAssistantTeachersSchema,
  setClassCoursesSchema,
  deleteClassSchema,
  setClassStatusSchema,
  setClassScheduleSchema,
  setClassTeacherSchema,
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
  /**
   * Destroy a class. Archiving is the ordinary end of one; this is for a class
   * created by mistake, and it is refused once anybody has submitted through it.
   */
  delete: oc.input(deleteClassSchema).output(z.object({ classId: z.uuid() })),
  setCourses: oc.input(setClassCoursesSchema).output(classDetailSchema),
  /**
   * When the class meets. §8.1 — the whole timetable at once, `MANAGER` only,
   * and the only thing in this contract that attendance points depend on.
   */
  setSchedule: oc.input(setClassScheduleSchema).output(classDetailSchema),
  listEligibleStudents: oc
    .input(classIdInputSchema)
    .output(z.object({ students: z.array(eligibleStudentSummarySchema) })),
  addStudents: oc.input(addClassStudentsSchema).output(classDetailSchema),
  removeStudent: oc.input(removeClassStudentSchema).output(classDetailSchema),
  listEligibleTeachers: oc
    .input(classIdInputSchema)
    .output(z.object({ teachers: z.array(eligibleTeacherSummarySchema) })),
  setTeacher: oc.input(setClassTeacherSchema).output(classDetailSchema),
  /**
   * The assistants, as a complete set. Separate from `setTeacher` because
   * naming who is answerable for a class and listing who else teaches it are
   * two decisions, and an auditor reading one must not have to infer the
   * other.
   */
  setAssistantTeachers: oc
    .input(setClassAssistantTeachersSchema)
    .output(classDetailSchema),
};
