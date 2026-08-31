import type { ExerciseDifficulty, TestCaseVisibility } from "../course.js";
import { parseStableKey } from "./keys.js";
import {
  CONTENT_IMPORT_MAX_CODE_LENGTH,
  CONTENT_IMPORT_MAX_TEXT_LENGTH,
  CONTENT_IMPORT_MAX_TITLE_LENGTH,
  CONTENT_IMPORT_MAX_TRIGGER_LENGTH,
  CONTENT_IMPORT_PREVIEW_VALUE_LENGTH,
} from "./limits.js";
import type {
  ContentImportIssue,
  ContentImportErrorCode,
} from "./issues.js";
import {
  cellAt,
  hintColumns,
  indexHeaderRow,
  missingRequiredColumns,
  problemColumns,
  requiredHintColumns,
  requiredProblemColumns,
  requiredStructureColumns,
  requiredTestCaseColumns,
  structureColumns,
  testCaseColumns,
  type ContentImportSheet,
} from "./sheets.js";
import {
  isBlankCell,
  normalizeCellText,
  normalizeDescriptionFormat,
  normalizeDifficulty,
  normalizeStrictBoolean,
  normalizeTestVisibility,
  normalizeTrimmedText,
  parseOrder,
  truncateForPreview,
  type ContentImportDescriptionFormat,
} from "./values.js";

/**
 * Cell grids in, typed rows out — and an issue for every cell that could not
 * become one.
 *
 * This layer knows nothing about the course being imported into. Whether a
 * difficulty is spelled correctly is a property of the row; whether the problem
 * it names already exists is a property of the database, and mixing the two
 * would make every rule here untestable without a fixture course. `plan.ts`
 * adds the second half.
 *
 * A row that fails still comes back. Returning only the good rows would make
 * the preview's counts lie — a workbook with 48 problems and 2 broken ones is
 * not a workbook with 46 problems — and §6 blocks the whole session on any
 * error anyway, so there is nothing to gain by dropping them.
 *
 * See §5.3–5.7 of the team lead Excel problem import design.
 */

/** Where a row sits, for every issue this file produces. */
type RowLocation = { sheet: ContentImportSheet; rowNumber: number };

export type NormalizedStructureRow = RowLocation & {
  moduleKey: string | null;
  moduleOrder: number | null;
  moduleTitle: string;
  moduleDescription: string;
  lectureKey: string | null;
  lectureOrder: number | null;
  lectureTitle: string;
  lectureDescription: string;
};

export type NormalizedProblemRow = RowLocation & {
  problemKey: string | null;
  lectureKey: string | null;
  problemOrder: number | null;
  title: string;
  difficulty: ExerciseDifficulty | null;
  description: string;
  descriptionFormat: ContentImportDescriptionFormat;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  starterCode: string;
  /** Null means the cell was blank; the planner applies legacy update rules. */
  solutionCode: string | null;
  /** Null means the cell was blank: create as false, preserve on update. */
  aiFeedbackEnabled: boolean | null;
};

export type NormalizedTestCaseRow = RowLocation & {
  problemKey: string | null;
  testOrder: number | null;
  input: string;
  expectedOutput: string;
  visibility: TestCaseVisibility | null;
};

export type NormalizedHintRow = RowLocation & {
  problemKey: string | null;
  hintOrder: number | null;
  content: string;
  triggerExpression: string | null;
};

export type NormalizedWorkbook = {
  structure: NormalizedStructureRow[];
  problems: NormalizedProblemRow[];
  testCases: NormalizedTestCaseRow[];
  hints: NormalizedHintRow[];
  issues: ContentImportIssue[];
};

/* ------------------------------------------------------------- helpers */

function issue(
  location: RowLocation | { sheet: ContentImportSheet; rowNumber: null },
  code: ContentImportErrorCode,
  column: string | null,
  received: string | null,
  entityKey: string | null = null,
): ContentImportIssue {
  return {
    severity: "ERROR",
    code,
    sheet: location.sheet,
    rowNumber: location.rowNumber,
    column,
    received:
      received === null
        ? null
        : truncateForPreview(received, CONTENT_IMPORT_PREVIEW_VALUE_LENGTH),
    entityKey,
  };
}

/**
 * A key cell, read and reported in one step.
 *
 * Every sheet has at least one, and all four want the same three verdicts —
 * blank, malformed, or usable — reported against their own column name. Written
 * once because the alternative is four copies that drift on the day the key
 * rules change.
 */
