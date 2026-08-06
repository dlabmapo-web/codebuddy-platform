import { describe, expect, it } from "vitest";

import {
  applyPresenceDelta,
  canOpenLiveWorkspace,
  collaborationPointerSchema,
  feedbackBodySchema,
  grantsLiveMonitoring,
  isAccessRevocation,
  isMonitorableStudent,
  listFeedbackInputSchema,
  monitoringLimits,
  monitoringTiming,
  normalizePointerPosition,
  presenceDeltaSchema,
  resolveLiveState,
  roleCanMonitor,
  shouldPersistLastSeen,
  type MonitoringClassFacts,
  type MonitoringTeacherFacts,
  type PresenceEntry,
  type PresenceSignals,
} from "./monitoring.js";

const academyId = "11111111-1111-4111-8111-111111111111";
const otherAcademyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const classId = "22222222-2222-4222-8222-222222222222";
const membershipId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";
const materialId = "55555555-5555-4555-8555-555555555555";

const activeClass: MonitoringClassFacts = {
  academyId,
  status: "ACTIVE",
  teacherMembershipId: membershipId,
};

const assignedTeacher: MonitoringTeacherFacts = {
  membershipId,
  academyId,
  userId,
  role: "TEACHER",
  membershipStatus: "ACTIVE",
  userStatus: "ACTIVE",
};

const session = { academyId, userId };

function accessInput(
  overrides: {
    class?: Partial<MonitoringClassFacts>;
    teacher?: Partial<MonitoringTeacherFacts> | null;
    session?: Partial<typeof session>;
  } = {},
) {
  return {
    class: { ...activeClass, ...overrides.class },
    teacher:
      overrides.teacher === null
        ? null
        : { ...assignedTeacher, ...overrides.teacher },
    session: { ...session, ...overrides.session },
  };
}

describe("roleCanMonitor", () => {
  it("accepts a teacher, who holds both monitoring permissions", () => {
    expect(roleCanMonitor("TEACHER")).toBe(true);
  });

  it("rejects a team lead even though they hold classes.assigned.manage", () => {
    expect(roleCanMonitor("TEAM_LEAD")).toBe(false);
  });

  it("rejects managers and students", () => {
    expect(roleCanMonitor("MANAGER")).toBe(false);
    expect(roleCanMonitor("STUDENT")).toBe(false);
  });
});

describe("grantsLiveMonitoring", () => {
  it("grants the current effective assigned teacher", () => {
    expect(grantsLiveMonitoring(accessInput())).toBe(true);
  });

  it("denies an archived class", () => {
    expect(grantsLiveMonitoring(accessInput({ class: { status: "ARCHIVED" } })))
      .toBe(false);
  });

  it("denies an unassigned class", () => {
    expect(
      grantsLiveMonitoring(accessInput({ class: { teacherMembershipId: null } })),
    ).toBe(false);
  });

  it("denies a teacher who is not the one assigned", () => {
    expect(
      grantsLiveMonitoring(
        accessInput({ teacher: { membershipId: "99999999-9999-4999-8999-999999999999" } }),
      ),
    ).toBe(false);
  });

  it("denies a membership from another academy", () => {
    expect(
      grantsLiveMonitoring(accessInput({ teacher: { academyId: otherAcademyId } })),
    ).toBe(false);
  });

  it("denies a session scoped to another academy", () => {
    expect(
      grantsLiveMonitoring(accessInput({ session: { academyId: otherAcademyId } })),
    ).toBe(false);
  });

  it("denies a session that does not own the assigned membership", () => {
    expect(
      grantsLiveMonitoring(
        accessInput({ session: { userId: "88888888-8888-4888-8888-888888888888" } }),
      ),
    ).toBe(false);
  });

  it("denies a suspended membership", () => {
    expect(
      grantsLiveMonitoring(accessInput({ teacher: { membershipStatus: "SUSPENDED" } })),
    ).toBe(false);
  });

  it("denies a suspended user behind an active membership", () => {
    expect(
      grantsLiveMonitoring(accessInput({ teacher: { userStatus: "SUSPENDED" } })),
    ).toBe(false);
  });

  it("denies a member moved off the teacher role while still assigned", () => {
    expect(grantsLiveMonitoring(accessInput({ teacher: { role: "TEAM_LEAD" } })))
      .toBe(false);
    expect(grantsLiveMonitoring(accessInput({ teacher: { role: "MANAGER" } })))
      .toBe(false);
  });

  it("denies a deleted assignment", () => {
    expect(grantsLiveMonitoring(accessInput({ teacher: null }))).toBe(false);
  });
});

