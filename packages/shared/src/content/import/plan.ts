import { z } from "zod";

import type { ExerciseDifficulty, TestCaseVisibility } from "../course.js";
import { normalizeComparableTitle } from "./keys.js";
import {
  CONTENT_IMPORT_MAX_HINTS_PER_PROBLEM,
  CONTENT_IMPORT_MAX_PROBLEMS,
  CONTENT_IMPORT_MAX_TESTS_PER_PROBLEM,
} from "./limits.js";
import {
  contentImportIssueSchema,
  summarizeIssues,
  type ContentImportConflictCode,
  type ContentImportErrorCode,
  type ContentImportIssue,
  type ContentImportWarningCode,
} from "./issues.js";
import type {
  NormalizedHintRow,
  NormalizedProblemRow,
  NormalizedStructureRow,
  NormalizedTestCaseRow,
  NormalizedWorkbook,
} from "./rows.js";
import type { ContentImportSheet } from "./sheets.js";

/**
 * What the workbook would do to the course, decided once and stored.
 *
 * §4.6 and §7.3 together make this the most important module in the feature:
 * **the browser never decides whether a row creates or updates anything.** It
 * renders this plan. The plan is computed at upload, persisted with the
 * session, and re-verified inside the commit transaction against a locked
 * course — so the thing a Team Lead approved and the thing that runs are the
 * same object, and a course that moved underneath them produces a revision
 * conflict rather than a different import.
 *
 * §6's other rule shapes every type below: Warning and Conflict are
 * *annotations*, not actions. A visible problem being edited is an `UPDATE`
 * carrying a warning, not a fourth kind of action. Modelling them as actions
 * would mean the commit had to reason about five cases where three exist, and
 * the fifth would eventually acquire behaviour nobody designed.
 *
 * Nothing here deletes. §2 and §18 both say a top-level entity omitted from the
 * workbook is left alone, and this module has no vocabulary for removing a
 * module, a lecture, or a problem — which is a stronger guarantee than a rule
 * that says it must not. Tests and hints are the deliberate exception, and they
 * are replacement collections rather than deletions: §5.5 and §5.6 make the
 * rows for an included problem the complete set, which is the only semantics
 * that lets a round trip be lossless.
 *
 * See §6 of the team lead Excel problem import design.
 */

/* --------------------------------------------------------------- actions */

export const contentImportActions = ["CREATE", "UPDATE", "UNCHANGED"] as const;
export const contentImportActionSchema = z.enum(contentImportActions);
export type ContentImportAction = z.infer<typeof contentImportActionSchema>;

const plannedTestCaseSchema = z
  .object({
    position: z.number().int().positive(),
    input: z.string(),
    expectedOutput: z.string(),
    visibility: z.enum(["SAMPLE", "HIDDEN"]),
  })
  .strict();

const plannedHintSchema = z
  .object({
    position: z.number().int().positive(),
    content: z.string(),
    triggerExpression: z.string().nullable(),
  })
  .strict();

/**
 * The fields an update would change, by canonical name.
 *
 * Names rather than before/after pairs at this level: §4.4 expands an update to
 * show what changed, and the before value is already on screen in the course
 * the Team Lead is importing into. Storing both would double the size of a
 * session that already holds two hundred problems' worth of source code.
 */
const changedFieldsSchema = z.array(z.string().max(64)).max(32);

export const plannedProblemSchema = z
  .object({
    key: z.string().max(80),
    action: contentImportActionSchema,
    title: z.string(),
    lectureKey: z.string().max(80),
    /** Null for a create; the existing Material for an update. */
    materialId: z.uuid().nullable(),
    /** The visibility the problem has now. Imports never change it. */
    isVisible: z.boolean(),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
    description: z.string(),
    inputFormat: z.string(),
    outputFormat: z.string(),
    constraints: z.string(),
    starterCode: z.string(),
    solutionCode: z.string().nullable(),
    aiFeedbackEnabled: z.boolean(),
    /** Explicit order from the workbook, or null to preserve or append. */
    order: z.number().int().positive().nullable(),
    testCases: z.array(plannedTestCaseSchema),
    hints: z.array(plannedHintSchema),
    changedFields: changedFieldsSchema,
    /**
     * §11 step 16 — whether the grading definition itself moved.
     *
     * Separate from `changedFields` because it has a consequence the others do
     * not: it invalidates every cached verdict for the problem, so a student
     * who solved it yesterday is re-graded against tests they never saw. The
     * commit reads this rather than re-deriving it, so the number the Team Lead
     * acknowledged is the number that runs.
     */
    gradingChanged: z.boolean(),
    issues: z.array(contentImportIssueSchema),
  })
  .strict();
export type PlannedProblem = z.infer<typeof plannedProblemSchema>;

export const plannedLectureSchema = z
  .object({
    key: z.string().max(80),
    action: contentImportActionSchema,
    title: z.string(),
    description: z.string(),
    moduleKey: z.string().max(80),
    lectureId: z.uuid().nullable(),
    isVisible: z.boolean(),
    order: z.number().int().positive().nullable(),
    changedFields: changedFieldsSchema,
    issues: z.array(contentImportIssueSchema),
    problems: z.array(plannedProblemSchema),
  })
  .strict();
export type PlannedLecture = z.infer<typeof plannedLectureSchema>;

