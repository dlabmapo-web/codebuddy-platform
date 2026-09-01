import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  CONTENT_IMPORT_TEMPLATE_VERSION,
  buildBlankWorkbook,
  buildCurrentCourseWorkbook,
  readWorkbookRows,
  type CourseProjection,
} from "@cove/shared";

import {
  ContentWorkbookError,
  readContentWorkbook,
} from "./content-workbook-reader.js";
import { writeWorkbook } from "../../common/workbook-writer.js";
import {
  resolveWorkbookDescription,
  sanitizeDescriptionHtml,
} from "./description-html.js";

/**
 * The reader and the writer, checked against each other and against files
 * nobody would send by accident.
 *
 * Both are hand-written — §7.2 keeps a second full XLSX implementation out of
 * the process — so the round trip below is doing real work: it is the only
 * thing that proves the bytes one half produces are the bytes the other half
 * expects, including the parts a spreadsheet library would have handled
 * silently (sheet naming through relationships, sparse rows, inline strings).
 *
 * The rejection cases are the reason the reader exists in this shape. Each one
 * is a documented attack on spreadsheet importers, and each has to fail closed.
 */

const projection: CourseProjection = {
  contentRevision: 1,
  isVisible: false,
  modules: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      key: "PY-BASICS",
      title: "Python Basics",
      description: "Start here.",
      position: 1,
      isVisible: false,
      lectures: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          key: "VARIABLES",
          title: "Variables",
          description: "",
          position: 1,
          isVisible: false,
          problems: [
            {
              materialId: "33333333-3333-4333-8333-333333333333",
              key: "VAR-001",
              title: "Create a variable",
              position: 1,
              isVisible: false,
              difficulty: "EASY",
              // Deliberately awkward: markup that has to survive escaping, and
              // a Korean name that has to survive UTF-8.
              description: "<p>Greet &amp; welcome 민지</p>",
              inputFormat: "",
              outputFormat: "",
              constraints: "",
              // Indentation is Python's syntax. A trim here breaks the problem.
              starterCode: "def greet(name):\n    return f'Hello, {name}!'\n",
              aiFeedbackEnabled: true,
              testCases: [
                {
                  position: 1,
                  input: "Minji",
                  expectedOutput: "Hello, Minji!",
                  visibility: "SAMPLE",
                },
                {
                  position: 2,
                  input: "",
                  expectedOutput: "Hello, !",
                  visibility: "HIDDEN",
                },
              ],
              hints: [
                {
                  position: 1,
                  content: "f-strings interpolate.",
                  triggerExpression: null,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe("content workbook round trip", () => {
  it("reads back every sheet the writer produced, by name", () => {
    const bytes = writeWorkbook(
      buildCurrentCourseWorkbook({ course: projection, locale: "en" }),
    );
    const read = readContentWorkbook(bytes);

    expect(read.templateVersion).toBe(CONTENT_IMPORT_TEMPLATE_VERSION);
    expect(read.unknownSheets).toEqual([]);
    expect([...read.sheets.keys()].sort()).toEqual([
      "Hints",
      "Problems",
      "Structure",
      "Test Cases",
    ]);
  });

  it("preserves code indentation, markup, and Korean text exactly", () => {
    const bytes = writeWorkbook(
      buildCurrentCourseWorkbook({ course: projection, locale: "en" }),
    );
    const read = readContentWorkbook(bytes);
    const rows = readWorkbookRows({
      Structure: read.sheets.get("Structure") ?? [],
      Problems: read.sheets.get("Problems") ?? [],
      "Test Cases": read.sheets.get("Test Cases") ?? [],
      Hints: read.sheets.get("Hints") ?? [],
    });

    const problem = rows.problems[0];
    expect(problem.problemKey).toBe("VAR-001");
    expect(problem.starterCode).toBe(
      "def greet(name):\n    return f'Hello, {name}!'\n",
    );
    expect(problem.description).toBe("<p>Greet &amp; welcome 민지</p>");
    expect(problem.aiFeedbackEnabled).toBe(true);
    expect(rows.issues).toEqual([]);
  });

  it("keeps a test whose input is empty distinguishable from a missing cell", () => {
    // The writer omits empty cells entirely, so this only works because the
    // reader addresses columns by their `r=` reference rather than by position.
    const bytes = writeWorkbook(
      buildCurrentCourseWorkbook({ course: projection, locale: "en" }),
    );
    const read = readContentWorkbook(bytes);
    const rows = readWorkbookRows({
      Structure: read.sheets.get("Structure") ?? [],
      Problems: read.sheets.get("Problems") ?? [],
      "Test Cases": read.sheets.get("Test Cases") ?? [],
      Hints: read.sheets.get("Hints") ?? [],
    });

    const hidden = rows.testCases.find((row) => row.visibility === "HIDDEN");
    expect(hidden?.input).toBe("");
    expect(hidden?.expectedOutput).toBe("Hello, !");
  });

  it("reads the blank template it ships", () => {
    const read = readContentWorkbook(
      writeWorkbook(buildBlankWorkbook("ko")),
    );
    const rows = readWorkbookRows({
      Structure: read.sheets.get("Structure") ?? [],
      Problems: read.sheets.get("Problems") ?? [],
      "Test Cases": read.sheets.get("Test Cases") ?? [],
      Hints: read.sheets.get("Hints") ?? [],
    });

    // The sample workbook has to be importable, or it teaches the wrong format.
    expect(rows.issues.filter((issue) => issue.severity !== "WARNING")).toEqual(
      [],
    );
    expect(rows.problems).toHaveLength(2);
  });
});

describe("hostile workbooks", () => {
  const reject = (bytes: Buffer) => {
    try {
      readContentWorkbook(bytes);
      return null;
    } catch (failure) {
      return failure instanceof ContentWorkbookError ? failure.reason : "threw";
    }
  };

  it("refuses an empty upload", () => {
    expect(reject(Buffer.alloc(0))).toBe("file_empty");
  });

  it("refuses anything that is not a zip", () => {
    // A `.xlsx` that is really a CSV. §5.1 accepts one format, and the leading
    // bytes decide — never the filename or the declared content type.
    expect(reject(Buffer.from("problem_key,title\nVAR-001,Hi\n"))).toBe(
      "unsupported_format",
    );
  });

  it("refuses legacy .xls", () => {
    // The OLE2 compound-file signature. Not a zip, so it never reaches a parser.
    const ole2 = Buffer.from([
      0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
    ]);
    expect(reject(ole2)).toBe("unsupported_format");
  });

  it("refuses a zip with no workbook relationships", () => {
    const bytes = Buffer.from(
      zipSync({
        "xl/workbook.xml": Buffer.from("<workbook/>"),
      }),
    );
    expect(reject(bytes)).toBe("unsupported_format");
  });

  it("refuses a formula cell in a data sheet", () => {
    // §5.7 — the cached value is what Excel last computed, and an expected
    // output nobody will recompute is a grading definition on trust.
    const bytes = craft({
      sheetName: "Problems",
      cells: '<c r="A2"><f>CONCATENATE("VAR","-001")</f><v>VAR-001</v></c>',
    });
    expect(reject(bytes)).toBe("formula_cell");
  });

  it("allows a formula left behind in the Instructions prose", () => {
    // Instructions is written for a person and imports nothing, so a stray
    // formula there is not a reason to refuse somebody's whole curriculum.
    const bytes = craft({
      sheetName: "Instructions",
      cells: '<c r="A2"><f>TODAY()</f><v>46000</v></c>',
    });
    expect(reject(bytes)).toBeNull();
  });

  it("refuses more sheets than the format has", () => {
    const many = Array.from({ length: 12 }, (_value, index) => index);
    const bytes = Buffer.from(
      zipSync({
        "xl/workbook.xml": Buffer.from(
          `<workbook><sheets>${many
            .map(
              (index) =>
                `<sheet name="S${index}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
            )
            .join("")}</sheets></workbook>`,
        ),
        "xl/_rels/workbook.xml.rels": Buffer.from(
          `<Relationships>${many
            .map(
              (index) =>
                `<Relationship Id="rId${index + 1}" Target="worksheets/sheet${index + 1}.xml"/>`,
            )
            .join("")}</Relationships>`,
        ),
      }),
    );
    expect(reject(bytes)).toBe("too_many_sheets");
  });

  it("ignores a `<!DOCTYPE>` entity table rather than expanding it", () => {
    // Billion laughs. The reader is a scanner that decodes five predefined
    // entities and consults no entity table, so the declaration is inert.
    const bytes = craft({
      sheetName: "Problems",
      prologue:
        '<!DOCTYPE t [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;">]>',
      cells: '<c r="A2" t="inlineStr"><is><t>&lol2;</t></is></c>',
    });
    expect(reject(bytes)).toBeNull();
    const read = readContentWorkbook(bytes);
    // The undeclared-to-this-reader entity contributes nothing rather than
    // expanding; what matters is that it did not multiply.
    expect(read.sheets.get("Problems")?.[1]?.[0] ?? "").not.toContain("lollol");
  });

  it("drops zip entries whose names try to traverse", () => {
    const bytes = Buffer.from(
      zipSync({
        "../../etc/passwd": Buffer.from("root"),
        "xl/workbook.xml": Buffer.from("<workbook/>"),
      }),
    );
    // No relationships part survives, so the file is refused outright — and the
    // traversal entry was never inflated in the first place.
    expect(reject(bytes)).toBe("unsupported_format");
  });
});

/**
 * A minimal one-sheet workbook, for the cases that need a specific cell.
 *
 * Built by hand rather than through the writer, because every one of these
 * tests is about a file the writer would never produce.
 */
function craft(input: {
  sheetName: string;
  cells: string;
  prologue?: string;
}): Buffer {
  return Buffer.from(
    zipSync({
      "xl/workbook.xml": Buffer.from(
        `<workbook><sheets><sheet name="${input.sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
      "xl/_rels/workbook.xml.rels": Buffer.from(
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      ),
      "xl/worksheets/sheet1.xml": Buffer.from(
        `<?xml version="1.0"?>${input.prologue ?? ""}<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>header</t></is></c></row><row r="2">${input.cells}</row></sheetData></worksheet>`,
      ),
    }),
  );
}

describe("description sanitizer", () => {
  it("keeps the editor's vocabulary and drops everything else", () => {
    expect(
      sanitizeDescriptionHtml(
        '<p>Read <strong>this</strong></p><div class="x">and this</div>',
      ),
    ).toBe("<p>Read <strong>this</strong></p>and this");
  });

  it("removes scripts with their bodies", () => {
    expect(
      sanitizeDescriptionHtml("<p>before</p><script>steal()</script><p>after</p>"),
    ).toBe("<p>before</p><p>after</p>");
  });

  it("strips every attribute, including the ones that look harmless", () => {
    // An allowlist of attributes is an invitation to get one wrong. A
    // description has nothing it needs to say in one.
    expect(
      sanitizeDescriptionHtml('<p onclick="x()" class="y">text</p>'),
    ).toBe("<p>text</p>");
    expect(
      sanitizeDescriptionHtml('<img src="x" onerror="steal()">'),
    ).toBe("");
  });

  it("treats a description that renders as nothing as empty", () => {
    // A Rich Editor that was typed into and cleared emits this, and it has to
    // compare equal to an absent description or a round trip reports a change.
    expect(sanitizeDescriptionHtml("<p></p>")).toBe("");
    expect(sanitizeDescriptionHtml("<p>&nbsp;</p>")).toBe("");
  });

  it("renders plain text as the same markup the editor produces", () => {
    expect(
      resolveWorkbookDescription({ text: "a < b", format: "PLAIN_TEXT" }),
    ).toBe("<p>a &lt; b</p>");
  });
});
