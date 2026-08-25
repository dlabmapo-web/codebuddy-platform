import { unzipSync } from "fflate";
import {
  CONTENT_IMPORT_MAX_EXPANDED_BYTES,
  CONTENT_IMPORT_MAX_SHEETS,
  CONTENT_IMPORT_MAX_TOTAL_CELL_CHARS,
  CONTENT_IMPORT_MAX_TOTAL_ROWS,
  CONTENT_IMPORT_MAX_UPLOAD_BYTES,
  contentImportSheets,
  normalizeCellText,
  readTemplateVersion,
  type ContentImportSheet,
} from "@cove/shared";

import { decodeXmlText, readSharedStrings } from "../../manage/workbook-reader.js";

/**
 * Bytes in, named sheets out — and nothing else, ever.
 *
 * The member importer's reader already establishes the rules this file obeys,
 * and §7.2 says to extend it rather than introduce a second parser: formulas
 * are never evaluated, external references are never followed, macros are never
 * extracted, the zip cannot exhaust memory, and the XML cannot expand. Its
 * shared-string and entity decoding are imported directly rather than copied,
 * because two hand-written XML scanners in one codebase is one more attack
 * surface than the platform needs.
 *
 * What this reader adds is *names*. The member workbook is one sheet and takes
 * the first one; this workbook is five sheets whose identity is their name, and
 * `xl/worksheets/sheet3.xml` is not necessarily the third tab a person sees.
 * The mapping lives in `xl/workbook.xml`, which lists sheets in tab order with
 * a relationship id, and `xl/_rels/workbook.xml.rels`, which turns that id into
 * a path. Reading the numbered files in numeric order and hoping they line up
 * is the bug that imports the Hints sheet as Problems.
 *
 * Two rejections are new and deliberate. §5.7 refuses a real formula cell in a
 * data sheet rather than taking its cached value — the member importer accepts
 * the cached `<v>` because a member list is names, and here a cached value is a
 * grading definition somebody would be trusting Excel to have computed
 * correctly. And §10 caps aggregate decoded characters, because sheet and row
 * counts alone do not bound memory when one cell may hold a hundred thousand
 * characters of source code.
 *
 * See §7.2 and §10 of the team lead Excel problem import design.
 */

export type ContentWorkbookSheets = {
  /** Present sheets by canonical name; absent ones are simply missing. */
  sheets: Map<ContentImportSheet, string[][]>;
  /** Sheet names the workbook carried that the importer ignores. */
  unknownSheets: string[];
  templateVersion: number | null;
};

export type ContentWorkbookRejection =
  | "file_empty"
  | "file_too_large"
  | "unsupported_format"
  | "expanded_too_large"
  | "too_many_sheets"
  | "too_many_rows"
  | "too_much_content"
  | "formula_cell"
  | "unreadable";

export class ContentWorkbookError extends Error {
  constructor(readonly reason: ContentWorkbookRejection) {
    super(reason);
    this.name = "ContentWorkbookError";
  }
}

/** No single part of a workbook this size is legitimate. */
const MAX_ENTRY_BYTES = 16 * 1024 * 1024;
/** More zip entries than a spreadsheet application produces. */
const MAX_ZIP_ENTRIES = 512;

/**
 * The workbook, as named grids.
 *
 * The format is decided by the leading bytes. §5.1 accepts only `.xlsx`, and a
 * filename is attacker-supplied — a `.xlsx` that is really a CSV is refused
 * here rather than parsed as one, because CSV cannot express the multi-sheet
 * relationships this format is built on and accepting it would mean silently
 * importing a file that could not say what the author meant.
 */
export function readContentWorkbook(bytes: Buffer): ContentWorkbookSheets {
  if (bytes.byteLength === 0) throw new ContentWorkbookError("file_empty");
  if (bytes.byteLength > CONTENT_IMPORT_MAX_UPLOAD_BYTES) {
    throw new ContentWorkbookError("file_too_large");
  }
  // `PK\x03\x04`. Legacy `.xls` begins with an OLE2 signature and lands here as
  // "not a zip", which is the right answer: §2 rules it out rather than adding
  // a second parser for a format nobody should still be exporting.
  if (
    bytes.length < 4 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    bytes[2] !== 0x03 ||
    bytes[3] !== 0x04
  ) {
    throw new ContentWorkbookError("unsupported_format");
  }

  const entries = expand(bytes);
  const parts = locateSheets(entries);

  const shared = entries["xl/sharedStrings.xml"]
    ? readSharedStrings(decode(entries["xl/sharedStrings.xml"]))
    : [];

  const sheets = new Map<ContentImportSheet, string[][]>();
  const unknownSheets: string[] = [];
  const budget = { rows: 0, characters: 0 };

  let instructionRows: string[][] = [];

  for (const part of parts) {
    const canonical = contentImportSheets.find((name) => name === part.name);
    if (!canonical) {
      unknownSheets.push(part.name);
      continue;
    }
    const entry = entries[part.path];
    if (!entry) continue;

    const grid = readNamedSheet(decode(entry), shared, budget, canonical);
    if (canonical === "Instructions") instructionRows = grid;
    else sheets.set(canonical, grid);
  }

  return {
    sheets,
    unknownSheets,
    templateVersion: readTemplateVersion(instructionRows),
  };
}

