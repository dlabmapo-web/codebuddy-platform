import { describe, expect, it } from "vitest";

import {
  hasAnotherActiveManager,
  planRoleGrant,
  planRoleRevoke,
} from "./academy-membership.service.js";

describe("last active manager protection", () => {
  it("rejects changing the only active manager", () => {
    expect(hasAnotherActiveManager([{ id: "manager-1" }], "manager-1"))
      .toBe(false);
  });

  it("allows a manager change when another active manager remains", () => {
    expect(hasAnotherActiveManager(
      [{ id: "manager-1" }, { id: "manager-2" }],
      "manager-1",
    )).toBe(true);
  });
});

describe("planRoleGrant", () => {
  it("adds a staff role and keeps the highest as primary", () => {
    expect(planRoleGrant(["TEACHER"], "MANAGER")).toEqual({
      next: ["TEACHER", "MANAGER"],
      primary: "MANAGER",
    });
  });

  it("keeps the existing primary when the new role is lower", () => {
    expect(planRoleGrant(["MANAGER"], "TEACHER")).toEqual({
      next: ["TEACHER", "MANAGER"],
      primary: "MANAGER",
    });
  });

  it("refuses a role the member already holds", () => {
    expect(() => planRoleGrant(["TEACHER"], "TEACHER")).toThrowError(
      expect.objectContaining({ code: "MEMBERSHIP_ROLE_ALREADY_HELD" }),
    );
  });

  it("refuses STUDENT beside staff, and staff beside STUDENT", () => {
    expect(() => planRoleGrant(["TEACHER"], "STUDENT")).toThrowError(
      expect.objectContaining({ code: "MEMBERSHIP_ROLE_CONFLICT" }),
    );
    expect(() => planRoleGrant(["STUDENT"], "TEACHER")).toThrowError(
      expect.objectContaining({ code: "MEMBERSHIP_ROLE_CONFLICT" }),
    );
  });
});

describe("planRoleRevoke", () => {
  it("promotes the highest remaining role when the primary goes", () => {
    expect(planRoleRevoke(["TEACHER", "TEAM_LEAD", "MANAGER"], "MANAGER"))
      .toEqual({ next: ["TEACHER", "TEAM_LEAD"], primary: "TEAM_LEAD" });
  });

  it("leaves the primary alone when a lower role goes", () => {
    expect(planRoleRevoke(["TEACHER", "MANAGER"], "TEACHER")).toEqual({
      next: ["MANAGER"],
      primary: "MANAGER",
    });
  });

  it("refuses to remove the last role", () => {
    // A membership that grants nothing is not a membership. Removing the
    // member is a different action with different consequences.
    expect(() => planRoleRevoke(["MANAGER"], "MANAGER")).toThrowError(
      expect.objectContaining({ code: "MEMBERSHIP_ROLE_LAST" }),
    );
  });

  it("refuses a role the member does not hold", () => {
    expect(() => planRoleRevoke(["TEACHER", "MANAGER"], "TEAM_LEAD"))
      .toThrowError(
        expect.objectContaining({ code: "MEMBERSHIP_ROLE_NOT_HELD" }),
      );
  });
});
