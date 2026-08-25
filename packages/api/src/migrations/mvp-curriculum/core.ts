import { createHash } from "node:crypto";

import {
  MIGRATION_VERSION,
  SOURCE_PROJECT_REF,
  TARGET_ACADEMY_SLUG,
  TARGET_PROJECT_REF,
  type MigrationCounts,
  type MigrationIssue,
  type MigrationPlan,
  type PlannedCourse,
  type SourceSnapshot,
} from "./types.js";

const UUID_NAMESPACE = "08d5397c-9193-5c67-986c-981b46c13e66";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function checksum(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function uuidBytes(uuid: string): Buffer {
  const compact = uuid.replaceAll("-", "");
  if (!/^[0-9a-f]{32}$/i.test(compact)) throw new Error(`Invalid UUID: ${uuid}`);
  return Buffer.from(compact, "hex");
}

export function deterministicUuid(table: string, sourceId: string): string {
  const digest = createHash("sha1")
    .update(uuidBytes(UUID_NAMESPACE))
    .update(`${SOURCE_PROJECT_REF}:${table}:${sourceId}`)
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = digest.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function externalKey(table: string, sourceId: string): string {
  return `mvp:${SOURCE_PROJECT_REF}:${table}:${sourceId}`;
}

interface OrderedSource {
  id: string;
  order_no: number;
  created_at: string;
}

function ordered<T extends OrderedSource>(rows: T[]): T[] {
  return [...rows].sort(
    (left, right) =>
      left.order_no - right.order_no ||
      left.created_at.localeCompare(right.created_at) ||
      left.id.localeCompare(right.id),
  );
}

function warnPosition(
  row: OrderedSource,
  position: number,
  sourceTable: MigrationIssue["sourceTable"],
  courseSourceId: string,
  issues: MigrationIssue[],
): void {
  if (row.order_no === position) return;
  issues.push({
    severity: "warning",
    code: "POSITION_NORMALIZED",
    message: `Source order ${row.order_no} was normalized to position ${position}.`,
    sourceTable,
    sourceId: row.id,
    courseSourceId,
  });
}

function error(
  issues: MigrationIssue[],
  code: string,
  message: string,
  sourceTable: MigrationIssue["sourceTable"],
  sourceId: string,
  courseSourceId?: string,
  parentChain?: string[],
): void {
  issues.push({ severity: "error", code, message, sourceTable, sourceId, courseSourceId, parentChain });
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const group = grouped.get(key(row)) ?? [];
    group.push(row);
    grouped.set(key(row), group);
  }
  return grouped;
}

function fingerprint<T extends object>(value: T): T & { fingerprint: string } {
  return { ...value, fingerprint: checksum(value) };
}

function validateOrphans(snapshot: SourceSnapshot, issues: MigrationIssue[]): void {
  const subjectIds = new Set(snapshot.subjects.map(({ id }) => id));
  const stageIds = new Set(snapshot.stages.map(({ id }) => id));
  const chapterIds = new Set(snapshot.chapters.map(({ id }) => id));
  const problemIds = new Set(snapshot.problems.map(({ id }) => id));
  for (const row of snapshot.stages) if (!subjectIds.has(row.subject_id)) error(issues, "ORPHAN_STAGE", "Stage has no source subject.", "stages", row.id);
  for (const row of snapshot.chapters) if (!stageIds.has(row.stage_id)) error(issues, "ORPHAN_CHAPTER", "Chapter has no source stage.", "chapters", row.id);
  for (const row of snapshot.problems) if (!row.chapter_id || !chapterIds.has(row.chapter_id)) error(issues, "ORPHAN_PROBLEM", "Problem has no source chapter.", "problems", row.id);
  for (const row of snapshot.testCases) if (!problemIds.has(row.problem_id)) error(issues, "ORPHAN_TEST_CASE", "Test case has no source problem.", "test_cases", row.id);
  for (const row of snapshot.hints) if (!problemIds.has(row.problem_id)) error(issues, "ORPHAN_HINT", "Hint has no source problem.", "problem_hints", row.id);
}

export function buildMigrationPlan(input: {
  snapshot: SourceSnapshot;
  targetAcademyId: string;
  actorUserId: string;
  now?: string;
}): MigrationPlan {
  const { snapshot, targetAcademyId, actorUserId } = input;
  const issues: MigrationIssue[] = [];
  validateOrphans(snapshot, issues);

  const stagesBySubject = groupBy(snapshot.stages, (row) => row.subject_id);
  const chaptersByStage = groupBy(snapshot.chapters, (row) => row.stage_id);
  const problemsByChapter = groupBy(snapshot.problems.filter((row) => row.chapter_id), (row) => row.chapter_id!);
  const testCasesByProblem = groupBy(snapshot.testCases, (row) => row.problem_id);
  const hintsByProblem = groupBy(snapshot.hints, (row) => row.problem_id);

  const duplicateProblemNumbers = groupBy(snapshot.problems, (row) => String(row.problem_no));
  for (const [problemNo, rows] of duplicateProblemNumbers) {
    if (rows.length > 1) {
      for (const row of rows) error(issues, "DUPLICATE_PROBLEM_NO", `Legacy problem number ${problemNo} is duplicated.`, "problems", row.id);
    }
  }

  const courses: PlannedCourse[] = ordered(snapshot.subjects).map((subject) => {
    const courseSourceId = subject.id;
    const modules = ordered(stagesBySubject.get(subject.id) ?? []).map((stage, moduleIndex) => {
      warnPosition(stage, moduleIndex + 1, "stages", courseSourceId, issues);
      const lectures = ordered(chaptersByStage.get(stage.id) ?? []).map((chapter, lectureIndex) => {
        warnPosition(chapter, lectureIndex + 1, "chapters", courseSourceId, issues);
        const exercises = ordered(problemsByChapter.get(chapter.id) ?? []).map((problem, exerciseIndex) => {
          warnPosition(problem, exerciseIndex + 1, "problems", courseSourceId, issues);
          const difficulty = ({ easy: "EASY", medium: "MEDIUM", hard: "HARD" } as const)[problem.difficulty as "easy" | "medium" | "hard"];
          if (!difficulty) error(issues, "UNSUPPORTED_DIFFICULTY", `Unsupported difficulty: ${problem.difficulty}.`, "problems", problem.id, courseSourceId, [subject.id, stage.id, chapter.id]);

          const testCases = ordered(testCasesByProblem.get(problem.id) ?? []).map((testCase, testIndex) => {
            warnPosition(testCase, testIndex + 1, "test_cases", courseSourceId, issues);
            if (testCase.is_sample && testCase.is_hidden) error(issues, "INCONSISTENT_TEST_VISIBILITY", "Test case cannot be both sample and hidden.", "test_cases", testCase.id, courseSourceId, [subject.id, stage.id, chapter.id, problem.id]);
            return fingerprint({
              id: deterministicUuid("test_cases", testCase.id), sourceId: testCase.id,
              position: testIndex + 1, input: testCase.input, expectedOutput: testCase.expected_output,
              visibility: testCase.is_sample ? "SAMPLE" as const : "HIDDEN" as const,
              createdAt: testCase.created_at, updatedAt: testCase.created_at,
            });
          });
          if (problem.is_published && testCases.length === 0) error(issues, "PUBLISHED_WITHOUT_TESTS", "Published problem has no runnable grading cases.", "problems", problem.id, courseSourceId, [subject.id, stage.id, chapter.id]);

          const hints = ordered(hintsByProblem.get(problem.id) ?? []).map((hint, hintIndex) => {
            warnPosition(hint, hintIndex + 1, "problem_hints", courseSourceId, issues);
            return fingerprint({
              id: deterministicUuid("problem_hints", hint.id), sourceId: hint.id,
              position: hintIndex + 1, content: hint.hint_text, triggerExpression: hint.trigger_pattern,
              createdAt: hint.created_at, updatedAt: hint.created_at,
            });
          });

          return fingerprint({
            materialId: deterministicUuid("problems", problem.id), sourceId: problem.id,
            externalKey: externalKey("problems", problem.id), legacyProblemNo: problem.problem_no,
            title: problem.title, position: exerciseIndex + 1, isVisible: problem.is_published,
            difficulty: difficulty ?? "EASY", description: problem.description,
            inputFormat: problem.input_format ?? "", outputFormat: problem.output_format ?? "",
            constraints: problem.constraint_text ?? "", starterCode: problem.starter_code ?? "",
            timeLimitMs: problem.time_limit_ms, memoryLimitMb: problem.memory_limit_mb,
            aiFeedbackEnabled: problem.use_ai_feedback, createdAt: problem.created_at,
            updatedAt: problem.updated_at, testCases, hints,
          });
        });
        return fingerprint({
          id: deterministicUuid("chapters", chapter.id), sourceId: chapter.id,
          externalKey: externalKey("chapters", chapter.id), title: chapter.title,
          description: chapter.description ?? "", position: lectureIndex + 1,
          isVisible: chapter.is_published, createdAt: chapter.created_at,
          updatedAt: chapter.updated_at, exercises,
        });
      });
      return fingerprint({
        id: deterministicUuid("stages", stage.id), sourceId: stage.id,
        externalKey: externalKey("stages", stage.id), title: stage.title,
        description: stage.description ?? "", position: moduleIndex + 1,
        isVisible: stage.is_published, createdAt: stage.created_at,
        updatedAt: stage.updated_at, lectures,
      });
    });
    return fingerprint({
      id: deterministicUuid("subjects", subject.id), sourceId: subject.id,
      title: subject.title, description: subject.description ?? "",
      isVisible: subject.is_published, createdAt: subject.created_at,
      updatedAt: subject.updated_at, modules,
    });
  });

  const base = {
    format: "cove-mvp-curriculum-plan" as const,
    version: MIGRATION_VERSION,
    createdAt: input.now ?? new Date().toISOString(),
    sourceProjectRef: SOURCE_PROJECT_REF,
    targetProjectRef: TARGET_PROJECT_REF,
    targetAcademySlug: TARGET_ACADEMY_SLUG,
    targetAcademyId,
    actorUserId,
    sourceSnapshotChecksum: checksum({ ...snapshot, extractedAt: undefined }),
    issues,
    courses,
  };
  return { ...base, fingerprint: checksum(base) };
}

export function migrationCounts(courses: PlannedCourse[]): MigrationCounts {
  let modules = 0, lectures = 0, exercises = 0, testCases = 0, hints = 0;
  for (const course of courses) for (const module of course.modules) {
    modules += 1;
    for (const lecture of module.lectures) {
      lectures += 1;
      for (const exercise of lecture.exercises) {
        exercises += 1;
        testCases += exercise.testCases.length;
        hints += exercise.hints.length;
      }
    }
  }
  return { courses: courses.length, modules, lectures, exercises, testCases, hints };
}