describe("isMonitorableStudent", () => {
  const student = {
    membershipId: "66666666-6666-4666-8666-666666666666",
    academyId,
    role: "STUDENT" as const,
    membershipStatus: "ACTIVE" as const,
    userStatus: "ACTIVE" as const,
    isEnrolled: true,
  };

  it("accepts an active enrolled student of the class academy", () => {
    expect(isMonitorableStudent(student, academyId)).toBe(true);
  });

  it("rejects a removed enrollment", () => {
    expect(isMonitorableStudent({ ...student, isEnrolled: false }, academyId))
      .toBe(false);
  });

  it("rejects a suspended membership or user", () => {
    expect(
      isMonitorableStudent({ ...student, membershipStatus: "SUSPENDED" }, academyId),
    ).toBe(false);
    expect(isMonitorableStudent({ ...student, userStatus: "SUSPENDED" }, academyId))
      .toBe(false);
  });

  it("rejects a membership promoted out of the student role", () => {
    expect(isMonitorableStudent({ ...student, role: "TEACHER" }, academyId))
      .toBe(false);
  });

  it("rejects a membership from another academy", () => {
    expect(isMonitorableStudent({ ...student, academyId: otherAcademyId }, academyId))
      .toBe(false);
  });
});

describe("resolveLiveState", () => {
  const now = 1_700_000_000_000;
  const base: PresenceSignals = {
    connection: "CONNECTED",
    interruptedAt: null,
    materialId,
    visibility: "VISIBLE",
    lastActivityAt: now,
  };

  it("is offline without a connection", () => {
    expect(resolveLiveState({ ...base, connection: "NONE" }, now)).toBe("OFFLINE");
  });

  it("is reconnecting inside the recovery grace window", () => {
    const signals = {
      ...base,
      connection: "INTERRUPTED" as const,
      interruptedAt: now - monitoringTiming.recoveryGraceMs + 1,
    };
    expect(resolveLiveState(signals, now)).toBe("RECONNECTING");
  });

  it("is offline once the recovery grace window has passed", () => {
    const signals = {
      ...base,
      connection: "INTERRUPTED" as const,
      interruptedAt: now - monitoringTiming.recoveryGraceMs - 1,
    };
    expect(resolveLiveState(signals, now)).toBe("OFFLINE");
  });

  it("is online while connected outside an exercise", () => {
    expect(resolveLiveState({ ...base, materialId: null }, now)).toBe("ONLINE");
  });

  it("is online when the workspace is not the foreground document", () => {
    expect(resolveLiveState({ ...base, visibility: "HIDDEN" }, now)).toBe("ONLINE");
  });

  it("is solving with recent activity in a visible workspace", () => {
    expect(resolveLiveState(base, now)).toBe("SOLVING");
  });

  it("is idle after the idle threshold without activity", () => {
    const signals = {
      ...base,
      lastActivityAt: now - monitoringTiming.idleAfterMs - 1,
    };
    expect(resolveLiveState(signals, now)).toBe("IDLE");
  });

  it("never infers a connection from activity history alone", () => {
    const signals = { ...base, connection: "NONE" as const, lastActivityAt: now };
    expect(resolveLiveState(signals, now)).toBe("OFFLINE");
  });
});

describe("canOpenLiveWorkspace", () => {
  it("opens for a connected student inside an exercise", () => {
    expect(canOpenLiveWorkspace({ state: "ONLINE", materialId })).toBe(true);
    expect(canOpenLiveWorkspace({ state: "SOLVING", materialId })).toBe(true);
    expect(canOpenLiveWorkspace({ state: "IDLE", materialId })).toBe(true);
  });

  it("does not open without a current exercise", () => {
    expect(canOpenLiveWorkspace({ state: "ONLINE", materialId: null })).toBe(false);
    expect(canOpenLiveWorkspace({ state: "SOLVING", materialId: null })).toBe(false);
  });

  it("does not open for an offline or reconnecting student", () => {
    expect(canOpenLiveWorkspace({ state: "OFFLINE", materialId })).toBe(false);
    expect(canOpenLiveWorkspace({ state: "RECONNECTING", materialId })).toBe(false);
  });
});

describe("shouldPersistLastSeen", () => {
  const now = 1_700_000_000_000;

  it("writes the first time it is asked", () => {
    expect(shouldPersistLastSeen(null, now)).toBe(true);
  });

  it("skips a write inside the throttle window", () => {
    expect(shouldPersistLastSeen(now - 1_000, now)).toBe(false);
  });

  it("writes once the throttle window has elapsed", () => {
    expect(
      shouldPersistLastSeen(now - monitoringTiming.lastSeenPersistIntervalMs, now),
    ).toBe(true);
  });
});

describe("applyPresenceDelta", () => {
  const entry: PresenceEntry = {
    studentMembershipId: membershipId,
    state: "SOLVING",
    materialId,
    courseId: null,
    lastActivityAt: null,
    run: null,
    latestSubmissionId: null,
  };

  it("applies a delta that continues the known version", () => {
    const result = applyPresenceDelta(
      { version: 4, entries: [] },
      {
        classId,
        version: 5,
        previousVersion: 4,
        entry,
        onlineCount: 1,
        solvingCount: 1,
      },
    );
    expect(result).toEqual({ outcome: "applied", version: 5, entries: [entry] });
  });

  it("replaces the student's previous row rather than duplicating it", () => {
    const stale = { ...entry, state: "IDLE" as const };
    const result = applyPresenceDelta(
      { version: 5, entries: [stale] },
      {
        classId,
        version: 6,
        previousVersion: 5,
        entry,
        onlineCount: 1,
        solvingCount: 1,
      },
    );
    expect(result).toEqual({ outcome: "applied", version: 6, entries: [entry] });
  });

  it("reports a gap instead of guessing at the missed versions", () => {
    const result = applyPresenceDelta(
      { version: 4, entries: [] },
      {
        classId,
        version: 9,
        previousVersion: 8,
        entry,
        onlineCount: 1,
        solvingCount: 1,
      },
    );
    expect(result).toEqual({ outcome: "gap" });
  });

  it("drops a delta that arrived after a newer one", () => {
    const result = applyPresenceDelta(
      { version: 7, entries: [] },
      {
        classId,
        version: 6,
        previousVersion: 5,
        entry,
        onlineCount: 1,
        solvingCount: 1,
      },
    );
    expect(result).toEqual({ outcome: "stale" });
  });
});