function readKey(
  location: RowLocation,
  raw: string,
  column: string,
  issues: ContentImportIssue[],
): string | null {
  if (isBlankCell(raw)) {
    issues.push(issue(location, "key_missing", column, null));
    return null;
  }
  const key = parseStableKey(raw);
  if (key === null) {
    issues.push(issue(location, "key_invalid", column, raw));
    return null;
  }
  return key;
}

function readTitle(
  location: RowLocation,
  raw: string,
  column: string,
  issues: ContentImportIssue[],
  entityKey: string | null,
): string {
  const title = normalizeTrimmedText(raw);
  if (title.length === 0) {
    issues.push(issue(location, "title_missing", column, null, entityKey));
    return "";
  }
  if (title.length > CONTENT_IMPORT_MAX_TITLE_LENGTH) {
    issues.push(issue(location, "title_too_long", column, raw, entityKey));
  }
  return title;
}

/**
 * An optional prose cell, capped.
 *
 * The cap is reported rather than applied. §5.7's rule against silent defaults
 * covers truncation too: importing the first ten thousand characters of a
 * twelve-thousand-character description gives the Team Lead a problem that
 * stops mid-sentence and no reason to suspect it.
 */
function readText(
  location: RowLocation,
  raw: string,
  column: string,
  issues: ContentImportIssue[],
  entityKey: string | null,
  limit = CONTENT_IMPORT_MAX_TEXT_LENGTH,
  code: ContentImportErrorCode = "text_too_long",
): string {
  const text = normalizeTrimmedText(raw);
  if (text.length > limit) {
    issues.push(issue(location, code, column, raw, entityKey));
  }
  return text;
}

/**
 * An order cell, with §5.3's three-way meaning preserved.
 *
 * Blank is a legitimate value that means "decide for me", so it returns null
 * without an issue. Only an unparseable one is reported — and it is reported
 * rather than defaulted, because an order the importer chose is an order the
 * Team Lead did not.
 */
function readOptionalOrder(
  location: RowLocation,
  raw: string,
  column: string,
  issues: ContentImportIssue[],
  entityKey: string | null,
): number | null {
  const parsed = parseOrder(raw);
  if (parsed.kind === "blank") return null;
  if (parsed.kind === "invalid") {
    issues.push(issue(location, "order_invalid", column, raw, entityKey));
    return null;
  }
  return parsed.value;
}

/**
 * An order cell that §5.5 and §5.6 make mandatory.
 *
 * Tests and hints are ordered collections whose order is the content: a student
 * reads hint 1 before hint 2, and a sample test shown out of sequence teaches
 * the wrong thing. There is no sensible "decide for me" here, so blank is an
 * error rather than an append.
 */
function readRequiredOrder(
  location: RowLocation,
  raw: string,
  column: string,
  issues: ContentImportIssue[],
  entityKey: string | null,
): number | null {
  const parsed = parseOrder(raw);
  if (parsed.kind === "blank") {
    issues.push(issue(location, "order_missing", column, null, entityKey));
    return null;
  }
  if (parsed.kind === "invalid") {
    issues.push(issue(location, "order_invalid", column, raw, entityKey));
    return null;
  }
  return parsed.value;
}

/** Whether every cell in a row is empty — Excel's leftovers after a deletion. */
function rowIsBlank(row: readonly string[]): boolean {
  return row.every((cell) => isBlankCell(cell));
}

/* ----------------------------------------------------------- the sheets */

type SheetGrid = readonly (readonly string[])[];

/**
 * The header check every data sheet gets before its rows are read.
 *
 * Returning null rather than throwing keeps one broken sheet from hiding the
 * other three: a workbook missing `expected_output` should preview the eleven
 * problems that are fine alongside the reason its tests could not be read, not
 * a single line saying the file is bad.
 */
function readHeader<Column extends string>(
  sheet: ContentImportSheet,
  grid: SheetGrid,
  known: readonly Column[],
  required: readonly Column[],
  issues: ContentImportIssue[],
) {
  if (grid.length === 0) {
    issues.push(
      issue({ sheet, rowNumber: null }, "sheet_missing", null, null),
    );
    return null;
  }

  const header = indexHeaderRow(grid[0], known);
  for (const column of header.duplicated) {
    issues.push(
      issue({ sheet, rowNumber: 1 }, "column_duplicated", column, null),
    );
  }
  const missing = missingRequiredColumns(header.columns, required);
  for (const column of missing) {
    issues.push(issue({ sheet, rowNumber: 1 }, "column_missing", column, null));
  }
  if (missing.length > 0) return null;

  return header;
}

