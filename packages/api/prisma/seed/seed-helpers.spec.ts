import type { SupabaseClient, User } from "@supabase/supabase-js";
import { usernameSchema } from "@cove/shared";
import { describe, expect, it, vi } from "vitest";

import { developmentUsers, type DevelopmentUser } from "./data/users.js";
import {
  assertDevelopmentSeedAllowed,
  assertNoCoveUserConflicts,
  normalizeEmail,
  synchronizeSupabaseUsers,
  validateSeedUsers,
} from "./seed-helpers.js";

type SupabaseAdmin = SupabaseClient["auth"]["admin"];

describe("development seed manifest", () => {
  it("contains unique accounts for every platform and academy role", () => {
    expect(() => validateSeedUsers(developmentUsers)).not.toThrow();
    // Derived rather than a fixed count: what this asserts is that no two
    // accounts share an address, which stays true as accounts are added.
    expect(new Set(developmentUsers.map((user) => normalizeEmail(user.email))).size)
      .toBe(developmentUsers.length);
    expect(developmentUsers.filter((user) => user.platformRole === "ADMIN"))
      .toHaveLength(1);
    expect(developmentUsers.map((user) => user.academyRole).filter(Boolean).sort())
      .toEqual([
        "MANAGER",
        "MANAGER",
        "STUDENT",
        "TEACHER",
        "TEACHER",
        "TEAM_LEAD",
      ]);
  });

  it("gives every seed account a distinct, signable-in username", () => {
    expect(new Set(developmentUsers.map((user) => user.username)).size)
      .toBe(developmentUsers.length);
    for (const user of developmentUsers) {
      expect(usernameSchema.safeParse(user.username).success).toBe(true);
    }
  });

  it("keeps one account holding several roles, so the switcher is reachable", () => {
    // Without it there is no way to see the role switcher locally short of
    // granting a second role by hand before every test of it.
    // Read through the declared type rather than the `as const` literal: the
    // manifest narrows to a union in which only some members carry the
    // optional field, and the assertion is about the manifest as a whole.
    const users: readonly DevelopmentUser[] = developmentUsers;
    const multi = users.filter(
      (user) => (user.extraAcademyRoles?.length ?? 0) > 0,
    );
    expect(multi).toHaveLength(1);
    expect(multi[0]!.username).toBe("cove-multi");
    expect([multi[0]!.academyRole, ...multi[0]!.extraAcademyRoles!].sort())
      .toEqual(["MANAGER", "TEACHER", "TEAM_LEAD"]);
    // STUDENT never combines with a staff role: a student's rows are about
    // them, while every staff role reads across students.
    for (const user of users) {
      if ((user.extraAcademyRoles?.length ?? 0) > 0) {
        expect(user.academyRole).not.toBe("STUDENT");
        expect(user.extraAcademyRoles).not.toContain("STUDENT");
      }
    }
  });

  it("rejects a seed username the signup form would refuse", () => {
    expect(() =>
      validateSeedUsers([{ ...developmentUsers[0], username: "admin" }])
    ).toThrowError("Invalid seed username: admin");
  });

  it("keeps two teachers, so replacing one has somebody to replace it with", () => {
    expect(developmentUsers.filter((user) => user.academyRole === "TEACHER"))
      .toHaveLength(2);
  });

  it("gives memberships only to academy-scoped users", () => {
    for (const user of developmentUsers) {
      expect(user.membershipId !== null).toBe(user.academyRole !== null);
    }
  });
});

describe("development seed safety", () => {
  it("rejects production before the seed can mutate data", () => {
    expect(() => assertDevelopmentSeedAllowed("production"))
      .toThrowError("Development seed is disabled when NODE_ENV=production.");
    expect(() => assertDevelopmentSeedAllowed("development")).not.toThrow();
  });

  it("rejects a Cove email owned by a different user ID", () => {
    expect(() =>
      assertNoCoveUserConflicts(
        [{
          id: "90000000-0000-4000-8000-000000000001",
          authUserId: null,
          email: developmentUsers[0].email,
          username: null,
        }],
        developmentUsers,
      )
    ).toThrowError(`Cove email conflict for ${developmentUsers[0].email}.`);
  });

  it("rejects a Cove username owned by a different user ID", () => {
    expect(() =>
      assertNoCoveUserConflicts(
        [{
          id: "90000000-0000-4000-8000-000000000001",
          authUserId: null,
          email: null,
          username: developmentUsers[0].username,
        }],
        developmentUsers,
      )
    ).toThrowError(`Cove username conflict for ${developmentUsers[0].username}.`);
  });

  it("accepts the matching stable Cove user", () => {
    const user = developmentUsers[0];
    expect(() =>
      assertNoCoveUserConflicts(
        [{
          id: user.id,
          authUserId: null,
          email: user.email,
          username: user.username,
        }],
        developmentUsers,
      )
    ).not.toThrow();
  });
});

describe("Supabase Auth synchronization", () => {
  it("updates an existing account instead of creating a duplicate", async () => {
    const seedUser = developmentUsers[0];
    const existingUser = {
      id: "50000000-0000-4000-8000-000000000001",
      email: seedUser.email.toUpperCase(),
    } as User;
    const updateUserById = vi.fn().mockResolvedValue({
      data: { user: existingUser },
      error: null,
    });
    const createUser = vi.fn();
    const admin = {
      listUsers: vi.fn().mockResolvedValue({
        data: { users: [existingUser] },
        error: null,
      }),
      updateUserById,
      createUser,
    } as unknown as SupabaseAdmin;

    const result = await synchronizeSupabaseUsers(admin, [seedUser], "password");

    expect(createUser).not.toHaveBeenCalled();
    expect(updateUserById).toHaveBeenCalledWith(
      existingUser.id,
      expect.objectContaining({
        email: seedUser.email,
        password: "password",
        email_confirm: true,
      }),
    );
    expect(result.get(seedUser.id)).toBe(existingUser.id);
  });

  it("creates a missing account with a confirmed email", async () => {
    const seedUser = developmentUsers[1];
    const createdUser = {
      id: "50000000-0000-4000-8000-000000000002",
      email: seedUser.email,
    } as User;
    const createUser = vi.fn().mockResolvedValue({
      data: { user: createdUser },
      error: null,
    });
    const admin = {
      listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
      updateUserById: vi.fn(),
      createUser,
    } as unknown as SupabaseAdmin;

    const result = await synchronizeSupabaseUsers(admin, [seedUser], "password");

    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: seedUser.email,
      email_confirm: true,
    }));
    expect(result.get(seedUser.id)).toBe(createdUser.id);
  });
});
