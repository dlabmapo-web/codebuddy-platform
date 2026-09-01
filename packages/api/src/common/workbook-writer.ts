import { zipSync } from "fflate";

/**
 * Anything with named sheets of string rows.
 *
 * Structural rather than one feature's type, so the course importer's
 * `GeneratedWorkbook` and the user directory's export both satisfy it without
 * either knowing about the other. Widening this is how the codebase keeps the
 * promise the paragraph below makes — one writer, not one per caller.
 */
export type WorkbookData = {
  sheets: readonly { name: string; rows: readonly (readonly string[])[] }[];
};

/**
 * A `.xlsx` written by hand, because the alternative is worse.
 *
 * A spreadsheet library would do this in four lines and bring a second
 * full-featured XLSX implementation into the process — one that also *reads*,
 * and whose reader would then be one import statement away from becoming the
 * path an uploaded file takes. §7.2 is explicit that the hardened reader is the
 * only thing that parses a workbook, and the cheapest way to keep that true is
 * for the writer to be unable to read.
 *
 * The format written here is the minimum Excel, Numbers, LibreOffice, and
 * Google Sheets all open: a content-type map, a package relationship, a
 * workbook listing the sheets, its relationships, and one part per sheet.
 * Nothing else — no styles, no themes, no calculation chain, no shared string
 * table.
 *
 * Every cell is an inline string. It costs a few bytes per repeated value and
 * removes an entire class of bug: with a shared table, a cell is an *index*,
 * and an off-by-one in the table puts one problem's expected output in another
 * problem's row. It also means a numeric-looking key like `2024` comes back as
 * the text `2024` rather than as a float that Excel renders as `2024` and the
 * reader sees as `2024.0`.
 *
 * See §4.3 and §7.2 of the team lead Excel problem import design, and §4 of
 * the console user directory export design for why this lives in `common/`
 * rather than beside the importer that first needed it.
 */

export function writeWorkbook(workbook: WorkbookData): Buffer {
  const sheets = workbook.sheets;

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": encode(contentTypes(sheets.length)),
    "_rels/.rels": encode(packageRelationships()),
    "xl/workbook.xml": encode(workbookPart(sheets.map((sheet) => sheet.name))),
    "xl/_rels/workbook.xml.rels": encode(workbookRelationships(sheets.length)),
  };

  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = encode(
      worksheetPart(sheet.rows),
    );
  });

  // Deflate at a middling level. A generated workbook is mostly repeated column
  // names and Python source, which compresses well, and the download is
  // produced synchronously inside a request.
  return Buffer.from(zipSync(files, { level: 6 }));
}

function encode(xml: string): Uint8Array {
  return new Uint8Array(Buffer.from(xml, "utf8"));
}

/* ----------------------------------------------------------------- parts */

function contentTypes(sheetCount: number): string {
  const overrides = Array.from({ length: sheetCount }, (_value, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`;
}

function packageRelationships(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

/**
 * The sheet list, in tab order.
 *
 * `sheetId` and `r:id` are both written and both matter to the reader: it
 * resolves the relationship rather than trusting that `sheet2.xml` is the
 * second tab. Keeping them aligned here is convenient rather than load-bearing,
 * which is the point — a file where they disagree still reads correctly.
 */
function workbookPart(names: readonly string[]): string {
  const sheets = names
    .map(
      (name, index) =>
        `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`;
}

function workbookRelationships(sheetCount: number): string {
  const relationships = Array.from({ length: sheetCount }, (_value, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`;
}

/**
 * One sheet's rows.
 *
 * Every cell carries its own address. A sparse row would otherwise be
 * ambiguous, and the reader on the other side deliberately trusts the address
 * over the position — writing them makes the two halves agree about what an
 * empty cell means.
 */
function worksheetPart(rows: readonly (readonly string[])[]): string {
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) =>
          value.length === 0
            ? ""
            : `<c r="${columnName(columnIndex)}${rowIndex + 1}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`,
        )
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

/** 0 -> `A`, 25 -> `Z`, 26 -> `AA`. */
function columnName(index: number): string {
  let name = "";
  let remaining = index;
  while (remaining >= 0) {
    name = String.fromCharCode((remaining % 26) + 65) + name;
    remaining = Math.floor(remaining / 26) - 1;
  }
  return name;
}

/**
 * XML text, plus the characters XML has no way to carry.
 *
 * Code points below space other than tab and newline are illegal in XML 1.0 at
 * any escaping level, so a workbook containing one cannot be opened at all.
 * They are stripped rather than escaped, which is safe here because the values
 * being written already went through the importer's own normalization on the
 * way in — nothing that survives to this point should contain one.
 */
function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