export const plannedModuleSchema = z
  .object({
    key: z.string().max(80),
    action: contentImportActionSchema,
    title: z.string(),
    description: z.string(),
    moduleId: z.uuid().nullable(),
    isVisible: z.boolean(),
    order: z.number().int().positive().nullable(),
    changedFields: changedFieldsSchema,
    issues: z.array(contentImportIssueSchema),
    lectures: z.array(plannedLectureSchema),
  })
  .strict();
export type PlannedModule = z.infer<typeof plannedModuleSchema>;

export const contentImportCountsSchema = z
  .object({
    create: z.number().int().nonnegative(),
    update: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
    conflicts: z.number().int().nonnegative(),
    errors: z.number().int().nonnegative(),
  })
  .strict();
export type ContentImportCounts = z.infer<typeof contentImportCountsSchema>;

export const contentImportPlanSchema = z
  .object({
    modules: z.array(plannedModuleSchema),
    /** Issues that belong to the file rather than to any one entity. */
    issues: z.array(contentImportIssueSchema),
    counts: contentImportCountsSchema,
  })
  .strict();
export type ContentImportPlan = z.infer<typeof contentImportPlanSchema>;

/* ------------------------------------------------------------ projection */

/**
 * The course as the planner needs to see it: one consistent read, keyed.
 *
 * Deliberately not a Prisma type. §7.1 keeps the shared package free of a
 * database dependency, and the practical benefit is that every planning rule
 * below can be tested against a literal — which is what makes §15.1's
 * conflict-matrix tests possible at all.
 */
export type ExistingProblem = {
  materialId: string;
  key: string;
  title: string;
  position: number;
  isVisible: boolean;
  difficulty: ExerciseDifficulty;
  description: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  starterCode: string;
  solutionCode?: string | null;
  aiFeedbackEnabled: boolean;
  testCases: Array<{
    position: number;
    input: string;
    expectedOutput: string;
    visibility: TestCaseVisibility;
  }>;
  hints: Array<{
    position: number;
    content: string;
    triggerExpression: string | null;
  }>;
};

export type ExistingLecture = {
  id: string;
  key: string;
  title: string;
  description: string;
  position: number;
  isVisible: boolean;
  problems: ExistingProblem[];
};

export type ExistingModule = {
  id: string;
  key: string;
  title: string;
  description: string;
  position: number;
  isVisible: boolean;
  lectures: ExistingLecture[];
};

export type CourseProjection = {
  /** §9.2 — what the commit must still agree with. */
  contentRevision: number;
  /** Whether the course itself is visible, for §6's visible-content warning. */
  isVisible: boolean;
  modules: ExistingModule[];
};

/* --------------------------------------------------------------- inputs */

/**
 * How a workbook description becomes the string that is stored.
 *
 * A seam rather than a branch, because the two formats need different
 * machinery and only one of them belongs in a package with no DOM. §5.4's
 * PLAIN_TEXT rule is pure string work and lives here; RICH_TEXT_HTML has to go
 * through the same allowlist sanitizer manual authoring uses, which lives in
 * the API. The planner does not care which it got — it compares the result.
 */
export type DescriptionResolver = (input: {
  text: string;
  format: "PLAIN_TEXT" | "RICH_TEXT_HTML";
}) => string;

/**
 * §5.4 — plain text, rendered as the Rich Editor's own paragraph markup.
 *
 * The output has to match what the editor produces for the same text, or a
 * problem imported as plain text would show as changed the first time somebody
 * opened and saved it without touching anything. Escaping happens here rather
 * than at render time because the value is stored as HTML from this point on.
 */
export function renderPlainTextDescription(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped.split(/\n{2,}/);
  return paragraphs
    .map((paragraph) => {
      const body = paragraph.split("\n").join("<br>");
      return `<p>${body}</p>`;
    })
    .join("");
}

const defaultDescriptionResolver: DescriptionResolver = ({ text, format }) =>
  format === "PLAIN_TEXT" ? renderPlainTextDescription(text) : text;

/* -------------------------------------------------------------- helpers */

function conflict(
  code: ContentImportConflictCode,
  location: {
    sheet: ContentImportSheet | null;
    rowNumber: number | null;
    column?: string | null;
    received?: string | null;
    entityKey?: string | null;
  },
): ContentImportIssue {
  return {
    severity: "CONFLICT",
    code,
    sheet: location.sheet,
    rowNumber: location.rowNumber,
    column: location.column ?? null,
    received: location.received ?? null,
    entityKey: location.entityKey ?? null,
  };
}

function warning(
  code: ContentImportWarningCode,
  entityKey: string | null,
  sheet: ContentImportSheet | null = null,
): ContentImportIssue {
  return {
    severity: "WARNING",
    code,
    sheet,
    rowNumber: null,
    column: null,
    received: null,
    entityKey,
  };
}

function error(
  code: ContentImportErrorCode,
  entityKey: string | null,
  sheet: ContentImportSheet | null = null,
  rowNumber: number | null = null,
): ContentImportIssue {
  return {
    severity: "ERROR",
    code,
    sheet,
    rowNumber,
    column: null,
    received: null,
    entityKey,
  };
}

/** Fields that differ, by canonical name, ignoring the ones not supplied. */
function diffFields(
  comparisons: Array<[string, unknown, unknown]>,
): string[] {
  return comparisons
    .filter(([, next, current]) => next !== current)
    .map(([field]) => field);
}

