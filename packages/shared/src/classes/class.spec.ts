import { describe, expect, it } from "vitest";

import {
  addClassStudentsSchema,
  assignedTeacherDetailSchema,
  assignmentGrantsAccess,
  classDetailSchema,
  classSummarySchema,
  createClassSchema,
  eligibleTeacherSummarySchema,
  enrollmentGrantsAccess,
  setClassCoursesSchema,
  setClassTeacherSchema,
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

describe("setClassTeacherSchema", () => {
  it("accepts a membership id, which assigns or replaces", () => {
    expect(
      setClassTeacherSchema.parse({
        academyId,
        classId,
        teacherMembershipId: membershipId,
        expectedUpdatedAt: "2026-08-04T09:00:00.000Z",
      }).teacherMembershipId,
    ).toBe(membershipId);
  });

  it("accepts null, which removes the assignment", () => {
    expect(
      setClassTeacherSchema.parse({
        academyId,
        classId,
        teacherMembershipId: null,
        expectedUpdatedAt: "2026-08-04T09:00:00.000Z",
      }).teacherMembershipId,
    ).toBeNull();
  });

  it("distinguishes an omitted field from an explicit removal", () => {
    expect(
      setClassTeacherSchema.safeParse({
        academyId,
        classId,
        expectedUpdatedAt: "2026-08-04T09:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("requires a revision so two dialogs cannot overwrite each other", () => {
    expect(
      setClassTeacherSchema.safeParse({
        academyId,
        classId,
        teacherMembershipId: membershipId,
      }).success,
    ).toBe(false);
  });
});

describe("assigned teacher output", () => {
  const base = {
    id: classId,
    academyId,
    name: "Level 1 Evening",
    description: "",
    status: "ACTIVE" as const,
    courses: [],
    studentCount: 0,
    createdAt: "2026-08-04T09:00:00.000Z",
    updatedAt: "2026-08-04T09:00:00.000Z",
    archivedAt: null,
  };

  it("lets a class report no teacher at all", () => {
    expect(
      classSummarySchema.parse({ ...base, assignedTeacher: null })
        .assignedTeacher,
    ).toBeNull();
  });

  it("keeps the membership's current status and role on the summary", () => {
    const parsed = classSummarySchema.parse({
      ...base,
      assignedTeacher: {
        membershipId,
        userId: "55555555-5555-4555-8555-555555555555",
        displayName: "Ada",
        userStatus: "ACTIVE",
        // A stored assignment survives suspension, so the summary must be
        // able to carry a state that no longer grants access.
        membershipStatus: "SUSPENDED",
        role: "TEACHER",
      },
    });
    expect(parsed.assignedTeacher?.membershipStatus).toBe("SUSPENDED");
  });

  it("adds the email only on the detail shape", () => {
    expect(
      assignedTeacherDetailSchema.parse({
        membershipId,
        userId: "55555555-5555-4555-8555-555555555555",
        displayName: null,
        userStatus: "ACTIVE",
        membershipStatus: "ACTIVE",
        role: "TEACHER",
        email: "ada@example.com",
      }).email,
    ).toBe("ada@example.com");
    expect(
      classDetailSchema.safeParse({
        ...base,
        students: [],
        assignedTeacher: {
          membershipId,
          userId: "55555555-5555-4555-8555-555555555555",
          displayName: null,
          userStatus: "ACTIVE",
          membershipStatus: "ACTIVE",
          role: "TEACHER",
        },
      }).success,
    ).toBe(false);
  });

  it("keeps the eligible summary free of status and role", () => {
    const parsed = eligibleTeacherSummarySchema.parse({
      membershipId,
      userId: "55555555-5555-4555-8555-555555555555",
      displayName: "Ada",
      email: "ada@example.com",
      // A picker renders a face, so the three avatar sources travel with an
      // eligible summary like they do with every other person on the wire.
      academyImageUrl: null,
      globalImageUrl: null,
      externalAvatarUrl: null,
      membershipStatus: "ACTIVE",
    });
    expect(parsed).not.toHaveProperty("membershipStatus");
  });
});

describe("assignmentGrantsAccess", () => {
  it("grants only for an active teacher membership", () => {
    expect(
      assignmentGrantsAccess({
        userStatus: "ACTIVE",
        membershipStatus: "ACTIVE",
        role: "TEACHER",
      }),
    ).toBe(true);
  });

  it("stops granting once the membership is suspended or moved off TEACHER", () => {
    expect(
      assignmentGrantsAccess({
        userStatus: "ACTIVE",
        membershipStatus: "SUSPENDED",
        role: "TEACHER",
      }),
    ).toBe(false);
    expect(
      assignmentGrantsAccess({
        userStatus: "ACTIVE",
        membershipStatus: "ACTIVE",
        role: "TEAM_LEAD",
      }),
    ).toBe(false);
  });

  it("stops granting when the assigned user's account is suspended", () => {
    expect(
      assignmentGrantsAccess({
        userStatus: "SUSPENDED",
        membershipStatus: "ACTIVE",
        role: "TEACHER",
      }),
    ).toBe(false);
  });

  it("treats an unassigned class as granting nothing", () => {
    expect(assignmentGrantsAccess(null)).toBe(false);
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
