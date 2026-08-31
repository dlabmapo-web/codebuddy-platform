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
  deleteCourseModuleSchema,
  deleteLectureSchema,
  reorderCourseModulesSchema,
  reorderLecturesSchema,
  reorderProgrammingExercisesSchema,
  setExerciseVisibilitySchema,
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
  setVisibility: oc
    .input(setCourseVisibilitySchema)
    .output(courseSummarySchema),
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
