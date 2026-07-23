import { describe, expect, it } from "vitest";

import {
  hashInvitationToken,
  normalizeEmail,
} from "./academy-invitation.service.js";

describe("academy invitation security helpers", () => {
  it("normalizes invited email addresses", () => {
    expect(normalizeEmail("  Student@Cove.Test ")).toBe("student@cove.test");
  });

  it("hashes tokens deterministically without retaining plaintext", () => {
    const token = "a".repeat(43);
    const hash = hashInvitationToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashInvitationToken(token));
    expect(hash).not.toContain(token);
  });
});