describe("collaborationPointerSchema", () => {
  it("accepts a supported surface with normalized coordinates", () => {
    expect(
      collaborationPointerSchema.parse({ surface: "editor", x: 0.5, y: 1 }),
    ).toEqual({ surface: "editor", x: 0.5, y: 1 });
  });

  it("rejects an unsupported surface", () => {
    expect(
      collaborationPointerSchema.safeParse({ surface: "sidebar", x: 0, y: 0 })
        .success,
    ).toBe(false);
  });

  it("rejects raw viewport coordinates", () => {
    expect(
      collaborationPointerSchema.safeParse({ surface: "editor", x: 812, y: 344 })
        .success,
    ).toBe(false);
  });

  it("rejects non-finite coordinates", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(
        collaborationPointerSchema.safeParse({ surface: "editor", x: value, y: 0 })
          .success,
      ).toBe(false);
    }
  });

  it("has no field for a DOM selector or element text", () => {
    const parsed = collaborationPointerSchema.parse({
      surface: "editor",
      x: 0.1,
      y: 0.2,
      selector: "#code",
      text: "print(1)",
    });
    expect(parsed).toEqual({ surface: "editor", x: 0.1, y: 0.2 });
  });
});

describe("normalizePointerPosition", () => {
  it("clamps a position that left its surface mid-drag", () => {
    expect(normalizePointerPosition({ x: -0.4, y: 1.8 })).toEqual({ x: 0, y: 1 });
  });

  it("returns null for a non-finite measurement", () => {
    expect(normalizePointerPosition({ x: Number.NaN, y: 0.5 })).toBeNull();
  });
});

describe("feedbackBodySchema", () => {
  it("trims the message", () => {
    expect(feedbackBodySchema.parse("  try a loop  ")).toBe("try a loop");
  });

  it("rejects an empty or whitespace-only message", () => {
    expect(feedbackBodySchema.safeParse("   ").success).toBe(false);
  });

  it("rejects a message over the limit", () => {
    expect(
      feedbackBodySchema.safeParse("a".repeat(monitoringLimits.feedbackMaxLength + 1))
        .success,
    ).toBe(false);
  });
});

describe("listFeedbackInputSchema", () => {
  it("defaults to one bounded page", () => {
    const parsed = listFeedbackInputSchema.parse({
      academyId,
      classId,
      membershipId,
    });
    expect(parsed.limit).toBe(monitoringLimits.feedbackPageSize);
  });

  it("rejects a page larger than the bound", () => {
    expect(
      listFeedbackInputSchema.safeParse({
        academyId,
        classId,
        membershipId,
        limit: monitoringLimits.feedbackPageSize + 1,
      }).success,
    ).toBe(false);
  });
});

describe("presenceDeltaSchema", () => {
  it("has no field for source code or an email address", () => {
    const parsed = presenceDeltaSchema.parse({
      classId,
      version: 2,
      previousVersion: 1,
      onlineCount: 1,
      solvingCount: 1,
      entry: {
        studentMembershipId: membershipId,
        state: "SOLVING",
        materialId,
        courseId: null,
        lastActivityAt: null,
        stateExpiresAt: null,
        run: null,
        latestSubmissionId: null,
        code: "print(1)",
        email: "student@example.com",
      },
    });
    expect(parsed.entry).not.toHaveProperty("code");
    expect(parsed.entry).not.toHaveProperty("email");
  });
});

describe("isAccessRevocation", () => {
  it("treats every access change as a revocation", () => {
    expect(isAccessRevocation("ASSIGNMENT_CHANGED")).toBe(true);
    expect(isAccessRevocation("CLASS_ARCHIVED")).toBe(true);
    expect(isAccessRevocation("ROLE_CHANGED")).toBe(true);
    expect(isAccessRevocation("FEATURE_DISABLED")).toBe(true);
  });

  it("treats an ordinary end as an ordinary end", () => {
    expect(isAccessRevocation("TEACHER_LEFT")).toBe(false);
    expect(isAccessRevocation("STUDENT_LEFT")).toBe(false);
    expect(isAccessRevocation("WATCH_REPLACED")).toBe(false);
    expect(isAccessRevocation("CONNECTION_EXPIRED")).toBe(false);
  });
});