export function readStructureSheet(grid: SheetGrid): {
  rows: NormalizedStructureRow[];
  issues: ContentImportIssue[];
  unknownColumns: string[];
} {
  const issues: ContentImportIssue[] = [];
  const header = readHeader(
    "Structure",
    grid,
    structureColumns,
    requiredStructureColumns,
    issues,
  );
  if (!header) return { rows: [], issues, unknownColumns: [] };

  const rows: NormalizedStructureRow[] = [];
  for (let index = 1; index < grid.length; index += 1) {
    const raw = grid[index];
    if (rowIsBlank(raw)) continue;
    // One-based, and the header is row 1, so a zero-based array index of 1 is
    // spreadsheet row 2. This is the number the Team Lead reads in the gutter.
    const location = { sheet: "Structure", rowNumber: index + 1 } as const;
    const get = (column: (typeof structureColumns)[number]) =>
      cellAt(raw, header.columns, column);

    const moduleKey = readKey(location, get("module_key"), "module_key", issues);
    const lectureKey = readKey(
      location,
      get("lecture_key"),
      "lecture_key",
      issues,
    );

    rows.push({
      ...location,
      moduleKey,
      moduleOrder: readOptionalOrder(
        location,
        get("module_order"),
        "module_order",
        issues,
        moduleKey,
      ),
      moduleTitle: readTitle(
        location,
        get("module_title"),
        "module_title",
        issues,
        moduleKey,
      ),
      moduleDescription: readText(
        location,
        get("module_description"),
        "module_description",
        issues,
        moduleKey,
      ),
      lectureKey,
      lectureOrder: readOptionalOrder(
        location,
        get("lecture_order"),
        "lecture_order",
        issues,
        lectureKey,
      ),
      lectureTitle: readTitle(
        location,
        get("lecture_title"),
        "lecture_title",
        issues,
        lectureKey,
      ),
      lectureDescription: readText(
        location,
        get("lecture_description"),
        "lecture_description",
        issues,
        lectureKey,
      ),
    });
  }

  return { rows, issues, unknownColumns: header.unknown };
}

export function readProblemsSheet(grid: SheetGrid): {
  rows: NormalizedProblemRow[];
  issues: ContentImportIssue[];
  unknownColumns: string[];
} {
  const issues: ContentImportIssue[] = [];
  const header = readHeader(
    "Problems",
    grid,
    problemColumns,
    requiredProblemColumns,
    issues,
  );
  if (!header) return { rows: [], issues, unknownColumns: [] };

  const rows: NormalizedProblemRow[] = [];
  for (let index = 1; index < grid.length; index += 1) {
    const raw = grid[index];
    if (rowIsBlank(raw)) continue;
    const location = { sheet: "Problems", rowNumber: index + 1 } as const;
    const get = (column: (typeof problemColumns)[number]) =>
      cellAt(raw, header.columns, column);

    const problemKey = readKey(
      location,
      get("problem_key"),
      "problem_key",
      issues,
    );
    const lectureKey = readKey(
      location,
      get("lecture_key"),
      "lecture_key",
      issues,
    );

    const difficultyCell = get("difficulty");
    let difficulty: ExerciseDifficulty | null = null;
    if (isBlankCell(difficultyCell)) {
      issues.push(
        issue(location, "difficulty_missing", "difficulty", null, problemKey),
      );
    } else {
      difficulty = normalizeDifficulty(difficultyCell);
      if (difficulty === null) {
        issues.push(
          issue(
            location,
            "difficulty_invalid",
            "difficulty",
            difficultyCell,
            problemKey,
          ),
        );
      }
    }

    const descriptionCell = get("description");
    if (isBlankCell(descriptionCell)) {
      issues.push(
        issue(location, "description_missing", "description", null, problemKey),
      );
    }

    const formatCell = get("description_format");
    const descriptionFormat = normalizeDescriptionFormat(formatCell);
    if (descriptionFormat === null) {
      issues.push(
        issue(
          location,
          "description_format_invalid",
          "description_format",
          formatCell,
          problemKey,
        ),
      );
    }

    // §5.4 — blank means false on create and "leave it alone" on update, so the
    // blank cell has to stay distinguishable from an explicit FALSE all the way
    // into the planner. Only an unrecognised word is an error.
    const aiCell = get("ai_feedback_enabled");
    let aiFeedbackEnabled: boolean | null = null;
    if (!isBlankCell(aiCell)) {
      aiFeedbackEnabled = normalizeStrictBoolean(aiCell);
      if (aiFeedbackEnabled === null) {
        issues.push(
          issue(
            location,
            "boolean_invalid",
            "ai_feedback_enabled",
            aiCell,
            problemKey,
          ),
        );
      }
    }

    rows.push({
      ...location,
      problemKey,
      lectureKey,
      problemOrder: readOptionalOrder(
        location,
        get("problem_order"),
        "problem_order",
        issues,
        problemKey,
      ),
      title: readTitle(location, get("title"), "title", issues, problemKey),
      difficulty,
      description: readText(
        location,
        descriptionCell,
        "description",
        issues,
        problemKey,
      ),
      descriptionFormat: descriptionFormat ?? "PLAIN_TEXT",
      inputFormat: readText(
        location,
        get("input_format"),
        "input_format",
        issues,
        problemKey,
      ),
      outputFormat: readText(
        location,
        get("output_format"),
        "output_format",
        issues,
        problemKey,
      ),
      constraints: readText(
        location,
        get("constraints"),
        "constraints",
        issues,
        problemKey,
      ),
      // Starter code keeps its whitespace: indentation is Python's syntax, and
      // trimming it would import code that does not run.
      starterCode: readCode(
        location,
        get("starter_code"),
        "starter_code",
        issues,
        problemKey,
      ),
      solutionCode: readSensitiveCode(
        location,
        get("solution_code"),
        "solution_code",
        issues,
        problemKey,
      ),
      aiFeedbackEnabled,
    });
  }

  return { rows, issues, unknownColumns: header.unknown };
}

