import { describe, expect, it } from "vitest";

import {
  createAcademyJoinRequestSchema,
  reviewAcademyJoinRequestSchema,
} from "../index.js";

describe("academy onboarding contracts", () => {
  it("does not accept a role from a student join request", () => {
    const parsed = createAcademyJoinRequestSchema.parse({
      academyId: "20000000-0000-4000-8000-000000000001",
      role: "MANAGER",
    });
    expect(parsed).toEqual({
      academyId: "20000000-0000-4000-8000-000000000001",
    });
  });

  it("requires managers to explicitly select an approval role", () => {
    expect(reviewAcademyJoinRequestSchema.safeParse({
      academyId: "20000000-0000-4000-8000-000000000001",
      requestId: "50000000-0000-4000-8000-000000000001",
      decision: "APPROVE",
    }).success).toBe(false);
    expect(reviewAcademyJoinRequestSchema.safeParse({
      academyId: "20000000-0000-4000-8000-000000000001",
      requestId: "50000000-0000-4000-8000-000000000001",
      decision: "APPROVE",
      role: "STUDENT",
    }).success).toBe(true);
  });
});