/* ------------------------------------------------------------------- zip */

/**
 * The zip, expanded with every bound applied before parsing starts.
 *
 * The filter refuses entries by declared size *and* by name. Only the five
 * kinds of part this reader consults are extracted: nothing else in the
 * container — themes, styles, printer settings, drawings, comments, pivot
 * caches, `vbaProject.bin`, `externalLinks/` — is inflated at all, so a macro
 * or an external reference is not "ignored", it is never in memory.
 *
 * A path containing `..` is dropped rather than sanitized. Nothing here writes
 * to a filesystem, so traversal is not exploitable today — but the entry names
 * are attacker-supplied, and a reader that quietly normalizes them is one
 * refactor away from being the place a path escapes.
 */
function expand(bytes: Buffer): Record<string, Uint8Array> {
  let entries: Record<string, Uint8Array>;
  let declared = 0;

  try {
    entries = unzipSync(bytes, {
      filter: (file) => {
        if (file.name.includes("..")) return false;
        if (file.originalSize > MAX_ENTRY_BYTES) return false;
        if (!isWantedPart(file.name)) return false;
        declared += file.originalSize;
        // §10 — the inflated cap, checked against the zip's own headers before
        // a single byte is decompressed. A lying header is caught below by
        // measuring what actually arrived.
        return declared <= CONTENT_IMPORT_MAX_EXPANDED_BYTES;
      },
    });
  } catch {
    throw new ContentWorkbookError("unsupported_format");
  }

  const names = Object.keys(entries);
  if (names.length === 0) throw new ContentWorkbookError("unsupported_format");
  if (names.length > MAX_ZIP_ENTRIES) {
    throw new ContentWorkbookError("unreadable");
  }

  let actual = 0;
  for (const name of names) {
    actual += entries[name].byteLength;
    if (actual > CONTENT_IMPORT_MAX_EXPANDED_BYTES) {
      throw new ContentWorkbookError("expanded_too_large");
    }
  }

  return entries;
}

function isWantedPart(name: string): boolean {
  return (
    name === "xl/workbook.xml" ||
    name === "xl/_rels/workbook.xml.rels" ||
    name === "xl/sharedStrings.xml" ||
    name.startsWith("xl/worksheets/")
  );
}

function decode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("utf8");
}

/* ---------------------------------------------------------------- naming */

type SheetPart = { name: string; path: string };

/**
 * Each sheet's visible name, paired with the part that holds it.
 *
 * `xl/workbook.xml` carries `<sheet name="Problems" sheetId="2" r:id="rId3"/>`,
 * and the relationship file turns `rId3` into `worksheets/sheet2.xml`. Both
 * indirections are real: sheet ids are not tab order, tab order is not file
 * number, and a workbook that has had a tab deleted and another added has all
 * three disagreeing.
 *
 * A workbook whose relationships are missing or unreadable is refused rather
 * than guessed at. Falling back to numeric order would work most of the time,
 * and the times it did not would import a Hints sheet as Problems.
 */
function locateSheets(entries: Record<string, Uint8Array>): SheetPart[] {
  const workbook = entries["xl/workbook.xml"];
  const rels = entries["xl/_rels/workbook.xml.rels"];
  if (!workbook || !rels) throw new ContentWorkbookError("unsupported_format");

  const targets = new Map<string, string>();
  for (const match of decode(rels).matchAll(
    /<Relationship\b([^>]*)\/?>/g,
  )) {
    const attributes = match[1] ?? "";
    const id = attributes.match(/\bId="([^"]+)"/)?.[1];
    const target = attributes.match(/\bTarget="([^"]+)"/)?.[1];
    if (!id || !target) continue;
    targets.set(id, normalizePartPath(target));
  }

  const parts: SheetPart[] = [];
  for (const match of decode(workbook).matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attributes = match[1] ?? "";
    const name = attributes.match(/\bname="([^"]*)"/)?.[1];
    const relationId = attributes.match(/r:id="([^"]+)"/)?.[1];
    if (!name || !relationId) continue;
    const path = targets.get(relationId);
    if (!path) continue;
    parts.push({ name: decodeXmlText(name), path });
  }

  if (parts.length === 0) throw new ContentWorkbookError("unsupported_format");
  // §10 — counted from what the workbook declares rather than from how many the
  // importer recognises, so padding a file with forty decoy tabs is refused
  // rather than silently ignored.
  if (parts.length > CONTENT_IMPORT_MAX_SHEETS) {
    throw new ContentWorkbookError("too_many_sheets");
  }

  return parts;
}