/**
 * Source code and test payloads, preserved exactly.
 *
 * §5.5 is explicit that input and expected output are not trimmed, and starter
 * code has the same requirement for a different reason: a leading blank line is
 * cosmetic, but leading *indentation* is a syntax error waiting to happen the
 * moment a trim removes it from one line and not another. Only line endings are
 * normalized, and only because the spreadsheet chose those rather than the
 * author.
 */
function readCode(
  location: RowLocation,
  raw: string,
  column: string,
  issues: ContentImportIssue[],
  entityKey: string | null,
): string {
  const text = normalizeCellText(raw);
  if (text.length > CONTENT_IMPORT_MAX_CODE_LENGTH) {
    issues.push(issue(location, "code_too_long", column, raw, entityKey));
  }
  return text;
}

/** Correct answers are never copied into issue previews or reports. */
function readSensitiveCode(
  location: RowLocation,
  raw: string,
  column: string,
  issues: ContentImportIssue[],
  entityKey: string | null,
): string | null {
  const text = normalizeCellText(raw);
  if (text.length > CONTENT_IMPORT_MAX_CODE_LENGTH) {
    issues.push(issue(location, "code_too_long", column, null, entityKey));
  }
  return text.trim().length > 0 ? text : null;
}

export function readTestCasesSheet(grid: SheetGrid): {
  rows: NormalizedTestCaseRow[];
  issues: ContentImportIssue[];
  unknownColumns: string[];
} {
  const issues: ContentImportIssue[] = [];
  const header = readHeader(
    "Test Cases",
    grid,
    testCaseColumns,
    requiredTestCaseColumns,
    issues,
  );
  if (!header) return { rows: [], issues, unknownColumns: [] };

  const rows: NormalizedTestCaseRow[] = [];
  for (let index = 1; index < grid.length; index += 1) {
    const raw = grid[index];
    if (rowIsBlank(raw)) continue;
    const location = { sheet: "Test Cases", rowNumber: index + 1 } as const;
    const get = (column: (typeof testCaseColumns)[number]) =>
      cellAt(raw, header.columns, column);

    const problemKey = readKey(
      location,
      get("problem_key"),
      "problem_key",
      issues,
    );

    const visibilityCell = get("visibility");
    let visibility: TestCaseVisibility | null = null;
    if (isBlankCell(visibilityCell)) {
      issues.push(
        issue(location, "visibility_missing", "visibility", null, problemKey),
      );
    } else {
      visibility = normalizeTestVisibility(visibilityCell);
      if (visibility === null) {
        issues.push(
          issue(
            location,
            "visibility_invalid",
            "visibility",
            visibilityCell,
            problemKey,
          ),
        );
      }
    }

    // §5.5 — a test with no expected output cannot grade anything. Input may be
    // empty (a problem that reads nothing is a real problem); output may not.
    const expectedOutput = readCode(
      location,
      get("expected_output"),
      "expected_output",
      issues,
      problemKey,
    );
    if (expectedOutput.length === 0) {
      issues.push(
        issue(
          location,
          "expected_output_missing",
          "expected_output",
          null,
          problemKey,
        ),
      );
    }

    rows.push({
      ...location,
      problemKey,
      testOrder: readRequiredOrder(
        location,
        get("test_order"),
        "test_order",
        issues,
        problemKey,
      ),
      input: readCode(location, get("input"), "input", issues, problemKey),
      expectedOutput,
      visibility,
    });
  }

  return { rows, issues, unknownColumns: header.unknown };
}

