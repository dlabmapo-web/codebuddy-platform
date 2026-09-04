import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  courseTreeSchema,
  courseIdInputSchema,
  courseSummarySchema,
  createCourseModuleSchema,
  createCourseSchema,
  createLectureSchema,
  createProgrammingExerciseSchema,
  deleteProgrammingExerciseSchema,
  exerciseAuthoringContextSchema,
  exerciseMaterialInputSchema,
  exerciseSolutionSchema,
  deleteCourseSchema,
  deleteCourseModuleSchema,
  deleteLectureSchema,
  reorderCourseModulesSchema,
  reorderLecturesSchema,
  reorderProgrammingExercisesSchema,
  setExerciseVisibilitySchema,
  setCourseContentVisibilitySchema,
  setCourseVisibilitySchema,
  updateCourseModuleSchema,
  updateCourseSchema,
  updateLectureSchema,
  updateProgrammingExerciseSchema,
} from "../../content/course.js";

export const academyCoursesContract = {
  list: oc
    .input(z.object({ academyId: z.uuid() }))
    .output(z.object({ courses: z.array(courseSummarySchema) })),
  create: oc.input(createCourseSchema).output(courseSummarySchema),
  update: oc.input(updateCourseSchema).output(courseSummarySchema),
  /**
   * Destroy a course and everything under it.
   *
   * Refused while any student has submitted, which is the same rule the module
   * and lecture deletes already apply — student work is not the academy's to
   * delete as a side effect of tidying curriculum.
   */
  delete: oc.input(deleteCourseSchema).output(z.object({ courseId: z.uuid() })),
  setVisibility: oc
    .input(setCourseVisibilitySchema)
    .output(courseSummarySchema),
  /**
   * Show or hide every module, lecture and problem under one course.
   *
   * The action a course adopted from the library never needed, and the one an
   * imported course always did: making a complete curriculum teachable one row
   * at a time is several hundred requests, which is how courses end up
   * published and empty. Returns the tree, like every other builder write.
   */
  setContentVisibility: oc
    .input(setCourseContentVisibilitySchema)
    .output(courseTreeSchema),
  getTree: oc.input(courseIdInputSchema).output(courseTreeSchema),
  createModule: oc
    .input(createCourseModuleSchema)
    .output(courseTreeSchema),
  updateModule: oc
    .input(updateCourseModuleSchema)
    .output(courseTreeSchema),
  deleteModule: oc
    .input(deleteCourseModuleSchema)
    .output(courseTreeSchema),
  reorderModules: oc
    .input(reorderCourseModulesSchema)
    .output(courseTreeSchema),
  createLecture: oc.input(createLectureSchema).output(courseTreeSchema),
  updateLecture: oc.input(updateLectureSchema).output(courseTreeSchema),
  deleteLecture: oc.input(deleteLectureSchema).output(courseTreeSchema),
  reorderLectures: oc
    .input(reorderLecturesSchema)
    .output(courseTreeSchema),
  getExercise: oc
    .input(exerciseMaterialInputSchema)
    .output(exerciseAuthoringContextSchema),
  getExerciseSolution: oc
    .input(exerciseMaterialInputSchema)
    .output(exerciseSolutionSchema),
  createExercise: oc
    .input(createProgrammingExerciseSchema)
    .output(exerciseAuthoringContextSchema),
  updateExercise: oc
    .input(updateProgrammingExerciseSchema)
    .output(exerciseAuthoringContextSchema),
  deleteExercise: oc
    .input(deleteProgrammingExerciseSchema)
    .output(courseTreeSchema),
  reorderExercises: oc
    .input(reorderProgrammingExercisesSchema)
    .output(courseTreeSchema),
  setExerciseVisibility: oc
    .input(setExerciseVisibilitySchema)
    .output(courseTreeSchema),
};
