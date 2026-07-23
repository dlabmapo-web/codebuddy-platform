import type { AcademyRole, PlatformRole } from "../../../src/generated/prisma/enums.js";

export const developmentPassword = "CoveDev123!";
export const developmentJoinedAt = new Date("2026-07-23T00:00:00.000Z");

export type DevelopmentUser = {
  id: string;
  membershipId: string | null;
  email: string;
  displayName: string;
  platformRole: PlatformRole;
  academyRole: AcademyRole | null;
};

export const developmentUsers = [
  {
    id: "30000000-0000-4000-8000-000000000001",
    membershipId: null,
    email: "admin@cove.test",
    displayName: "Cove Platform Admin",
    platformRole: "ADMIN",
    academyRole: null,
  },
  {
    id: "30000000-0000-4000-8000-000000000002",
    membershipId: "40000000-0000-4000-8000-000000000002",
    email: "manager@cove.test",
    displayName: "Cove Academy Manager",
    platformRole: "USER",
    academyRole: "MANAGER",
  },
  {
    id: "30000000-0000-4000-8000-000000000003",
    membershipId: "40000000-0000-4000-8000-000000000003",
    email: "teamlead@cove.test",
    displayName: "Cove Team Lead",
    platformRole: "USER",
    academyRole: "TEAM_LEAD",
  },
  {
    id: "30000000-0000-4000-8000-000000000004",
    membershipId: "40000000-0000-4000-8000-000000000004",
    email: "teacher@cove.test",
    displayName: "Cove Teacher",
    platformRole: "USER",
    academyRole: "TEACHER",
  },
  {
    id: "30000000-0000-4000-8000-000000000005",
    membershipId: "40000000-0000-4000-8000-000000000005",
    email: "student@cove.test",
    displayName: "Cove Student",
    platformRole: "USER",
    academyRole: "STUDENT",
  },
] as const satisfies readonly DevelopmentUser[];