export function readHintsSheet(grid: SheetGrid): {
  rows: NormalizedHintRow[];
  issues: ContentImportIssue[];
  unknownColumns: string[];
} {
  const issues: ContentImportIssue[] = [];
  // §5.1 — Hints is optional, so an absent sheet is an empty collection rather
  // than a missing-sheet error. An absent sheet and an empty one mean the same
  // thing, which §5.6 defines: every included problem's hints are cleared.
  if (grid.length === 0) return { rows: [], issues, unknownColumns: [] };

  const header = readHeader(
    "Hints",
    grid,
    hintColumns,
    requiredHintColumns,
    issues,
  );
  if (!header) return { rows: [], issues, unknownColumns: [] };

  const rows: NormalizedHintRow[] = [];
  for (let index = 1; index < grid.length; index += 1) {
    const raw = grid[index];
    if (rowIsBlank(raw)) continue;
    const location = { sheet: "Hints", rowNumber: index + 1 } as const;
    const get = (column: (typeof hintColumns)[number]) =>
      cellAt(raw, header.columns, column);

    const problemKey = readKey(
      location,
      get("problem_key"),
      "problem_key",
      issues,
    );

    const content = readText(
      location,
      get("content"),
      "content",
      issues,
      problemKey,
    );
    if (content.length === 0) {
      issues.push(
        issue(location, "hint_content_missing", "content", null, problemKey),
      );
    }

    const trigger = readText(
      location,
      get("trigger_expression"),
      "trigger_expression",
      issues,
      problemKey,
      CONTENT_IMPORT_MAX_TRIGGER_LENGTH,
    );

    rows.push({
      ...location,
      problemKey,
      hintOrder: readRequiredOrder(
        location,
        get("hint_order"),
        "hint_order",
        issues,
        problemKey,
      ),
      content,
      triggerExpression: trigger.length === 0 ? null : trigger,
    });
  }

  return { rows, issues, unknownColumns: header.unknown };
}

/* ------------------------------------------------------------- workbook */

/**
 * All four data sheets, read together.
 *
 * Unknown columns become one warning per sheet rather than one per column: a
 * Team Lead who keeps a `notes` and an `owner` column beside the imported ones
 * has made one decision, and reporting it twice makes the warning list look
 * like a problem list.
 */
export function readWorkbookRows(grids: {
  Structure: SheetGrid;
  Problems: SheetGrid;
  "Test Cases": SheetGrid;
  Hints: SheetGrid;
  unknownSheets?: readonly string[];
}): NormalizedWorkbook {
  const structure = readStructureSheet(grids.Structure);
  const problems = readProblemsSheet(grids.Problems);
  const testCases = readTestCasesSheet(grids["Test Cases"]);
  const hints = readHintsSheet(grids.Hints);

  const issues: ContentImportIssue[] = [
    ...structure.issues,
    ...problems.issues,
    ...testCases.issues,
    ...hints.issues,
  ];

  const unknownColumns: Array<[ContentImportSheet, string[]]> = [
    ["Structure", structure.unknownColumns],
    ["Problems", problems.unknownColumns],
    ["Test Cases", testCases.unknownColumns],
    ["Hints", hints.unknownColumns],
  ];
  for (const [sheet, columns] of unknownColumns) {
    if (columns.length === 0) continue;
    issues.push({
      severity: "WARNING",
      code: "unknown_column_ignored",
      sheet,
      rowNumber: 1,
      column: null,
      received: truncateForPreview(
        columns.join(", "),
        CONTENT_IMPORT_PREVIEW_VALUE_LENGTH,
      ),
      entityKey: null,
    });
  }

  for (const sheet of grids.unknownSheets ?? []) {
    issues.push({
      severity: "WARNING",
      code: "unknown_sheet_ignored",
      sheet: null,
      rowNumber: null,
      column: null,
      received: truncateForPreview(sheet, CONTENT_IMPORT_PREVIEW_VALUE_LENGTH),
      entityKey: null,
    });
  }

  return {
    structure: structure.rows,
    problems: problems.rows,
    testCases: testCases.rows,
    hints: hints.rows,
    issues,
  };
}