/* --------------------------------------------------------------- planner */

/**
 * The workbook and the course, reconciled.
 *
 * The order of the passes matters and is the same order §6 describes: identity
 * first (are these rows even coherent), then parentage (does the workbook agree
 * with the course about where things live), then values (what would actually
 * change). Doing values first would produce a plan full of updates for entities
 * that turn out to be conflicts, and a preview showing both is a preview nobody
 * can read.
 */
export function planContentImport(input: {
  workbook: NormalizedWorkbook;
  course: CourseProjection;
  resolveDescription?: DescriptionResolver;
}): ContentImportPlan {
  const resolveDescription =
    input.resolveDescription ?? defaultDescriptionResolver;
  const fileIssues: ContentImportIssue[] = [...input.workbook.issues];

  const existing = indexCourse(input.course);
  const structure = collectStructure(input.workbook.structure, fileIssues);
  const problems = collectProblems(
    input.workbook.problems,
    structure,
    existing,
    fileIssues,
  );
  const collections = collectChildRows(
    input.workbook.testCases,
    input.workbook.hints,
    problems,
    existing,
    fileIssues,
  );

  return assemble({
    structure,
    problems,
    collections,
    existing,
    course: input.course,
    resolveDescription,
    fileIssues,
  });
}

/* ------------------------------------------------------- course indexing */

type CourseIndex = {
  modulesByKey: Map<string, ExistingModule>;
  lecturesByKey: Map<string, { lecture: ExistingLecture; moduleKey: string }>;
  problemsByKey: Map<
    string,
    { problem: ExistingProblem; lectureKey: string; moduleKey: string }
  >;
  moduleTitles: Map<string, string>;
  lectureTitlesByModule: Map<string, Map<string, string>>;
  problemTitlesByLecture: Map<string, Map<string, string>>;
  courseIsVisible: boolean;
};

/**
 * Every existing entity, addressable by its stable key.
 *
 * Lectures and problems are indexed course-wide rather than per parent, which
 * is exactly what §5.2 requires: the Problems sheet references a lecture with
 * no module column, so a lecture key that is unique only inside its module
 * would be ambiguous the moment two modules reused one. The uniqueness is
 * enforced at write time; this index is what detects a violation of it.
 */
function indexCourse(course: CourseProjection): CourseIndex {
  const index: CourseIndex = {
    modulesByKey: new Map(),
    lecturesByKey: new Map(),
    problemsByKey: new Map(),
    moduleTitles: new Map(),
    lectureTitlesByModule: new Map(),
    problemTitlesByLecture: new Map(),
    courseIsVisible: course.isVisible,
  };

  for (const module of course.modules) {
    index.modulesByKey.set(module.key, module);
    index.moduleTitles.set(normalizeComparableTitle(module.title), module.key);

    const lectureTitles = new Map<string, string>();
    index.lectureTitlesByModule.set(module.key, lectureTitles);

    for (const lecture of module.lectures) {
      index.lecturesByKey.set(lecture.key, { lecture, moduleKey: module.key });
      lectureTitles.set(normalizeComparableTitle(lecture.title), lecture.key);

      const problemTitles = new Map<string, string>();
      index.problemTitlesByLecture.set(lecture.key, problemTitles);

      for (const problem of lecture.problems) {
        index.problemsByKey.set(problem.key, {
          problem,
          lectureKey: lecture.key,
          moduleKey: module.key,
        });
        problemTitles.set(normalizeComparableTitle(problem.title), problem.key);
      }
    }
  }

  return index;
}

/* ------------------------------------------------------------- structure */

type StructureModule = {
  key: string;
  title: string;
  description: string;
  order: number | null;
  firstRow: NormalizedStructureRow;
  lectureKeys: string[];
};

type StructureLecture = {
  key: string;
  moduleKey: string;
  title: string;
  description: string;
  order: number | null;
  firstRow: NormalizedStructureRow;
};

type StructureIndex = {
  modules: Map<string, StructureModule>;
  lectures: Map<string, StructureLecture>;
  order: string[];
};

/**
 * The Structure sheet, folded into one definition per entity.
 *
 * §5.3 lets a module appear in several rows — one per lecture — and requires
 * every repetition to agree. Last-row-wins would be the easy reading and the
 * wrong one: a Team Lead who renamed a module on row 12 and forgot rows 8–11
 * has made a mistake, and silently taking row 12 hides it until the course
 * looks wrong to a student.
 */
