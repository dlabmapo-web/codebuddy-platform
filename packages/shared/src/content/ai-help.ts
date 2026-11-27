import { z } from "zod";

/**
 * The AI learning assistant's student contract.
 *
 * See the Cove AI learning assistant data document, §4. Nothing here can carry
 * a prompt, a solution, a hidden case or another student.
 */
export const aiHelpLocaleSchema = z.enum(["ko", "en"]);
export type AiHelpLocale = z.infer<typeof aiHelpLocaleSchema>;

/** Why a student can or cannot ask now. `OFF` never says which switch. */
export const aiHelpStateSchema = z.enum([
  "AVAILABLE",
  "LIMIT_PROBLEM",
  "LIMIT_DAY",
  "EXAM_OPEN",
  "STALE",
  "OFF",
]);
export type AiHelpState = z.infer<typeof aiHelpStateSchema>;

/** Fixed, translated text shown when no reply could be given. */
export const aiHelpFallbacks = ["trace_public", "try_small", "time_limit", "busy"] as const;
export const aiHelpFallbackSchema = z.enum(aiHelpFallbacks);
export type AiHelpFallback = z.infer<typeof aiHelpFallbackSchema>;

/** The whole stored text of one answer, all sections joined. */
export const AI_HELP_REPLY_MAX = 2_000;
/** One section of an analysis. */
export const AI_ANALYSIS_FIELD_MAX = 500;
export const AI_LIBRARY_TEXT_MAX = 400;

const section = z.string().trim().min(1).max(AI_ANALYSIS_FIELD_MAX);
/**
 * One analysis of a failed submission, in words only (the Analyze design, §6).
 * `line` is a line of the student's own code.
 */
export const aiAnalysisSchema = z.object({
  result: section,
  line: z.number().int().positive().nullable(),
  why: section,
  think: section,
  tryIt: section.nullable(),
  alsoCheck: section.nullable(),
}).strict();
export type AiAnalysis = z.infer<typeof aiAnalysisSchema>;

/** 1 is the analysis of a submission; 2 explains the same again, more simply. */
export const aiHelpModes = ["analyze", "simpler"] as const;
export const aiHelpModeSchema = z.enum(aiHelpModes);
export type AiHelpMode = z.infer<typeof aiHelpModeSchema>;

export const aiHelpReplySchema = z.object({
  id: z.uuid(),
  level: z.number().int().min(1).max(9),
  text: z.string().min(1).max(AI_HELP_REPLY_MAX),
  /** Null on a reply written before analyses. */
  analysis: aiAnalysisSchema.nullable(),
  createdAt: z.iso.datetime(),
  reported: z.boolean(),
}).strict();
export type AiHelpReply = z.infer<typeof aiHelpReplySchema>;

const remaining = {
  state: aiHelpStateSchema,
  remainingForProblem: z.number().int().nonnegative(),
  remainingToday: z.number().int().nonnegative(),
};

export const getAiHelpInputSchema = z.object({ academyId: z.uuid(), submissionId: z.uuid() });
export const aiHelpViewSchema = z.object({ ...remaining, replies: z.array(aiHelpReplySchema) }).strict();
export type AiHelpView = z.infer<typeof aiHelpViewSchema>;

export const requestAiHelpInputSchema = getAiHelpInputSchema.extend({
  locale: aiHelpLocaleSchema,
  requestId: z.uuid(),
  mode: aiHelpModeSchema.default("analyze"),
});
export type RequestAiHelpInput = z.infer<typeof requestAiHelpInputSchema>;

/** Which button a student asked from (the campus courses design, §6). */
export const aiHelpSources = ["SUBMIT", "TEST_RUN", "RUN"] as const;
export const aiHelpSourceSchema = z.enum(aiHelpSources);
export type AiHelpSource = z.infer<typeof aiHelpSourceSchema>;

/** The most saved answers a workspace opens with. */
export const AI_HELP_HISTORY_MAX = 20;
/**
 * One of the student's own saved answers on a problem, so every answer they
 * were given stays on screen after a reload, not only the latest.
 */
export const aiHelpHistoryItemSchema = aiHelpReplySchema.extend({
  source: aiHelpSourceSchema,
  /** The submission or example check it answered: an answer and its simpler version share it. */
  subjectId: z.uuid(),
  /** The line the answer names, as the code read when it was asked. */
  quoted: z.string().max(200).nullable(),
}).strict();
export type AiHelpHistoryItem = z.infer<typeof aiHelpHistoryItemSchema>;

/**
 * AI help on the code in the editor, after Run or Test run. The server runs
 * the code on the problem's examples first and never trusts the browser's
 * results; hidden tests never run.
 */
export const requestAiHelpForCodeInputSchema = z.object({
  academyId: z.uuid(),
  classId: z.uuid(),
  materialId: z.uuid(),
  code: z.string().min(1).max(100_000),
  /** The grading revision the workspace was loaded at; a mismatch asks for a refresh. */
  workspaceRevision: z.number().int().positive(),
  source: z.enum(["TEST_RUN", "RUN"]),
  locale: aiHelpLocaleSchema,
  requestId: z.uuid(),
  mode: aiHelpModeSchema.default("analyze"),
}).strict();
export type RequestAiHelpForCodeInput = z.infer<typeof requestAiHelpForCodeInputSchema>;

export const aiHelpResponseSchema = z.object({
  ...remaining,
  reply: aiHelpReplySchema.nullable(),
  fallback: aiHelpFallbackSchema.nullable(),
  /** The server ran every example and all passed: nothing to explain, nothing counted. */
  examplesPassed: z.boolean().optional(),
}).strict();
export type AiHelpResponse = z.infer<typeof aiHelpResponseSchema>;

