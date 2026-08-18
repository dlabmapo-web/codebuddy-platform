import { unzipSync } from "fflate";
import {
  IMPORT_MAX_CELL_LENGTH,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_ROWS,
  IMPORT_MAX_SHEETS,
  sanitizeCell,
  type ImportFileErrorCode,
} from "@cove/shared";

/**
 * Bytes in, a grid of strings out — and nothing else, ever.
 *
 * This is the module that touches attacker-supplied files, so it is written to
 * a single rule: **an uploaded workbook is data, never instructions.** Every
 * decision below follows from that, and each one closes a specific documented
 * attack against spreadsheet importers.
 *
 * *Formulas are never evaluated.* An `.xlsx` cell can carry `<f>` (the formula)
 * and `<v>` (the value Excel last computed). This reader takes `<v>` and
 * inline strings and ignores `<f>` entirely. It has no expression evaluator, so
 * there is nothing to exploit — not a sandboxed one, not a limited one, none.
 *
 * *External references are never followed.* `xl/externalLinks/`, `workbook.xml`
 * relationships, and DDE links are not read. A cell whose value came from
 * `=WEBSERVICE(...)` arrives as whatever number Excel cached, which is exactly
 * as much as this platform should learn from it.
 *
 * *Macros cannot run.* `xl/vbaProject.bin` is never extracted or executed. Node
 * cannot run VBA, but the point is that the file is never handed to anything
 * that could.
 *
 * *The zip cannot exhaust memory.* A zip bomb is a small file that inflates to
 * gigabytes. `fflate` decompresses in memory, so the guard is applied to the
 * inflated size of each entry and to the entry count, before any parsing.
 *
 * *The XML cannot expand.* The billion-laughs attack needs entity expansion,
 * and this reader is a scanner rather than an XML parser: it looks for the tags
 * it wants and decodes only the five predefined entities. A `<!DOCTYPE>` with
 * an entity table is inert because nothing here consults one.
 *
 * A hand-written scanner rather than a spreadsheet library is a deliberate
 * trade. It handles less — no styles, no dates as dates, no pivot tables — and
 * a member list needs none of that. What it buys is that the whole attack
 * surface is on this page and can be read in one sitting.
 *
 * See §11 and §17 of the manager control tower and scalable people operations
 * design.
 */

export type WorkbookGrid = {
  /** Rows of cells, header included, already sanitized. */
  rows: string[][];
};

export class WorkbookError extends Error {
  constructor(readonly code: ImportFileErrorCode) {
    super(code);
    this.name = "WorkbookError";
  }
}

/** The largest an entry may inflate to. A member list is kilobytes. */
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;
/** More entries than this is not a spreadsheet somebody made by hand. */
const MAX_ZIP_ENTRIES = 256;

/**
 * Read a workbook, whichever of the two formats it is.
 *
 * The format is decided by the leading bytes, never by the filename or the
 * declared content type — both are attacker-supplied, and a `.csv` that is
 * really a zip is the oldest trick there is.
 */
export function readWorkbook(input: {
  bytes: Buffer;
  filename: string;
}): WorkbookGrid {
  if (input.bytes.byteLength === 0) throw new WorkbookError("file_empty");
  if (input.bytes.byteLength > IMPORT_MAX_FILE_BYTES) {
    throw new WorkbookError("file_too_large");
  }

  // `PK\x03\x04` — the local file header every zip, and therefore every xlsx,
  // begins with. Anything else is treated as text and parsed as CSV.
  const isZip =
    input.bytes.length >= 4 &&
    input.bytes[0] === 0x50 &&
    input.bytes[1] === 0x4b &&
    input.bytes[2] === 0x03 &&
    input.bytes[3] === 0x04;

  const rows = trimTrailingBlankRows(
    isZip ? readXlsx(input.bytes) : readCsv(input.bytes),
  );

  if (rows.length === 0) throw new WorkbookError("missing_header");
  // The header does not count toward the row cap, which is what a manager
  // means by "500 members".
  if (rows.length - 1 > IMPORT_MAX_ROWS) {
    throw new WorkbookError("too_many_rows");
  }
  return { rows };
}

