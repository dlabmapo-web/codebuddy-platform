import { CONTENT_IMPORT_TEMPLATE_VERSION } from "./limits.js";
import {
  contentImportColumns,
  type ContentImportDataSheet,
  type ContentImportSheet,
} from "./sheets.js";
import type { CourseProjection } from "./plan.js";

/**
 * What goes in a generated workbook, as rows of strings.
 *
 * The bytes are written in the API — a `.xlsx` is a zip and this package has no
 * business knowing that — but *what the file says* is decided here, beside the
 * rules that read it back. §4.3 requires the current-course export to be a
 * lossless round trip, and a round trip has exactly one way to stay lossless:
 * the writer and the reader share a source of truth about columns and order.
 * Two hand-maintained column lists in two packages drift on the first change,
 * and the symptom is a Team Lead's own export failing to import.
 *
 * Instructions are localized; nothing else is. §5.1 draws that line so an
 * English and a Korean Team Lead can hand each other one workbook without
 * either of them editing a header.
 *
 * See §4.3 and §5.1 of the team lead Excel problem import design.
 */

export type WorkbookLocale = "en" | "ko";

export type GeneratedWorkbook = {
  sheets: Array<{ name: ContentImportSheet; rows: string[][] }>;
};

/* -------------------------------------------------------- instructions */

type InstructionCopy = {
  title: string;
  intro: string[];
  sheetNotes: string[];
  rules: string[];
  versionLabel: string;
};

/**
 * The Instructions sheet, in both languages.
 *
 * Written as the answers to the four questions a Team Lead opening this file
 * actually has — what am I looking at, which sheet do I edit, what will happen
 * when I upload it, and what will it refuse — rather than as a field-by-field
 * reference. The reference is the header row; a person who needs to know what
 * `lecture_key` means reads the column, not a manual.
 */
const instructionCopy: Record<WorkbookLocale, InstructionCopy> = {
  en: {
    title: "Cove course import",
    intro: [
      "Edit the Structure, Problems, Test Cases, and Hints sheets, then upload this file to the course you exported it from.",
      "Uploading shows a preview. Nothing changes in the course until you confirm it.",
    ],
    sheetNotes: [
      "Structure — one row per lecture, with the module it belongs to.",
      "Problems — one row per problem. Link it to a lecture with lecture_key.",
      "Test Cases — one row per test. Every problem needs at least one SAMPLE.",
      "Hints — optional, one row per hint.",
    ],
    rules: [
      "Keys decide identity. Keep module_key, lecture_key, and problem_key as they are to update existing content; use a new key to create something.",
      "Deleting a row does not delete content. Remove modules, lectures, and problems in the course builder.",
      "Test and hint rows replace the whole set for that problem. Leave a problem's tests in the file to keep them.",
      "New modules, lectures, and problems arrive hidden from students. Make them visible in the course builder.",
      "difficulty accepts EASY, MEDIUM, or HARD. visibility accepts SAMPLE or HIDDEN.",
      "Every new or changed problem needs solution_code. It is the private correct Python answer teachers can reveal while monitoring.",
      "Do not rename the sheets or the header row.",
    ],
    versionLabel: "template_version",
  },
  ko: {
    title: "Cove 코스 가져오기",
    intro: [
      "Structure, Problems, Test Cases, Hints 시트를 편집한 뒤 내보낸 코스에 이 파일을 업로드하세요.",
      "업로드하면 미리보기가 나타납니다. 확인하기 전까지 코스는 바뀌지 않습니다.",
    ],
    sheetNotes: [
      "Structure — 강의 한 개당 한 행, 소속 모듈을 함께 적습니다.",
      "Problems — 문제 한 개당 한 행. lecture_key로 강의에 연결합니다.",
      "Test Cases — 테스트 한 개당 한 행. 모든 문제에 SAMPLE이 최소 한 개 필요합니다.",
      "Hints — 선택 사항이며 힌트 한 개당 한 행입니다.",
    ],
    rules: [
      "키가 대상을 결정합니다. 기존 내용을 수정하려면 module_key, lecture_key, problem_key를 그대로 두고, 새로 만들려면 새 키를 사용하세요.",
      "행을 지워도 내용은 삭제되지 않습니다. 모듈·강의·문제 삭제는 코스 빌더에서 하세요.",
      "테스트와 힌트 행은 해당 문제의 전체 목록을 대체합니다. 유지하려면 파일에 그대로 두세요.",
      "새로 만든 모듈·강의·문제는 학생에게 숨겨진 상태로 추가됩니다. 코스 빌더에서 공개하세요.",
      "difficulty는 EASY, MEDIUM, HARD만 허용합니다. visibility는 SAMPLE 또는 HIDDEN입니다.",
      "새 문제와 변경하는 모든 문제에는 solution_code가 필요합니다. 교사가 모니터링 중 확인할 수 있는 비공개 Python 정답입니다.",
      "시트 이름과 머리글 행은 바꾸지 마세요.",
    ],
    versionLabel: "template_version",
  },
};

