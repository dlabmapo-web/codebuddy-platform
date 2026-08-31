import { describe, expect, it } from "vitest";

import {
  isValidStableKey,
  normalizeStableKey,
  parseStableKey,
} from "./keys.js";
import {
  canCommitPlan,
  collectPlanIssues,
  planContentImport,
  renderPlainTextDescription,
  type CourseProjection,
} from "./plan.js";
import { readWorkbookRows } from "./rows.js";
import {
  contentImportColumns,
  readTemplateVersion,
} from "./sheets.js";
import {
  normalizeDifficulty,
  normalizeStrictBoolean,
  parseOrder,
} from "./values.js";
import { buildCurrentCourseWorkbook } from "./workbook-template.js";

/**
 * The planner, exercised the way the API exercises it.
 *
 * Grids of strings in, a plan out — no fixture files, no database, no parsed
 * XLSX. That is exactly the seam §7.1 draws, and it is what makes the conflict
 * matrix below writable at all: every one of these cases is a spreadsheet
 * somebody will eventually produce, and each is three lines to express here.
 */

const header = <Sheet extends keyof typeof contentImportColumns>(
  sheet: Sheet,
): string[] => [...contentImportColumns[sheet]];

const fixtureSolution = "name = input()\nprint(f'Hello, {name}!')\n";

function workbook(input: {
  structure?: string[][];
  problems?: string[][];
  tests?: string[][];
  hints?: string[][];
  unknownSheets?: string[];
}) {
  return readWorkbookRows({
    Structure: [header("Structure"), ...(input.structure ?? [])],
    Problems: [
      header("Problems"),
      ...(input.problems ?? []).map((row) =>
        row.length === 12
          ? [...row.slice(0, 11), fixtureSolution, ...row.slice(11)]
          : row
      ),
    ],
    "Test Cases": [header("Test Cases"), ...(input.tests ?? [])],
    Hints: input.hints ? [header("Hints"), ...input.hints] : [],
    unknownSheets: input.unknownSheets,
  });
}

/** One module, one lecture, one problem — enough to collide with. */
function courseWith(overrides: Partial<CourseProjection> = {}): CourseProjection {
  return {
    contentRevision: 4,
    isVisible: false,
    modules: [],
    ...overrides,
  };
}

const existingCourse: CourseProjection = {
  contentRevision: 4,
  isVisible: true,
  modules: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      key: "PY-BASICS",
      title: "Python Basics",
      description: "Start here.",
      position: 1,
      isVisible: true,
      lectures: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          key: "VARIABLES",
          title: "Variables",
          description: "Naming things.",
          position: 1,
          isVisible: true,
          problems: [
            {
              materialId: "33333333-3333-4333-8333-333333333333",
              key: "VAR-001",
              title: "Create a variable",
              position: 1,
              isVisible: true,
              difficulty: "EASY",
              description: "<p>Greet the person.</p>",
              inputFormat: "A name.",
              outputFormat: "A greeting.",
              constraints: "",
              starterCode: "name = input()\n",
              solutionCode: fixtureSolution,
              aiFeedbackEnabled: false,
              testCases: [
                {
                  position: 1,
                  input: "Minji",
                  expectedOutput: "Hello, Minji!",
                  visibility: "SAMPLE",
                },
              ],
              hints: [
                { position: 1, content: "Use input().", triggerExpression: null },
              ],
            },
          ],
        },
      ],
    },
  ],
};

/** The rows that describe `existingCourse` exactly as it stands. */
const unchangedRows = {
  structure: [
    ["PY-BASICS", "1", "Python Basics", "Start here.", "VARIABLES", "1", "Variables", "Naming things."],
  ],
  problems: [
    [
      "VAR-001",
      "VARIABLES",
      "1",
      "Create a variable",
      "EASY",
      "<p>Greet the person.</p>",
      "RICH_TEXT_HTML",
      "A name.",
      "A greeting.",
      "",
      "name = input()\n",
      "FALSE",
    ],
  ],
  tests: [["VAR-001", "1", "Minji", "Hello, Minji!", "SAMPLE"]],
  hints: [["VAR-001", "1", "Use input().", ""]],
};

/* ------------------------------------------------------------------ keys */

