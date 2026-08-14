import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AppException } from "../common/app-exception.js";
import {
  AcademyProfileService,
  assertUnchanged,
  editableSections,
} from "./academy-profile.service.js";

describe("editableSections", () => {
  it("lets a student write their own details and their own words", () => {
    expect(editableSections("STUDENT", false)).toEqual([
      "COMMON",
      "STUDENT_DETAILS",
      "STUDENT_SELF_EXPRESSION",
    ]);
  });

  // Design §7.3: interests and the learning goal are the student's own
  // expression, not an academy record. A manager reads them and stops there.
  it("withholds a student's self-expression from a manager", () => {
    expect(editableSections("STUDENT", true)).toEqual([
      "COMMON",
      "STUDENT_DETAILS",
    ]);
  });

  it("gives every staff role the same one profile shape", () => {
    for (const role of ["TEACHER", "TEAM_LEAD", "MANAGER"] as const) {
      expect(editableSections(role, false)).toEqual(["COMMON", "STAFF"]);
      expect(editableSections(role, true)).toEqual(["COMMON", "STAFF"]);
    }
  });
});

describe("assertUnchanged", () => {
  const saved = new Date("2026-08-14T09:00:00.000Z");

  it("accepts the revision the form loaded", () => {
    expect(() => assertUnchanged(saved, saved.toISOString())).not.toThrow();
  });

  it("rejects a stale revision with PROFILE_CHANGED", () => {
    expect(() => assertUnchanged(saved, "2026-08-14T08:00:00.000Z")).toThrow(
      AppException,
    );
    try {
      assertUnchanged(saved, "2026-08-14T08:00:00.000Z");
    } catch (error) {
      expect((error as AppException).code).toBe("PROFILE_CHANGED");
    }
  });

  // The race this exists for: the student saved first and created the row,
  // and the manager's form still believes the section has never been written.
  // Letting that save through would blank what the student just typed.
  it("rejects a form that believes an existing section is still empty", () => {
    expect(() => assertUnchanged(saved, null)).toThrow(AppException);
  });

  it("accepts a first save of a section that has no row yet", () => {
    expect(() => assertUnchanged(undefined, null)).not.toThrow();
  });

  it("rejects a revision for a section the server has no row for", () => {
    expect(() => assertUnchanged(undefined, saved.toISOString())).toThrow(
      AppException,
    );
  });
});

describe("AcademyProfileService manager authorization", () => {
  const identity = { authUserId: "auth-manager" } as SupabaseIdentity;

  it("does not query a target profile when the actor is not a manager", async () => {
    const findFirst = vi.fn();
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "actor-1",
          status: "ACTIVE",
        }),
      },
      academyMembership: {
        findUnique: vi.fn().mockResolvedValue({
          role: "TEACHER",
          status: "ACTIVE",
          academy: { status: "ACTIVE" },
        }),
        findFirst,
      },
    };
    const service = new AcademyProfileService(
      prisma as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.getForManager(identity, {
        academyId: "academy-a",
        membershipId: "member-b",
      }),
    ).rejects.toMatchObject({ code: "PROFILE_NOT_FOUND", status: 404 });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("scopes the target membership query to the manager's academy", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "actor-1",
          status: "ACTIVE",
        }),
      },
      academyMembership: {
        findUnique: vi.fn().mockResolvedValue({
          role: "MANAGER",
          status: "ACTIVE",
          academy: { status: "ACTIVE" },
        }),
        findFirst,
      },
    };
    const service = new AcademyProfileService(
      prisma as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.getForManager(identity, {
        academyId: "academy-a",
        membershipId: "member-from-academy-b",
      }),
    ).rejects.toMatchObject({ code: "PROFILE_NOT_FOUND", status: 404 });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "member-from-academy-b",
          academyId: "academy-a",
        },
      }),
    );
  });
});
