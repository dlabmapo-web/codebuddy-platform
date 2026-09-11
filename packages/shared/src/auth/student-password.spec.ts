import { describe, expect, it } from "vitest";

import {
  generateIssuedPassword,
  studentPasswordProblem,
  studentPasswordSchema,
} from "./student-password.js";

describe("studentPasswordSchema", () => {
  it("accepts a password a child can remember", () => {
    expect(studentPasswordSchema.safeParse("minji1234").success).toBe(true);
    expect(studentPasswordSchema.safeParse("Cove!2026").success).toBe(true);
  });

  it("accepts what the suggest button generates", () => {
    expect(studentPasswordSchema.safeParse(generateIssuedPassword()).success).toBe(
      true,
    );
  });

  it.each([
    ["ㅡㅑㅜㅓㅑ1234", "bad_characters"],
    ["minji 1234", "bad_characters"],
    ["민지비밀번호123", "bad_characters"],
    ["abc1234", "too_short"],
    ["a".repeat(73), "too_long"],
  ] as const)("refuses %s as %s", (password, problem) => {
    expect(studentPasswordSchema.safeParse(password).success).toBe(false);
    expect(studentPasswordProblem(password)).toBe(problem);
  });

  it("reports an empty box as too short, not as bad characters", () => {
    expect(studentPasswordProblem("")).toBe("too_short");
  });
});
