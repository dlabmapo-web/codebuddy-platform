import { describe, expect, it } from "vitest";

import { parseUsername, usernameSchema } from "./username.js";

describe("usernameSchema", () => {
  it("normalizes case and surrounding space", () => {
    expect(usernameSchema.parse("  MinSu01  ")).toBe("minsu01");
  });

  it.each(["minsu", "min.su", "min_su", "min-su", "a1234", "a".repeat(30)])(
    "accepts %s",
    (value) => {
      expect(usernameSchema.safeParse(value).success).toBe(true);
    },
  );

  it.each([
    ["min", "shorter than five characters"],
    ["a".repeat(31), "longer than thirty characters"],
    [".minsu", "leading separator"],
    ["minsu.", "trailing separator"],
    ["min su", "inner space"],
    ["min@su", "at sign"],
    ["민수학생", "non-ASCII"],
    ["", "empty"],
  ])("rejects %s (%s)", (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(false);
  });

  it.each(["admin", "ADMIN", "root", "support", "system"])(
    "rejects the reserved name %s",
    (value) => {
      expect(usernameSchema.safeParse(value).success).toBe(false);
    },
  );

  /**
   * Sign-in resolves an unknown username into an address, so a name that is
   * not a valid email local part would produce an address Supabase rejects
   * outright — and a rejection shaped differently from a wrong password is
   * exactly the signal this whole path is built to avoid emitting.
   */
  it("only accepts names that are valid email local parts", () => {
    const accepted = ["minsu01", "min.su", "min_su", "min-su"];
    for (const value of accepted) {
      expect(`${usernameSchema.parse(value)}@unresolved.invalid`).toMatch(
        /^[a-z0-9][a-z0-9_.-]*[a-z0-9]@unresolved\.invalid$/,
      );
    }
  });
});

describe("parseUsername", () => {
  it("normalizes a usable value", () => {
    expect(parseUsername("MinSu01")).toBe("minsu01");
  });

  it.each([[undefined], [null], [42], ["min"], ["admin"], [{}]])(
    "returns null for %s",
    (value) => {
      expect(parseUsername(value)).toBeNull();
    },
  );
});
