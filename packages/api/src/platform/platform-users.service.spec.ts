import { describe, expect, it } from "vitest";

import { listPlatformUsersInputSchema } from "@cove/shared";

import { buildUsersWhere } from "./platform-users.service.js";

function where(input: Record<string, unknown> = {}) {
  return buildUsersWhere(listPlatformUsersInputSchema.parse(input));
}

describe("platform users filter", () => {
  it("narrows nothing when no facet is chosen", () => {
    expect(where()).toEqual({});
  });

  it("folds the membership facets into one clause", () => {
    // The property this whole test file exists for. Three separate `some`
    // clauses would match a person who teaches at academy B and is a suspended
    // student at academy A — satisfying every facet and none of them together.
    const result = where({
      academyIds: ["11111111-1111-4111-8111-111111111111"],
      roles: ["TEACHER"],
      membershipStatuses: ["ACTIVE"],
    });

    expect(result.AND).toEqual([
      {
        memberships: {
          some: {
            academyId: { in: ["11111111-1111-4111-8111-111111111111"] },
            role: { in: ["TEACHER"] },
            status: { in: ["ACTIVE"] },
          },
        },
      },
    ]);
  });

  it("treats an empty facet list as no filter at all", () => {
    // What a cleared filter chip sends. Reading it as "narrow to nothing"
    // would answer a cleared filter with an empty table.
    expect(where({ roles: [], academyIds: [], accountStatuses: [] })).toEqual(
      {},
    );
  });

  it("asks for accounts in no academy, ignoring membership facets", () => {
    const result = where({
      unaffiliatedOnly: true,
      roles: ["STUDENT"],
      academyIds: ["11111111-1111-4111-8111-111111111111"],
    });

    expect(result.AND).toEqual([{ memberships: { none: {} } }]);
  });

  it("keeps account facets separate from membership ones", () => {
    const result = where({
      accountStatuses: ["SUSPENDED"],
      platformRoles: ["ADMIN"],
      roles: ["MANAGER"],
    });

    expect(result.AND).toEqual([
      { status: { in: ["SUSPENDED"] } },
      { platformRole: { in: ["ADMIN"] } },
      { memberships: { some: { role: { in: ["MANAGER"] } } } },
    ]);
  });

  it("searches identity and both academy-local numbers", () => {
    const clauses = where({ query: "20241" }).AND as { OR?: unknown[] }[];
    const search = clauses.find((clause) => clause.OR);

    expect(search?.OR).toHaveLength(5);
    expect(JSON.stringify(search)).toContain("studentNumber");
    expect(JSON.stringify(search)).toContain("employeeNumber");
  });

  it("ignores a query that is only whitespace", () => {
    expect(where({ query: "   " })).toEqual({});
  });

  it("combines a search with a facet rather than replacing it", () => {
    const result = where({ query: "kim", roles: ["TEACHER"] });
    expect(result.AND).toHaveLength(2);
  });
});

describe("platform users paging defaults", () => {
  it("starts on page one with a bounded page size", () => {
    const input = listPlatformUsersInputSchema.parse({});
    expect(input.page).toBe(1);
    expect(input.pageSize).toBe(25);
  });

  it("refuses a page size past the cap", () => {
    expect(() =>
      listPlatformUsersInputSchema.parse({ pageSize: 500 }),
    ).toThrow();
  });
});
