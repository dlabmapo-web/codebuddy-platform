import type { AcademyRole } from "@cove/shared";
import { learnClassDetailSchema, learnClassSummarySchema } from "@cove/shared";
import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { AcademyAccessService } from "../authorization/academy-access.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import { CurriculumOutlineService } from "./curriculum-outline.service.js";
import { LearnClassService } from "./learn-class.service.js";
import { LearnService } from "./learn.service.js";
import type { LearningClassContextService } from "./learning-class-context.service.js";
import type { SubmissionService } from "./submission.service.js";
import { ProfileMediaService } from "../profile/profile-media.service.js";

const identity: SupabaseIdentity = {
  authUserId: "10000000-0000-4000-8000-000000000001",
  email: "student@example.com",
  emailIsPlaceholder: false,
  emailVerified: true,
  username: null,
  displayName: "Student",
  avatarUrl: null,
  provider: null,
  requestedAcademyId: null,
};
const academyId = "20000000-0000-4000-8000-000000000001";
const otherAcademyId = "20000000-0000-4000-8000-000000000002";
const userId = "30000000-0000-4000-8000-000000000001";
const courseId = "40000000-0000-4000-8000-000000000001";
const classId = "a0000000-0000-4000-8000-000000000001";
const secondClassId = "a0000000-0000-4000-8000-000000000002";
const at = new Date("2026-08-11T00:00:00Z");

function exerciseMaterial(id: string, position: number, isVisible = true) {
  return {
    id,
    lectureId: "60000000-0000-4000-8000-000000000001",
    type: "PROGRAMMING_EXERCISE",
    title: `Problem ${position}`,
    position,
    isRequired: true,
    isVisible,
    createdAt: at,
    updatedAt: at,
    programmingExercise: { materialId: id, difficulty: "EASY" },
  };
}

/** One visible course with two visible exercises, as the catalog reads it. */
function visibleCourse(overrides: { id?: string; materials?: unknown[] } = {}) {
  const id = overrides.id ?? courseId;
  return {
    id,
    academyId,
    title: "Python Foundations",
    description: "Start here.",
    isVisible: true,
    createdByUserId: userId,
    createdAt: at,
    updatedAt: at,
    modules: [
      {
        id: "50000000-0000-4000-8000-000000000001",
        courseId: id,
        title: "Basics",
        description: "",
        position: 1,
        isVisible: true,
        createdAt: at,
        updatedAt: at,
        lectures: [
          {
            id: "60000000-0000-4000-8000-000000000001",
            courseModuleId: "50000000-0000-4000-8000-000000000001",
            title: "Addition",
            description: "",
            position: 1,
            isVisible: true,
            createdAt: at,
            updatedAt: at,
            materials: overrides.materials ?? [
              exerciseMaterial("70000000-0000-4000-8000-000000000001", 1),
              exerciseMaterial("70000000-0000-4000-8000-000000000002", 2),
            ],
          },
        ],
      },
    ],
  };
}

/** Visible, but every exercise beneath it is hidden — nothing to open. */
function emptyCourse() {
  return visibleCourse({
    id: "40000000-0000-4000-8000-000000000009",
    materials: [],
  });
}

function activeTeacher(overrides: Record<string, unknown> = {}) {
  return {
    academyId,
    status: "ACTIVE",
    role: "TEACHER",
    memberProfile: null,
    user: {
      status: "ACTIVE",
      displayName: "Kim Minji",
      avatarUrl: null,
      avatarAsset: null,
    },
    ...overrides,
  };
}

/** Signs nothing, which is the state every teacher fixture here is in. */
const media = {
  signMany: vi.fn().mockResolvedValue([]),
} as unknown as ProfileMediaService;

function studentClass(overrides: Record<string, unknown> = {}) {
  return {
    id: classId,
    name: "Algorithms A",
    description: "Weekly problem solving.",
    assignedTeacher: activeTeacher(),
    courseAssignments: [{ course: visibleCourse() }],
    ...overrides,
  };
}

