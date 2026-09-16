import { TEACHER_ROSTER_MAX_STUDENTS } from "@cove/shared";
import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { LeaderboardRepository } from "../points/leaderboard.repository.js";
import type { ProfileMediaService } from "../profile/profile-media.service.js";
import type { TeacherOverviewAccessService } from "./teacher-overview-access.service.js";
import type { TeacherOverviewRepository } from "./teacher-overview.repository.js";
import { TeacherRosterService } from "./teacher-roster.service.js";

const academyId = "11111111-2222-4333-8444-555555555555";
const identity = { authUserId: "auth" } as SupabaseIdentity;

function uuid(seed: number, tag = "2222") {
  return `${String(seed).padStart(8, "0")}-${tag}-4333-8444-555555555555`;
}

type FakeClass = { classId: string; className: string; students: number };

/** A scope of `classes`, each holding that many generated students. */
function scopeOf(classes: readonly FakeClass[]) {
  const built = classes.map((entry, classIndex) => ({
    classId: entry.classId,
    className: entry.className,
    students: Array.from({ length: entry.students }, (_, index) => ({
      membershipId: uuid(classIndex * 1000 + index, "1111"),
      userId: uuid(classIndex * 1000 + index, "3333"),
      displayName: `학생 ${classIndex}-${index}`,
      classIds: [entry.classId],
    })),
    exercises: [{ materialId: uuid(1, "4444"), courseId: uuid(1, "5555") }],
  }));

  const students = built.flatMap((entry) => entry.students);
  return {
    actor: { academyId },
    timeZone: "Asia/Seoul",
    classes: built,
    classOptions: built.map((entry) => ({
      value: entry.classId,
      label: entry.className,
    })),
    students,
    userIds: students.map((student) => student.userId),
    membershipIds: students.map((student) => student.membershipId),
    materialIds: [uuid(1, "4444")],
  };
}

function build(options: {
  classes: readonly FakeClass[];
  pointsOn?: boolean;
  /** Make every board read throw, as a failing aggregate does. */
  boardFails?: boolean;
}) {
  const scope = scopeOf(options.classes);

  const access = {
    requireScope: vi.fn(async () => scope),
  } as unknown as TeacherOverviewAccessService;

  const prisma = {
    academyMembership: {
      findMany: vi.fn(async () =>
        scope.students.map((student) => ({
          id: student.membershipId,
          joinedAt: new Date("2026-03-02T00:00:00Z"),
          user: {
            displayName: student.displayName,
            username: `u-${student.membershipId.slice(0, 8)}`,
            avatarUrl: null,
            avatarAsset: null,
          },
          memberProfile: null,
        })),
      ),
    },
    academyFeatureFlag: {
      findFirst: vi.fn(async () => (options.pointsOn ? { academyId } : null)),
    },
  } as unknown as PrismaService;

  const media = {
    signMany: vi.fn(async () => []),
  } as unknown as ProfileMediaService;

  const leaderboard = {
    roster: vi.fn(async (classId: string) => {
      if (options.boardFails) throw new Error("board unavailable");
      const entry = scope.classes.find((row) => row.classId === classId);
      return (entry?.students ?? []).map((student) => ({
        membershipId: student.membershipId,
      }));
    }),
    totals: vi.fn(async () => new Map()),
    activeDays: vi.fn(async () => new Map()),
  } as unknown as LeaderboardRepository;

  const workByStudent = vi.fn(async (
    _scope: unknown,
    _period: { startAt: Date | null; endAt: Date },
  ) =>
    scope.students.map((student) => ({
      userId: student.userId,
      submissions: 4,
      attemptedProblems: 3,
      solvedProblems: 3,
      scoreSum: 300,
      lastSubmissionAt: new Date("2026-09-10T00:00:00Z"),
    })),
  );
  const overview = { workByStudent } as unknown as TeacherOverviewRepository;

  return {
    workByStudent,
    service: new TeacherRosterService(
      access,
      prisma,
      media,
      leaderboard,
      overview,
    ),
  };
}

const oneClass = [{ classId: uuid(9), className: "월수 파이썬", students: 3 }];

describe("TeacherRosterService.list", () => {
  it("survives a board that cannot be read, and says so per class", async () => {
    // §4.5 — a failing aggregate costs the teacher two columns in one class,
    // not the page. Before this, the throw escaped `list` and the roster was
    // replaced by an error state.
    const { service } = build({
      classes: [
        ...oneClass,
        { classId: uuid(10), className: "화목 자바", students: 2 },
      ],
      pointsOn: true,
      boardFails: true,
    });

    const roster = await service.list(identity, { academyId });

    expect(roster.classes).toHaveLength(2);
    expect(roster.classes[0]!.students).toHaveLength(3);
    for (const entry of roster.classes) {
      expect(entry.board).toEqual({ ranked: false, reason: "UNAVAILABLE" });
      // Points are what the board carries; the roster's own columns stay.
      expect(entry.students.every((row) => row.points === undefined)).toBe(true);
      expect(entry.students.every((row) => row.solvedProblems === 3)).toBe(true);
    }
  });

  it("omits the board entirely when the academy runs no points", async () => {
    // Every reason the union carries is a claim about a board. An academy
    // that keeps no score has none for `NO_ACTIVITY_YET` to be false about.
    const { service } = build({ classes: oneClass, pointsOn: false });

    const roster = await service.list(identity, { academyId });

    expect(roster.pointsEnabled).toBe(false);
    expect(roster.classes[0]).not.toHaveProperty("board");
    expect(roster.classes[0]!.students).toHaveLength(3);
  });

  it("reports a roster of exactly the cap as complete", async () => {
    // Reaching the cap drops nobody. Counting down to zero and calling that
    // truncation asked the teacher to narrow a list that was already whole.
    const { service } = build({
      classes: [
        {
          classId: uuid(11),
          className: "가득 찬 반",
          students: TEACHER_ROSTER_MAX_STUDENTS,
        },
      ],
    });

    const roster = await service.list(identity, { academyId });

    expect(roster.truncated).toBe(false);
    expect(roster.classes[0]!.students).toHaveLength(
      TEACHER_ROSTER_MAX_STUDENTS,
    );
  });

  it("truncates past the cap, and leaves out the classes it never reached", async () => {
    // A class drawn with an empty student list reads as a class with no
    // students, which is a claim about the class. The true claim is that the
    // roster stopped before reaching it, and `truncated` makes it.
    const { service } = build({
      classes: [
        {
          classId: uuid(12),
          className: "첫 반",
          students: TEACHER_ROSTER_MAX_STUDENTS,
        },
        { classId: uuid(13), className: "둘째 반", students: 4 },
      ],
    });

    const roster = await service.list(identity, { academyId });

    expect(roster.truncated).toBe(true);
    expect(roster.classes).toHaveLength(1);
    expect(roster.classes[0]!.name).toBe("첫 반");
  });

  it("measures solved problems through the analytics unit, at no start", async () => {
    // §4.2 — the same unit `student-facts` measures with, so a solved count
    // here and the same count in Analytics view cannot disagree.
    const { service, workByStudent } = build({ classes: oneClass });

    await service.list(identity, { academyId });

    expect(workByStudent).toHaveBeenCalledTimes(1);
    expect(workByStudent.mock.calls[0]![1]).toMatchObject({ startAt: null });
  });
});
