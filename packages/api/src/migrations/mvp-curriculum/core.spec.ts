import { describe, expect, it } from "vitest";

import { buildMigrationPlan, checksum, deterministicUuid, migrationCounts } from "./core.js";
import { SOURCE_PROJECT_REF, type SourceSnapshot } from "./types.js";

const id = (suffix: number) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const time = "2026-08-25T00:00:00.000Z";

function snapshot(): SourceSnapshot {
  return {
    sourceProjectRef: SOURCE_PROJECT_REF, extractedAt: time,
    subjects: [{ id: id(1), title: "Python", description: null, order_no: 7, is_published: true, created_at: time, updated_at: time }],
    stages: [{ id: id(2), subject_id: id(1), title: "Start", description: null, order_no: 9, is_published: true, created_at: time, updated_at: time }],
    chapters: [{ id: id(3), stage_id: id(2), title: "Print", description: "Basics", order_no: 2, is_published: true, created_at: time, updated_at: time }],
    problems: [{ id: id(4), problem_no: 101, chapter_id: id(3), order_no: 5, title: "Hello", description: "Write it", difficulty: "easy", input_format: null, output_format: "text", constraint_text: null, starter_code: "print()", time_limit_ms: 1000, memory_limit_mb: 128, is_published: true, use_ai_feedback: true, created_at: time, updated_at: time }],
    testCases: [
      { id: id(5), problem_id: id(4), input: "hidden input", expected_output: "secret output", is_sample: false, is_hidden: true, order_no: 3, created_at: time },
      { id: id(6), problem_id: id(4), input: "", expected_output: "hello", is_sample: true, is_hidden: false, order_no: 1, created_at: time },
    ],
    hints: [{ id: id(7), problem_id: id(4), trigger_pattern: "SyntaxError", hint_text: "Check syntax", order_no: 4, created_at: time }],
  };
}

describe("MVP curriculum migration plan", () => {
  it("maps all curriculum levels and normalizes positions", () => {
    const plan = buildMigrationPlan({ snapshot: snapshot(), targetAcademyId: id(20), actorUserId: id(21), now: time });
    const exercise = plan.courses[0]!.modules[0]!.lectures[0]!.exercises[0]!;
    expect(migrationCounts(plan.courses)).toEqual({ courses: 1, modules: 1, lectures: 1, exercises: 1, testCases: 2, hints: 1 });
    expect(plan.courses[0]).toMatchObject({ title: "Python", description: "", isVisible: true });
    expect(exercise).toMatchObject({ legacyProblemNo: 101, difficulty: "EASY", position: 1, aiFeedbackEnabled: true, inputFormat: "" });
    expect(exercise.testCases.map((row) => row.visibility)).toEqual(["SAMPLE", "HIDDEN"]);
    expect(exercise.hints[0]).toMatchObject({ triggerExpression: "SyntaxError", content: "Check syntax" });
    expect(plan.issues.filter((issue) => issue.code === "POSITION_NORMALIZED")).toHaveLength(5);
  });

  it("creates stable RFC 4122 version 5 UUIDs and a stable plan fingerprint", () => {
    const first = deterministicUuid("subjects", id(1));
    expect(first).toBe(deterministicUuid("subjects", id(1)));
    expect(first[14]).toBe("5");
    expect(["8", "9", "a", "b"]).toContain(first[19]);
    const plan = buildMigrationPlan({ snapshot: snapshot(), targetAcademyId: id(20), actorUserId: id(21), now: time });
    const { fingerprint, ...unsigned } = plan;
    expect(fingerprint).toBe(checksum(unsigned));
  });

  it("rejects semantic data errors without discarding rows", () => {
    const data = snapshot();
    data.problems.push({ ...data.problems[0]!, id: id(8), problem_no: 101, difficulty: "javascript", is_published: false });
    data.testCases[0] = { ...data.testCases[0]!, is_sample: true };
    data.hints.push({ ...data.hints[0]!, id: id(9), problem_id: id(99) });
    const plan = buildMigrationPlan({ snapshot: data, targetAcademyId: id(20), actorUserId: id(21), now: time });
    expect(plan.courses[0]!.modules[0]!.lectures[0]!.exercises).toHaveLength(2);
    expect(new Set(plan.issues.filter((issue) => issue.severity === "error").map((issue) => issue.code))).toEqual(
      new Set(["ORPHAN_HINT", "DUPLICATE_PROBLEM_NO", "UNSUPPORTED_DIFFICULTY", "INCONSISTENT_TEST_VISIBILITY"]),
    );
  });

  it("reports a published problem with no grading cases", () => {
    const data = snapshot(); data.testCases = [];
    const plan = buildMigrationPlan({ snapshot: data, targetAcademyId: id(20), actorUserId: id(21), now: time });
    expect(plan.issues).toContainEqual(expect.objectContaining({ severity: "error", code: "PUBLISHED_WITHOUT_TESTS" }));
  });
});