function createService(options?: {
  classes?: unknown[];
  detail?: unknown | null;
  role?: AcademyRole;
  progress?: Array<{ materialId: string; status: string; bestScore: number }>;
  drafts?: Array<{ materialId: string }>;
  media?: ProfileMediaService;
}) {
  const prisma = {
    class: {
      findMany: vi.fn().mockResolvedValue(options?.classes ?? [studentClass()]),
      findFirst: vi
        .fn()
        .mockResolvedValue(
          options?.detail === undefined ? studentClass() : options.detail,
        ),
    },
    course: {
      findMany: vi.fn().mockResolvedValue([visibleCourse()]),
      findFirst: vi.fn().mockResolvedValue(visibleCourse()),
    },
    exerciseDraft: { findMany: vi.fn().mockResolvedValue(options?.drafts ?? []) },
    studentExerciseProgress: {
      findMany: vi.fn().mockResolvedValue(options?.progress ?? []),
    },
    submission: { findMany: vi.fn() },
  } as unknown as PrismaService;
  const access = {
    requirePermission: vi.fn().mockResolvedValue({
      userId,
      academyId,
      role: options?.role ?? "STUDENT",
    }),
  } as unknown as AcademyAccessService;
  const curriculum = new CurriculumOutlineService(prisma);
  return {
    prisma,
    service: new LearnClassService(
      prisma,
      access,
      curriculum,
      options?.media ?? media,
    ),
    courses: new LearnService(
      prisma,
      access,
      curriculum,
      { findSelected: vi.fn().mockResolvedValue(null) } as unknown as SubmissionService,
      {
        resolve: vi.fn().mockResolvedValue({
          membershipId: userId,
          classId,
          classes: [{ classId, name: "Algorithms A" }],
        }),
      } as unknown as LearningClassContextService,
    ),
  };
}

describe("LearnClassService list", () => {
  it("returns the classes the requester is enrolled in, ordered by name", async () => {
    const { service, prisma } = createService({
      classes: [
        studentClass(),
        studentClass({ id: secondClassId, name: "Algorithms B" }),
      ],
    });

    const { classes } = await service.listClasses(identity, academyId);

    expect(classes.map((item) => item.classId)).toEqual([classId, secondClassId]);
    expect(prisma.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ name: "asc" }, { id: "asc" }] }),
    );
  });

  // Archived classes, other academies' classes, and classes the requester has
  // no seat in are all excluded by the query rather than filtered afterwards.
  it("selects only active classes enrolled through this active student membership", async () => {
    const { service, prisma } = createService();

    await service.listClasses(identity, academyId);

    expect(prisma.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
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
      }),
    );
  });

  it("asks only for visible courses of this academy", async () => {
    const { service, prisma } = createService();

    await service.listClasses(identity, academyId);

    expect(prisma.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          courseAssignments: expect.objectContaining({
            where: { course: { academyId, isVisible: true } },
          }),
        }),
      }),
    );
  });

  it("keeps an accessible class that has no available courses", async () => {
    const { service } = createService({
      classes: [studentClass({ courseAssignments: [] })],
    });

    const { classes } = await service.listClasses(identity, academyId);

    expect(classes).toHaveLength(1);
    expect(classes[0]!.availableCourseCount).toBe(0);
  });

  /**
   * Counted, not hidden. A course whose curriculum is entirely hidden is the
   * academy's mistake to fix, and a student who was told they have it must be
   * able to find it — reading "no problems yet" rather than finding nothing and
   * no explanation anywhere.
   */
  it("counts an assigned course whose curriculum holds no visible exercise", async () => {
    const { service } = createService({
      classes: [
        studentClass({
          courseAssignments: [
            { course: visibleCourse() },
            { course: emptyCourse() },
          ],
        }),
      ],
    });

    const { classes } = await service.listClasses(identity, academyId);

    expect(classes[0]!.availableCourseCount).toBe(2);
  });

  it("refuses a staff member previewing the curriculum", async () => {
    const { service } = createService({ role: "TEAM_LEAD" });

    await expect(service.listClasses(identity, academyId)).rejects.toMatchObject(
      { code: "PERMISSION_DENIED" },
    );
  });

  it("emits summaries the student-safe schema accepts", async () => {
    const { service } = createService();

    const { classes } = await service.listClasses(identity, academyId);

    // `.strict()` means a roster, membership id, or timestamp that reached the
    // projection would fail here rather than be silently dropped.
    expect(learnClassSummarySchema.parse(classes[0])).toEqual(classes[0]);
  });
});

