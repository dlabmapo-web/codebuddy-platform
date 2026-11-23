import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  examAttemptInputSchema,
  examAttemptShellSchema,
  examClassInputSchema,
  examClassTestInputSchema,
  examClassTestRowSchema,
  examConvertLectureInputSchema,
  examCreateTestInputSchema,
  examItemContentSchema,
  examItemInputSchema,
  examResultsSchema,
  examScheduleUpdateInputSchema,
  examStaffAttemptInputSchema,
  examStaffTestInputSchema,
  examStaffTestSchema,
  examStartInputSchema,
  examStudentTestInputSchema,
  examStudentTestSchema,
  examSubmitInputSchema,
  examUpdateTestInputSchema,
} from "../../content/exam.js";

/**
 * Exams (테스트). Student procedures resolve the subject from the caller and
 * never take a user id; staff procedures check the class or the course.
 */
export const examContract = {
  serverTime: oc.output(z.object({ now: z.coerce.date() })),
  studentTest: oc.input(examStudentTestInputSchema).output(examStudentTestSchema),
  start: oc.input(examStartInputSchema).output(z.object({ attemptId: z.uuid() })),
  attempt: oc.input(examAttemptInputSchema).output(examAttemptShellSchema),
  item: oc.input(examItemInputSchema).output(examItemContentSchema),
  submit: oc.input(examSubmitInputSchema).output(z.object({ submittedAt: z.coerce.date() })),
  end: oc.input(examAttemptInputSchema).output(examAttemptShellSchema),

  staffTest: oc.input(examStaffTestInputSchema).output(examStaffTestSchema),
  createTest: oc.input(examCreateTestInputSchema).output(z.object({ lectureId: z.uuid() })),
  convertLecture: oc.input(examConvertLectureInputSchema).output(examStaffTestSchema),
  updateTest: oc.input(examUpdateTestInputSchema).output(examStaffTestSchema),

  classTests: oc.input(examClassInputSchema).output(z.object({ tests: z.array(examClassTestRowSchema) })),
  results: oc.input(examClassTestInputSchema).output(examResultsSchema),
  exportResults: oc.input(examClassTestInputSchema).output(z.object({ filename: z.string(), csv: z.string() })),
  updateSchedule: oc.input(examScheduleUpdateInputSchema).output(examResultsSchema),
  endAttempt: oc.input(examStaffAttemptInputSchema).output(examResultsSchema),
  grantRetake: oc.input(examStaffAttemptInputSchema).output(examResultsSchema),
};
