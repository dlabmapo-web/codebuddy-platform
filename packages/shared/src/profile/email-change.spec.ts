import { describe, expect, it } from "vitest";
import { requestEmailChangeSchema } from "./profile.js";

describe("requestEmailChangeSchema", () => {
  it.each(["", "abcdef", "missing-at.example.com", "name@", "@example.com", "name @example.com", "name@example..com"])("rejects invalid email %s regardless of length", email => {
    expect(requestEmailChangeSchema.safeParse({ email }).success).toBe(false);
  });
  it("normalizes surrounding whitespace and casing", () => {
    expect(requestEmailChangeSchema.parse({ email: " Person+qa@Example.com " })).toEqual({ email: "person+qa@example.com" });
  });
});
