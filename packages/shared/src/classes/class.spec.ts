import { describe, expect, it } from "vitest";

import {
  addClassStudentsSchema,
  createClassSchema,
  enrollmentGrantsAccess,
  setClassCoursesSchema,
  updateClassSchema,
} from "./class.js";

const academyId = "11111111-1111-4111-8111-111111111111";
const classId = "22222222-2222-4222-8222-222222222222";
const courseId = "33333333-3333-4333-8333-333333333333";
const membershipId = "44444444-4444-4444-8444-444444444444";

describe("createClassSchema", () => {
  it("trims the name and defaults the description", () => {
    const parsed = createClassSchema.parse({
      academyId,
      name: "  Level 1 Evening  ",
    });
    expect(parsed.name).toBe("Level 1 Evening");
    expect(parsed.description).toBe("");
  });

  it("rejects a blank or whitespace-only name", () => {
    expect(createClassSchema.safeParse({ academyId, name: "   " }).success)
      .toBe(false);
  });

  it("rejects a name over 120 characters", () => {
    expect(
      createClassSchema.safeParse({ academyId, name: "a".repeat(121) }).success,
    ).toBe(false);
  });

  it("rejects a description over 2,000 characters", () => {
    expect(
      createClassSchema.safeParse({
        academyId,
        name: "Level 1",
        description: "a".repeat(2_001),
      }).success,
    ).toBe(false);
  });
});

describe("updateClassSchema", () => {
  it("requires a revision for optimistic concurrency", () => {
    const parsed = updateClassSchema.parse({
      academyId,
      classId,
      name: "Level 2",
      expectedUpdatedAt: "2026-08-03T09:00:00.000Z",
    });
    expect(parsed.expectedUpdatedAt).toBe("2026-08-03T09:00:00.000Z");
    expect(
      updateClassSchema.safeParse({ academyId, classId, name: "Level 2" })
        .success,
    ).toBe(false);
  });

  it("rejects a revision that is not a timestamp", () => {
    expect(
      updateClassSchema.safeParse({
        academyId,
        classId,
        name: "Level 2",
        expectedUpdatedAt: "yesterday",
      }).success,
    ).toBe(false);
  });
});

describe("setClassCoursesSchema", () => {
  it("accepts an empty set, which clears every assignment", () => {
    expect(
      setClassCoursesSchema.parse({
        academyId,
        classId,
        courseIds: [],
        expectedUpdatedAt: "2026-08-03T09:00:00.000Z",
      })
        .courseIds,
    ).toEqual([]);
  });

  it("accepts a batch of course ids", () => {
    expect(
      setClassCoursesSchema.parse({
        academyId,
        classId,
        courseIds: [courseId],
        expectedUpdatedAt: "2026-08-03T09:00:00.000Z",
      })
        .courseIds,
    ).toEqual([courseId]);
  });

  it("rejects a batch over the assignment limit", () => {
    expect(
      setClassCoursesSchema.safeParse({
        academyId,
        classId,
        courseIds: Array.from({ length: 101 }, () => courseId),
        expectedUpdatedAt: "2026-08-03T09:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("rejects a missing revision", () => {
    expect(
      setClassCoursesSchema.safeParse({ academyId, classId, courseIds: [] })
        .success,
    ).toBe(false);
  });
});

describe("addClassStudentsSchema", () => {
  it("requires at least one membership", () => {
    expect(
      addClassStudentsSchema.safeParse({ academyId, classId, membershipIds: [] })
        .success,
    ).toBe(false);
  });

  it("accepts a bounded batch", () => {
    expect(
      addClassStudentsSchema.parse({
        academyId,
        classId,
        membershipIds: [membershipId],
      }).membershipIds,
    ).toEqual([membershipId]);
  });
});

describe("enrollmentGrantsAccess", () => {
  it("grants only for an active student membership", () => {
    expect(
      enrollmentGrantsAccess({ membershipStatus: "ACTIVE", role: "STUDENT" }),
    ).toBe(true);
  });

  it("stops granting once the membership is suspended or promoted", () => {
    expect(
      enrollmentGrantsAccess({ membershipStatus: "SUSPENDED", role: "STUDENT" }),
    ).toBe(false);
    expect(
      enrollmentGrantsAccess({ membershipStatus: "ACTIVE", role: "TEACHER" }),
    ).toBe(false);
  });
});