describe("stable keys", () => {
  it("folds case, width, and surrounding whitespace onto one identity", () => {
    // A Korean IME produces fullwidth Latin. A team lead has no way to know
    // which of these they typed, so all three have to be one problem.
    expect(normalizeStableKey("  var-001 ")).toBe("VAR-001");
    expect(normalizeStableKey("ＶＡＲ－００１")).toBe("VAR-001");
    expect(normalizeStableKey("VAR-001")).toBe("VAR-001");
  });

  it("accepts Hangul and rejects spaces and path separators", () => {
    expect(isValidStableKey(normalizeStableKey("변수-001"))).toBe(true);
    expect(parseStableKey("VAR 001")).toBeNull();
    expect(parseStableKey("a/b")).toBeNull();
    expect(parseStableKey("")).toBeNull();
    expect(parseStableKey("x".repeat(81))).toBeNull();
  });
});

/* ---------------------------------------------------------------- values */

describe("strict values", () => {
  it("refuses to guess a difficulty", () => {
    expect(normalizeDifficulty(" medium ")).toBe("MEDIUM");
    // The v1 importer defaulted this to EASY, silently.
    expect(normalizeDifficulty("Medum")).toBeNull();
    expect(normalizeDifficulty("")).toBeNull();
  });

  it("refuses to guess a boolean", () => {
    expect(normalizeStrictBoolean("예")).toBe(true);
    expect(normalizeStrictBoolean("N")).toBe(false);
    expect(normalizeStrictBoolean("no thanks")).toBeNull();
  });

  it("keeps blank, valid, and unreadable orders distinguishable", () => {
    // §5.3 gives blank a real meaning, so it cannot collapse into "invalid".
    expect(parseOrder("")).toEqual({ kind: "blank" });
    expect(parseOrder("3")).toEqual({ kind: "value", value: 3 });
    // Excel stores whole numbers as floats.
    expect(parseOrder("3.0")).toEqual({ kind: "value", value: 3 });
    expect(parseOrder("3.5")).toEqual({ kind: "invalid" });
    expect(parseOrder("0")).toEqual({ kind: "invalid" });
    expect(parseOrder("banana")).toEqual({ kind: "invalid" });
  });

  it("reads the template version wherever the author left it", () => {
    expect(
      readTemplateVersion([["Cove course import"], [], ["template_version", "1"]]),
    ).toBe(1);
    expect(readTemplateVersion([["nothing here"]])).toBeNull();
  });
});

/* ----------------------------------------------------------------- plan */

