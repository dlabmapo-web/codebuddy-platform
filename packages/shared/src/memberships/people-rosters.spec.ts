import { describe, expect, it } from "vitest";

import {
  listStaffRosterInputSchema,
  parseStaffRosterQuery,
  serializeStaffRosterQuery,
  staffRosterResetsToFirstPage,
} from "./staff-roster.js";
import {
  listStudentRosterInputSchema,
  parseStudentRosterQuery,
  serializeStudentRosterQuery,
  studentRosterResetsToFirstPage,
} from "./student-roster.js";

const academyId = "11111111-2222-4333-8444-555555555555";
const classA = "66666666-2222-4333-8444-555555555555";
const classB = "77777777-2222-4333-8444-555555555555";

describe("student roster query", () => {
  it("opens on students by name", () => {
    expect(listStudentRosterInputSchema.parse({ academyId })).toMatchObject({
      page: 1,
      pageSize: 25,
      search: "",
      statuses: [],
      classIds: [],
      sort: "displayName",
      direction: "asc",
    });
  });

  it("reads classes as a canonical set and drops anything that is not an id", () => {
    const query = parseStudentRosterQuery({
      class: [classB, "not-a-class", classA, classB.toUpperCase()],
    });
    expect(query.classIds).toEqual([classA, classB]);
  });

  it("falls back to defaults instead of failing on nonsense", () => {
    expect(
      parseStudentRosterQuery({
        page: "-3",
        size: "7",
        sort: "password",
        dir: "sideways",
        status: "ASLEEP",
      }),
    ).toEqual(parseStudentRosterQuery({}));
  });

  it("omits every default, and round trips", () => {
    expect(serializeStudentRosterQuery(parseStudentRosterQuery({}))).toBe("");
    const query = parseStudentRosterQuery({
      page: "2",
      size: "50",
      q: "minji",
      status: "SUSPENDED",
      class: [classB, classA],
      sort: "studentNumber",
      dir: "desc",
    });
    const serialized = serializeStudentRosterQuery(query);
    expect(
      parseStudentRosterQuery(
        Object.fromEntries(
          [...new URLSearchParams(serialized)].reduce((all, [key, value]) => {
            all.set(key, [...(all.get(key) ?? []), value]);
            return all;
          }, new Map<string, string[]>()),
        ),
      ),
    ).toEqual(query);
  });

  it("returns to page one when the class filter changes", () => {
    const base = parseStudentRosterQuery({ page: "4" });
    expect(
      studentRosterResetsToFirstPage(base, { ...base, classIds: [classA] }),
    ).toBe(true);
    expect(studentRosterResetsToFirstPage(base, { ...base, pageSize: 100 })).toBe(
      false,
    );
  });
});

describe("staff roster query", () => {
  it("opens on managers first", () => {
    expect(listStaffRosterInputSchema.parse({ academyId })).toMatchObject({
      sort: "role",
      direction: "desc",
      roles: [],
    });
  });

  it("offers only staff roles to filter by", () => {
    expect(parseStaffRosterQuery({ role: ["STUDENT", "TEACHER"] }).roles).toEqual(
      ["TEACHER"],
    );
    expect(() =>
      listStaffRosterInputSchema.parse({ academyId, roles: ["STUDENT"] }),
    ).toThrow();
  });

  it("omits every default, and keeps the rest", () => {
    expect(serializeStaffRosterQuery(parseStaffRosterQuery({}))).toBe("");
    expect(
      serializeStaffRosterQuery(
        parseStaffRosterQuery({ role: ["MANAGER", "TEACHER"], sort: "username" }),
      ),
    ).toBe("role=MANAGER&role=TEACHER&sort=username");
  });

  it("returns to page one when the role filter changes", () => {
    const base = parseStaffRosterQuery({ page: "3" });
    expect(
      staffRosterResetsToFirstPage(base, { ...base, roles: ["TEACHER"] }),
    ).toBe(true);
  });
});