function collectStructure(
  rows: readonly NormalizedStructureRow[],
  issues: ContentImportIssue[],
): StructureIndex {
  const modules = new Map<string, StructureModule>();
  const lectures = new Map<string, StructureLecture>();
  const order: string[] = [];

  for (const row of rows) {
    if (!row.moduleKey || !row.lectureKey) continue;

    const existingModule = modules.get(row.moduleKey);
    if (!existingModule) {
      modules.set(row.moduleKey, {
        key: row.moduleKey,
        title: row.moduleTitle,
        description: row.moduleDescription,
        order: row.moduleOrder,
        firstRow: row,
        lectureKeys: [],
      });
      order.push(row.moduleKey);
    } else {
      const disagreements = diffFields([
        ["module_title", row.moduleTitle, existingModule.title],
        [
          "module_description",
          row.moduleDescription,
          existingModule.description,
        ],
        // Only an *explicit* repeat has to agree. A blank order on a later row
        // is the author declining to say, not the author disagreeing.
        [
          "module_order",
          row.moduleOrder ?? existingModule.order,
          existingModule.order,
        ],
      ]);
      for (const column of disagreements) {
        issues.push(
          conflict("structure_contradiction", {
            sheet: "Structure",
            rowNumber: row.rowNumber,
            column,
            entityKey: row.moduleKey,
          }),
        );
      }
    }

    const priorLecture = lectures.get(row.lectureKey);
    if (priorLecture) {
      // §5.2 — a lecture key is unique course-wide, so the same key twice in one
      // workbook is a duplicate whether or not the two rows agree.
      issues.push(
        conflict("duplicate_key_in_workbook", {
          sheet: "Structure",
          rowNumber: row.rowNumber,
          column: "lecture_key",
          received: row.lectureKey,
          entityKey: row.lectureKey,
        }),
      );
      continue;
    }

    lectures.set(row.lectureKey, {
      key: row.lectureKey,
      moduleKey: row.moduleKey,
      title: row.lectureTitle,
      description: row.lectureDescription,
      order: row.lectureOrder,
      firstRow: row,
    });
    modules.get(row.moduleKey)?.lectureKeys.push(row.lectureKey);
  }

  return { modules, lectures, order };
}

/* -------------------------------------------------------------- problems */

type WorkbookProblem = {
  key: string;
  lectureKey: string;
  row: NormalizedProblemRow;
};

type ProblemIndex = {
  byKey: Map<string, WorkbookProblem>;
  order: string[];
};

/**
 * The Problems sheet, with every reference resolved.
 *
 * A `lecture_key` may name a lecture the workbook defines *or* one that already
 * exists in the course — §5.4 allows both, and the second is what makes "add
 * three problems to an existing lecture" a two-row edit rather than a
 * re-export. Anything else is an orphan, reported against the cell that names
 * it rather than against the lecture that does not exist.
 */
function collectProblems(
  rows: readonly NormalizedProblemRow[],
  structure: StructureIndex,
  existing: CourseIndex,
  issues: ContentImportIssue[],
): ProblemIndex {
  const byKey = new Map<string, WorkbookProblem>();
  const order: string[] = [];

  for (const row of rows) {
    if (!row.problemKey || !row.lectureKey) continue;

    if (byKey.has(row.problemKey)) {
      issues.push(
        conflict("duplicate_key_in_workbook", {
          sheet: "Problems",
          rowNumber: row.rowNumber,
          column: "problem_key",
          received: row.problemKey,
          entityKey: row.problemKey,
        }),
      );
      continue;
    }

    const resolves =
      structure.lectures.has(row.lectureKey) ||
      existing.lecturesByKey.has(row.lectureKey);
    if (!resolves) {
      issues.push(
        conflict("orphan_lecture_reference", {
          sheet: "Problems",
          rowNumber: row.rowNumber,
          column: "lecture_key",
          received: row.lectureKey,
          entityKey: row.problemKey,
        }),
      );
      continue;
    }

    byKey.set(row.problemKey, {
      key: row.problemKey,
      lectureKey: row.lectureKey,
      row,
    });
    order.push(row.problemKey);
  }

  if (byKey.size > CONTENT_IMPORT_MAX_PROBLEMS) {
    issues.push(error("too_many_problems", null, "Problems"));
  }

  return { byKey, order };
}

/* ------------------------------------------------------- tests and hints */

type ProblemCollections = {
  testCases: Map<string, NormalizedTestCaseRow[]>;
  hints: Map<string, NormalizedHintRow[]>;
};

/**
 * Test and hint rows, grouped by the problem that owns them.
 *
 * §5.5 and §5.6 make these complete replacement collections for every problem
 * the Problems sheet includes, which is why a row naming a problem the workbook
 * does not include is an orphan rather than a partial edit. Accepting it would
 * mean a test sheet could silently rewrite the grading of a problem nobody
 * listed — the exact surprise the preview exists to prevent.
 */