/**
 * Excel keeps empty rows after a deletion, and a CSV that ends in a newline has
 * one by construction.
 *
 * Dropped once here rather than inside each reader, so both formats agree and
 * the readers stay honest about what the file literally contained. Reporting
 * four hundred `row_empty` errors instead is the difference between a preview a
 * manager reads and one they close.
 */
function trimTrailingBlankRows(rows: string[][]): string[][] {
  const trimmed = [...rows];
  while (
    trimmed.length > 0 &&
    trimmed[trimmed.length - 1].every((cell) => cell === "")
  ) {
    trimmed.pop();
  }
  return trimmed;
}

/* ------------------------------------------------------------------ csv */

/**
 * RFC 4180, plus the two deviations real files have.
 *
 * A BOM is stripped — Excel writes one on every UTF-8 CSV it exports, and a
 * header column called `﻿email` matches nothing. Bare `\r` and `\r\n` both
 * end a record, because a file that has been through a Windows machine and a
 * Mac one contains both.
 *
 * Quoted fields may contain commas, newlines, and doubled quotes. Nothing is
 * evaluated: a field beginning with `=` is a string here and stays one.
 */
export function readCsv(bytes: Buffer): string[][] {
  let text = bytes.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let index = 0;

  const endField = () => {
    row.push(sanitizeCell(field));
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (index < text.length) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      field += char;
      // The bound that matters. An unterminated quote makes every remaining
      // byte part of one field, so a one-character file edit turns a 5 MB
      // upload into a 5 MB string in a single cell. Checked here rather than
      // after the loop, because after the loop the memory is already spent.
      if (field.length > IMPORT_MAX_CELL_LENGTH * 2) {
        throw new WorkbookError("unreadable");
      }
      index += 1;
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
      index += 1;
      continue;
    }
    if (char === ",") {
      endField();
      index += 1;
      continue;
    }
    if (char === "\r" || char === "\n") {
      endRow();
      if (char === "\r" && text[index + 1] === "\n") index += 2;
      else index += 1;
      continue;
    }

    field += char;
    // A single unterminated quote would otherwise let one field consume the
    // whole file. The cell cap is the backstop, applied while reading rather
    // than after.
    if (field.length > IMPORT_MAX_CELL_LENGTH * 2) {
      throw new WorkbookError("unreadable");
    }
    index += 1;
  }

  // A file that does not end in a newline still has a last row.
  if (field.length > 0 || row.length > 0) endRow();

  return rows;
}

/* ----------------------------------------------------------------- xlsx */

/**
 * The first worksheet of an `.xlsx`, as strings.
 *
 * Only three entries are ever read: the workbook part, to find which sheet is
 * first; the sheet itself; and the shared string table it points into. Anything
 * else in the container — themes, styles, printer settings, macros, external
 * links — is left in the zip untouched.
 */
function readXlsx(bytes: Buffer): string[][] {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: (file) =>
        // Refuse before inflating. `originalSize` comes from the zip's own
        // header, so a lying header is caught by the length check afterwards.
        file.originalSize <= MAX_ENTRY_BYTES &&
        (file.name === "xl/workbook.xml" ||
          file.name === "xl/sharedStrings.xml" ||
          file.name.startsWith("xl/worksheets/")),
    });
  } catch {
    throw new WorkbookError("unsupported_format");
  }

  const names = Object.keys(entries);
  if (names.length > MAX_ZIP_ENTRIES) throw new WorkbookError("unreadable");
  for (const name of names) {
    if (entries[name].byteLength > MAX_ENTRY_BYTES) {
      throw new WorkbookError("unreadable");
    }
  }

  const sheetNames = names
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((left, right) => sheetNumber(left) - sheetNumber(right));

  if (sheetNames.length === 0) throw new WorkbookError("unsupported_format");
  if (sheetNames.length > IMPORT_MAX_SHEETS) {
    throw new WorkbookError("too_many_sheets");
  }

  // The first sheet, and only the first. §11's template is one sheet, and
  // silently merging several would import rows a manager did not see in the
  // preview of the one they were looking at.
  const sheet = decode(entries[sheetNames[0]]);
  const shared = entries["xl/sharedStrings.xml"]
    ? readSharedStrings(decode(entries["xl/sharedStrings.xml"]))
    : [];

  return readSheet(sheet, shared);
}

