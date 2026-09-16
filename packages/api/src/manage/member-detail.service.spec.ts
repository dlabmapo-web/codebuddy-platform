import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { TeamLeadOverviewRepository } from "../lead/team-lead-overview.repository.js";
import type { LeaderboardRepository } from "../points/leaderboard.repository.js";
import type { ProfileMediaService } from "../profile/profile-media.service.js";
import type { TeacherOverviewRepository } from "../teach/teacher-overview.repository.js";
import type { ManagerScopeService } from "./manager-scope.service.js";
import { MemberDetailService } from "./member-detail.service.js";

const academyId = "11111111-2222-4333-8444-555555555555";
const membershipId = "22222222-2222-4333-8444-555555555555";
const classId = "66666666-2222-4333-8444-555555555555";
const secondClassId = "88888888-2222-4333-8444-555555555555";
const courseId = "77777777-2222-4333-8444-555555555555";
const identity = { authUserId: "auth" } as SupabaseIdentity;

function studentRow(profile: Record<string, unknown> | null) {
  return {
    id: membershipId,
    userId: "33333333-2222-4333-8444-555555555555",
    status: "ACTIVE",
    joinedAt: new Date("2026-03-02T00:00:00Z"),
    user: {
      id: "33333333-2222-4333-8444-555555555555",
      displayName: "김지호",
      username: "kim-jh",
      email: "jiho@example.com",
      avatarUrl: null,
      avatarAsset: null,
    },
    memberProfile: null,
    studentProfile: profile,
    classEnrollments: [
      {
        class: {
          id: classId,
          name: "월수 파이썬",
          courseAssignments: [
            { course: { id: courseId, title: "파이썬 기초" } },
          ],
          assignedTeacher: {
            status: "ACTIVE",
            user: { displayName: "이선생", username: "lee" },
            memberProfile: null,
          },
        },
      },
      {
        // A second class teaching the same course — one course studied, in
        // two rooms. `class_courses` is keyed on the pair, so this is the
        // only way a duplicate can reach the page.
        class: {
          id: secondClassId,
          name: "금요일 파이썬",
          courseAssignments: [
            { course: { id: courseId, title: "파이썬 기초" } },
          ],
          assignedTeacher: null,
        },
      },
    ],
  };
}

const fullProfile = {
  studentNumber: "S-01",
  codingInterests: ["ALGORITHMS"],
  learningGoal: "파이썬을 잘하고 싶어요",
  guardianName: "김보호",
  guardianRelationship: "MOTHER",
  guardianPhone: "+821012345678",
  emergencyContactName: "김비상",
  emergencyContactPhone: "+821098765432",
};

/**
 * `canManageMembers` decides the withholding; `pointsOn` decides whether a
 * standing section exists at all. Everything else is held still so a test says
 * one thing.
 */
