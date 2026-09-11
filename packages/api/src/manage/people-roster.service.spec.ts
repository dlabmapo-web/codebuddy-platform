import {
  listStaffRosterInputSchema,
  listStudentRosterInputSchema,
  primaryAcademyRole,
} from "@cove/shared";
import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { PrismaService } from "../database/prisma.service.js";
import { AcademyRole } from "../generated/prisma/enums.js";
import type { ProfileMediaService } from "../profile/profile-media.service.js";
import type { ManagerScopeService } from "./manager-scope.service.js";
import { PeopleRosterService } from "./people-roster.service.js";

const academyId = "11111111-2222-4333-8444-555555555555";
const managerMembership = "22222222-2222-4333-8444-555555555555";
const classId = "66666666-2222-4333-8444-555555555555";
const identity = { authUserId: "auth" } as SupabaseIdentity;

function membership(overrides: Record<string, unknown> = {}) {
  return {
    id: managerMembership,
    userId: "33333333-2222-4333-8444-555555555555",
    role: "MANAGER",
    extraRoles: [{ role: "TEACHER" }],
    status: "ACTIVE",
    joinedAt: new Date("2026-03-02T00:00:00Z"),
    updatedAt: new Date("2026-09-01T00:00:00Z"),
    user: {
      displayName: "김원장",
      username: "director",
      email: "director@example.com",
      avatarUrl: null,
      avatarAsset: null,
    },
    memberProfile: null,
    staffProfile: { academyTitle: "원장", employeeNumber: "E-01" },
    studentProfile: null,
    assignedClasses: [{ id: classId, name: "월수 파이썬" }],
    assistedClasses: [],
    classEnrollments: [],
    ...overrides,
  };
}

function build(rows: unknown[]) {
  const count = vi.fn(async () => rows.length);
  const findMany = vi.fn(async () => rows);
  const prisma = {
    academyMembership: {
      count,
      findMany,
      groupBy: vi.fn(async () => [
        { status: "ACTIVE", _count: { _all: rows.length } },
      ]),
    },
    class: {
      findMany: vi.fn(async () => [
        { id: classId, name: "월수 파이썬" },
        { id: "77777777-2222-4333-8444-555555555555", name: "빈 반" },
      ]),
    },
    classEnrollment: {
      groupBy: vi.fn(async () => [{ classId, _count: { _all: 3 } }]),
    },
  } as unknown as PrismaService;
  const scopes = {
    requireManager: vi.fn(async () => ({ academyId, userId: "actor" })),
  } as unknown as ManagerScopeService;
  const media = {
    signMany: vi.fn(async () => []),
  } as unknown as ProfileMediaService;

  return {
    count,
    findMany,
    service: new PeopleRosterService(prisma, scopes, media),
  };
}

describe("AcademyRole ordering", () => {
  it("is declared lowest to highest, which is what the role sort relies on", () => {
    // `staffOrder` sorts the Postgres enum column directly, and Postgres sorts
    // an enum by declaration order. If somebody reorders the enum, this is the
    // test that says so — before anybody's position on the Staff page moves.
    const declared = Object.values(AcademyRole);
    for (let index = 1; index < declared.length; index += 1) {
      expect(
        primaryAcademyRole([declared[index - 1]!, declared[index]!]),
      ).toBe(declared[index]);
    }
  });
});

describe("PeopleRosterService.listStaff", () => {
  it("returns every role a multi-role member holds, highest first in `role`", async () => {
    const { service } = build([membership()]);
    const page = await service.listStaff(
      identity,
      listStaffRosterInputSchema.parse({ academyId }),
    );

    expect(page.rows[0]).toMatchObject({
      role: "MANAGER",
      roles: ["TEACHER", "MANAGER"],
      username: "director",
      academyTitle: "원장",
      homeroomClasses: [{ id: classId, name: "월수 파이썬" }],
    });
  });

  it("counts each role by who holds it, so one person can count twice", async () => {
    const { service, count } = build([membership()]);
    const page = await service.listStaff(
      identity,
      listStaffRosterInputSchema.parse({ academyId }),
    );

    // One count for the page, then one per staff role, each asking "holds".
    const roleCountCalls = count.mock.calls.slice(1) as unknown as [
      { where: { AND: { OR: unknown[] }[] } },
    ][];
    expect(roleCountCalls).toHaveLength(3);
    expect(roleCountCalls[0]![0].where.AND).toContainEqual({
      OR: [
        { role: { in: ["TEACHER"] } },
        { extraRoles: { some: { role: { in: ["TEACHER"] } } } },
      ],
    });
    expect(page.facets.roles.map((facet) => facet.value)).toEqual([
      "TEACHER",
      "TEAM_LEAD",
      "MANAGER",
    ]);
  });

  it("sorts by highest role, then by name, then by id", async () => {
    const { service, findMany } = build([membership()]);
    await service.listStaff(
      identity,
      listStaffRosterInputSchema.parse({ academyId }),
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { role: "desc" },
          { user: { displayName: "asc" } },
          { id: "asc" },
        ],
      }),
    );
  });
});

describe("PeopleRosterService.listStudents", () => {
  it("lists every active class in the facet, including empty ones", async () => {
    const { service } = build([
      membership({
        role: "STUDENT",
        extraRoles: [],
        staffProfile: null,
        studentProfile: {
          studentNumber: "S-07",
          schoolName: "한빛초",
          schoolGrade: "초4",
          guardianName: "박보호",
          guardianPhone: "+821012345678",
        },
        classEnrollments: [{ class: { id: classId, name: "월수 파이썬" } }],
      }),
    ]);
    const page = await service.listStudents(
      identity,
      listStudentRosterInputSchema.parse({ academyId }),
    );

    expect(page.facets.classes).toEqual([
      { id: classId, name: "월수 파이썬", count: 3 },
      { id: "77777777-2222-4333-8444-555555555555", name: "빈 반", count: 0 },
    ]);
    expect(page.rows[0]).toMatchObject({
      username: "director",
      studentNumber: "S-07",
      schoolGrade: "초4",
      guardianPhone: "+821012345678",
      classes: [{ id: classId, name: "월수 파이썬" }],
    });
  });

  it("puts students without a number last, whichever way it sorts", async () => {
    const { service, findMany } = build([]);
    await service.listStudents(
      identity,
      listStudentRosterInputSchema.parse({
        academyId,
        sort: "studentNumber",
        direction: "desc",
      }),
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          {
            studentProfile: {
              studentNumber: { sort: "desc", nulls: "last" },
            },
          },
          { user: { displayName: "asc" } },
          { id: "asc" },
        ],
      }),
    );
  });
});
