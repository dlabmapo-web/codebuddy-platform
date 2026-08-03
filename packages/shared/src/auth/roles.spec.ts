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

  it("allows team leads and managers to review authoring content", () => {
    expect(roleHasPermission("TEAM_LEAD", "curriculum.review")).toBe(true);
    expect(roleHasPermission("MANAGER", "curriculum.review")).toBe(true);
  });

  it("keeps content mutation permissions with team leads", () => {
    expect(roleHasPermission("TEAM_LEAD", "curriculum.manage")).toBe(true);
    expect(roleHasPermission("TEAM_LEAD", "curriculum.publish")).toBe(true);
    expect(roleHasPermission("TEAM_LEAD", "exercises.manage")).toBe(true);
    expect(roleHasPermission("TEAM_LEAD", "content.import")).toBe(true);
    expect(roleHasPermission("TEAM_LEAD", "ai-feedback-rules.manage")).toBe(true);
  });

  it("makes managers read-only reviewers of curriculum", () => {
    for (const permission of [
      "curriculum.draft",
      "curriculum.manage",
      "curriculum.publish",
      "exercises.manage",
      "content.import",
      "ai-feedback-rules.manage",
    ] as const) {
      expect(roleHasPermission("MANAGER", permission)).toBe(false);
    }
  });

  it("gives class structure to team leads and managers only", () => {
    expect(roleHasPermission("TEAM_LEAD", "classes.manage")).toBe(true);
    expect(roleHasPermission("MANAGER", "classes.manage")).toBe(true);
    expect(roleHasPermission("TEACHER", "classes.manage")).toBe(false);
    expect(roleHasPermission("STUDENT", "classes.manage")).toBe(false);
  });

  it("keeps student enrollment with managers alone", () => {
    expect(roleHasPermission("MANAGER", "class-enrollments.manage")).toBe(true);
    for (const role of ["TEAM_LEAD", "TEACHER", "STUDENT"] as const) {
      expect(roleHasPermission(role, "class-enrollments.manage")).toBe(false);
    }
  });

  it("keeps the reserved teacher assignment permission out of class CRUD", () => {
    expect(roleHasPermission("TEACHER", "classes.assigned.manage")).toBe(true);
    expect(roleHasPermission("TEACHER", "classes.manage")).toBe(false);
  });

  it("does not allow teachers or students to manage or import content", () => {
    for (const role of ["TEACHER", "STUDENT"] as const) {
      expect(roleHasPermission(role, "exercises.manage")).toBe(false);
      expect(roleHasPermission(role, "content.import")).toBe(false);
      expect(roleHasPermission(role, "ai-feedback-rules.manage")).toBe(false);
      expect(roleHasPermission(role, "curriculum.review")).toBe(false);
    }
  });
});