function collectChildRows(
  testRows: readonly NormalizedTestCaseRow[],
  hintRows: readonly NormalizedHintRow[],
  problems: ProblemIndex,
  existing: CourseIndex,
  issues: ContentImportIssue[],
): ProblemCollections {
  const testCases = new Map<string, NormalizedTestCaseRow[]>();
  const hints = new Map<string, NormalizedHintRow[]>();

  const attach = <Row extends { problemKey: string | null; rowNumber: number }>(
    rows: readonly Row[],
    target: Map<string, Row[]>,
    sheet: ContentImportSheet,
  ) => {
    for (const row of rows) {
      if (!row.problemKey) continue;
      if (!problems.byKey.has(row.problemKey)) {
        issues.push(
          conflict("orphan_problem_reference", {
            sheet,
            rowNumber: row.rowNumber,
            column: "problem_key",
            received: row.problemKey,
            entityKey: row.problemKey,
          }),
        );
        continue;
      }
      const bucket = target.get(row.problemKey) ?? [];
      bucket.push(row);
      target.set(row.problemKey, bucket);
    }
  };

  attach(testRows, testCases, "Test Cases");
  attach(hintRows, hints, "Hints");

  // §5.5 and §5.6 — the order column is the collection's identity, so two rows
  // claiming position 3 leave the importer with no defensible answer.
  const assertUniqueOrders = <Row extends { rowNumber: number }>(
    buckets: Map<string, Row[]>,
    orderOf: (row: Row) => number | null,
    sheet: ContentImportSheet,
    column: string,
    limit: number,
    limitCode: ContentImportErrorCode,
  ) => {
    for (const [key, rows] of buckets) {
      const seen = new Set<number>();
      for (const row of rows) {
        const order = orderOf(row);
        if (order === null) continue;
        if (seen.has(order)) {
          issues.push(
            conflict("duplicate_order_in_workbook", {
              sheet,
              rowNumber: row.rowNumber,
              column,
              received: String(order),
              entityKey: key,
            }),
          );
          continue;
        }
        seen.add(order);
      }
      if (rows.length > limit) {
        issues.push(error(limitCode, key, sheet));
      }
    }
  };

  assertUniqueOrders(
    testCases,
    (row) => row.testOrder,
    "Test Cases",
    "test_order",
    CONTENT_IMPORT_MAX_TESTS_PER_PROBLEM,
    "too_many_tests",
  );
  assertUniqueOrders(
    hints,
    (row) => row.hintOrder,
    "Hints",
    "hint_order",
    CONTENT_IMPORT_MAX_HINTS_PER_PROBLEM,
    "too_many_hints",
  );

  return { testCases, hints };
}

/* -------------------------------------------------------------- assembly */

function assemble(input: {
  structure: StructureIndex;
  problems: ProblemIndex;
  collections: ProblemCollections;
  existing: CourseIndex;
  course: CourseProjection;
  resolveDescription: DescriptionResolver;
  fileIssues: ContentImportIssue[];
}): ContentImportPlan {
  const { structure, problems, collections, existing, resolveDescription } =
    input;
  const fileIssues = input.fileIssues;

  const problemsByLecture = new Map<string, WorkbookProblem[]>();
  for (const key of problems.order) {
    const problem = problems.byKey.get(key);
    if (!problem) continue;
    const bucket = problemsByLecture.get(problem.lectureKey) ?? [];
    bucket.push(problem);
    problemsByLecture.set(problem.lectureKey, bucket);
  }

  /*
   * A lecture the workbook does not define but a problem references still needs
   * a node in the tree, or §4.4's grouped preview would have nowhere to show
   * "two problems added to Loops". It is planned as UNCHANGED under its real
   * parent, which is the honest description: the lecture itself is untouched.
   */
  const lectureKeys = new Set<string>(structure.lectures.keys());
  for (const lectureKey of problemsByLecture.keys()) {
    lectureKeys.add(lectureKey);
  }

  const moduleKeys: string[] = [...structure.order];
  const lectureParents = new Map<string, string>();

  for (const lectureKey of lectureKeys) {
    const defined = structure.lectures.get(lectureKey);
    const current = existing.lecturesByKey.get(lectureKey);
    const moduleKey = defined?.moduleKey ?? current?.moduleKey;
    if (!moduleKey) continue;
    lectureParents.set(lectureKey, moduleKey);
    if (!moduleKeys.includes(moduleKey)) moduleKeys.push(moduleKey);
  }

  const plannedModules: PlannedModule[] = [];

  for (const moduleKey of moduleKeys) {
    const defined = structure.modules.get(moduleKey);
    const current = existing.modulesByKey.get(moduleKey);
    const moduleIssues: ContentImportIssue[] = [];

    const title = defined?.title ?? current?.title ?? "";
    const description = defined?.description ?? current?.description ?? "";
    const order = defined?.order ?? null;

    if (defined) {
      assertTitleAvailable({
        title,
        key: moduleKey,
        occupied: existing.moduleTitles,
        sheet: "Structure",
        rowNumber: defined.firstRow.rowNumber,
        column: "module_title",
        issues: moduleIssues,
      });
    }

    const plannedLectures: PlannedLecture[] = [];
    const lectureTitlesInModule =
      existing.lectureTitlesByModule.get(moduleKey) ?? new Map<string, string>();

    for (const [lectureKey, parentKey] of lectureParents) {
      if (parentKey !== moduleKey) continue;
      plannedLectures.push(
        planLecture({
          lectureKey,
          moduleKey,
          structure,
          existing,
          lectureTitlesInModule,
          problems: problemsByLecture.get(lectureKey) ?? [],
          collections,
          resolveDescription,
        }),
      );
    }

    const moduleExists = Boolean(current);
    const changedFields = moduleExists
      ? diffFields([
          ["module_title", title, current?.title],
          ["module_description", description, current?.description],
          ["module_order", order ?? current?.position, current?.position],
        ])
      : [];

    // A module the workbook only mentions as a problem's grandparent is not
    // being edited, so it is UNCHANGED regardless of what its lectures do. The
    // tree still shows it, because §4.4 groups by the real hierarchy.
    const action: ContentImportAction = !moduleExists
      ? "CREATE"
      : defined && changedFields.length > 0
        ? "UPDATE"
        : "UNCHANGED";

    if (action === "UPDATE" && (current?.isVisible ?? false)) {
      moduleIssues.push(warning("updates_visible_content", moduleKey, "Structure"));
    }

    plannedModules.push({
      key: moduleKey,
      action,
      title,
      description,
      moduleId: current?.id ?? null,
      isVisible: current?.isVisible ?? false,
      order,
      changedFields,
      issues: moduleIssues,
      lectures: plannedLectures,
    });
  }

  assertExplicitOrdersUnique(plannedModules, fileIssues);

  const counts = countPlan(plannedModules, fileIssues);
  return { modules: plannedModules, issues: fileIssues, counts };
}