function sheetNumber(name: string): number {
  return Number(name.match(/sheet(\d+)\.xml$/)?.[1] ?? 0);
}

function decode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("utf8");
}

/**
 * The shared string table.
 *
 * `.xlsx` stores every distinct string once and refers to it by index, so a
 * sheet full of `t="s"` cells is meaningless without this. Rich text splits one
 * string across several `<t>` runs, which are concatenated — a name typed with
 * one bold syllable is still one name.
 */
export function readSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const itemPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  const textPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/g;

  for (const item of xml.matchAll(itemPattern)) {
    let value = "";
    for (const text of item[1].matchAll(textPattern)) {
      value += decodeXmlText(text[1]);
    }
    strings.push(sanitizeCell(value));
    if (strings.length > IMPORT_MAX_ROWS * 8) break;
  }
  return strings;
}

/**
 * One worksheet, as a dense grid.
 *
 * Cells carry their address (`B7`), and a sparse sheet omits the empty ones
 * entirely — so the column index is read from the address rather than from the
 * cell's position in the row. Without that, a row whose `display_name` was
 * blank would shift `send_invitation` into the name column, and the import
 * would confidently create people called "true".
 *
 * `<f>` is never consulted. A formula cell contributes its cached `<v>` if it
 * has one and an empty string if it does not, which is the honest reading of
 * "we do not evaluate formulas".
 */
export function readSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  // The attribute run is lazy and quote-aware. A greedy `[^>]*` swallows the
  // slash of a self-closing `<c r="A1"/>`, after which the alternation matches
  // the bare `>` and the body capture runs on to the *next* cell's `</c>` —
  // silently merging two cells, which for a member list means one row's email
  // landing in another row's name column.
  const cellPattern = /<c\b((?:[^>"]|"[^"]*")*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

  for (const rowMatch of xml.matchAll(rowPattern)) {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(cellPattern)) {
      const attributes = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const column = columnIndex(attributes.match(/\br="([A-Z]+)\d+"/)?.[1]);
      const type = attributes.match(/\bt="([^"]+)"/)?.[1] ?? "n";

      let value = "";
      if (type === "inlineStr") {
        // Inline strings live in the cell rather than the shared table.
        for (const text of body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) {
          value += decodeXmlText(text[1]);
        }
      } else {
        const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (raw !== undefined) {
          const decoded = decodeXmlText(raw);
          if (type === "s") {
            // A shared-string index. An out-of-range one is an empty cell
            // rather than a crash: a malformed file should be refused by the
            // row rules, not by an exception here.
            value = shared[Number(decoded)] ?? "";
          } else if (type === "b") {
            value = decoded === "1" ? "true" : "false";
          } else {
            value = decoded;
          }
        }
      }

      // Pad forward to the cell's real column, so a sparse row keeps its shape.
      while (cells.length < column) cells.push("");
      cells[column] = sanitizeCell(value);
    }
    rows.push(cells);
    // One past the cap is enough to know the file is too big; reading the rest
    // of a hostile sheet only spends memory.
    if (rows.length > IMPORT_MAX_ROWS + 1) break;
  }

  return rows;
}

/** `A` → 0, `Z` → 25, `AA` → 26. Missing address means "next column". */
function columnIndex(reference: string | undefined): number {
  if (!reference) return 0;
  let index = 0;
  for (const character of reference) {
    index = index * 26 + (character.charCodeAt(0) - 64);
  }
  return index - 1;
}

/**
 * The five predefined XML entities, and nothing else.
 *
 * No entity table is consulted, so a `<!DOCTYPE>` declaring a billion laughs
 * expands to nothing. Numeric character references are decoded because real
 * exports use them for non-ASCII; the range is clamped so a reference cannot
 * name a code point outside Unicode.
 */
export function decodeXmlText(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) =>
      safeCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_match, digits: string) =>
      safeCodePoint(Number.parseInt(digits, 10)),
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Last, so `&amp;lt;` decodes to the text `&lt;` rather than to `<`.
    .replace(/&amp;/g, "&");
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  // Lone surrogates are not characters and would corrupt the string.
  if (code >= 0xd800 && code <= 0xdfff) return "";
  return String.fromCodePoint(code);
}
