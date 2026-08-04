import type { SupabaseClient, User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { developmentUsers } from "./data/users.js";
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
    expect(new Set(developmentUsers.map((user) => normalizeEmail(user.email))).size)
      .toBe(6);
    expect(developmentUsers.filter((user) => user.platformRole === "ADMIN"))
      .toHaveLength(1);
    expect(developmentUsers.map((user) => user.academyRole).filter(Boolean).sort())
      .toEqual(["MANAGER", "STUDENT", "TEACHER", "TEACHER", "TEAM_LEAD"]);
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
        }],
        developmentUsers,
      )
    ).toThrowError(`Cove email conflict for ${developmentUsers[0].email}.`);
  });

  it("accepts the matching stable Cove user", () => {
    const user = developmentUsers[0];
    expect(() =>
      assertNoCoveUserConflicts(
        [{ id: user.id, authUserId: null, email: user.email }],
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
