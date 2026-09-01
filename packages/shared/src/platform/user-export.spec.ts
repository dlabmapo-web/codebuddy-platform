import { describe, expect, it } from "vitest";

import {
  buildUserExportSheet,
  toUserExportRows,
  userExportCopy,
  userExportFilename,
} from "./user-export.js";

function account(overrides: Partial<Parameters<typeof toUserExportRows>[0]> = {}) {
  return {
    displayName: "Kim Minji",
    username: "minji",
    email: "minji@example.com",
    status: "ACTIVE" as const,
    platformRole: "USER" as const,
    createdAt: "2026-08-29T01:00:00.000Z",
    memberships: [],
    ...overrides,
  };
}

function membership(overrides: Record<string, unknown> = {}) {
  return {
    academyName: "Mapo Dlab",
    academySlug: "dlab-mapo",
    role: "STUDENT" as const,
    status: "ACTIVE" as const,
    joinedAt: "2026-03-04T00:00:00.000Z",
    ...overrides,
  };
}

describe("toUserExportRows", () => {
  it("gives an account one row per membership", () => {
    // The whole point of the file's shape: one academy and one role per row is
    // what makes Excel's own filters and pivot tables work.
    const rows = toUserExportRows(
      account({
        memberships: [
          membership(),
          membership({
            academyName: "Gangnam",
            academySlug: "gangnam",
            role: "TEAM_LEAD",
          }),
        ],
      }),
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.academySlug)).toEqual(["gangnam", "dlab-mapo"]);
    // The account columns repeat, unchanged, on every one of its rows.
    expect(new Set(rows.map((row) => row.email))).toEqual(
      new Set(["minji@example.com"]),
    );
  });

  it("keeps an account that belongs to no academy", () => {
    // Dropping them would make the file disagree with the total the operator
    // just read, and it is a set they go looking for on purpose.
    const rows = toUserExportRows(account());

    expect(rows).toHaveLength(1);
    expect(rows[0]!.academyName).toBeNull();
    expect(rows[0]!.role).toBeNull();
    expect(rows[0]!.email).toBe("minji@example.com");
  });

  it("names an account the way the console does", () => {
    expect(toUserExportRows(account({ displayName: "  " }))[0]!.name).toBe(
      "minji",
    );
    expect(
      toUserExportRows(account({ displayName: null, username: null }))[0]!.name,
    ).toBe("minji@example.com");
  });
});

describe("buildUserExportSheet", () => {
  const rows = toUserExportRows(account({ memberships: [membership()] }));

  it("writes a header row in the asked-for language", () => {
    expect(buildUserExportSheet(rows, "en", "UTC")[0]).toEqual(
      userExportCopy.en.headers,
    );
    expect(buildUserExportSheet(rows, "ko", "UTC")[0]).toEqual(
      userExportCopy.ko.headers,
    );
  });

  it("gives every row a cell for every header", () => {
    const sheet = buildUserExportSheet(rows, "en", "UTC");
    for (const row of sheet) {
      expect(row).toHaveLength(userExportCopy.en.headers.length);
    }
  });

  it("spells enums in the reader's language, not the database's", () => {
    const sheet = buildUserExportSheet(rows, "ko", "UTC");
    expect(sheet[1]).toContain("학생");
    expect(sheet[1]).not.toContain("STUDENT");
  });

  it("dates in the reader's own zone, so the file agrees with the page", () => {
    // 01:00 UTC on the 29th is already the 29th in Seoul (10:00) and still the
    // 28th in Los Angeles (18:00).
    const seoul = buildUserExportSheet(rows, "en", "Asia/Seoul")[1]!;
    const la = buildUserExportSheet(rows, "en", "America/Los_Angeles")[1]!;

    expect(seoul[5]).toBe("2026-08-29");
    expect(la[5]).toBe("2026-08-28");
  });

  it("falls back to UTC rather than failing over a bad zone", () => {
    // The zone arrives in a query parameter. A download must not fail over one.
    expect(buildUserExportSheet(rows, "en", "Mars/Olympus")[1]![5]).toBe(
      "2026-08-29",
    );
  });

  it("leaves a missing date empty rather than printing Invalid Date", () => {
    const invited = toUserExportRows(
      account({ memberships: [membership({ joinedAt: null, status: "INVITED" })] }),
    );
    expect(buildUserExportSheet(invited, "en", "UTC")[1]![10]).toBe("");
  });

  it("marks an operator and leaves everyone else's cell empty", () => {
    const operator = toUserExportRows(
      account({ platformRole: "ADMIN", memberships: [membership()] }),
    );
    expect(buildUserExportSheet(operator, "en", "UTC")[1]![4]).toBe("Operator");
    expect(buildUserExportSheet(rows, "en", "UTC")[1]![4]).toBe("");
  });

  it("carries a formula-looking name through as text", () => {
    // Not a property of this function — the writer emits inline strings, so
    // Excel never evaluates it. Asserted here because the day somebody
    // "helpfully" adds a numeric cell type, this is the test that should fail.
    const attacker = toUserExportRows(
      account({ displayName: '=IMPORTXML("http://x","//a")' }),
    );
    expect(buildUserExportSheet(attacker, "en", "UTC")[1]![0]).toBe(
      '=IMPORTXML("http://x","//a")',
    );
  });
});

describe("userExportFilename", () => {
  const today = new Date("2026-09-01T12:00:00.000Z");

  it("names the whole directory and the count of accounts in it", () => {
    expect(userExportFilename({ accounts: 49, today })).toBe(
      "cove-users-2026-09-01-49-accounts.xlsx",
    );
  });

  it("names the role when one was picked", () => {
    expect(userExportFilename({ accounts: 34, role: "STUDENT", today })).toBe(
      "cove-students-2026-09-01-34-accounts.xlsx",
    );
    expect(userExportFilename({ accounts: 3, role: "TEAM_LEAD", today })).toBe(
      "cove-team-leads-2026-09-01-3-accounts.xlsx",
    );
  });

  it("is assembled only from parts a header can carry", () => {
    // Nothing a person typed reaches the filename, so `Content-Disposition`
    // can never need escaping.
    expect(
      userExportFilename({ accounts: 1, role: "MANAGER", today }),
    ).toMatch(/^[a-z0-9.-]+$/);
  });
});
