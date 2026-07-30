import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  courseDraftTreeSchema,
  courseIdInputSchema,
  courseSummarySchema,
  courseVersionInputSchema,
  courseVersionValidationSchema,
  createCourseModuleSchema,
  createCourseSchema,
  createLectureSchema,
  createProgrammingExerciseSchema,
  deleteProgrammingExerciseSchema,
  exerciseAuthoringContextSchema,
  exerciseMaterialInputSchema,
  deleteCourseModuleSchema,
  deleteLectureSchema,
  publishCourseVersionResultSchema,
  reorderCourseModulesSchema,
  reorderLecturesSchema,
  reorderProgrammingExercisesSchema,
  setExerciseVisibilitySchema,
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
  archive: oc.input(courseIdInputSchema).output(courseSummarySchema),
  restore: oc.input(courseIdInputSchema).output(courseSummarySchema),
  createDraft: oc.input(courseIdInputSchema).output(courseSummarySchema),
  getDraftTree: oc
    .input(courseVersionInputSchema)
    .output(courseDraftTreeSchema),
  createModule: oc
    .input(createCourseModuleSchema)
    .output(courseDraftTreeSchema),
  updateModule: oc
    .input(updateCourseModuleSchema)
    .output(courseDraftTreeSchema),
  deleteModule: oc
    .input(deleteCourseModuleSchema)
    .output(courseDraftTreeSchema),
  reorderModules: oc
    .input(reorderCourseModulesSchema)
    .output(courseDraftTreeSchema),
  createLecture: oc.input(createLectureSchema).output(courseDraftTreeSchema),
  updateLecture: oc.input(updateLectureSchema).output(courseDraftTreeSchema),
  deleteLecture: oc.input(deleteLectureSchema).output(courseDraftTreeSchema),
  reorderLectures: oc
    .input(reorderLecturesSchema)
    .output(courseDraftTreeSchema),
  getExercise: oc
    .input(exerciseMaterialInputSchema)
    .output(exerciseAuthoringContextSchema),
  createExercise: oc
    .input(createProgrammingExerciseSchema)
    .output(exerciseAuthoringContextSchema),
  updateExercise: oc
    .input(updateProgrammingExerciseSchema)
    .output(exerciseAuthoringContextSchema),
  deleteExercise: oc
    .input(deleteProgrammingExerciseSchema)
    .output(courseDraftTreeSchema),
  reorderExercises: oc
    .input(reorderProgrammingExercisesSchema)
    .output(courseDraftTreeSchema),
  setExerciseVisibility: oc
    .input(setExerciseVisibilitySchema)
    .output(courseDraftTreeSchema),
  validateVersion: oc
    .input(courseVersionInputSchema)
    .output(courseVersionValidationSchema),
  publishVersion: oc
    .input(courseVersionInputSchema)
    .output(publishCourseVersionResultSchema),
};
