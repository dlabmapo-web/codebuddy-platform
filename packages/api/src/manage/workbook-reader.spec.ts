import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";

import {
  WorkbookError,
  decodeXmlText,
  readCsv,
  readSharedStrings,
  readSheet,
  readWorkbook,
} from "./workbook-reader.js";

/** A minimal but real `.xlsx`: the three parts the reader actually opens. */
function xlsx(input: {
  sheet: string;
  sharedStrings?: string;
  extra?: Record<string, string>;
}): Buffer {
  const files: Record<string, Uint8Array> = {
    "xl/workbook.xml": strToU8("<workbook/>"),
    "xl/worksheets/sheet1.xml": strToU8(input.sheet),
    ...(input.sharedStrings
      ? { "xl/sharedStrings.xml": strToU8(input.sharedStrings) }
      : {}),
    ...Object.fromEntries(
      Object.entries(input.extra ?? {}).map(([name, body]) => [
        name,
        strToU8(body),
      ]),
    ),
  };
  return Buffer.from(zipSync(files));
}

const sheet = (body: string) =>
  `<worksheet><sheetData>${body}</sheetData></worksheet>`;

describe("readCsv", () => {
  it("reads a plain file", () => {
    expect(readCsv(Buffer.from("email,role\na@x.com,STUDENT"))).toEqual([
      ["email", "role"],
      ["a@x.com", "STUDENT"],
    ]);
  });

  it("strips the byte-order mark Excel writes", () => {
    // Without this the first header reads as "﻿email" and matches nothing.
    expect(readCsv(Buffer.from("﻿email\na@x.com"))[0]).toEqual(["email"]);
  });

  it("handles both line endings in one file", () => {
    expect(readCsv(Buffer.from("a\r\nb\rc\nd"))).toEqual([
      ["a"],
      ["b"],
      ["c"],
      ["d"],
    ]);
  });

  it("reads a quoted field containing a comma and a newline", () => {
    expect(readCsv(Buffer.from('name,role\n"Kim, Minji\nJr",STUDENT'))).toEqual([
      ["name", "role"],
      ["Kim, Minji\nJr", "STUDENT"],
    ]);
  });

  it("un-doubles an escaped quote", () => {
    expect(readCsv(Buffer.from('a\n"say ""hi"""'))).toEqual([
      ["a"],
      ['say "hi"'],
    ]);
  });

  it("keeps a formula as text rather than evaluating anything", () => {
    expect(readCsv(Buffer.from("a\n=1+1"))).toEqual([["a"], ["=1+1"]]);
  });

  it("reports what the file literally contained, trailing blanks included", () => {
    // Trimming is the caller's job, so this reader stays honest about the file.
    expect(readCsv(Buffer.from("a\nb\n\n"))).toEqual([["a"], ["b"], [""]]);
  });

  it("refuses a file whose quote is never closed", () => {
    const hostile = `a\n"${"x".repeat(3_000)}`;
    expect(() => readCsv(Buffer.from(hostile))).toThrow(WorkbookError);
  });
});

describe("readSharedStrings", () => {
  it("reads one entry per string", () => {
    expect(
      readSharedStrings("<sst><si><t>one</t></si><si><t>two</t></si></sst>"),
    ).toEqual(["one", "two"]);
  });

  it("joins the runs of a rich-text string", () => {
    // A name typed with one bold syllable is still one name.
    expect(
      readSharedStrings(
        "<sst><si><r><t>Kim </t></r><r><t>Minji</t></r></si></sst>",
      ),
    ).toEqual(["Kim Minji"]);
  });

  it("decodes entities", () => {
    expect(readSharedStrings("<sst><si><t>a&amp;b</t></si></sst>")).toEqual([
      "a&b",
    ]);
  });
});

describe("readSheet", () => {
  it("resolves a shared-string cell", () => {
    expect(
      readSheet(sheet('<row><c r="A1" t="s"><v>0</v></c></row>'), ["email"]),
    ).toEqual([["email"]]);
  });

  it("keeps a sparse row in its columns", () => {
    // The whole reason column addresses are read: without this, a blank
    // display_name would shift send_invitation into the name column and the
    // import would create people called "true".
    expect(
      readSheet(
        sheet(
          '<row><c r="A2" t="inlineStr"><is><t>a@x.com</t></is></c>' +
            '<c r="D2" t="inlineStr"><is><t>false</t></is></c></row>',
        ),
        [],
      ),
    ).toEqual([["a@x.com", "", "", "false"]]);
  });

  it("takes a formula cell's cached value and never its formula", () => {
    const rows = readSheet(
      sheet('<row><c r="A1"><f>SUM(B1:B9)</f><v>42</v></c></row>'),
      [],
    );
    expect(rows).toEqual([["42"]]);
    expect(JSON.stringify(rows)).not.toContain("SUM");
  });

  it("reads a formula with no cached value as empty", () => {
    expect(
      readSheet(sheet('<row><c r="A1"><f>WEBSERVICE("http://x")</f></c></row>'), []),
    ).toEqual([[""]]);
  });

  it("spells a boolean the way the row rules expect", () => {
    expect(
      readSheet(sheet('<row><c r="A1" t="b"><v>0</v></c></row>'), []),
    ).toEqual([["false"]]);
  });

  it("reads a self-closing empty cell without losing the column", () => {
    expect(
      readSheet(
        sheet('<row><c r="A1"/><c r="B1" t="inlineStr"><is><t>x</t></is></c></row>'),
        [],
      ),
    ).toEqual([["", "x"]]);
  });

  it("treats an out-of-range string index as empty rather than crashing", () => {
    expect(
      readSheet(sheet('<row><c r="A1" t="s"><v>99</v></c></row>'), ["only"]),
    ).toEqual([[""]]);
  });
});

