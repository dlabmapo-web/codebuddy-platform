import { z } from "zod";

import { inputPromptPolicySchema, programmingExerciseGradingModeSchema } from "./course.js";

/**
 * Exams (테스트). A TEST lecture whose materials are the problems, taken in one
 * timed attempt. Design: docs/superpowers/specs/2026-11-20-exam-tests-design.md.
 *
 * Everything that decides a deadline, a phase or a score lives here so the API
 * and the web cannot disagree about it.
 */

export const testTypeSchema = z.enum(["NONE", "DIAGNOSTIC", "FORMATIVE", "SUMMATIVE"]);
export type TestType = z.infer<typeof testTypeSchema>;

export const testAttemptEndReasonSchema = z.enum(["STUDENT", "TIME_UP", "PERIOD_CLOSED", "STAFF"]);
export type TestAttemptEndReason = z.infer<typeof testAttemptEndReasonSchema>;

/** The problem types a test may hold: every type Cove can grade. */
export const examItemTypeSchema = z.enum(["CODE", "QUIZ", "MULTIPLE_CHOICE", "SHORT_ANSWER"]);
export type ExamItemType = z.infer<typeof examItemTypeSchema>;
export const examGradableMaterialTypes = ["PROGRAMMING_EXERCISE", "MULTIPLE_CHOICE", "WRITTEN_RESPONSE"] as const;

export const EXAM_TIME_LIMIT_MAX_MINUTES = 600;
export const EXAM_POINTS_MAX_HUNDREDTHS = 100_000;
/** In-flight submits that left the browser before the deadline still count. */
export const EXAM_SUBMIT_GRACE_MS = 5_000;

const isoDate = z.coerce.date();

export const examPeriodStateSchema = z.enum(["BEFORE", "OPEN", "AFTER"]);
export type ExamPeriodState = z.infer<typeof examPeriodStateSchema>;

// --- Rules ---------------------------------------------------------------

/** The earliest of start + limit and the period end, or null for no deadline. */
export function computeDeadline(input: {
  startedAt: Date;
  timeLimitMinutes: number | null;
  closesAt: Date | null;
}): Date | null {
  const candidates: number[] = [];
  if (input.timeLimitMinutes != null) candidates.push(input.startedAt.getTime() + input.timeLimitMinutes * 60_000);
  if (input.closesAt) candidates.push(input.closesAt.getTime());
  return candidates.length ? new Date(Math.min(...candidates)) : null;
}

/** Why a deadline ended an attempt: the period end when it came first. */
export function deadlineEndReason(input: { deadlineAt: Date; closesAt: Date | null }): TestAttemptEndReason {
  return input.closesAt && input.closesAt.getTime() === input.deadlineAt.getTime() ? "PERIOD_CLOSED" : "TIME_UP";
}

export function periodState(input: { opensAt: Date | null; closesAt: Date | null; now: Date }): ExamPeriodState {
  if (input.opensAt && input.now < input.opensAt) return "BEFORE";
  if (input.closesAt && input.now >= input.closesAt) return "AFTER";
  return "OPEN";
}

/** A passed deadline reads as ended even before anything has written it. */
export function attemptIsOpen(input: { endedAt: Date | null; deadlineAt: Date | null; now: Date }): boolean {
  if (input.endedAt) return false;
  return !input.deadlineAt || input.now < input.deadlineAt;
}

/** 입장 마감: nobody starts after the entry deadline. */
export function entryOpen(input: { entryClosesAt: Date | null; now: Date }): boolean {
  return !input.entryClosesAt || input.now < input.entryClosesAt;
}

/** 퇴실 시간: a student may end the test themselves only from this time. */
export function exitAllowed(input: { exitOpensAt: Date | null; now: Date }): boolean {
  return !input.exitOpensAt || input.now >= input.exitOpensAt;
}

/** The reference docs a code problem links to, by language and UI language. */
export function languageReferenceUrl(language: string, locale: string): string {
  if (language === "C") return "https://en.cppreference.com/w/c";
  if (language === "CPP") return "https://en.cppreference.com/w/cpp";
  return locale.startsWith("ko") ? "https://docs.python.org/ko/3/" : "https://docs.python.org/3/";
}

