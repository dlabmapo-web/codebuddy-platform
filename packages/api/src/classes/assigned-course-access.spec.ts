import { describe, expect, it } from "vitest";

import {
  assignedCourseWhere,
  learningScopeFor,
  taughtCourseWhere,
} from "./assigned-course-access.js";

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

  it("gates a teacher on the classes they run", () => {
    const scope = learningScopeFor(academyId, { userId, role: "TEACHER" });

    // A teacher delivers their own classes, not the whole academy: a course
    // no class of theirs is given must not appear on their learning surface.
    expect(scope.course).toEqual(taughtCourseWhere(academyId, userId));
    expect(scope.material).toEqual({
      lecture: {
        courseModule: { course: taughtCourseWhere(academyId, userId) },
      },
    });
  });

  it("pins the teaching assignment to an active teacher of this academy", () => {
    const where = taughtCourseWhere(academyId, userId);
    const some = where.classAssignments?.some;
    const klass = some && "class" in some ? some.class : null;

    expect(where.academyId).toBe(academyId);
    expect(klass?.academyId).toBe(academyId);
    expect(klass?.status).toBe("ACTIVE");
    // A demoted or suspended teacher stops reaching the class through the
    // stale assignment, so the role and status are part of the join.
    expect(klass?.assignedTeacher).toEqual({
      academyId,
      userId,
      status: "ACTIVE",
      role: "TEACHER",
    });
  });

  it("leaves curriculum owners on visibility rules alone", () => {
    for (const role of ["TEAM_LEAD", "MANAGER"] as const) {
      const scope = learningScopeFor(academyId, { userId, role });
      expect(scope.course).toEqual({ academyId });
      expect(scope.material).toEqual({});
    }
  });
});