function build(options: {
  canManageMembers?: boolean;
  memberReader?: boolean;
  taughtClasses?: string[];
  pointsOn?: boolean;
  profile?: Record<string, unknown> | null;
} = {}) {
  const {
    canManageMembers = true,
    memberReader = true,
    taughtClasses = [],
    pointsOn = false,
    profile = fullProfile,
  } = options;

  const membershipFindFirst = vi.fn(
    async (_args: { select: Record<string, any> }) => studentRow(profile),
  );
  const prisma = {
    academyMembership: { findFirst: membershipFindFirst },
    class: {
      findMany: vi.fn(async () => taughtClasses.map((id) => ({ id }))),
    },
    academyFeatureFlag: {
      findFirst: vi.fn(async () => (pointsOn ? { academyId } : null)),
    },
    studentCourseLearningDay: {
      aggregate: vi.fn(async () => ({
        _sum: { activeSeconds: 3600 },
        _max: { lastActiveAt: new Date("2026-09-12T00:00:00Z") },
      })),
      groupBy: vi.fn(async () => [
        { courseId, _sum: { activeSeconds: 1800 } },
      ]),
    },
    classEnrollment: {
      groupBy: vi.fn(async () => [{ classId, _count: { _all: 12 } }]),
    },
  } as unknown as PrismaService;

  const scopes = {
    requireMemberReader: vi.fn(async () => {
      if (!memberReader) throw new Error("denied");
      return { academyId, userId: "actor", canManageMembers };
    }),
  } as unknown as ManagerScopeService;

  const media = {
    signMany: vi.fn(async () => []),
  } as unknown as ProfileMediaService;

  const leaderboard = {
    roster: vi.fn(async () => [
      { membershipId, displayName: "김지호" },
      { membershipId: "other", displayName: "박서준" },
    ]),
    totals: vi.fn(
      async () =>
        new Map([
          [membershipId, { points: 40, solvedProblems: 7 }],
          ["other", { points: 90, solvedProblems: 9 }],
        ]),
    ),
    activeDays: vi.fn(
      async () =>
        new Map([
          [membershipId, 3],
          ["other", 5],
        ]),
    ),
  } as unknown as LeaderboardRepository;

  const aggregateScope = vi.fn(async () => ({
    studentClasses: [],
    materialClasses: [],
  }));
  const lead = { aggregateScope } as unknown as TeamLeadOverviewRepository;

  const workByStudent = vi.fn(async (
    _scope: unknown,
    _period: { startAt: Date | null; endAt: Date },
  ) => [
    {
      userId: "33333333-2222-4333-8444-555555555555",
      submissions: 12,
      attemptedProblems: 9,
      solvedProblems: 7,
      scoreSum: 700,
      lastSubmissionAt: new Date("2026-09-10T00:00:00Z"),
    },
  ]);
  const overview = { workByStudent } as unknown as TeacherOverviewRepository;

  return {
    membershipFindFirst,
    classFindMany: prisma.class.findMany as unknown as ReturnType<typeof vi.fn>,
    aggregateScope,
    workByStudent,
    service: new MemberDetailService(
      prisma,
      scopes,
      media,
      leaderboard,
      lead,
      overview,
    ),
  };
}