/**
 * The Instructions grid.
 *
 * `template_version` sits on its own row with the canonical label beside the
 * number, and the reader finds it by scanning for that label rather than by
 * reading a fixed cell — so a Team Lead who adds a note at the top of the sheet
 * does not invalidate their own workbook.
 */
function instructionsSheet(locale: WorkbookLocale): string[][] {
  const copy = instructionCopy[locale];
  return [
    [copy.title],
    [],
    [copy.versionLabel, String(CONTENT_IMPORT_TEMPLATE_VERSION)],
    [],
    ...copy.intro.map((line) => [line]),
    [],
    ...copy.sheetNotes.map((line) => [line]),
    [],
    ...copy.rules.map((line) => [line]),
  ];
}

/* -------------------------------------------------------------- samples */

/**
 * §4.3 — the blank workbook's representative data.
 *
 * Real rows rather than `<value>` placeholders, because the fastest way to
 * learn that `lecture_key` in Problems has to match `lecture_key` in Structure
 * is to see one row where it does. The keys are readable on purpose: a Team
 * Lead copying this pattern produces keys they can recognise in a preview.
 */
const sampleStructure: string[][] = [
  [
    "PY-BASICS",
    "1",
    "Python Basics",
    "Variables, types, and control flow.",
    "VARIABLES",
    "1",
    "Variables",
    "Naming and assigning values.",
  ],
  ["PY-BASICS", "1", "Python Basics", "Variables, types, and control flow.", "LOOPS", "2", "Loops", "Repeating work."],
];

const sampleProblems: string[][] = [
  [
    "VAR-001",
    "VARIABLES",
    "1",
    "Create a variable",
    "EASY",
    "Read a name and greet the person.",
    "PLAIN_TEXT",
    "One line holding a name.",
    "One greeting line.",
    "The name is at most 50 characters.",
    "name = input()\n",
    "name = input()\nprint(f'Hello, {name}!')\n",
    "FALSE",
  ],
  [
    "LOOP-001",
    "LOOPS",
    "1",
    "Repeat a message",
    "MEDIUM",
    "Print the message n times.",
    "PLAIN_TEXT",
    "A message, then a count.",
    "The message, once per line.",
    "1 <= n <= 100",
    "message = input()\nn = int(input())\n",
    "message = input()\nn = int(input())\nfor _ in range(n):\n    print(message)\n",
    "TRUE",
  ],
];

const sampleTestCases: string[][] = [
  ["VAR-001", "1", "Minji", "Hello, Minji!", "SAMPLE"],
  ["VAR-001", "2", "Jisoo", "Hello, Jisoo!", "HIDDEN"],
  ["LOOP-001", "1", "hi\n3", "hi\nhi\nhi", "SAMPLE"],
  ["LOOP-001", "2", "go\n1", "go", "HIDDEN"],
];

const sampleHints: string[][] = [
  ["VAR-001", "1", "input() gives you the line the student typed.", ""],
  ["LOOP-001", "1", "A for loop over range(n) repeats the body n times.", ""],
];

