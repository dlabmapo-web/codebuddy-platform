import { describe, expect, it } from "vitest";

import {
  parsePlatformUsersQuery,
  serializePlatformUsersQuery,
  setPlatformMembershipRoleInputSchema,
  setPlatformUserStatusInputSchema,
  settablePlatformUserStatuses,
} from "./users.js";

describe("directory address", () => {
  it("round-trips a filtered query", () => {
    const query = parsePlatformUsersQuery({
      q: "kim",
      status: ["SUSPENDED"],
      prole: "ADMIN",
      page: "3",
    });
    const round = parsePlatformUsersQuery(
      Object.fromEntries(
        new URLSearchParams(serializePlatformUsersQuery(query)),
      ),
    );

    expect(round.query).toBe("kim");
    expect(round.accountStatuses).toEqual(["SUSPENDED"]);
    expect(round.platformRoles).toEqual(["ADMIN"]);
    expect(round.page).toBe(3);
  });

  it("carries the role facet, now that the lens paths are gone", () => {
    // `/admin/users/staff` redirects to `?role=TEAM_LEAD&role=MANAGER`, so the
    // role has to survive a round trip through the address like every other
    // facet — it is no longer imposed by the path.
    const query = parsePlatformUsersQuery({ role: ["TEAM_LEAD", "MANAGER"] });
    expect(query.roles).toEqual(["TEAM_LEAD", "MANAGER"]);
    expect(serializePlatformUsersQuery(query)).toContain("role=MANAGER");
  });

  it("drops a role the address invented", () => {
    // A query string is user-editable text arriving from bookmarks and chat
    // messages, so an invalid value has to be a page rather than an error.
    expect(parsePlatformUsersQuery({ role: "STAFF" }).roles).toEqual([]);
  });
});

describe("status mutation", () => {
  it("offers deletion as a settable status", () => {
    // §3.7 reversed §1.2 of the console design: deleting an account sets this
    // status. It is still not erasure — the account's work survives.
    expect(settablePlatformUserStatuses).toContain("DELETED");
    expect(settablePlatformUserStatuses).not.toContain("PENDING_PROFILE");
  });

  it("accepts a suspension with no typed handle", () => {
    const parsed = setPlatformUserStatusInputSchema.parse({
      userId: "11111111-1111-4111-8111-111111111111",
      status: "SUSPENDED",
      reason: "Chargeback dispute opened",
    });
    expect(parsed.confirmHandle).toBeUndefined();
  });

  it("refuses a reason too short to review later", () => {
    expect(() =>
      setPlatformUserStatusInputSchema.parse({
        userId: "11111111-1111-4111-8111-111111111111",
        status: "SUSPENDED",
        reason: "spam",
      }),
    ).toThrow();
  });

  it("refuses an unknown field rather than dropping it", () => {
    // `.strict()` is what stops a typo'd `confirm_handle` being read as an
    // absent confirmation on a deletion.
    expect(() =>
      setPlatformUserStatusInputSchema.parse({
        userId: "11111111-1111-4111-8111-111111111111",
        status: "DELETED",
        reason: "Requested by the academy",
        confirm_handle: "kim@example.com",
      }),
    ).toThrow();
  });
});

describe("membership role mutation", () => {
  it("addresses a membership, never an account", () => {
    // §3.6: an account is not a student, it *holds* a membership that is one.
    const shape = setPlatformMembershipRoleInputSchema.shape;
    expect(shape.membershipId).toBeDefined();
    expect(() =>
      setPlatformMembershipRoleInputSchema.parse({
        userId: "11111111-1111-4111-8111-111111111111",
        role: "TEACHER",
        reason: "Promoted at the academy's request",
      }),
    ).toThrow();
  });
});
