import { describe, expect, it } from "vitest";

import {
  teacherRosterStudentSchema,
  type TeacherRosterStudent,
} from "./teacher-roster.js";

function student(
  overrides: Partial<TeacherRosterStudent> = {},
): TeacherRosterStudent {
  return {
    membershipId: "11111111-2222-4333-8444-555555555555",
    displayName: "김지호",
    username: "kim-jh",
    joinedAt: "2026-03-02T00:00:00.000Z",
    avatar: {
      academyImageUrl: null,
      globalImageUrl: null,
      externalAvatarUrl: null,
    },
    solvedProblems: 7,
    ...overrides,
  };
}

describe("teacherRosterStudentSchema", () => {
  it("accepts a student with no standing at all", () => {
    // The academy runs no points, or the class has no board. Either way the
    // fields are absent, and absent has to parse — it is the ordinary case for
    // an academy that does not keep score.
    const parsed = teacherRosterStudentSchema.parse(student());

    expect(parsed).not.toHaveProperty("points");
    expect(parsed).not.toHaveProperty("position");
    expect(parsed.solvedProblems).toBe(7);
  });

  it("rejects a position of zero, which no ranking produces", () => {
    expect(() =>
      teacherRosterStudentSchema.parse(student({ position: 0 })),
    ).toThrow();
  });

  it("keeps points and position through a round trip", () => {
    const parsed = teacherRosterStudentSchema.parse(
      student({ points: 240, position: 1 }),
    );

    expect(parsed.points).toBe(240);
    expect(parsed.position).toBe(1);
  });
});
