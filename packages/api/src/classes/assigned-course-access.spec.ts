import { describe, expect, it } from "vitest";

import { assignedCourseWhere, learningScopeFor } from "./assigned-course-access.js";

const academyId = "20000000-0000-4000-8000-000000000001";
const userId = "30000000-0000-4000-8000-000000000001";

describe("assignedCourseWhere", () => {
  it("requires every link in the chain at once", () => {
    const where = assignedCourseWhere(academyId, userId);

    expect(where).toEqual({
      academyId,
      classAssignments: {
        some: {
          class: {
            academyId,
            status: "ACTIVE",
            enrollments: {
              some: {
                membership: {
                  academyId,
                  userId,
                  status: "ACTIVE",
                  role: "STUDENT",
                },
              },
            },
          },
        },
      },
    });
  });

  it("scopes the class to the requested academy, not only the course", () => {
    const where = assignedCourseWhere(academyId, userId);
    const some = where.classAssignments?.some;

    // Both ends are pinned, so a class in academy B can never carry a course
    // of academy A into a student's catalog.
    expect(where.academyId).toBe(academyId);
    expect(some && "class" in some ? some.class?.academyId : null).toBe(academyId);
  });
});

describe("learningScopeFor", () => {
  it("gates a student on their class assignments", () => {
    const scope = learningScopeFor(academyId, { userId, role: "STUDENT" });

    expect(scope.course).toEqual(assignedCourseWhere(academyId, userId));
    expect(scope.material).toEqual({
      lecture: {
        courseModule: { course: assignedCourseWhere(academyId, userId) },
      },
    });
  });

  it("leaves staff preview on visibility rules alone", () => {
    for (const role of ["TEACHER", "TEAM_LEAD", "MANAGER"] as const) {
      const scope = learningScopeFor(academyId, { userId, role });
      expect(scope.course).toEqual({ academyId });
      expect(scope.material).toEqual({});
    }
  });
});