function planLecture(input: {
  lectureKey: string;
  moduleKey: string;
  structure: StructureIndex;
  existing: CourseIndex;
  lectureTitlesInModule: Map<string, string>;
  problems: WorkbookProblem[];
  collections: ProblemCollections;
  resolveDescription: DescriptionResolver;
}): PlannedLecture {
  const { lectureKey, moduleKey, structure, existing } = input;
  const defined = structure.lectures.get(lectureKey);
  const current = existing.lecturesByKey.get(lectureKey);
  const issues: ContentImportIssue[] = [];

  /*
   * §5.3 — import does not move lectures.
   *
   * A key that exists under another module is far more likely to be a typo in
   * `module_key` than a deliberate restructuring, and the two are
   * indistinguishable from the file. Blocking is the only answer that cannot
   * quietly rearrange a course a class is part-way through.
   */
  if (defined && current && current.moduleKey !== moduleKey) {
    issues.push(
      conflict("parent_conflict", {
        sheet: "Structure",
        rowNumber: defined.firstRow.rowNumber,
        column: "module_key",
        received: moduleKey,
        entityKey: lectureKey,
      }),
    );
  }

  const title = defined?.title ?? current?.lecture.title ?? "";
  const description = defined?.description ?? current?.lecture.description ?? "";
  const order = defined?.order ?? null;

  if (defined) {
    assertTitleAvailable({
      title,
      key: lectureKey,
      occupied: input.lectureTitlesInModule,
      sheet: "Structure",
      rowNumber: defined.firstRow.rowNumber,
      column: "lecture_title",
      issues,
    });
  }

  const problemTitles =
    existing.problemTitlesByLecture.get(lectureKey) ?? new Map<string, string>();

  const plannedProblems = input.problems.map((problem) =>
    planProblem({
      problem,
      lectureKey,
      existing,
      problemTitles,
      collections: input.collections,
      resolveDescription: input.resolveDescription,
    }),
  );

  const lectureExists = Boolean(current);
  const changedFields = lectureExists
    ? diffFields([
        ["lecture_title", title, current?.lecture.title],
        ["lecture_description", description, current?.lecture.description],
        ["lecture_order", order ?? current?.lecture.position, current?.lecture.position],
      ])
    : [];

  const action: ContentImportAction = !lectureExists
    ? "CREATE"
    : defined && changedFields.length > 0
      ? "UPDATE"
      : "UNCHANGED";

  if (action === "UPDATE" && (current?.lecture.isVisible ?? false)) {
    issues.push(warning("updates_visible_content", lectureKey, "Structure"));
  }

  return {
    key: lectureKey,
    action,
    title,
    description,
    moduleKey,
    lectureId: current?.lecture.id ?? null,
    isVisible: current?.lecture.isVisible ?? false,
    order,
    changedFields,
    issues,
    problems: plannedProblems,
  };
}