export function resultsVisible(input: { resultsReleasedAt: Date | null; now: Date }): boolean {
  return Boolean(input.resultsReleasedAt && input.resultsReleasedAt <= input.now);
}

/** "7", "6.5" or "6.25" from integer hundredths. */
export function formatPoints(hundredths: number): string {
  const value = Math.round(hundredths) / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, "");
}

/**
 * One item's earned hundredths from its grading fraction, or null while it
 * is still being graded. `fraction` is earned ÷ possible on the problem's own
 * scale; the test scales it to the item's points.
 */
export function itemScore(fraction: number | null, pointsHundredths: number): number | null {
  if (fraction == null) return null;
  const clamped = Math.min(1, Math.max(0, fraction));
  return Math.round(pointsHundredths * clamped);
}

export function attemptTotal(items: Array<{ pointsHundredths: number; scoreHundredths: number | null; submitted: boolean }>) {
  let earned = 0;
  let possible = 0;
  let pending = 0;
  for (const item of items) {
    possible += item.pointsHundredths;
    if (!item.submitted) continue;
    if (item.scoreHundredths == null) pending += 1;
    else earned += item.scoreHundredths;
  }
  return { earnedHundredths: earned, possibleHundredths: possible, pending };
}

// --- Schemas ---------------------------------------------------------------

export const examItemSnapshotSchema = z.object({
  materialId: z.uuid(),
  pointsHundredths: z.number().int().min(0).max(EXAM_POINTS_MAX_HUNDREDTHS),
  position: z.number().int().min(0),
});
export const examItemsSnapshotSchema = z.array(examItemSnapshotSchema);
export type ExamItemSnapshot = z.infer<typeof examItemSnapshotSchema>;

export const examSettingsSchema = z.object({
  guide: z.string().max(100_000),
  summary: z.string().max(200),
  testType: testTypeSchema,
  timeLimitMinutes: z.number().int().min(1).max(EXAM_TIME_LIMIT_MAX_MINUTES).nullable(),
  usePreparation: z.boolean(),
  reviewAfterEnd: z.boolean(),
  allowSelfRetake: z.boolean(),
  /** Show the score as soon as the attempt ends, without waiting for a release. */
  showScoreOnFinish: z.boolean(),
  /** Code problems link to the language reference during the test. */
  languageReference: z.boolean(),
  /** Review after the test shows explanations, once results are visible. */
  showExplanations: z.boolean(),
});
export type ExamSettings = z.infer<typeof examSettingsSchema>;

export const examScheduleSchema = z.object({
  opensAt: isoDate.nullable(),
  closesAt: isoDate.nullable(),
  resultsReleasedAt: isoDate.nullable(),
  /** 입장 마감: no new start after this. Null = until the period ends. */
  entryClosesAt: isoDate.nullable(),
  /** 퇴실 시간: the student cannot end the test before this. Null = any time. */
  exitOpensAt: isoDate.nullable(),
});
export type ExamSchedule = z.infer<typeof examScheduleSchema>;

export const examLatestAttemptSchema = z.object({
  id: z.uuid(),
  attemptNo: z.number().int(),
  startedAt: isoDate,
  deadlineAt: isoDate.nullable(),
  endedAt: isoDate.nullable(),
  endReason: testAttemptEndReasonSchema.nullable(),
  open: z.boolean(),
});

/** The student's test card: before, during and after an attempt. */
export const examStudentTestSchema = z.object({
  lectureId: z.uuid(),
  courseId: z.uuid(),
  classId: z.uuid(),
  title: z.string(),
  settings: examSettingsSchema,
  schedule: examScheduleSchema,
  periodState: examPeriodStateSchema,
  itemCount: z.number().int(),
  totalPointsHundredths: z.number().int(),
  latestAttempt: examLatestAttemptSchema.nullable(),
  canStart: z.boolean(),
  canRetake: z.boolean(),
  resultsVisible: z.boolean(),
  /** Only when results are visible and the latest attempt ended. */
  score: z.object({ earnedHundredths: z.number().int(), possibleHundredths: z.number().int(), pending: z.number().int() }).nullable(),
  serverNow: isoDate,
});
export type ExamStudentTest = z.infer<typeof examStudentTestSchema>;