export const reportAiHelpInputSchema = z.object({ academyId: z.uuid(), replyId: z.uuid() });
export const aiReportedSchema = z.object({ reported: z.literal(true) });

/* ------------------------------------------------------------------ library */

export const aiLibraryStateSchema = z.enum(["NONE", "WAITING", "WRITING", "CHECKING", "REVIEWING", "READY", "FAILED"]);
export const aiLibraryItemSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["HINT", "FEEDBACK"]),
  position: z.number().int(),
  label: z.string(),
  textKo: z.string(),
  textEn: z.string(),
  wrongProgram: z.string().nullable(),
  origin: z.enum(["AI", "COPY", "GROWN", "STAFF"]),
  state: z.enum(["CHECKING", "ACTIVE", "HIDDEN", "REJECTED"]),
  rejectReason: z.string().nullable(),
  reports: z.number().int().nonnegative(),
  version: z.number().int(),
});
export type AiLibraryItemView = z.infer<typeof aiLibraryItemSchema>;

export const aiLibraryInputSchema = z.object({ academyId: z.uuid(), courseId: z.uuid(), materialId: z.uuid() });
/**
 * Why the AI teacher cannot learn a problem, in the order a Manager would fix
 * it (the campus courses design, §5). Null when it can.
 */
export const aiLibraryBlockers = [
  "FEATURE_OFF", "COURSE_OFF", "PROBLEM_OFF", "LANGUAGE", "QUIZ", "MANUAL", "PROJECT", "EXAM", "NO_EXAMPLE",
] as const;
export const aiLibraryBlockerSchema = z.enum(aiLibraryBlockers);
export type AiLibraryBlocker = z.infer<typeof aiLibraryBlockerSchema>;

export const aiLibraryViewSchema = z.object({
  /** The switches this exercise needs, so staff see why there is no library. */
  enabled: z.boolean(),
  /** The first thing that keeps the AI teacher from this problem, or null. */
  blocked: aiLibraryBlockerSchema.nullable().default(null),
  state: aiLibraryStateSchema,
  errorCode: z.string().nullable(),
  current: z.boolean(),
  items: z.array(aiLibraryItemSchema),
  correctPrograms: z.array(z.object({ approach: z.string(), code: z.string() })),
  /** Submissions of the last 30 days, by the mistake they show. */
  mistakes: z.object({
    failures: z.number().int(),
    students: z.number().int(),
    pythonErrors: z.array(z.object({ type: z.string(), count: z.number().int(), students: z.number().int() })),
    library: z.array(z.object({ itemId: z.uuid(), count: z.number().int(), students: z.number().int() })),
    unmatched: z.number().int(),
  }),
});
export type AiLibraryView = z.infer<typeof aiLibraryViewSchema>;

export const updateAiLibraryItemInputSchema = aiLibraryInputSchema.extend({
  itemId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  textKo: z.string().trim().min(1).max(AI_LIBRARY_TEXT_MAX).optional(),
  textEn: z.string().trim().min(1).max(AI_LIBRARY_TEXT_MAX).optional(),
  state: z.enum(["ACTIVE", "HIDDEN"]).optional(),
});
export type UpdateAiLibraryItemInput = z.infer<typeof updateAiLibraryItemInputSchema>;

/* ---------------------------------------------------------------- operators */

export const aiUsageRowSchema = z.object({
  month: z.string(),
  kind: z.enum(["HELP", "LIBRARY"]),
  requests: z.number().int(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  costUsd: z.number(),
});
export const platformAiUsageSchema = z.object({
  enabled: z.object({ help: z.boolean(), library: z.boolean(), key: z.boolean(), model: z.string(), libraryModel: z.string() }),
  budgetUsd: z.object({ help: z.number(), library: z.number() }),
  months: z.array(aiUsageRowSchema),
  libraries: z.array(z.object({ state: aiLibraryStateSchema, count: z.number().int() })),
  last7Days: z.object({
    replies: z.number().int(), failed: z.number().int(), rejected: z.number().int(),
    reported: z.number().int(), matched: z.number().int(), p95Ms: z.number().int().nullable(), students: z.number().int(),
  }),
  hiddenItems: z.number().int(),
  academies: z.array(z.object({ academyId: z.uuid(), name: z.string(), replies: z.number().int(), students: z.number().int() })),
});
export type PlatformAiUsage = z.infer<typeof platformAiUsageSchema>;

/* ------------------------------------------------------------------ teacher */

/** One AI reply on a submission, as the student's teacher reads it. */
export const teacherAiReplySchema = z.object({
  level: z.number().int(), text: z.string(), analysis: aiAnalysisSchema.nullable().default(null), locale: aiHelpLocaleSchema,
  reported: z.boolean(), createdAt: z.iso.datetime(),
}).strict();
export type TeacherAiReply = z.infer<typeof teacherAiReplySchema>;

/**
 * What the AI assistant told a student after Run or Test run on one problem,
 * with the code the server checked (the campus courses design, §6). Only the
 * examples ran, so nothing here concerns a hidden test.
 */
export const teacherAiCodeReplySchema = teacherAiReplySchema.extend({
  source: z.enum(["TEST_RUN", "RUN"]),
  code: z.string(),
}).strict();
export type TeacherAiCodeReply = z.infer<typeof teacherAiCodeReplySchema>;