function planProblem(input: {
  problem: WorkbookProblem;
  lectureKey: string;
  existing: CourseIndex;
  problemTitles: Map<string, string>;
  collections: ProblemCollections;
  resolveDescription: DescriptionResolver;
}): PlannedProblem {
  const { problem, lectureKey, existing, resolveDescription } = input;
  const row = problem.row;
  const current = existing.problemsByKey.get(problem.key);
  const issues: ContentImportIssue[] = [];

  // §5.4 — the same refusal to move that lectures get, one level down. Existing
  // submissions, drafts, and progress hang off this Material; relocating it
  // would move a student's history into a lecture they were never in.
  if (current && current.lectureKey !== lectureKey) {
    issues.push(
      conflict("parent_conflict", {
        sheet: "Problems",
        rowNumber: row.rowNumber,
        column: "lecture_key",
        received: lectureKey,
        entityKey: problem.key,
      }),
    );
  }

  assertTitleAvailable({
    title: row.title,
    key: problem.key,
    occupied: input.problemTitles,
    sheet: "Problems",
    rowNumber: row.rowNumber,
    column: "title",
    issues,
  });

  const testCases = buildTestCases(
    input.collections.testCases.get(problem.key) ?? [],
  );
  const hints = buildHints(input.collections.hints.get(problem.key) ?? []);

  // §5.5 — every created or updated problem grades against something, and at
  // least one of those cases is one a student can see worked.
  if (testCases.length === 0) {
    issues.push(error("tests_missing", problem.key, "Test Cases", row.rowNumber));
  } else if (
    !testCases.some(
      (test) =>
        test.visibility === "SAMPLE" && test.expectedOutput.trim().length > 0,
    )
  ) {
    issues.push(
      error("sample_test_missing", problem.key, "Test Cases", row.rowNumber),
    );
  }

  const description = resolveDescription({
    text: row.description,
    format: row.descriptionFormat,
  });

  // §5.4 — a blank cell preserves the stored value on update and means false on
  // create. Two different meanings for one blank, which is why the row keeps it
  // as null all the way to here rather than resolving it at read time.
  const aiFeedbackEnabled =
    row.aiFeedbackEnabled ?? current?.problem.aiFeedbackEnabled ?? false;

  const difficulty = row.difficulty ?? current?.problem.difficulty ?? "EASY";
  const currentSolutionCode = current?.problem.solutionCode ?? null;
  const solutionCode = row.solutionCode ?? currentSolutionCode;

  const changedFields = current
    ? diffFields([
        ["title", row.title, current.problem.title],
        ["difficulty", difficulty, current.problem.difficulty],
        ["description", description, current.problem.description],
        ["input_format", row.inputFormat, current.problem.inputFormat],
        ["output_format", row.outputFormat, current.problem.outputFormat],
        ["constraints", row.constraints, current.problem.constraints],
        ["starter_code", row.starterCode, current.problem.starterCode],
        ...(row.solutionCode !== null
          ? [[
              "solution_code",
              row.solutionCode,
              currentSolutionCode,
            ] as [string, unknown, unknown]]
          : []),
        [
          "ai_feedback_enabled",
          aiFeedbackEnabled,
          current.problem.aiFeedbackEnabled,
        ],
        [
          "problem_order",
          row.problemOrder ?? current.problem.position,
          current.problem.position,
        ],
      ])
    : [];

  const testsChanged = current
    ? !sameTestCases(testCases, current.problem.testCases)
    : true;
  const hintsChanged = current ? !sameHints(hints, current.problem.hints) : true;

  if (current && testsChanged) changedFields.push("test_cases");
  if (current && hintsChanged) changedFields.push("hints");

  const action: ContentImportAction = !current
    ? "CREATE"
    : changedFields.length > 0
      ? "UPDATE"
      : "UNCHANGED";

  // §11 step 16 — only the grading definition advances the revision. A
  // description edit does not invalidate a verdict; a changed expected output
  // does.
  const gradingChanged = action === "UPDATE" && testsChanged;

  if (
    (!current && solutionCode === null) ||
    (current && currentSolutionCode !== null && row.solutionCode === null) ||
    (action === "UPDATE" && solutionCode === null)
  ) {
    issues.push(
      error("solution_code_missing", problem.key, "Problems", row.rowNumber),
    );
  }

  if (action === "UPDATE") {
    if (current?.problem.isVisible) {
      issues.push(warning("updates_visible_content", problem.key, "Problems"));
    }
    if (testsChanged) {
      issues.push(warning("replaces_test_cases", problem.key, "Test Cases"));
      issues.push(
        warning("grading_revision_advances", problem.key, "Test Cases"),
      );
    }
    // §5.6 — an included problem with no hint rows has its hints cleared. Worth
    // saying out loud only when there is something to lose.
    if (hints.length === 0 && (current?.problem.hints.length ?? 0) > 0) {
      issues.push(warning("clears_hints", problem.key, "Hints"));
    }
  }

  return {
    key: problem.key,
    action,
    title: row.title,
    lectureKey,
    materialId: current?.problem.materialId ?? null,
    isVisible: current?.problem.isVisible ?? false,
    difficulty,
    description,
    inputFormat: row.inputFormat,
    outputFormat: row.outputFormat,
    constraints: row.constraints,
    starterCode: row.starterCode,
    solutionCode,
    aiFeedbackEnabled,
    order: row.problemOrder,
    testCases,
    hints,
    changedFields,
    gradingChanged,
    issues,
  };
}

/* ------------------------------------------------------- collection rules */

/**
 * Test rows, in the order the author numbered them and renumbered densely.
 *
 * The workbook's `test_order` decides the sequence; the stored position is
 * `1..n` with no gaps, because that is what manual authoring produces and a
 * round trip has to be lossless. An author who numbers their tests 10, 20, 30
 * gets 1, 2, 3 back — the same sequence, which is all the column was ever
 * saying.
 */
function buildTestCases(rows: readonly NormalizedTestCaseRow[]) {
  return [...rows]
    .filter((row) => row.testOrder !== null && row.visibility !== null)
    .sort((left, right) => (left.testOrder ?? 0) - (right.testOrder ?? 0))
    .map((row, index) => ({
      position: index + 1,
      input: row.input,
      expectedOutput: row.expectedOutput,
      visibility: row.visibility as TestCaseVisibility,
    }));
}

function buildHints(rows: readonly NormalizedHintRow[]) {
  return [...rows]
    .filter((row) => row.hintOrder !== null && row.content.length > 0)
    .sort((left, right) => (left.hintOrder ?? 0) - (right.hintOrder ?? 0))
    .map((row, index) => ({
      position: index + 1,
      content: row.content,
      triggerExpression: row.triggerExpression,
    }));
}

/**
 * Whether two test collections are the same grading definition.
 *
 * Compared by value in order, never by id: the imported rows have no ids, and
 * §12 requires an unchanged workbook to plan as UNCHANGED rather than replacing
 * every test with an identical one and advancing the grading revision. Getting
 * this wrong makes idempotency impossible — re-uploading the same file would
 * re-grade every submission in the course.
 */
function sameTestCases(
  next: ReturnType<typeof buildTestCases>,
  current: ExistingProblem["testCases"],
): boolean {
  if (next.length !== current.length) return false;
  const ordered = [...current].sort((a, b) => a.position - b.position);
  return next.every((test, index) => {
    const existing = ordered[index];
    return (
      existing !== undefined &&
      test.input === existing.input &&
      test.expectedOutput === existing.expectedOutput &&
      test.visibility === existing.visibility
    );
  });
}