export const examShellItemSchema = z.object({
  materialId: z.uuid(),
  position: z.number().int(),
  title: z.string(),
  type: examItemTypeSchema,
  pointsHundredths: z.number().int(),
  submitted: z.boolean(),
  lastSubmittedAt: isoDate.nullable(),
  /** Only in review once results are released. */
  scoreHundredths: z.number().int().nullable(),
});
export type ExamShellItem = z.infer<typeof examShellItemSchema>;

/** The full-screen test mode: the rail, the clock and the end state. */
export const examAttemptShellSchema = z.object({
  id: z.uuid(),
  lectureId: z.uuid(),
  classId: z.uuid(),
  /** For live monitoring, which keys a student's open problem by course. */
  courseId: z.uuid(),
  title: z.string(),
  guide: z.string(),
  startedAt: isoDate,
  deadlineAt: isoDate.nullable(),
  endedAt: isoDate.nullable(),
  endReason: testAttemptEndReasonSchema.nullable(),
  open: z.boolean(),
  review: z.boolean(),
  resultsVisible: z.boolean(),
  /** The student cannot end the test before this (퇴실 시간). */
  exitOpensAt: isoDate.nullable(),
  /** Code problems show a link to the language reference. */
  languageReference: z.boolean(),
  items: z.array(examShellItemSchema),
  serverNow: isoDate,
});
export type ExamAttemptShell = z.infer<typeof examAttemptShellSchema>;

const sampleSchema = z.object({ input: z.string(), output: z.string() });
/** One problem as a student sees it inside an attempt: never an answer key. */
export const examItemContentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("CODE"), materialId: z.uuid(), title: z.string(), description: z.string(),
    inputFormat: z.string(), outputFormat: z.string(), constraints: z.string(), samples: z.array(sampleSchema),
    /** How many graded cases stay hidden, as the normal workspace says. */
    hiddenCount: z.number().int().min(0),
    language: z.string(), starterCode: z.string(),
    /** How Submit grades it, so a sample run judges in the browser only what the server would. */
    gradingMode: programmingExerciseGradingModeSchema.default("LEGACY_STDIO"),
    inputPromptPolicy: inputPromptPolicySchema.default("INCLUDE"),
    /** The last code submitted in this attempt, to restore after leaving. */
    lastAnswer: z.string().nullable(),
  }),
  z.object({
    type: z.literal("QUIZ"), materialId: z.uuid(), title: z.string(), description: z.string(),
    choices: z.array(z.object({ id: z.string(), text: z.string() })),
    lastAnswer: z.string().nullable(),
  }),
  z.object({
    type: z.literal("MULTIPLE_CHOICE"), materialId: z.uuid(), title: z.string(), question: z.string(),
    description: z.string(), selectionMode: z.enum(["SINGLE", "MULTIPLE"]),
    options: z.array(z.object({ id: z.uuid(), content: z.string() })),
    contentRevision: z.number().int(),
    lastAnswer: z.array(z.uuid()).nullable(),
    /** Only in review, once results are visible, when the test shows explanations. */
    explanation: z.string().nullable(),
  }),
  z.object({
    type: z.literal("SHORT_ANSWER"), materialId: z.uuid(), title: z.string(), description: z.string(),
    placeholder: z.string(), contentRevision: z.number().int(),
    lastAnswer: z.string().nullable(),
    explanation: z.string().nullable(),
  }),
]);
export type ExamItemContent = z.infer<typeof examItemContentSchema>;

export const examSubmitAnswerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("code"), code: z.string().max(200_000) }),
  z.object({ kind: z.literal("choice"), choiceId: z.string().min(1).max(80) }),
  z.object({ kind: z.literal("options"), optionIds: z.array(z.uuid()).min(1).max(20), displayOrder: z.array(z.uuid()).min(2).max(20), contentRevision: z.number().int() }),
  z.object({ kind: z.literal("text"), text: z.string().min(1).max(10_000), contentRevision: z.number().int() }),
]);

// --- Staff ---------------------------------------------------------------

