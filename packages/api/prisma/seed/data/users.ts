import type { AcademyRole, PlatformRole } from "../../../src/generated/prisma/enums.js";

export const developmentPassword = "CoveDev123!";
export const developmentJoinedAt = new Date("2026-07-23T00:00:00.000Z");

export type DevelopmentUser = {
  id: string;
  membershipId: string | null;
  email: string;
  /**
   * What these accounts sign in with. Prefixed rather than named after the
   * role alone because `admin` is a reserved name and `student` would collide
   * with the first real one somebody creates while testing.
   */
  username: string;
  displayName: string;
  platformRole: PlatformRole;
  /** The member's highest role, stored on the membership row. */
  academyRole: AcademyRole | null;
  /**
   * Roles held beside `academyRole`, for exercising the role switcher.
   *
   * Never `STUDENT`: a student's rows are about them while every staff role
   * reads across students, and the schema refuses the combination.
   */
  extraAcademyRoles?: readonly AcademyRole[];
};

export const developmentUsers = [
  {
    id: "30000000-0000-4000-8000-000000000001",
    membershipId: null,
    email: "admin@cove.test",
    username: "cove-admin",
    displayName: "Cove Platform Admin",
    platformRole: "ADMIN",
    academyRole: null,
  },
  {
    id: "30000000-0000-4000-8000-000000000002",
    membershipId: "40000000-0000-4000-8000-000000000002",
    email: "manager@cove.test",
    username: "cove-manager",
    displayName: "Cove Academy Manager",
    platformRole: "USER",
    academyRole: "MANAGER",
  },
  {
    id: "30000000-0000-4000-8000-000000000003",
    membershipId: "40000000-0000-4000-8000-000000000003",
    email: "teamlead@cove.test",
    username: "cove-teamlead",
    displayName: "Cove Team Lead",
    platformRole: "USER",
    academyRole: "TEAM_LEAD",
  },
  {
    id: "30000000-0000-4000-8000-000000000004",
    membershipId: "40000000-0000-4000-8000-000000000004",
    email: "teacher@cove.test",
    username: "cove-teacher",
    displayName: "Cove Teacher",
    platformRole: "USER",
    academyRole: "TEACHER",
  },
  {
    // A second teacher exists so replacement is a real transition rather than
    // a hypothetical one: with only one teacher, "replace" has nobody to
    // replace them with, and the tests could only assign and remove.
    id: "30000000-0000-4000-8000-000000000006",
    membershipId: "40000000-0000-4000-8000-000000000006",
    email: "teacher2@cove.test",
    username: "cove-teacher2",
    displayName: "Cove Second Teacher",
    platformRole: "USER",
    academyRole: "TEACHER",
  },
  {
    // Holds three roles at one academy, which is the only way to see the role
    // switcher without granting one by hand. A small campus really does staff
    // one person as director, teacher, and curriculum lead, and before this
    // account existed that arrangement could not be tested at all.
    id: "30000000-0000-4000-8000-000000000007",
    membershipId: "40000000-0000-4000-8000-000000000007",
    email: "multi@cove.test",
    username: "cove-multi",
    displayName: "Cove Multi-Role Staff",
    platformRole: "USER",
    academyRole: "MANAGER",
    extraAcademyRoles: ["TEACHER", "TEAM_LEAD"],
  },
  {
    id: "30000000-0000-4000-8000-000000000005",
    membershipId: "40000000-0000-4000-8000-000000000005",
    email: "student@cove.test",
    username: "cove-student",
    displayName: "Cove Student",
    platformRole: "USER",
    academyRole: "STUDENT",
  },
] as const satisfies readonly DevelopmentUser[];
