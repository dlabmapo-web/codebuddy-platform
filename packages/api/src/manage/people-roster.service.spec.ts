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

function build(rows: unknown[], canManageMembers = true, pointsOn = false) {
  const count = vi.fn(async () => rows.length);
  // Typed with the argument so a test can read the select it was given.
  const findMany = vi.fn(async (_args: { select: Record<string, any> }) => rows);
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
    academyFeatureFlag: {
      findFirst: vi.fn(async () => (pointsOn ? { academyId } : null)),
    },
    studentPointBalance: {
      findMany: vi.fn(async () =>
        rows.map((row, index) => ({
          membershipId: (row as { id: string }).id,
          earnedTotal: (index + 1) * 10,
        })),
      ),
    },
  } as unknown as PrismaService;
  const scopes = {
    // A manager, unless a test says otherwise. `canManageMembers` is what
    // decides which columns the rows carry, so the narrowed shape is asserted
    // by overriding this rather than by a second harness.
    requireMemberReader: vi.fn(async () => ({
      academyId,
      userId: "actor",
      canManageMembers,
    })),
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

const studentRow = () =>
  membership({
    role: "STUDENT",
    extraRoles: [],
    staffProfile: null,
    studentProfile: { studentNumber: "S-01" },
  });

describe("the points column", () => {
  it("carries a lifetime total for an academy that keeps score", async () => {
    const { service } = build([studentRow()], true, true);

    const page = await service.listStudents(
      identity,
      listStudentRosterInputSchema.parse({ academyId }),
    );

    expect(page.pointsEnabled).toBe(true);
    expect(page.rows[0]!.points).toBe(10);
  });

  it("omits points entirely for an academy that does not", async () => {
    // Absent, never zero. A column of zeroes would state a score for every
    // child in an academy that keeps none.
    const { service } = build([studentRow()], true, false);

    const page = await service.listStudents(
      identity,
      listStudentRosterInputSchema.parse({ academyId }),
    );

    expect(page.pointsEnabled).toBe(false);
    expect(page.rows[0]).not.toHaveProperty("points");
  });
});

describe("what a reader who may not manage members is answered with", () => {
  /**
   * The rule `studentAcademyProfileSchema` states, enforced where it is read.
   *
   * Both assertions matter and they are not the same one. The row must not
   * carry the field — `toHaveProperty` rather than a null check, because null
   * is a different claim and the table draws it differently. And the select
   * must not have asked for it, because a value a reader may not have should
   * not be read out of the database on their behalf.
   */
  it("withholds a student's guardian, in the row and in the query", async () => {
    const { service, findMany } = build(
      [
        membership({
          role: "STUDENT",
          extraRoles: [],
          staffProfile: null,
          studentProfile: {
            studentNumber: "S-01",
            schoolName: "마포중",
            schoolGrade: "2",
            guardianName: "김보호",
            guardianPhone: "+821012345678",
          },
        }),
      ],
      false,
    );

    const page = await service.listStudents(
      identity,
      listStudentRosterInputSchema.parse({ academyId }),
    );

    expect(page.viewer).toEqual({ canManageMembers: false });
    expect(page.rows[0]).toMatchObject({ schoolName: "마포중" });
    expect(page.rows[0]).not.toHaveProperty("guardianName");
    expect(page.rows[0]).not.toHaveProperty("guardianPhone");

    const select = findMany.mock.calls[0]![0] as {
      select: { studentProfile: { select: Record<string, unknown> } };
    };
    expect(select.select.studentProfile.select).not.toHaveProperty(
      "guardianName",
    );
    expect(select.select.studentProfile.select).not.toHaveProperty(
      "guardianPhone",
    );
  });

  it("hands a manager the guardian it withholds from everyone else", async () => {
    const { service } = build([
      membership({
        role: "STUDENT",
        extraRoles: [],
        staffProfile: null,
        studentProfile: {
          studentNumber: "S-01",
          schoolName: "마포중",
          schoolGrade: "2",
          guardianName: "김보호",
          guardianPhone: "+821012345678",
        },
      }),
    ]);

    const page = await service.listStudents(
      identity,
      listStudentRosterInputSchema.parse({ academyId }),
    );

    expect(page.viewer).toEqual({ canManageMembers: true });
    expect(page.rows[0]).toMatchObject({
      guardianName: "김보호",
      guardianPhone: "+821012345678",
    });
  });

  it("withholds staff contact details, in the row and in the query", async () => {
    const { service, findMany } = build(
      [
        membership({
          memberProfile: {
            academyDisplayName: null,
            contactPhone: "+821022223333",
          },
        }),
      ],
      false,
    );

    const page = await service.listStaff(
      identity,
      listStaffRosterInputSchema.parse({ academyId }),
    );

    // Still nameable, and still placed in the academy.
    expect(page.rows[0]).toMatchObject({
      displayName: "김원장",
      academyTitle: "원장",
    });
    expect(page.rows[0]).not.toHaveProperty("contactPhone");
    expect(page.rows[0]).not.toHaveProperty("employeeNumber");
    expect(page.rows[0]).not.toHaveProperty("email");

    const select = findMany.mock.calls[0]![0] as {
      select: {
        memberProfile: { select: Record<string, unknown> };
        staffProfile: { select: Record<string, unknown> };
      };
    };
    expect(select.select.memberProfile.select).not.toHaveProperty(
      "contactPhone",
    );
    expect(select.select.staffProfile.select).not.toHaveProperty(
      "employeeNumber",
    );
  });

  it("still reads the address it will not emit, because the name falls back to it", async () => {
    // The one field the narrowing cannot cover. A member with no name and no
    // username is named by their address, so the roster has to read it to
    // render a row at all — it simply does not send it on.
    const { service, findMany } = build(
      [
        membership({
          user: {
            displayName: null,
            username: null,
            email: "teacher@example.com",
            avatarUrl: null,
            avatarAsset: null,
          },
        }),
      ],
      false,
    );

    const page = await service.listStaff(
      identity,
      listStaffRosterInputSchema.parse({ academyId }),
    );

    expect(page.rows[0]?.displayName).toBe("teacher@example.com");
    expect(page.rows[0]).not.toHaveProperty("email");

    const select = findMany.mock.calls[0]![0] as {
      select: { user: { select: Record<string, unknown> } };
    };
    expect(select.select.user.select).toHaveProperty("email", true);
  });
});