export const examStaffItemSchema = z.object({
  materialId: z.uuid(),
  position: z.number().int(),
  title: z.string(),
  materialType: z.string(),
  type: examItemTypeSchema.nullable(),
  isVisible: z.boolean(),
  pointsHundredths: z.number().int(),
});
export const examStaffTestSchema = z.object({
  lectureId: z.uuid(),
  courseId: z.uuid(),
  moduleId: z.uuid(),
  title: z.string(),
  isVisible: z.boolean(),
  settings: examSettingsSchema,
  items: z.array(examStaffItemSchema),
  totalPointsHundredths: z.number().int(),
  /** Any attempt exists: points are frozen. Publishing alone does not freeze them. */
  locked: z.boolean(),
  attemptCount: z.number().int(),
  /** Every class that learns this course, with how far it got: results live per class. */
  classes: z.array(z.object({
    classId: z.uuid(),
    name: z.string(),
    taken: z.number().int(),
    ended: z.number().int(),
    inProgress: z.number().int(),
  })),
});
export type ExamStaffTest = z.infer<typeof examStaffTestSchema>;

export const examResultsItemSchema = z.object({
  materialId: z.uuid(),
  position: z.number().int(),
  title: z.string(),
  type: examItemTypeSchema,
  pointsHundredths: z.number().int(),
  averageHundredths: z.number().nullable(),
  fullScoreRate: z.number().nullable(),
  averageSubmissions: z.number().nullable(),
  /** Code problems only: runs per student who took the test. */
  averageRuns: z.number().nullable(),
});
export const examResultsCellSchema = z.object({
  materialId: z.uuid(),
  submitted: z.boolean(),
  submissionCount: z.number().int(),
  /** Code problems only; 0 for the others. */
  runCount: z.number().int(),
  scoreHundredths: z.number().int().nullable(),
  /** Where a teacher opens it to read or grade. */
  submissionId: z.uuid().nullable(),
  manual: z.boolean(),
});
export const examResultsStudentSchema = z.object({
  userId: z.uuid(),
  membershipId: z.uuid(),
  name: z.string(),
  username: z.string().nullable(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "ENDED"]),
  attemptId: z.uuid().nullable(),
  attemptNo: z.number().int().nullable(),
  startedAt: isoDate.nullable(),
  deadlineAt: isoDate.nullable(),
  endedAt: isoDate.nullable(),
  endReason: testAttemptEndReasonSchema.nullable(),
  retakeGranted: z.boolean(),
  earnedHundredths: z.number().int().nullable(),
  pending: z.number().int(),
  cells: z.array(examResultsCellSchema),
});
export const examResultsSchema = z.object({
  lectureId: z.uuid(),
  classId: z.uuid(),
  className: z.string(),
  courseId: z.uuid(),
  title: z.string(),
  settings: examSettingsSchema,
  schedule: examScheduleSchema,
  periodState: examPeriodStateSchema,
  totalPointsHundredths: z.number().int(),
  items: z.array(examResultsItemSchema),
  students: z.array(examResultsStudentSchema),
  tiles: z.object({
    averageHundredths: z.number().nullable(),
    submitted: z.number().int(),
    taken: z.number().int(),
    inProgress: z.number().int(),
    enrolled: z.number().int(),
  }),
  serverNow: isoDate,
});
export type ExamResults = z.infer<typeof examResultsSchema>;

export const examClassTestRowSchema = z.object({
  lectureId: z.uuid(),
  courseId: z.uuid(),
  courseTitle: z.string(),
  title: z.string(),
  itemCount: z.number().int(),
  timeLimitMinutes: z.number().int().nullable(),
  schedule: examScheduleSchema,
  periodState: examPeriodStateSchema,
  taken: z.number().int(),
  ended: z.number().int(),
  inProgress: z.number().int(),
});
export type ExamClassTestRow = z.infer<typeof examClassTestRowSchema>;

// --- Inputs ---------------------------------------------------------------

