import { describe, expect, it } from "vitest";

import { roleHasPermission } from "./roles.js";

describe("roleHasPermission", () => {
  it("allows managers to manage academy members", () => {
    expect(roleHasPermission("MANAGER", "academy.members.manage")).toBe(true);
  });

  it("does not allow team leads or teachers to assign roles", () => {
    expect(roleHasPermission("TEAM_LEAD", "academy.members.manage")).toBe(false);
    expect(roleHasPermission("TEACHER", "academy.members.manage")).toBe(false);
  });

  it("keeps student permissions limited to learning actions", () => {
    expect(roleHasPermission("STUDENT", "submissions.own.create")).toBe(true);
    expect(roleHasPermission("STUDENT", "curriculum.publish")).toBe(false);
  });
});