describe("planContentImport", () => {
  it("creates a whole branch when nothing exists yet", () => {
    const plan = planContentImport({
      workbook: workbook({
        structure: [
          ["PY-BASICS", "1", "Python Basics", "", "VARIABLES", "1", "Variables", ""],
        ],
        problems: [
          ["VAR-001", "VARIABLES", "1", "Create a variable", "EASY", "Greet.", "", "", "", "", "", ""],
        ],
        tests: [["VAR-001", "1", "Minji", "Hello, Minji!", "SAMPLE"]],
      }),
      course: courseWith(),
    });

    expect(plan.counts).toMatchObject({ create: 3, update: 0, unchanged: 0 });
    const [module] = plan.modules;
    expect(module.action).toBe("CREATE");
    expect(module.lectures[0].problems[0].action).toBe("CREATE");
    // §12 — nothing arrives visible, at any level.
    expect(module.isVisible).toBe(false);
    expect(module.lectures[0].problems[0].isVisible).toBe(false);
  });

  it("blocks a new problem whose solution_code is blank", () => {
    const plan = planContentImport({
      workbook: workbook({
        structure: [
          ["PY-BASICS", "1", "Python Basics", "", "VARIABLES", "1", "Variables", ""],
        ],
        problems: [[
          "VAR-001", "VARIABLES", "1", "Create a variable", "EASY",
          "Greet.", "PLAIN_TEXT", "", "", "", "", "", "FALSE",
        ]],
        tests: [["VAR-001", "1", "Minji", "Hello, Minji!", "SAMPLE"]],
      }),
      course: courseWith(),
    });

    expect(collectPlanIssues(plan).map((issue) => issue.code)).toContain(
      "solution_code_missing",
    );
    expect(
      canCommitPlan({ counts: plan.counts, acknowledgeWarnings: false }),
    ).toBe(false);
  });

  it("allows an untouched legacy problem without an answer but requires one when changed", () => {
    const legacyCourse: CourseProjection = {
      ...existingCourse,
      modules: existingCourse.modules.map((module) => ({
        ...module,
        lectures: module.lectures.map((lecture) => ({
          ...lecture,
          problems: lecture.problems.map((problem) => ({
            ...problem,
            solutionCode: null,
          })),
        })),
      })),
    };
    const blankSolutionRows = {
      ...unchangedRows,
      problems: unchangedRows.problems.map((row) => [
        ...row.slice(0, 11),
        "",
        ...row.slice(11),
      ]),
    };

    const unchanged = planContentImport({
      workbook: workbook(blankSolutionRows),
      course: legacyCourse,
    });
    expect(unchanged.counts.errors).toBe(0);

    const changed = planContentImport({
      workbook: workbook({
        ...blankSolutionRows,
        problems: blankSolutionRows.problems.map((row) => {
          const next = [...row];
          next[3] = "Changed title";
          return next;
        }),
      }),
      course: legacyCourse,
    });
    expect(collectPlanIssues(changed).map((issue) => issue.code)).toContain(
      "solution_code_missing",
    );
  });

  it("plans an untouched workbook as entirely unchanged", () => {
    // §18's idempotency guarantee, and the reason re-uploading is safe. A
    // planner that reported cosmetic updates here would re-grade every
    // submission in the course on every upload.
    const plan = planContentImport({
      workbook: workbook(unchangedRows),
      course: existingCourse,
    });

    expect(plan.counts).toMatchObject({ create: 0, update: 0, unchanged: 3 });
    expect(plan.counts.conflicts).toBe(0);
    expect(plan.counts.errors).toBe(0);
  });

  it("round-trips a generated current-course workbook without changes", () => {
    // §4.3 — Cove never offers a workbook its own importer would read
    // differently. This is that promise as a test: generate, read back, plan.
    const generated = buildCurrentCourseWorkbook({
      course: existingCourse,
      locale: "en",
    });
    const sheet = (name: string) =>
      generated.sheets.find((entry) => entry.name === name)?.rows ?? [];

    const plan = planContentImport({
      workbook: readWorkbookRows({
        Structure: sheet("Structure"),
        Problems: sheet("Problems"),
        "Test Cases": sheet("Test Cases"),
        Hints: sheet("Hints"),
      }),
      course: existingCourse,
    });

    expect(plan.counts).toMatchObject({ create: 0, update: 0, unchanged: 3 });
  });

  it("names the fields an update would change", () => {
    const plan = planContentImport({
      workbook: workbook({
        ...unchangedRows,
        problems: [
          [
            "VAR-001",
            "VARIABLES",
            "1",
            "Create a variable, carefully",
            "MEDIUM",
            "<p>Greet the person.</p>",
            "RICH_TEXT_HTML",
            "A name.",
            "A greeting.",
            "",
            "name = input()\n",
            "FALSE",
          ],
        ],
      }),
      course: existingCourse,
    });

    const problem = plan.modules[0].lectures[0].problems[0];
    expect(problem.action).toBe("UPDATE");
    expect(problem.changedFields).toEqual(["title", "difficulty"]);
    // Tests were unchanged, so grading has not moved and nothing is re-graded.
    expect(problem.gradingChanged).toBe(false);
  });

  it("advances the grading revision only when the tests themselves change", () => {
    const plan = planContentImport({
      workbook: workbook({
        ...unchangedRows,
        tests: [
          ["VAR-001", "1", "Minji", "Hello, Minji!", "SAMPLE"],
          ["VAR-001", "2", "Jisoo", "Hello, Jisoo!", "HIDDEN"],
        ],
      }),
      course: existingCourse,
    });

    const problem = plan.modules[0].lectures[0].problems[0];
    expect(problem.action).toBe("UPDATE");
    expect(problem.gradingChanged).toBe(true);
    expect(problem.issues.map((issue) => issue.code)).toContain(
      "replaces_test_cases",
    );
    // §6 — the problem is visible to students, which is always worth saying.
    expect(problem.issues.map((issue) => issue.code)).toContain(
      "updates_visible_content",
    );
  });

  it("warns before clearing hints the workbook left out", () => {
    // §5.6 — an included problem's hint rows are the complete set, so no rows
    // means "remove them all". Silent would be indefensible.
    const plan = planContentImport({
      workbook: workbook({ ...unchangedRows, hints: undefined }),
      course: existingCourse,
    });

    const problem = plan.modules[0].lectures[0].problems[0];
    expect(problem.hints).toHaveLength(0);
    expect(problem.issues.map((issue) => issue.code)).toContain("clears_hints");
  });

  it("blocks a problem being moved to another lecture", () => {
    const plan = planContentImport({
      workbook: workbook({
        structure: [
          ["PY-BASICS", "1", "Python Basics", "Start here.", "VARIABLES", "1", "Variables", "Naming things."],
          ["PY-BASICS", "1", "Python Basics", "Start here.", "LOOPS", "2", "Loops", ""],
        ],
        problems: [
          [
            "VAR-001",
            "LOOPS",
            "1",
            "Create a variable",
            "EASY",
            "<p>Greet the person.</p>",
            "RICH_TEXT_HTML",
            "A name.",
            "A greeting.",
            "",
            "name = input()\n",
            "FALSE",
          ],
        ],
        tests: [["VAR-001", "1", "Minji", "Hello, Minji!", "SAMPLE"]],
      }),
      course: existingCourse,
    });

    // §12 — far more likely a typo in `lecture_key` than a deliberate
    // restructuring, and the two are indistinguishable from the file.
    const codes = collectPlanIssues(plan).map((issue) => issue.code);
    expect(codes).toContain("parent_conflict");
    expect(plan.counts.conflicts).toBeGreaterThan(0);
  });

  it("refuses to treat a matching title as a matching identity", () => {
    const plan = planContentImport({
      workbook: workbook({
        structure: [
          ["PY-BASICS", "1", "Python Basics", "Start here.", "VARIABLES", "1", "Variables", "Naming things."],
        ],
        problems: [
          // A new key with the title an existing problem already holds. The
          // author almost certainly meant to edit VAR-001.
          ["VAR-999", "VARIABLES", "2", "create a VARIABLE", "EASY", "Greet.", "", "", "", "", "", ""],
        ],
        tests: [["VAR-999", "1", "Minji", "Hello, Minji!", "SAMPLE"]],
      }),
      course: existingCourse,
    });

    expect(collectPlanIssues(plan).map((issue) => issue.code)).toContain(
      "title_conflict",
    );
  });

  it("reports the same key used twice in one workbook", () => {
    const plan = planContentImport({
      workbook: workbook({
        structure: [
          ["M1", "1", "One", "", "L1", "1", "Lecture", ""],
        ],
        problems: [
          ["P1", "L1", "1", "First", "EASY", "Do it.", "", "", "", "", "", ""],
          ["P1", "L1", "2", "Second", "EASY", "Do it again.", "", "", "", "", "", ""],
        ],
        tests: [["P1", "1", "", "ok", "SAMPLE"]],
      }),
      course: courseWith(),
    });

    expect(collectPlanIssues(plan).map((issue) => issue.code)).toContain(
      "duplicate_key_in_workbook",
    );
  });

  it("reports a test row naming a problem nobody listed", () => {
    const plan = planContentImport({
      workbook: workbook({
        structure: [["M1", "1", "One", "", "L1", "1", "Lecture", ""]],
        problems: [["P1", "L1", "1", "First", "EASY", "Do it.", "", "", "", "", "", ""]],
        tests: [
          ["P1", "1", "", "ok", "SAMPLE"],
          ["P404", "1", "", "ok", "SAMPLE"],
        ],
      }),
      course: courseWith(),
    });

    const orphan = collectPlanIssues(plan).find(
      (issue) => issue.code === "orphan_problem_reference",
    );
    expect(orphan).toBeDefined();
    // §4.5 — located precisely enough to fix without searching. Row 3 counts
    // the header, exactly as the spreadsheet's own gutter does.
    expect(orphan).toMatchObject({
      sheet: "Test Cases",
      rowNumber: 3,
      column: "problem_key",
    });
  });

  it("reports rows that disagree about the same module", () => {
    const plan = planContentImport({
      workbook: workbook({
        structure: [
          ["M1", "1", "One", "", "L1", "1", "First", ""],
          // Renamed on the second row and not the first. Last-row-wins would
          // hide the mistake until a student saw it.
          ["M1", "1", "One renamed", "", "L2", "2", "Second", ""],
        ],
      }),
      course: courseWith(),
    });

    expect(collectPlanIssues(plan).map((issue) => issue.code)).toContain(
      "structure_contradiction",
    );
  });

  it("requires every problem to keep at least one worked example", () => {
    const plan = planContentImport({
      workbook: workbook({
        structure: [["M1", "1", "One", "", "L1", "1", "Lecture", ""]],
        problems: [["P1", "L1", "1", "First", "EASY", "Do it.", "", "", "", "", "", ""]],
        tests: [["P1", "1", "", "ok", "HIDDEN"]],
      }),
      course: courseWith(),
    });

    expect(collectPlanIssues(plan).map((issue) => issue.code)).toContain(
      "sample_test_missing",
    );
  });

  it("renumbers a sparsely ordered collection densely", () => {
    // An author who numbers tests 10, 20, 30 means the same sequence. Storing
    // 1, 2, 3 is what manual authoring produces, so a round trip stays lossless.
    const plan = planContentImport({
      workbook: workbook({
        structure: [["M1", "1", "One", "", "L1", "1", "Lecture", ""]],
        problems: [["P1", "L1", "1", "First", "EASY", "Do it.", "", "", "", "", "", ""]],
        tests: [
          ["P1", "30", "c", "three", "HIDDEN"],
          ["P1", "10", "a", "one", "SAMPLE"],
          ["P1", "20", "b", "two", "HIDDEN"],
        ],
      }),
      course: courseWith(),
    });

    expect(
      plan.modules[0].lectures[0].problems[0].testCases.map(
        (test) => test.expectedOutput,
      ),
    ).toEqual(["one", "two", "three"]);
  });

  it("passes unknown sheets and columns through as warnings, not refusals", () => {
    const plan = planContentImport({
      workbook: readWorkbookRows({
        Structure: [[...header("Structure"), "owner"], ["M1", "1", "One", "", "L1", "1", "Lecture", "", "Minji"]],
        Problems: [header("Problems")],
        "Test Cases": [header("Test Cases")],
        Hints: [],
        unknownSheets: ["Scratch"],
      }),
      course: courseWith(),
    });

    const codes = plan.issues.map((issue) => issue.code);
    expect(codes).toContain("unknown_column_ignored");
    expect(codes).toContain("unknown_sheet_ignored");
    expect(plan.counts.conflicts).toBe(0);
    expect(plan.counts.errors).toBe(0);
  });
});