const academy = { academyId: z.uuid() };
export const examStudentTestInputSchema = z.object({ ...academy, classId: z.uuid(), lectureId: z.uuid() });
export const examStartInputSchema = examStudentTestInputSchema.extend({
  consent: z.literal(true),
  clockDriftMs: z.number().int().min(-86_400_000).max(86_400_000).nullable(),
});
export const examAttemptInputSchema = z.object({ ...academy, attemptId: z.uuid() });
export const examItemInputSchema = examAttemptInputSchema.extend({ materialId: z.uuid() });
export const examRecordRunInputSchema = examItemInputSchema;
export const examSubmitInputSchema = examItemInputSchema.extend({ requestKey: z.uuid(), answer: examSubmitAnswerSchema });
export const examStaffTestInputSchema = z.object({ ...academy, courseId: z.uuid(), lectureId: z.uuid() });
export const examCreateTestInputSchema = z.object({ ...academy, courseId: z.uuid(), moduleId: z.uuid(), title: z.string().trim().min(1).max(200) });
export const examConvertLectureInputSchema = examStaffTestInputSchema;
export const examUpdateTestInputSchema = examStaffTestInputSchema.extend({
  title: z.string().trim().min(1).max(200).optional(),
  /** 공개 / 비공개. Publishing also shows every problem in the test. */
  isVisible: z.boolean().optional(),
  settings: examSettingsSchema.partial().optional(),
  points: z.record(z.uuid(), z.number().int().min(0).max(EXAM_POINTS_MAX_HUNDREDTHS)).optional(),
});
export const examClassInputSchema = z.object({ ...academy, classId: z.uuid() });
export const examClassTestInputSchema = examClassInputSchema.extend({ lectureId: z.uuid() });
/** A time inside the period: not before it opens, not after it closes. */
function withinPeriod(schedule: ExamSchedule, value: Date | null): boolean {
  if (!value) return true;
  if (schedule.opensAt && value < schedule.opensAt) return false;
  return !schedule.closesAt || value <= schedule.closesAt;
}
export const examScheduleUpdateInputSchema = examClassTestInputSchema.extend({
  schedule: examScheduleSchema.extend({
    // Optional on input so an older client that never sends them keeps working.
    entryClosesAt: isoDate.nullable().default(null),
    exitOpensAt: isoDate.nullable().default(null),
  }),
})
  .refine((value) => !value.schedule.opensAt || !value.schedule.closesAt || value.schedule.opensAt < value.schedule.closesAt, {
    message: "The period must open before it closes", path: ["schedule", "closesAt"],
  })
  .refine((value) => withinPeriod(value.schedule, value.schedule.entryClosesAt), {
    message: "The entry deadline must be inside the test period", path: ["schedule", "entryClosesAt"],
  })
  .refine((value) => withinPeriod(value.schedule, value.schedule.exitOpensAt), {
    message: "The exit time must be inside the test period", path: ["schedule", "exitOpensAt"],
  });
export const examCourseReportInputSchema = examStaffTestInputSchema;
export const examStaffAttemptInputSchema = examClassTestInputSchema.extend({ userId: z.uuid() });

/** The six default rules (§5.1), used when a test has no guide of its own. */
export const examDefaultRules = {
  ko: [
    "테스트 조건을 충분히 숙지한 후 '응시하기' 버튼을 클릭하여 테스트를 시작하세요.",
    "제한시간/종료시간이 있는 테스트 경우, 주어진 시간 안에 모든 문제를 풀어야 합니다.",
    "테스트 도중 페이지 이탈 시 제출 이력 및 작성한 코드는 저장되며 제한 시간은 계속 진행됩니다.",
    "모든 문제는 제출 버튼을 클릭해야 제출 처리되며, 마지막 제출한 답안 기준으로 채점됩니다.",
    "문제를 다 푼 후에 '테스트 종료'를 클릭해 주세요. 테스트 종료 후에는 재응시 및 재제출이 불가합니다.",
    "부정행위 적발 시 0점 처리됩니다.",
  ],
  en: [
    "Read the test conditions carefully, then click 'Start test' to begin.",
    "If the test has a time limit or an end time, you must solve every problem within it.",
    "If you leave the page during the test, your submissions and code are kept, and the time limit keeps running.",
    "Every problem is submitted only when you click its Submit button; your last submitted answer is graded.",
    "When you have finished, click 'End test'. You cannot retake or resubmit after ending the test.",
    "Cheating results in a score of 0.",
  ],
} as const;