describe("MemberDetailService.student", () => {
  it("gives a manager the guardian section", async () => {
    const { service } = build({ canManageMembers: true });

    const detail = await service.student(identity, { academyId, membershipId });

    expect(detail.viewer).toEqual({ canManageMembers: true });
    expect(detail.guardian).toMatchObject({
      guardianName: "김보호",
      emergencyContactPhone: "+821098765432",
    });
  });

  it("withholds the guardian section from a team lead, and does not read it", async () => {
    // The rule `studentAcademyProfileSchema` states. Absent, not nulled: a
    // page cannot draw a heading over a section that never arrived, which is
    // the whole point — a "Guardian —" heading would say this child has none.
    const { service, membershipFindFirst } = build({
      canManageMembers: false,
      profile: {
        studentNumber: "S-01",
        codingInterests: ["ALGORITHMS"],
        learningGoal: null,
      },
    });

    const detail = await service.student(identity, { academyId, membershipId });

    expect(detail).not.toHaveProperty("guardian");
    // The rest of the record still arrives — withholding is one section, not
    // a narrower page.
    expect(detail.identity.displayName).toBe("김지호");

    // Stronger than a narrowed select: the guardian pair is the only thing
    // this page reads off the student profile, so a reader who may not have it
    // does not touch the table at all.
    const select = membershipFindFirst.mock.calls[0]![0] as {
      select: Record<string, unknown>;
    };
    expect(select.select).not.toHaveProperty("studentProfile");
  });

  it("refuses somebody who neither reads members nor teaches them", async () => {
    const { service } = build({ memberReader: false, taughtClasses: [] });

    await expect(
      service.student(identity, { academyId, membershipId }),
    ).rejects.toThrow();
  });

  it("admits a teacher who teaches them, scoped to their own classes", async () => {
    const { service, membershipFindFirst } = build({
      memberReader: false,
      taughtClasses: [classId],
    });

    const detail = await service.student(identity, { academyId, membershipId });

    expect(detail.viewer).toEqual({ canManageMembers: false });
    expect(detail).not.toHaveProperty("guardian");

    // The class filter is what stops a teacher learning where else this
    // student studies.
    const select = membershipFindFirst.mock.calls[0]![0] as {
      select: {
        classEnrollments: { where: { class: { id?: { in: string[] } } } };
      };
    };
    expect(select.select.classEnrollments.where.class.id).toEqual({
      in: [classId],
    });
  });

  it("omits standing entirely when the academy does not run points", async () => {
    const { service } = build({ pointsOn: false });

    const detail = await service.student(identity, { academyId, membershipId });

    expect(detail).not.toHaveProperty("standing");
    // Work is not points, and survives without them.
    expect(detail.work).toMatchObject({ solvedProblems: 7, submissions: 12 });
  });

  it("ranks within the class, at the all-time period", async () => {
    const { service } = build({ pointsOn: true });

    const detail = await service.student(identity, { academyId, membershipId });

    // 40 against a classmate's 90 is second, not "40 points" with no context.
    // One standing per class: a student in two classes competes in two
    // cohorts, and collapsing them would invent a third nobody entered.
    expect(detail.standing).toEqual([
      { classId, className: "월수 파이썬", points: 40, position: 2 },
      {
        classId: secondClassId,
        className: "금요일 파이썬",
        points: 40,
        position: 2,
      },
    ]);
  });

  it("admits an assistant teacher, not only the homeroom one", async () => {
    // `taughtByWhere` is the predicate the roster resolves its scope through,
    // so an assistant sees these students listed. A detail page that asked
    // only about `assignedTeacher` would answer their row action with a
    // not-found — a link the same page had just drawn.
    const { service, classFindMany } = build({
      memberReader: false,
      taughtClasses: [classId],
    });

    await service.student(identity, { academyId, membershipId });

    const where = classFindMany.mock.calls[0]![0].where as {
      OR?: { assignedTeacher?: unknown; assistantTeachers?: unknown }[];
    };
    expect(where.OR).toHaveLength(2);
    expect(where.OR?.[0]).toHaveProperty("assignedTeacher");
    expect(where.OR?.[1]).toHaveProperty("assistantTeachers");
  });

  it("measures work over this academy, through the analytics unit", async () => {
    // `StudentExerciseProgress` has no academy column, so counting it gave a
    // student enrolled at two academies each other's totals — and a count the
    // analytics table beside it would not agree with.
    const { service, aggregateScope, workByStudent } = build();

    const detail = await service.student(identity, { academyId, membershipId });

    expect(aggregateScope).toHaveBeenCalledWith(academyId, { membershipId });
    // No start: the page's claim is lifetime, and the analytics view is the
    // one that narrows.
    expect(workByStudent.mock.calls[0]![1]).toMatchObject({ startAt: null });
    expect(detail.work).toMatchObject({ solvedProblems: 7, submissions: 12 });
  });

  it("lists the courses these classes teach, once each", async () => {
    // What a child is being taught is the frame every reader of this page is
    // asking their question inside. Two classes teaching one course is one
    // course being studied.
    const { service } = build();

    const detail = await service.student(identity, { academyId, membershipId });

    expect(detail.courses).toEqual([
      {
        courseId,
        title: "파이썬 기초",
        classNames: ["월수 파이썬", "금요일 파이썬"],
        activeSeconds: 1800,
      },
    ]);
    // The size of the room, which is what makes a position on the board above
    // mean anything.
    expect(detail.classes[0]).toMatchObject({ studentCount: 12 });
  });

  it("reports the later of the two clocks as last activity", async () => {
    // Reading without submitting is still activity. Reporting the last
    // submission would call a student idle who was working an hour ago.
    const { service } = build();

    const detail = await service.student(identity, { academyId, membershipId });

    expect(detail.work.lastActivityAt).toBe("2026-09-12T00:00:00.000Z");
  });
});