/** Relationship targets are relative to `xl/` and occasionally absolute. */
function normalizePartPath(target: string): string {
  const cleaned = target.replace(/^\/+/, "");
  return cleaned.startsWith("xl/") ? cleaned : `xl/${cleaned}`;
}

/* --------------------------------------------------------------- parsing */

type Budget = { rows: number; characters: number };

/**
 * One worksheet, as a dense grid, with §10's aggregate budget applied.
 *
 * Column indices come from each cell's address rather than from its position in
 * the row, because a sparse sheet omits empty cells entirely. Without that, a
 * problem whose `input_format` was blank would shift `starter_code` into the
 * wrong column, and the import would confidently create problems whose
 * constraints were their output format.
 *
 * `<f>` is not consulted, and its presence in a data sheet is fatal. §5.7 makes
 * that a rejection rather than a fallback to the cached value: an expected
 * output produced by a formula is a grading definition whose correctness
 * depends on a spreadsheet nobody will look at again.
 */
function readNamedSheet(
  xml: string,
  shared: string[],
  budget: Budget,
  sheet: ContentImportSheet,
): string[][] {
  const rows: string[][] = [];
  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  // Lazy, quote-aware attribute run. A greedy `[^>]*` swallows the slash of a
  // self-closing `<c r="A1"/>`, after which the body capture runs to the next
  // cell's `</c>` and silently merges two cells — which here means one
  // problem's expected output landing in another problem's row.
  const cellPattern = /<c\b((?:[^>"]|"[^"]*")*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

  for (const rowMatch of xml.matchAll(rowPattern)) {
    const cells: string[] = [];

    for (const cellMatch of rowMatch[1].matchAll(cellPattern)) {
      const attributes = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const column = columnIndex(attributes.match(/\br="([A-Z]+)\d+"/)?.[1]);
      const type = attributes.match(/\bt="([^"]+)"/)?.[1] ?? "n";

      // Instructions is prose a person wrote and may legitimately contain a
      // formula somebody left behind; the data sheets are the machine
      // interface, and §5.7 refuses one there.
      if (sheet !== "Instructions" && /<f\b/.test(body)) {
        throw new ContentWorkbookError("formula_cell");
      }

      let value = "";
      if (type === "inlineStr") {
        for (const text of body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) {
          value += decodeXmlText(text[1]);
        }
      } else {
        const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (raw !== undefined) {
          const decoded = decodeXmlText(raw);
          if (type === "s") {
            // An out-of-range shared-string index is an empty cell rather than
            // a crash: a malformed file should be refused by the row rules,
            // which name the sheet and the row, not by an exception here.
            value = shared[Number(decoded)] ?? "";
          } else if (type === "b") {
            value = decoded === "1" ? "TRUE" : "FALSE";
          } else {
            value = decoded;
          }
        }
      }

      const normalized = normalizeCellText(value);
      budget.characters += normalized.length;
      if (budget.characters > CONTENT_IMPORT_MAX_TOTAL_CELL_CHARS) {
        throw new ContentWorkbookError("too_much_content");
      }

      while (cells.length < column) cells.push("");
      cells[column] = normalized;
    }

    rows.push(cells);

    // The header does not count toward the cap, and Instructions is prose
    // rather than data — neither is what §10's row budget is protecting.
    if (sheet !== "Instructions" && rows.length > 1) {
      budget.rows += 1;
      if (budget.rows > CONTENT_IMPORT_MAX_TOTAL_ROWS) {
        throw new ContentWorkbookError("too_many_rows");
      }
    }
  }

  return trimTrailingBlankRows(rows);
}

/** `A` -> 0, `Z` -> 25, `AA` -> 26. A missing address means "next column". */
function columnIndex(reference: string | undefined): number {
  if (!reference) return 0;
  let index = 0;
  for (const character of reference) {
    index = index * 26 + (character.charCodeAt(0) - 64);
  }
  return index - 1;
}

/**
 * Excel keeps empty rows after a deletion.
 *
 * Dropped here rather than in the row rules so the preview does not report four
 * hundred blank-row errors for a file that is fine — the difference between a
 * preview a team lead reads and one they close.
 */
function trimTrailingBlankRows(rows: string[][]): string[][] {
  const trimmed = [...rows];
  while (
    trimmed.length > 0 &&
    trimmed[trimmed.length - 1].every((cell) => cell.trim() === "")
  ) {
    trimmed.pop();
  }
  return trimmed;
}