function sameHints(
  next: ReturnType<typeof buildHints>,
  current: ExistingProblem["hints"],
): boolean {
  if (next.length !== current.length) return false;
  const ordered = [...current].sort((a, b) => a.position - b.position);
  return next.every((hint, index) => {
    const existing = ordered[index];
    return (
      existing !== undefined &&
      hint.content === existing.content &&
      hint.triggerExpression === existing.triggerExpression
    );
  });
}

/* ----------------------------------------------------------- collisions */

/**
 * §5.2 — a title already held by a different key.
 *
 * The importer never concludes that two rows are the same entity because they
 * are called the same thing. That is the whole reason stable keys exist, and
 * the conflict is what tells a Team Lead they have re-created something rather
 * than editing it — usually because they typed a new key for a problem that was
 * already there.
 */
function assertTitleAvailable(input: {
  title: string;
  key: string;
  occupied: Map<string, string>;
  sheet: ContentImportSheet;
  rowNumber: number;
  column: string;
  issues: ContentImportIssue[];
}): void {
  if (input.title.length === 0) return;
  const holder = input.occupied.get(normalizeComparableTitle(input.title));
  if (holder === undefined || holder === input.key) return;
  input.issues.push(
    conflict("title_conflict", {
      sheet: input.sheet,
      rowNumber: input.rowNumber,
      column: input.column,
      received: input.title,
      entityKey: input.key,
    }),
  );
}

/**
 * §5.3 — two entities cannot claim the same explicit position under one parent.
 *
 * Only *explicit* orders collide. A blank order is a request for the importer
 * to place the entity, and the collision-safe rewrite at commit gives every one
 * of those a free slot; two rows that both said "3" is the author stating
 * something contradictory, and the preview reports it rather than picking one.
 */
function assertExplicitOrdersUnique(
  modules: readonly PlannedModule[],
  issues: ContentImportIssue[],
): void {
  const check = (
    entries: readonly { key: string; order: number | null }[],
    sheet: ContentImportSheet,
    column: string,
  ) => {
    const claimed = new Map<number, string>();
    for (const entry of entries) {
      if (entry.order === null) continue;
      const holder = claimed.get(entry.order);
      if (holder !== undefined && holder !== entry.key) {
        issues.push(
          conflict("order_conflict", {
            sheet,
            rowNumber: null,
            column,
            received: String(entry.order),
            entityKey: entry.key,
          }),
        );
        continue;
      }
      claimed.set(entry.order, entry.key);
    }
  };

  check(modules, "Structure", "module_order");
  for (const module of modules) {
    check(module.lectures, "Structure", "lecture_order");
    for (const lecture of module.lectures) {
      check(lecture.problems, "Problems", "problem_order");
    }
  }
}

/* ---------------------------------------------------------------- counts */

/**
 * The line §4.4 leads with, counted once.
 *
 * Modules, lectures, and problems are counted together rather than separately,
 * because "Create 48" is a number about the import and a Team Lead reads it as
 * one. The tree beside it is where the breakdown lives.
 */
export function countPlan(
  modules: readonly PlannedModule[],
  fileIssues: readonly ContentImportIssue[] = [],
): ContentImportCounts {
  let create = 0;
  let update = 0;
  let unchanged = 0;
  const issues: ContentImportIssue[] = [...fileIssues];

  const tally = (action: ContentImportAction) => {
    if (action === "CREATE") create += 1;
    else if (action === "UPDATE") update += 1;
    else unchanged += 1;
  };

  for (const module of modules) {
    tally(module.action);
    issues.push(...module.issues);
    for (const lecture of module.lectures) {
      tally(lecture.action);
      issues.push(...lecture.issues);
      for (const problem of lecture.problems) {
        tally(problem.action);
        issues.push(...problem.issues);
      }
    }
  }

  const summary = summarizeIssues(issues);
  return {
    create,
    update,
    unchanged,
    warnings: summary.warnings,
    conflicts: summary.conflicts,
    errors: summary.errors,
  };
}

/** Every issue in the plan, flattened for the issue table and the CSV report. */
export function collectPlanIssues(
  plan: ContentImportPlan,
): ContentImportIssue[] {
  const issues: ContentImportIssue[] = [...plan.issues];
  for (const module of plan.modules) {
    issues.push(...module.issues);
    for (const lecture of module.lectures) {
      issues.push(...lecture.issues);
      for (const problem of lecture.problems) {
        issues.push(...problem.issues);
      }
    }
  }
  return issues;
}

/**
 * §4.5 and §11 — whether this plan may be committed at all.
 *
 * One predicate, used by the disabled state of the Confirm button and by the
 * commit endpoint. Two implementations of "committable" is how a button ends up
 * enabled for a workbook the server will refuse, and the Team Lead learns that
 * the interface guesses.
 */
export function canCommitPlan(input: {
  counts: ContentImportCounts;
  acknowledgeWarnings: boolean;
}): boolean {
  if (input.counts.errors > 0 || input.counts.conflicts > 0) return false;
  if (input.counts.create + input.counts.update === 0) return false;
  if (input.counts.warnings > 0 && !input.acknowledgeWarnings) return false;
  return true;
}
