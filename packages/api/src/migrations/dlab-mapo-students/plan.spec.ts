import { describe, expect, it } from "vitest";

import { planStudents, type ExistingStudent } from "./plan.js";

const academyId = "eec3d5ca-cda7-4638-8875-c871e16b5c22";
const desired = [
  { username: "student1", displayName: "Student1" },
  { username: "student2", displayName: "Student2" },
];

function existing(overrides: Partial<ExistingStudent> = {}): ExistingStudent {
  return {
    coveUserId: "user-1",
    coveAuthUserId: "auth-1",
    coveUsername: "student1",
    coveStatus: "ACTIVE",
    coveEmailIsPlaceholder: true,
    authUserId: "auth-1",
    joinRequestAcademyId: academyId,
    ...overrides,
  };
}

describe("planStudents", () => {
  it("creates every student when none exist", () => {
    const plan = planStudents(desired, new Map(), academyId);

    expect(plan.hasConflict).toBe(false);
    expect(plan.toCreate).toHaveLength(2);
    expect(plan.entries.every((entry) => entry.action === "create")).toBe(true);
  });

  it("creates only what is missing, so a rerun is safe", () => {
    const plan = planStudents(desired, new Map([["student1", existing()]]), academyId);

    expect(plan.hasConflict).toBe(false);
    expect(plan.toCreate).toEqual([{ username: "student2", displayName: "Student2" }]);
    expect(plan.entries[0]).toMatchObject({ username: "student1", action: "skip" });
  });

  it("refuses a name held by an account with a real email address", () => {
    const plan = planStudents(
      desired,
      new Map([["student1", existing({ coveEmailIsPlaceholder: false })]]),
      academyId,
    );

    expect(plan.hasConflict).toBe(true);
    expect(plan.toCreate).toEqual([{ username: "student2", displayName: "Student2" }]);
    expect(plan.entries[0]).toMatchObject({ action: "conflict" });
  });

  it("refuses an Auth identity that has no Cove user row", () => {
    const plan = planStudents(
      desired,
      new Map([["student1", existing({ coveUserId: null, coveAuthUserId: null })]]),
      academyId,
    );

    expect(plan.hasConflict).toBe(true);
    expect(plan.entries[0]).toMatchObject({ action: "conflict" });
  });

  it("refuses a student who belongs to a different academy", () => {
    const plan = planStudents(
      desired,
      new Map([["student1", existing({ joinRequestAcademyId: "another-academy" })]]),
      academyId,
    );

    expect(plan.hasConflict).toBe(true);
    expect(plan.entries[0]).toMatchObject({ action: "conflict" });
  });

  it("refuses a Cove row whose identity disagrees with Supabase", () => {
    const plan = planStudents(
      desired,
      new Map([["student1", existing({ authUserId: "auth-other" })]]),
      academyId,
    );

    expect(plan.hasConflict).toBe(true);
    expect(plan.entries[0]).toMatchObject({ action: "conflict" });
  });
});