describe("readWorkbook", () => {
  it("reads a real xlsx container", () => {
    const bytes = xlsx({
      sheet: sheet(
        '<row><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
          '<row><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>',
      ),
      sharedStrings:
        "<sst><si><t>email</t></si><si><t>role</t></si>" +
        "<si><t>a@x.com</t></si><si><t>STUDENT</t></si></sst>",
    });
    expect(readWorkbook({ bytes, filename: "members.xlsx" })).toEqual({
      rows: [
        ["email", "role"],
        ["a@x.com", "STUDENT"],
      ],
    });
  });

  it("decides the format from the bytes, not the filename", () => {
    // A `.csv` that is really a zip is the oldest trick there is.
    const bytes = xlsx({
      sheet: sheet('<row><c r="A1" t="inlineStr"><is><t>email</t></is></c></row>'),
    });
    expect(readWorkbook({ bytes, filename: "members.csv" }).rows).toEqual([
      ["email"],
    ]);
  });

  it("never extracts a macro project", () => {
    const bytes = xlsx({
      sheet: sheet('<row><c r="A1" t="inlineStr"><is><t>email</t></is></c></row>'),
      extra: { "xl/vbaProject.bin": "MZ-not-really" },
    });
    // It reads, and the macro part is simply never opened.
    expect(readWorkbook({ bytes, filename: "m.xlsm" }).rows).toEqual([
      ["email"],
    ]);
  });

  it("drops the trailing empty rows Excel leaves behind", () => {
    expect(
      readWorkbook({ bytes: Buffer.from("a\nb\n\n\n"), filename: "x.csv" })
        .rows,
    ).toEqual([["a"], ["b"]]);
  });

  it("refuses an empty upload", () => {
    expect(() =>
      readWorkbook({ bytes: Buffer.alloc(0), filename: "x.csv" }),
    ).toThrow(new WorkbookError("file_empty"));
  });

  it("refuses a file past the size cap before parsing it", () => {
    expect(() =>
      readWorkbook({
        bytes: Buffer.alloc(5 * 1024 * 1024 + 1),
        filename: "x.csv",
      }),
    ).toThrow(new WorkbookError("file_too_large"));
  });

  it("refuses more data rows than one import may carry", () => {
    const rows = ["email", ...Array.from({ length: 501 }, (_, i) => `a${i}@x.com`)];
    expect(() =>
      readWorkbook({ bytes: Buffer.from(rows.join("\n")), filename: "x.csv" }),
    ).toThrow(new WorkbookError("too_many_rows"));
  });

  it("accepts exactly the cap", () => {
    const rows = ["email", ...Array.from({ length: 500 }, (_, i) => `a${i}@x.com`)];
    expect(
      readWorkbook({ bytes: Buffer.from(rows.join("\n")), filename: "x.csv" })
        .rows,
    ).toHaveLength(501);
  });

  it("refuses a zip with no worksheet in it", () => {
    const bytes = Buffer.from(zipSync({ "docProps/app.xml": strToU8("<x/>") }));
    expect(() => readWorkbook({ bytes, filename: "x.xlsx" })).toThrow(
      new WorkbookError("unsupported_format"),
    );
  });

  it("refuses a workbook with more sheets than a member list has", () => {
    const files: Record<string, string> = {};
    for (let index = 1; index <= 9; index += 1) {
      files[`xl/worksheets/sheet${index}.xml`] = sheet(
        '<row><c r="A1" t="inlineStr"><is><t>email</t></is></c></row>',
      );
    }
    const bytes = Buffer.from(
      zipSync(
        Object.fromEntries(
          Object.entries({ "xl/workbook.xml": "<workbook/>", ...files }).map(
            ([name, body]) => [name, strToU8(body)],
          ),
        ),
      ),
    );
    expect(() => readWorkbook({ bytes, filename: "x.xlsx" })).toThrow(
      new WorkbookError("too_many_sheets"),
    );
  });

  it("refuses a workbook with no header row at all", () => {
    const bytes = xlsx({ sheet: sheet("") });
    expect(() => readWorkbook({ bytes, filename: "x.xlsx" })).toThrow(
      new WorkbookError("missing_header"),
    );
  });
});

describe("decodeXmlText", () => {
  it("decodes the five predefined entities", () => {
    expect(decodeXmlText("&lt;a&gt; &quot;b&quot; &apos;c&apos; &amp;")).toBe(
      "<a> \"b\" 'c' &",
    );
  });

  it("decodes ampersand last, so a double escape survives", () => {
    expect(decodeXmlText("&amp;lt;")).toBe("&lt;");
  });

  it("decodes numeric references", () => {
    expect(decodeXmlText("&#x54;&#101;a")).toBe("Tea");
  });

  it("expands no custom entity, so a billion laughs is inert", () => {
    // No entity table is ever consulted, so this is just text.
    expect(decodeXmlText("&lol9;")).toBe("&lol9;");
  });

  it("drops a reference outside Unicode rather than throwing", () => {
    expect(decodeXmlText("&#x110000;")).toBe("");
    expect(decodeXmlText("&#xD800;")).toBe("");
  });
});
