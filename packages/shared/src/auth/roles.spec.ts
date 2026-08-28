import { describe, expect, it } from "vitest";

import {
  academyPermissions,
  academyRoles,
  approvableRoles,
  canApproveAs,
  platformPermissions,
  platformRoleHasPermission,
  roleHasPermission,
} from "./roles.js";

describe("application approval roles", () => {
  it("lets managers approve every academy role", () => {
    expect(approvableRoles("MANAGER")).toEqual(academyRoles);
  });

  it("limits team leads to students and teachers", () => {
    expect(approvableRoles("TEAM_LEAD")).toEqual(["STUDENT", "TEACHER"]);
  });

  it("gives teachers and students no approval roles", () => {
    expect(approvableRoles("TEACHER")).toEqual([]);
    expect(approvableRoles("STUDENT")).toEqual([]);
  });

  it("keeps canApproveAs aligned with each actor's role list", () => {
    for (const actor of academyRoles) {
      const allowed = approvableRoles(actor);
      for (const target of academyRoles) {
        expect(canApproveAs(actor, target)).toBe(allowed.includes(target));
      }
    }
  });
});

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

  it("keeps the class schedule with managers alone", () => {
    // §5.1 and §8.1 of the student points design: a schedule edit changes who
    // is paid for turning up, so it sits with the role that owns the academy's
    // settings — not with the one that owns the curriculum.
    expect(roleHasPermission("MANAGER", "class-schedule.manage")).toBe(true);
    for (const role of ["TEAM_LEAD", "TEACHER", "STUDENT"] as const) {
      expect(roleHasPermission(role, "class-schedule.manage")).toBe(false);
    }
  });

  it("gives teacher assignment to team leads and managers only", () => {
    expect(roleHasPermission("TEAM_LEAD", "class-teachers.manage")).toBe(true);
    expect(roleHasPermission("MANAGER", "class-teachers.manage")).toBe(true);
    expect(roleHasPermission("TEACHER", "class-teachers.manage")).toBe(false);
    expect(roleHasPermission("STUDENT", "class-teachers.manage")).toBe(false);
  });

  it("keeps the reserved teacher assignment permission out of class CRUD", () => {
    expect(roleHasPermission("TEACHER", "classes.assigned.manage")).toBe(true);
    expect(roleHasPermission("TEACHER", "classes.manage")).toBe(false);
    // Holding the reserved permission must never imply the authority to
    // choose who holds it.
    expect(roleHasPermission("TEACHER", "class-teachers.manage")).toBe(false);
  });

  it("does not allow teachers or students to manage or import content", () => {
    for (const role of ["TEACHER", "STUDENT"] as const) {
      expect(roleHasPermission(role, "exercises.manage")).toBe(false);
      expect(roleHasPermission(role, "content.import")).toBe(false);
      expect(roleHasPermission(role, "ai-feedback-rules.manage")).toBe(false);
      expect(roleHasPermission(role, "curriculum.manage")).toBe(false);
      expect(roleHasPermission(role, "curriculum.publish")).toBe(false);
    }
  });

  it("lets a teacher read curriculum detail without authoring it", () => {
    // The course tree and the exercise both sit behind `curriculum.review`,
    // so without it a teacher sees a course listed and can open none of it.
    expect(roleHasPermission("TEACHER", "curriculum.review")).toBe(true);
    // Reading is the whole grant: writing stays with the curriculum owners.
    expect(roleHasPermission("TEACHER", "curriculum.manage")).toBe(false);
    expect(roleHasPermission("TEACHER", "curriculum.publish")).toBe(false);
    // A student never reaches the authoring view: it carries the hidden test
    // inputs and expected outputs their submission is graded against.
    expect(roleHasPermission("STUDENT", "curriculum.review")).toBe(false);
  });
});

describe("platformRoleHasPermission", () => {
  it("gives a platform admin the academy lifecycle capabilities", () => {
    expect(platformRoleHasPermission("ADMIN", "platform.academies.read"))
      .toBe(true);
    expect(platformRoleHasPermission("ADMIN", "platform.academies.create"))
      .toBe(true);
    expect(platformRoleHasPermission("ADMIN", "platform.academies.lifecycle"))
      .toBe(true);
  });

  it("gives an ordinary user nothing at all", () => {
    for (const permission of platformPermissions) {
      expect(platformRoleHasPermission("USER", permission)).toBe(false);
    }
  });

  it("keeps the two permission axes disjoint", () => {
    // The academy map must never be reachable through a platform role, and the
    // platform map never through an academy one. Overlapping names are how a
    // support role would quietly acquire academy data access later.
    const academyNames = new Set<string>(academyPermissions);
    for (const permission of platformPermissions) {
      expect(academyNames.has(permission)).toBe(false);
    }
  });
});