/* ------------------------------------------------------------- readiness */

describe("canCommitPlan", () => {
  const counts = {
    create: 2,
    update: 0,
    unchanged: 0,
    warnings: 0,
    conflicts: 0,
    errors: 0,
  };

  it("allows a clean plan", () => {
    expect(canCommitPlan({ counts, acknowledgeWarnings: false })).toBe(true);
  });

  it("blocks on any error or conflict, acknowledged or not", () => {
    expect(
      canCommitPlan({
        counts: { ...counts, conflicts: 1 },
        acknowledgeWarnings: true,
      }),
    ).toBe(false);
    expect(
      canCommitPlan({
        counts: { ...counts, errors: 1 },
        acknowledgeWarnings: true,
      }),
    ).toBe(false);
  });

  it("holds warnings until somebody says so", () => {
    const warned = { ...counts, warnings: 1 };
    expect(canCommitPlan({ counts: warned, acknowledgeWarnings: false })).toBe(
      false,
    );
    expect(canCommitPlan({ counts: warned, acknowledgeWarnings: true })).toBe(
      true,
    );
  });

  it("refuses a workbook that would do nothing", () => {
    // Every row unchanged is a successful re-upload, not an import. Offering a
    // Confirm button here would bump the course revision for no reason.
    expect(
      canCommitPlan({
        counts: { ...counts, create: 0, unchanged: 12 },
        acknowledgeWarnings: false,
      }),
    ).toBe(false);
  });
});

/* ----------------------------------------------------------- description */

describe("renderPlainTextDescription", () => {
  it("escapes markup and keeps paragraphs", () => {
    expect(renderPlainTextDescription("a < b\n\nsecond")).toBe(
      "<p>a &lt; b</p><p>second</p>",
    );
  });

  it("keeps single newlines as line breaks", () => {
    expect(renderPlainTextDescription("one\ntwo")).toBe("<p>one<br>two</p>");
  });
});
