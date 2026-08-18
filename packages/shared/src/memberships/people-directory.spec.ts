import { describe, expect, it } from "vitest";

import {
  clampPage,
  listPeopleInputSchema,
  parsePeopleQuery,
  resetsToFirstPage,
  serializePeopleQuery,
  type ListPeopleInput,
} from "./people-directory.js";

const ACADEMY = "00000000-0000-4000-8000-00000000000c";

describe("listPeopleInputSchema", () => {
  it("fills in every default for a bare request", () => {
    expect(listPeopleInputSchema.parse({ academyId: ACADEMY })).toEqual({
      academyId: ACADEMY,
      page: 1,
      pageSize: 25,
      search: "",
      roles: [],
      statuses: [],
      sort: "updatedAt",
      direction: "desc",
    });
  });

  it("refuses a page size outside the offered set", () => {
    expect(
      listPeopleInputSchema.safeParse({ academyId: ACADEMY, pageSize: 500 })
        .success,
    ).toBe(false);
  });

  it("trims the search rather than searching for whitespace", () => {
    expect(
      listPeopleInputSchema.parse({ academyId: ACADEMY, search: "  kim  " })
        .search,
    ).toBe("kim");
  });
});

describe("clampPage", () => {
  it("serves a page that exists, with its offset", () => {
    expect(clampPage({ page: 12, pageSize: 25, totalRows: 40 })).toEqual({
      page: 2,
      pageCount: 2,
      offset: 25,
    });
  });

  it("keeps an empty directory on a first page rather than page zero", () => {
    expect(clampPage({ page: 1, pageSize: 25, totalRows: 0 })).toEqual({
      page: 1,
      pageCount: 1,
      offset: 0,
    });
  });
});

describe("resetsToFirstPage", () => {
  const base: ListPeopleInput = listPeopleInputSchema.parse({
    academyId: ACADEMY,
  });

  it("resets when the result set changes", () => {
    expect(resetsToFirstPage(base, { ...base, search: "kim" })).toBe(true);
    expect(resetsToFirstPage(base, { ...base, roles: ["TEACHER"] })).toBe(true);
    expect(resetsToFirstPage(base, { ...base, statuses: ["SUSPENDED"] })).toBe(
      true,
    );
    expect(resetsToFirstPage(base, { ...base, sort: "displayName" })).toBe(true);
    expect(resetsToFirstPage(base, { ...base, direction: "asc" })).toBe(true);
  });

  it("keeps the page when only the window widens", () => {
    expect(resetsToFirstPage(base, { ...base, pageSize: 100 })).toBe(false);
  });

  it("ignores the order the same filters arrived in", () => {
    expect(
      resetsToFirstPage(
        { ...base, roles: ["STUDENT", "TEACHER"] },
        { ...base, roles: ["TEACHER", "STUDENT"] },
      ),
    ).toBe(false);
  });
});

describe("parsePeopleQuery", () => {
  it("reads a full query string", () => {
    expect(
      parsePeopleQuery({
        page: "3",
        size: "50",
        q: " kim ",
        role: ["TEACHER", "STUDENT"],
        status: "ACTIVE",
        sort: "displayName",
        dir: "asc",
      }),
    ).toEqual({
      page: 3,
      pageSize: 50,
      search: "kim",
      roles: ["STUDENT", "TEACHER"],
      statuses: ["ACTIVE"],
      sort: "displayName",
      direction: "asc",
    });
  });

  it("falls back to defaults instead of failing on nonsense", () => {
    expect(
      parsePeopleQuery({
        page: "-4",
        size: "7",
        role: "PRINCIPAL",
        sort: "salary",
        dir: "sideways",
      }),
    ).toEqual({
      page: 1,
      pageSize: 25,
      search: "",
      roles: [],
      statuses: [],
      sort: "updatedAt",
      direction: "desc",
    });
  });

  it("deduplicates repeated filters into the vocabulary's order", () => {
    expect(
      parsePeopleQuery({ role: ["TEACHER", "TEACHER", "STUDENT"] }).roles,
    ).toEqual(["STUDENT", "TEACHER"]);
  });

  it("accepts a comma separated list, which is what people type", () => {
    expect(parsePeopleQuery({ status: "ACTIVE,SUSPENDED" }).statuses).toEqual([
      "ACTIVE",
      "SUSPENDED",
    ]);
  });
});

describe("serializePeopleQuery", () => {
  const base = parsePeopleQuery({});

  it("omits every default so a shared link is the bare path", () => {
    expect(serializePeopleQuery(base)).toBe("");
  });

  it("round trips through the parser", () => {
    const query = {
      ...base,
      page: 4,
      pageSize: 100 as const,
      search: "kim",
      roles: ["TEACHER" as const],
      statuses: ["SUSPENDED" as const],
      sort: "joinedAt" as const,
      direction: "asc" as const,
    };
    const params = Object.fromEntries(
      new URLSearchParams(serializePeopleQuery(query)).entries(),
    );
    expect(parsePeopleQuery({ ...params, role: "TEACHER" })).toEqual(query);
  });

  it("canonicalizes filter order so one request is one cache key", () => {
    expect(
      serializePeopleQuery({ ...base, roles: ["TEACHER", "MANAGER"] }),
    ).toBe(serializePeopleQuery({ ...base, roles: ["MANAGER", "TEACHER"] }));
  });
});
