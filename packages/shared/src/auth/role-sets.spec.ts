import { describe, expect, it } from "vitest";

import {
  academyPermissions,
  academyRoles,
  canCombineAcademyRoles,
  effectiveAcademyRoles,
  isStudentRoleSet,
  primaryAcademyRole,
  roleHasPermission,
  rolesHavePermission,
} from "./roles.js";

describe("effectiveAcademyRoles", () => {
  it("includes the primary role and deduplicates", () => {
    expect(effectiveAcademyRoles("MANAGER", ["TEACHER", "MANAGER"])).toEqual([
      "TEACHER",
      "MANAGER",
    ]);
  });

  it("orders by academyRoles so equal sets are equal arrays", () => {
    expect(effectiveAcademyRoles("TEACHER", ["MANAGER", "TEAM_LEAD"])).toEqual(
      effectiveAcademyRoles("MANAGER", ["TEAM_LEAD", "TEACHER"]),
    );
  });
});

describe("rolesHavePermission", () => {
  /*
   * The guard that keeps multi-role membership from changing what one role
   * means. Every existing caller passes a one-element set, so if this ever
   * disagreed with `roleHasPermission` the change would be silent and would
   * reach every permission check in the product at once.
   */
  it("agrees with roleHasPermission for every single-role set", () => {
    for (const role of academyRoles) {
      for (const permission of academyPermissions) {
        expect(rolesHavePermission([role], permission)).toBe(
          roleHasPermission(role, permission),
        );
      }
    }
  });

  it("is the union, not the highest role", () => {
    // A Manager holds no teaching monitor permission of their own; the point
    // of granting TEACHER beside it is that they gain one.
    expect(rolesHavePermission(["MANAGER"], "academy.settings.manage")).toBe(
      true,
    );
    expect(
      rolesHavePermission(["TEACHER", "MANAGER"], "academy.settings.manage"),
    ).toBe(true);
    expect(rolesHavePermission([], "academy.read")).toBe(false);
  });

  it("keeps credential management away from a team lead", () => {
    expect(
      rolesHavePermission(["MANAGER"], "academy.members.credentials.manage"),
    ).toBe(true);
    expect(
      rolesHavePermission(["TEAM_LEAD"], "academy.members.credentials.manage"),
    ).toBe(false);
    expect(
      rolesHavePermission(["TEACHER"], "academy.members.credentials.manage"),
    ).toBe(false);
  });
});

describe("primaryAcademyRole", () => {
  it("is the highest held role", () => {
    expect(primaryAcademyRole(["TEACHER", "MANAGER"])).toBe("MANAGER");
    expect(primaryAcademyRole(["TEACHER", "TEAM_LEAD"])).toBe("TEAM_LEAD");
    expect(primaryAcademyRole(["STUDENT"])).toBe("STUDENT");
    expect(primaryAcademyRole([])).toBeNull();
  });
});

describe("canCombineAcademyRoles", () => {
  it("lets staff roles combine freely", () => {
    expect(
      canCombineAcademyRoles(["TEACHER", "TEAM_LEAD", "MANAGER"]),
    ).toBe(true);
  });

  it("refuses STUDENT beside any staff role, in either direction", () => {
    expect(canCombineAcademyRoles(["STUDENT", "TEACHER"])).toBe(false);
    expect(canCombineAcademyRoles(["MANAGER", "STUDENT"])).toBe(false);
  });

  it("allows STUDENT alone, and refuses an empty set", () => {
    expect(canCombineAcademyRoles(["STUDENT"])).toBe(true);
    expect(canCombineAcademyRoles([])).toBe(false);
  });
});

describe("isStudentRoleSet", () => {
  it("is true only for exactly one STUDENT role", () => {
    expect(isStudentRoleSet(["STUDENT"])).toBe(true);
    expect(isStudentRoleSet(["STUDENT", "TEACHER"])).toBe(false);
    expect(isStudentRoleSet(["TEACHER"])).toBe(false);
    expect(isStudentRoleSet([])).toBe(false);
  });
});