/** §4.3 — the blank sample workbook: the real schema, invented content. */
export function buildBlankWorkbook(locale: WorkbookLocale): GeneratedWorkbook {
  return {
    sheets: [
      { name: "Instructions", rows: instructionsSheet(locale) },
      { name: "Structure", rows: withHeader("Structure", sampleStructure) },
      { name: "Problems", rows: withHeader("Problems", sampleProblems) },
      { name: "Test Cases", rows: withHeader("Test Cases", sampleTestCases) },
      { name: "Hints", rows: withHeader("Hints", sampleHints) },
    ],
  };
}

function withHeader(
  sheet: ContentImportDataSheet,
  rows: string[][],
): string[][] {
  return [[...contentImportColumns[sheet]], ...rows];
}

/* ------------------------------------------------------- current course */

/**
 * §4.3 — the course as it stands, in the format that reads it back.
 *
 * This is the recommended download and the reason the whole feature is safe to
 * use twice: a Team Lead who starts from their own content never has to invent
 * a key for something that already exists, and never accidentally clears a
 * problem's tests by omitting rows they did not know were required.
 *
 * Descriptions are written as `RICH_TEXT_HTML` carrying the stored sanitized
 * value. §5.4 makes that the lossless choice — re-reading it stores the same
 * string, so an untouched download and upload plans as UNCHANGED rather than as
 * two hundred cosmetic updates.
 */
export function buildCurrentCourseWorkbook(input: {
  course: CourseProjection;
  locale: WorkbookLocale;
}): GeneratedWorkbook {
  const structure: string[][] = [];
  const problems: string[][] = [];
  const testCases: string[][] = [];
  const hints: string[][] = [];

  for (const module of input.course.modules) {
    for (const lecture of module.lectures) {
      structure.push([
        module.key,
        String(module.position),
        module.title,
        module.description,
        lecture.key,
        String(lecture.position),
        lecture.title,
        lecture.description,
      ]);

      for (const problem of lecture.problems) {
        problems.push([
          problem.key,
          lecture.key,
          String(problem.position),
          problem.title,
          problem.difficulty,
          problem.description,
          "RICH_TEXT_HTML",
          problem.inputFormat,
          problem.outputFormat,
          problem.constraints,
          problem.starterCode,
          problem.solutionCode ?? "",
          problem.aiFeedbackEnabled ? "TRUE" : "FALSE",
        ]);

        for (const test of [...problem.testCases].sort(
          (left, right) => left.position - right.position,
        )) {
          testCases.push([
            problem.key,
            String(test.position),
            test.input,
            test.expectedOutput,
            test.visibility,
          ]);
        }

        for (const hint of [...problem.hints].sort(
          (left, right) => left.position - right.position,
        )) {
          hints.push([
            problem.key,
            String(hint.position),
            hint.content,
            hint.triggerExpression ?? "",
          ]);
        }
      }
    }
  }

  /*
   * A module with no lectures still needs a Structure row, or exporting it and
   * importing it back would silently drop it. There is no lecture to name, so
   * it cannot be represented — which is why an empty module is left out and the
   * export is only lossless for content that has somewhere to live. Modules are
   * created in the builder before they are filled, so this is a real state, and
   * omitting the row is honest: the workbook says nothing about that module and
   * §2 leaves entities the workbook omits alone.
   */

  return {
    sheets: [
      { name: "Instructions", rows: instructionsSheet(input.locale) },
      { name: "Structure", rows: withHeader("Structure", structure) },
      { name: "Problems", rows: withHeader("Problems", problems) },
      { name: "Test Cases", rows: withHeader("Test Cases", testCases) },
      { name: "Hints", rows: withHeader("Hints", hints) },
    ],
  };
}

/** How many problems a generated workbook would contain, for §4.3's cap. */
export function countProjectionProblems(course: CourseProjection): number {
  let total = 0;
  for (const module of course.modules) {
    for (const lecture of module.lectures) {
      total += lecture.problems.length;
    }
  }
  return total;
}

/** The filename a download is offered under. */
export function workbookFilename(input: {
  courseTitle: string;
  kind: "current" | "blank";
}): string {
  const base = input.courseTitle
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const stem = base.length > 0 ? base : "course";
  return input.kind === "blank"
    ? "cove-import-template.xlsx"
    : `${stem}-import.xlsx`;
}
