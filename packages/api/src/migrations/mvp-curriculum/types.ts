export const SOURCE_PROJECT_REF = "hsxaxlwlnbdwckimznvd" as const;
export const TARGET_PROJECT_REF = "sfesugoedobirmeqjcvp" as const;
export const TARGET_ACADEMY_SLUG = "dlab-mapo" as const;
export const MIGRATION_VERSION = 1 as const;

export type SourceTable =
  | "subjects"
  | "stages"
  | "chapters"
  | "problems"
  | "test_cases"
  | "problem_hints";

export interface SourceSubject {
  id: string;
  title: string;
  description: string | null;
  order_no: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface SourceStage extends SourceSubject {
  subject_id: string;
}

export interface SourceChapter extends Omit<SourceStage, "subject_id"> {
  stage_id: string;
}

export interface SourceProblem {
  id: string;
  problem_no: number;
  chapter_id: string | null;
  order_no: number;
  title: string;
  description: string;
  difficulty: string;
  input_format: string | null;
  output_format: string | null;
  constraint_text: string | null;
  starter_code: string | null;
  time_limit_ms: number;
  memory_limit_mb: number;
  is_published: boolean;
  use_ai_feedback: boolean;
  created_at: string;
  updated_at: string;
}

export interface SourceTestCase {
  id: string;
  problem_id: string;
  input: string;
  expected_output: string;
  is_sample: boolean;
  is_hidden: boolean;
  order_no: number;
  created_at: string;
}

export interface SourceHint {
  id: string;
  problem_id: string;
  trigger_pattern: string | null;
  hint_text: string;
  order_no: number;
  created_at: string;
}

export interface SourceSnapshot {
  sourceProjectRef: typeof SOURCE_PROJECT_REF;
  extractedAt: string;
  subjects: SourceSubject[];
  stages: SourceStage[];
  chapters: SourceChapter[];
  problems: SourceProblem[];
  testCases: SourceTestCase[];
  hints: SourceHint[];
}

export interface MigrationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  sourceTable?: SourceTable;
  sourceId?: string;
  courseSourceId?: string;
  parentChain?: string[];
}

export interface PlannedTestCase {
  id: string;
  sourceId: string;
  position: number;
  input: string;
  expectedOutput: string;
  visibility: "SAMPLE" | "HIDDEN";
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface PlannedHint {
  id: string;
  sourceId: string;
  position: number;
  content: string;
  triggerExpression: string | null;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface PlannedExercise {
  materialId: string;
  sourceId: string;
  externalKey: string;
  legacyProblemNo: number;
  title: string;
  position: number;
  isVisible: boolean;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  description: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  starterCode: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  aiFeedbackEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  testCases: PlannedTestCase[];
  hints: PlannedHint[];
  fingerprint: string;
}

export interface PlannedLecture {
  id: string;
  sourceId: string;
  externalKey: string;
  title: string;
  description: string;
  position: number;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
  exercises: PlannedExercise[];
  fingerprint: string;
}

export interface PlannedModule {
  id: string;
  sourceId: string;
  externalKey: string;
  title: string;
  description: string;
  position: number;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
  lectures: PlannedLecture[];
  fingerprint: string;
}

export interface PlannedCourse {
  id: string;
  sourceId: string;
  title: string;
  description: string;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
  modules: PlannedModule[];
  fingerprint: string;
}

export interface MigrationPlan {
  format: "cove-mvp-curriculum-plan";
  version: typeof MIGRATION_VERSION;
  createdAt: string;
  sourceProjectRef: typeof SOURCE_PROJECT_REF;
  targetProjectRef: typeof TARGET_PROJECT_REF;
  targetAcademySlug: typeof TARGET_ACADEMY_SLUG;
  targetAcademyId: string;
  actorUserId: string;
  sourceSnapshotChecksum: string;
  issues: MigrationIssue[];
  courses: PlannedCourse[];
  fingerprint: string;
}

export interface MigrationCounts {
  courses: number;
  modules: number;
  lectures: number;
  exercises: number;
  testCases: number;
  hints: number;
}

export interface DryRunReport {
  format: "cove-mvp-curriculum-dry-run";
  version: typeof MIGRATION_VERSION;
  generatedAt: string;
  fingerprint: string;
  sourceProjectRef: string;
  targetProjectRef: string;
  targetAcademySlug: string;
  targetAcademyId: string;
  actorUserId: string;
  sourceSnapshotChecksum: string;
  counts: MigrationCounts;
  issues: MigrationIssue[];
  successful: boolean;
  sensitivePlanPath: string;
}

export interface ApplyCourseResult {
  courseId: string;
  sourceId: string;
  status: "inserted" | "already-present" | "failed";
  fingerprint: string;
  insertedIds: Record<SourceTable | "materials", string[]>;
  error?: string;
}

export interface ApplyReport {
  format: "cove-mvp-curriculum-apply";
  version: typeof MIGRATION_VERSION;
  generatedAt: string;
  planFingerprint: string;
  sourceSnapshotChecksum: string;
  targetProjectRef: string;
  targetAcademySlug: string;
  targetAcademyId: string;
  actorUserId: string;
  backup: { confirmedAt: string; reference: string };
  courses: ApplyCourseResult[];
  successful: boolean;
  fingerprint: string;
}
