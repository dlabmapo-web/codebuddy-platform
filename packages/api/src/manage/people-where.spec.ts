import { describe, expect, it } from "vitest";

import { peopleWhere } from "./people-where.js";

const academyId = "11111111-2222-4333-8444-555555555555";
const classId = "66666666-2222-4333-8444-555555555555";

describe("peopleWhere", () => {
  it("matches a role whether it is primary or extra", () => {
    const where = peopleWhere(academyId, {
      search: "",
      roles: ["TEACHER"],
      statuses: [],
    });

    // The manager who also teaches holds TEACHER only as an extra role. A
    // predicate on the primary column alone is the bug this replaced.
    expect(where.AND).toContainEqual({
      OR: [
        { role: { in: ["TEACHER"] } },
        { extraRoles: { some: { role: { in: ["TEACHER"] } } } },
      ],
    });
  });

  it("searches usernames, so a bulk selection sees what the page showed", () => {
    const where = peopleWhere(academyId, {
      search: "minji",
      roles: [],
      statuses: [],
    });
    const search = (where.AND as { OR: unknown[] }[])[0]!.OR;

    expect(search).toContainEqual({
      user: { username: { contains: "minji", mode: "insensitive" } },
    });
    expect(search).toContainEqual({
      memberProfile: {
        academyDisplayName: { contains: "minji", mode: "insensitive" },
      },
    });
  });

  it("adds the roster-only search fields only when asked", () => {
    const plain = JSON.stringify(
      peopleWhere(academyId, { search: "07", roles: [], statuses: [] }),
    );
    expect(plain).not.toContain("studentNumber");
    expect(plain).not.toContain("employeeNumber");

    const students = JSON.stringify(
      peopleWhere(academyId, {
        search: "07",
        roles: [],
        statuses: [],
        searchStudentNumber: true,
      }),
    );
    expect(students).toContain("studentNumber");
  });

  it("hides people who left unless a status filter names them", () => {
    expect(
      peopleWhere(academyId, { search: "", roles: [], statuses: [] }).status,
    ).toEqual({ not: "LEFT" });
    expect(
      peopleWhere(academyId, { search: "", roles: [], statuses: ["LEFT"] })
        .status,
    ).toEqual({ in: ["LEFT"] });
  });

  it("narrows to an audience by the primary role", () => {
    expect(
      peopleWhere(academyId, {
        search: "",
        roles: [],
        statuses: [],
        audience: "students",
      }).role,
    ).toEqual("STUDENT");
    expect(
      peopleWhere(academyId, {
        search: "",
        roles: [],
        statuses: [],
        audience: "staff",
      }).role,
    ).toEqual({ in: ["TEACHER", "TEAM_LEAD", "MANAGER"] });
  });

  it("filters students by an active class of this academy", () => {
    const where = peopleWhere(academyId, {
      search: "",
      roles: [],
      statuses: [],
      classIds: [classId],
    });
    expect(where.AND).toContainEqual({
      classEnrollments: {
        some: {
          classId: { in: [classId] },
          class: { academyId, status: "ACTIVE" },
        },
      },
    });
  });

  it("adds nothing for an empty filter", () => {
    const where = peopleWhere(academyId, {
      search: "  ",
      roles: [],
      statuses: [],
    });
    expect(where.AND).toBeUndefined();
    expect(where.academyId).toBe(academyId);
    expect(where.user).toEqual({ status: { not: "DELETED" } });
  });
});