describe("LearnClassService detail", () => {
  it("composes the whole accessible-class predicate into the query", async () => {
    const { service, prisma } = createService();

    await service.getClass(identity, { academyId, classId });

    expect(prisma.class.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: classId,
          academyId,
          status: "ACTIVE",
          enrollments: expect.anything(),
        }),
      }),
    );
  });

  it.each([
    ["a nonexistent class", null],
    ["an archived class", null],
    ["a class in another academy", null],
    ["a class with no enrollment for this student", null],
  ])("returns the same not-found for %s", async (_label, detail) => {
    const { service } = createService({ detail });

    await expect(
      service.getClass(identity, { academyId, classId }),
    ).rejects.toMatchObject({ code: "CLASS_NOT_FOUND" });
  });

  it("sends the assigned teacher's photo, signed once for the whole page", async () => {
    const signMany = vi
      .fn()
      .mockResolvedValue([{ assetId: "asset-1", url: "https://signed/photo" }]);
    const { service } = createService({
      detail: studentClass({
        assignedTeacher: activeTeacher({
          memberProfile: {
            avatarAsset: { id: "asset-1", bucket: "b", objectKey: "k" },
          },
        }),
      }),
      media: { signMany } as unknown as ProfileMediaService,
    });

    const detail = await service.getClass(identity, { academyId, classId });

    expect(detail.teacher?.academyImageUrl).toBe("https://signed/photo");
    expect(signMany).toHaveBeenCalledTimes(1);
  });

  it("signs nothing for a teacher the student may not be told about", async () => {
    // A suspended teacher is reported as no teacher at all, so producing a
    // signed URL for their photo would be work done to leak a face.
    const signMany = vi.fn().mockResolvedValue([]);
    const { service } = createService({
      detail: studentClass({
        assignedTeacher: activeTeacher({
          status: "SUSPENDED",
          memberProfile: {
            avatarAsset: { id: "asset-1", bucket: "b", objectKey: "k" },
          },
        }),
      }),
      media: { signMany } as unknown as ProfileMediaService,
    });

    const detail = await service.getClass(identity, { academyId, classId });

    expect(detail.teacher).toBeNull();
    expect(signMany).not.toHaveBeenCalled();
  });

  it("names an active assigned teacher", async () => {
    const { service } = createService();

    const detail = await service.getClass(identity, { academyId, classId });

    expect(detail.teacher).toEqual({
      displayName: "Kim Minji",
      academyImageUrl: null,
      globalImageUrl: null,
      externalAvatarUrl: null,
    });
  });

  it.each([
    ["no assignment", null],
    ["a suspended membership", { ...activeTeacher(), status: "SUSPENDED" }],
    ["a membership that is no longer a teacher", { ...activeTeacher(), role: "STUDENT" }],
    ["a membership in another academy", { ...activeTeacher(), academyId: otherAcademyId }],
    [
      "an inactive user account",
      { ...activeTeacher(), user: { status: "SUSPENDED", displayName: "Kim" } },
    ],
    [
      "a blank display name",
      { ...activeTeacher(), user: { status: "ACTIVE", displayName: "   " } },
    ],
    [
      "a missing display name",
      { ...activeTeacher(), user: { status: "ACTIVE", displayName: null } },
    ],
  ])("reports no teacher for %s", async (_label, assignedTeacher) => {
    const { service } = createService({
      detail: studentClass({ assignedTeacher }),
    });

    const detail = await service.getClass(identity, { academyId, classId });

    expect(detail.teacher).toBeNull();
  });

  it("lists an empty course with zero counts rather than dropping it", async () => {
    const { service } = createService({
      detail: studentClass({
        courseAssignments: [
          { course: visibleCourse() },
          { course: emptyCourse() },
        ],
      }),
    });

    const detail = await service.getClass(identity, { academyId, classId });

    expect(detail.courses.map((course) => course.courseId)).toEqual([
      courseId,
      "40000000-0000-4000-8000-000000000009",
    ]);
    expect(detail.availableCourseCount).toBe(detail.courses.length);
    // Zero is what the card reads as "not ready yet", and what the outline
    // behind it already explains.
    expect(detail.courses[1]!.counts).toMatchObject({
      modules: 0,
      lectures: 0,
      exercises: 0,
    });
  });

  it("stays useful when the class has no available courses", async () => {
    const { service } = createService({
      detail: studentClass({ courseAssignments: [] }),
    });

    const detail = await service.getClass(identity, { academyId, classId });

    expect(detail).toMatchObject({ name: "Algorithms A", courses: [] });
  });

  it("reads progress from the aggregate rows, never from submissions", async () => {
    const { service, prisma } = createService({
      progress: [
        {
          materialId: "70000000-0000-4000-8000-000000000001",
          status: "SOLVED",
          bestScore: 100,
        },
      ],
    });

    const detail = await service.getClass(identity, { academyId, classId });

    expect(detail.courses[0]!.progress).toEqual({
      total: 2,
      started: 1,
      solved: 1,
    });
    expect(prisma.submission.findMany).not.toHaveBeenCalled();
  });

  it("reports the same course summary My Courses does", async () => {
    const { service, courses } = createService({
      drafts: [{ materialId: "70000000-0000-4000-8000-000000000002" }],
    });

    const detail = await service.getClass(identity, { academyId, classId });
    const catalog = await courses.listCourses(identity, academyId);

    expect(detail.courses).toEqual(catalog.courses);
  });

  it("refuses a staff member previewing the curriculum", async () => {
    const { service } = createService({ role: "MANAGER" });

    await expect(
      service.getClass(identity, { academyId, classId }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("emits a detail the student-safe schema accepts", async () => {
    const { service } = createService();

    const detail = await service.getClass(identity, { academyId, classId });

    expect(learnClassDetailSchema.parse(detail)).toEqual(detail);
  });
});
