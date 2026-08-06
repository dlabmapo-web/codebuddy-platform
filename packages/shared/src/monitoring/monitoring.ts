import { z } from "zod";

import {
  roleHasPermission,
  type AcademyPermission,
  type AcademyRole,
} from "../auth/roles.js";
import { userStatusSchema, type UserStatus } from "../auth/session.js";
import {
  membershipStatusSchema,
  type MembershipStatus,
} from "../memberships/status.js";
import { classStatusSchema, type ClassStatus } from "../classes/class.js";
import { learnExerciseSchema } from "../content/learn.js";

/**
 * Live teacher monitoring: the domain a class-scoped monitoring session is
 * expressed in.
 *
 * Nothing here depends on a socket, a route, or a database row. The gateway,
 * the oRPC endpoints, and the web client all read the same states, limits, and
 * predicates from this module so a rule cannot hold in one of the three and
 * quietly differ in the other two.
 */

/* ------------------------------------------------------------ feature flag */

/**
 * Per-academy rollout switches. An enum rather than a free string so a typo
 * cannot silently read as "off" for every academy.
 */
export const academyFeatures = ["TEACHER_LIVE_MONITORING"] as const;
export const academyFeatureSchema = z.enum(academyFeatures);
export type AcademyFeature = z.infer<typeof academyFeatureSchema>;

/* ------------------------------------------------------------- live states */

/**
 * What a teacher may be told about one student's connection.
 *
 * `OFFLINE` is the absence of a recoverable connection, never a database
 * timestamp: a `lastLearningSeenAt` from four minutes ago is history, and
 * reading presence off it is how v1 reported ghosts as online.
 */
export const monitoringLiveStates = [
  "ONLINE",
  "SOLVING",
  "IDLE",
  "RECONNECTING",
  "OFFLINE",
] as const;
export const monitoringLiveStateSchema = z.enum(monitoringLiveStates);
export type MonitoringLiveState = z.infer<typeof monitoringLiveStateSchema>;

/** Whether the student's exercise workspace is the foreground document. */
export const workspaceVisibilities = ["VISIBLE", "HIDDEN"] as const;
export const workspaceVisibilitySchema = z.enum(workspaceVisibilities);
export type WorkspaceVisibility = z.infer<typeof workspaceVisibilitySchema>;

/**
 * The server's own view of the socket, not something a client asserts.
 * `INTERRUPTED` is the recovery window between a lost transport and the
 * decision to call the student offline.
 */
export const presenceConnectionStates = [
  "CONNECTED",
  "INTERRUPTED",
  "NONE",
] as const;
export const presenceConnectionStateSchema = z.enum(presenceConnectionStates);
export type PresenceConnectionState = z.infer<
  typeof presenceConnectionStateSchema
>;

/* --------------------------------------------------------------- timing */

/**
 * Product defaults, named once. Scattering these as component constants is how
 * a client ends up calling a student idle two seconds before the server does
 * and rendering a state the roster never sent.
 */
export const monitoringTiming = {
  /** Upper bound on pointer publication per participant. */
  pointerIntervalMs: 80,
  /** Cursor awareness is coalesced at least this far apart. */
  cursorIntervalMs: 50,
  /** Student heartbeat while a learning connection is open. */
  presenceHeartbeatMs: 15_000,
  /** No editor, run, pointer, or navigation activity for this long is idle. */
  idleAfterMs: 60_000,
  /** How long an interrupted connection reads as reconnecting, not offline. */
  recoveryGraceMs: 30_000,
  /** Floor between two `lastLearningSeenAt` writes for one enrollment. */
  lastSeenPersistIntervalMs: 60_000,
  /** Debounce before a document's Yjs state and draft code are persisted. */
  documentFlushDebounceMs: 1_000,
  /** A remote pointer disappears this long after it last moved. */
  pointerExpiryMs: 3_000,
  /**
   * Upper bound on how long a terminal line may wait for company.
   *
   * A mirrored terminal is read as it is typed, so the ceiling is a person's
   * perception rather than a network budget: one batch per frame keeps the
   * teacher within a blink of the student without one message per `print`.
   */
  terminalBatchMaxDelayMs: 80,
  /** How long a granted access claim is trusted before it is re-queried. */
  accessClaimTtlMs: 60_000,
} as const;

/* ---------------------------------------------------------------- limits */

export const monitoringLimits = {
  /** One binary Yjs update. A larger reconciliation resynchronizes instead. */
  documentUpdateMaxBytes: 65_536,
  /** A Yjs state vector is tiny; anything larger is not one. */
  stateVectorMaxBytes: 8_192,
  feedbackMinLength: 1,
  feedbackMaxLength: 2_000,
  feedbackPageSize: 50,
  /** The supported class size, which bounds one presence snapshot. */
  rosterMaxEnrollments: 200,
  /** A teacher watches one student. A second tab replaces the first watch. */
  watchedStudentsPerTeacher: 1,
  /** Bounded stdout/stderr echoed from a student's local sample run. */
  runOutputMaxLength: 4_000,
  /** Roster search input, bounded before it reaches a query. */
  rosterSearchMaxLength: 120,
  /**
   * The mirrored terminal budget, in UTF-8 bytes.
   *
   * Deliberately the student runner's own output ceiling: the two sides append
   * through the same reducer, so an identical budget is what makes them stop at
   * an identical line rather than at two different ones.
   */
  terminalTranscriptMaxBytes: 512 * 1_024,
  /** One terminal delta on the wire. A full batch flushes early instead. */
  terminalDeltaMaxBytes: 16 * 1_024,
  /** One terminal line, before it is split at a code-point boundary. */
  terminalLineMaxBytes: 8 * 1_024,
  /** Lines in one delta. The byte budget above is the binding limit. */
  terminalLinesPerDelta: 256,
  /**
   * Lines one transcript may hold. Adjacent lines of the same kind coalesce,
   * so this is reached only by output that genuinely alternates that often.
   */
  terminalTranscriptMaxLines: 4_000,
  /** A single run cannot legitimately produce more numbered events than this. */
  terminalMaxSequence: 1_000_000,
} as const;

/* -------------------------------------------------------------- surfaces */

/**
 * The only places a pointer may be reported.
 *
 * Semantic surfaces, not DOM coordinates: the teacher's viewport, panel
 * layout, and zoom are their own, and a raw pixel pair from one browser means
 * nothing in the other. A surface the peer does not currently show degrades to
 * an activity indicator rather than opening panels or moving their scroll.
 */
export const collaborationSurfaces = [
  "header",
  "curriculum",
  "statement",
  "editor",
  "terminal",
  "feedback",
] as const;
export const collaborationSurfaceSchema = z.enum(collaborationSurfaces);
export type CollaborationSurface = z.infer<typeof collaborationSurfaceSchema>;

/**
 * Normalized to the surface's own box. The bounds reject `NaN` and both
 * infinities as a side effect, so no separate finiteness check is needed.
 */
const normalizedCoordinateSchema = z.number().min(0).max(1);

export const collaborationPointerSchema = z.object({
  surface: collaborationSurfaceSchema,
  x: normalizedCoordinateSchema,
  y: normalizedCoordinateSchema,
});
export type CollaborationPointer = z.infer<typeof collaborationPointerSchema>;

/** A Monaco selection, in editor coordinates both peers agree on. */
export const collaborationCursorSchema = z.object({
  line: z.number().int().min(1),
  column: z.number().int().min(1),
  selectionEndLine: z.number().int().min(1).nullable(),
  selectionEndColumn: z.number().int().min(1).nullable(),
});
export type CollaborationCursor = z.infer<typeof collaborationCursorSchema>;

/**
 * Clamps a measured position into the normalized range.
 *
 * A pointer leaving its surface mid-drag produces values slightly outside
 * `0..1`; dropping those makes a remote cursor stutter at the edges, so the
 * client clamps before publishing and the schema still rejects anything that
 * is not a number at all.
 */
export function normalizePointerPosition(
  position: { x: number; y: number },
): { x: number; y: number } | null {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  return {
    x: Math.min(1, Math.max(0, position.x)),
    y: Math.min(1, Math.max(0, position.y)),
  };
}

export function isCollaborationSurface(
  value: unknown,
): value is CollaborationSurface {
  return (collaborationSurfaces as readonly unknown[]).includes(value);
}

/* -------------------------------------------------- access predicates */

/**
 * Every permission live monitoring requires. Both, not either: `Team Lead`
 * holds `classes.assigned.manage` for later operational reasons, and the pair
 * plus the `TEACHER` role below is what keeps that from becoming monitoring.
 */
export const monitoringPermissions = [
  "classes.assigned.manage",
  "submissions.assigned.review",
] as const satisfies readonly AcademyPermission[];

export function roleCanMonitor(role: AcademyRole): boolean {
  return (
    role === "TEACHER" &&
    monitoringPermissions.every((permission) =>
      roleHasPermission(role, permission)
    )
  );
}

export type MonitoringClassFacts = {
  academyId: string;
  status: ClassStatus;
  teacherMembershipId: string | null;
};

export type MonitoringTeacherFacts = {
  membershipId: string;
  academyId: string;
  userId: string;
  role: AcademyRole;
  membershipStatus: MembershipStatus;
  userStatus: UserStatus;
};

export type MonitoringSessionFacts = {
  academyId: string;
  userId: string;
};

/**
 * The canonical effective-assignment predicate.
 *
 * An assignment id alone never proves access: the class must be active, the
 * stored membership must still be an active teacher of that same academy, the
 * signed-in session must own that membership in that academy, and the role
 * must still carry both monitoring permissions. Database queries mirror these
 * facts in their joins; this function is what the mirror is checked against.
 */
export function grantsLiveMonitoring(input: {
  class: MonitoringClassFacts;
  teacher: MonitoringTeacherFacts | null;
  session: MonitoringSessionFacts;
}): boolean {
  const { class: classFacts, teacher, session } = input;
  if (!teacher) return false;
  return (
    classFacts.status === "ACTIVE" &&
    classFacts.teacherMembershipId !== null &&
    classFacts.teacherMembershipId === teacher.membershipId &&
    teacher.academyId === classFacts.academyId &&
    teacher.membershipStatus === "ACTIVE" &&
    teacher.userStatus === "ACTIVE" &&
    session.academyId === classFacts.academyId &&
    session.userId === teacher.userId &&
    roleCanMonitor(teacher.role)
  );
}

export type MonitorableStudentFacts = {
  membershipId: string;
  academyId: string;
  role: AcademyRole;
  membershipStatus: MembershipStatus;
  userStatus: UserStatus;
  /** Whether an enrollment row for this class exists at all. */
  isEnrolled: boolean;
};

/**
 * Who may be watched inside an already authorized class.
 *
 * Deliberately separate from the material check: a student can be a legitimate
 * member of the class while the exercise they have open has just been hidden,
 * and those two produce different end reasons.
 */
export function isMonitorableStudent(
  student: MonitorableStudentFacts,
  classAcademyId: string,
): boolean {
  return (
    student.isEnrolled &&
    student.academyId === classAcademyId &&
    student.role === "STUDENT" &&
    student.membershipStatus === "ACTIVE" &&
    student.userStatus === "ACTIVE"
  );
}

/* ------------------------------------------------------ presence reducer */

export type PresenceSignals = {
  connection: PresenceConnectionState;
  /** When the transport dropped, for the recovery grace window. */
  interruptedAt: number | null;
  /** The exercise the student has open, or null outside a workspace. */
  materialId: string | null;
  visibility: WorkspaceVisibility;
  /** Last editor, run, pointer, or navigation signal. */
  lastActivityAt: number | null;
};

/**
 * The one place a live state is decided.
 *
 * Clients publish signals — connected, which exercise, foreground or not, when
 * they last did something — and the server decides the label. A client that
 * announced its own state could call itself `SOLVING` forever.
 */
export function resolveLiveState(
  signals: PresenceSignals,
  now: number,
  timing: { idleAfterMs: number; recoveryGraceMs: number } = monitoringTiming,
): MonitoringLiveState {
  if (signals.connection === "NONE") return "OFFLINE";
  if (signals.connection === "INTERRUPTED") {
    if (signals.interruptedAt === null) return "OFFLINE";
    return now - signals.interruptedAt <= timing.recoveryGraceMs
      ? "RECONNECTING"
      : "OFFLINE";
  }
  if (signals.materialId === null || signals.visibility === "HIDDEN") {
    return "ONLINE";
  }
  if (
    signals.lastActivityAt !== null &&
    now - signals.lastActivityAt <= timing.idleAfterMs
  ) {
    return "SOLVING";
  }
  return "IDLE";
}

/** Only a connected state with a current exercise can be opened for help. */
export function canOpenLiveWorkspace(
  presence: { state: MonitoringLiveState; materialId: string | null },
): boolean {
  return (
    presence.materialId !== null &&
    (presence.state === "ONLINE" ||
      presence.state === "SOLVING" ||
      presence.state === "IDLE")
  );
}

/**
 * Whether a persisted `lastLearningSeenAt` write is due.
 *
 * Heartbeats arrive every fifteen seconds per student; writing each one turns
 * a hundred-student class into four hundred pointless row updates a minute.
 */
export function shouldPersistLastSeen(
  storedAt: number | null,
  now: number,
  intervalMs: number = monitoringTiming.lastSeenPersistIntervalMs,
): boolean {
  if (storedAt === null) return true;
  return now - storedAt >= intervalMs;
}

/* -------------------------------------------------- presence transport */

/**
 * One student's live row, as the server publishes it.
 *
 * No source code, no email, no teacher identity: the class presence room is
 * the widest monitoring audience, so it carries the least.
 */
export const presenceEntrySchema = z.object({
  studentMembershipId: z.uuid(),
  state: monitoringLiveStateSchema,
  /** Null while the student is not inside an exercise workspace. */
  materialId: z.uuid().nullable(),
  courseId: z.uuid().nullable(),
  /** Contextual history for an offline row, never proof of a connection. */
  lastActivityAt: z.iso.datetime().nullable(),
  /** The student's own latest sample run, if one is in flight or recent. */
  run: z
    .object({
      lifecycle: z.enum(["STARTED", "COMPLETED", "FAILED", "CANCELLED"]),
      passedCount: z.number().int().nonnegative(),
      sampleCount: z.number().int().nonnegative(),
      at: z.iso.datetime(),
    })
    .nullable(),
  /** The latest graded submission summary, safe fields only. */
  latestSubmissionId: z.uuid().nullable(),
});
export type PresenceEntry = z.infer<typeof presenceEntrySchema>;

/**
 * A whole-room snapshot with the version deltas are measured against.
 *
 * The version is monotonic per class room. A client that receives a delta
 * built on a version it never saw asks for exactly one new snapshot — it does
 * not start polling, which is what v1 did on every roster render.
 */
export const presenceSnapshotSchema = z.object({
  classId: z.uuid(),
  version: z.number().int().nonnegative(),
  entries: z.array(presenceEntrySchema).max(monitoringLimits.rosterMaxEnrollments),
  /** Counts come from the same snapshot so the cards cannot disagree. */
  onlineCount: z.number().int().nonnegative(),
  solvingCount: z.number().int().nonnegative(),
  takenAt: z.iso.datetime(),
});
export type PresenceSnapshot = z.infer<typeof presenceSnapshotSchema>;

export const presenceDeltaSchema = z.object({
  classId: z.uuid(),
  /** The version this delta produces. */
  version: z.number().int().positive(),
  /** The version it was built on. A gap means one snapshot refresh. */
  previousVersion: z.number().int().nonnegative(),
  entry: presenceEntrySchema,
  onlineCount: z.number().int().nonnegative(),
  solvingCount: z.number().int().nonnegative(),
});
export type PresenceDelta = z.infer<typeof presenceDeltaSchema>;

/**
 * Folds one delta into the roster the client holds.
 *
 * Returns `"gap"` rather than guessing when the delta does not continue the
 * known version, and `"stale"` for a delta that arrived after a newer one:
 * both are ordinary on a reconnect, and neither may corrupt the roster.
 */
export function applyPresenceDelta(
  current: { version: number; entries: ReadonlyArray<PresenceEntry> },
  delta: PresenceDelta,
):
  | { outcome: "applied"; version: number; entries: PresenceEntry[] }
  | { outcome: "stale" }
  | { outcome: "gap" } {
  if (delta.version <= current.version) return { outcome: "stale" };
  if (delta.previousVersion !== current.version) return { outcome: "gap" };
  const entries = current.entries.filter(
    (entry) => entry.studentMembershipId !== delta.entry.studentMembershipId,
  );
  entries.push(delta.entry);
  return { outcome: "applied", version: delta.version, entries };
}

/* ------------------------------------------------------- durable reads */

/** One assigned class on the teacher's own list. */
export const monitoringClassSummarySchema = z.object({
  classId: z.uuid(),
  academyId: z.uuid(),
  name: z.string().min(1),
  description: z.string(),
  status: classStatusSchema,
  courseCount: z.number().int().nonnegative(),
  studentCount: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
});
export type MonitoringClassSummary = z.infer<
  typeof monitoringClassSummarySchema
>;

/**
 * A roster row as the database knows it. Live state is never in here — it
 * arrives on the class presence room and is merged client-side, so a stale
 * cached query can never render a student as currently online.
 */
export const monitoringRosterStudentSchema = z.object({
  membershipId: z.uuid(),
  userId: z.uuid(),
  displayName: z.string().nullable(),
  email: z.email().nullable(),
  membershipStatus: membershipStatusSchema,
  userStatus: userStatusSchema,
  enrolledAt: z.iso.datetime(),
  /** History for an offline label. Presence is decided by the registry. */
  lastLearningSeenAt: z.iso.datetime().nullable(),
});
export type MonitoringRosterStudent = z.infer<
  typeof monitoringRosterStudentSchema
>;

export const monitoringClassRosterSchema = z.object({
  class: monitoringClassSummarySchema,
  courses: z.array(
    z.object({ id: z.uuid(), title: z.string().min(1), isVisible: z.boolean() }),
  ),
  students: z
    .array(monitoringRosterStudentSchema)
    .max(monitoringLimits.rosterMaxEnrollments),
  /** True when more enrollments exist than one snapshot supports. */
  truncated: z.boolean(),
});
export type MonitoringClassRoster = z.infer<typeof monitoringClassRosterSchema>;

/**
 * The exercise a teacher opens beside a student.
 *
 * `learnExerciseSchema` is reused rather than restated: it is the student
 * shape, and it has no field capable of holding a hidden expectation. A
 * teacher monitoring surface must not become the one place they leak.
 */
export const monitoringExerciseContextSchema = z.object({
  breadcrumb: z.object({
    course: z.object({ id: z.uuid(), title: z.string().min(1) }),
    module: z.object({ id: z.uuid(), title: z.string().min(1) }),
    lecture: z.object({ id: z.uuid(), title: z.string().min(1) }),
  }),
  exercise: learnExerciseSchema,
  /** The collaboration room is derived from this server-side, never named by a client. */
  draftId: z.uuid().nullable(),
});
export type MonitoringExerciseContext = z.infer<
  typeof monitoringExerciseContextSchema
>;

export const monitoringStudentContextSchema = z.object({
  /**
   * The caller's own membership. Feedback records name no author, so this is
   * what lets a teacher's client mark its own messages as theirs without the
   * student's copy ever carrying a name.
   */
  viewerMembershipId: z.uuid(),
  student: z.object({
    membershipId: z.uuid(),
    userId: z.uuid(),
    displayName: z.string().nullable(),
    email: z.email().nullable(),
  }),
  class: z.object({ classId: z.uuid(), name: z.string().min(1) }),
  exercise: monitoringExerciseContextSchema.nullable(),
});
export type MonitoringStudentContext = z.infer<
  typeof monitoringStudentContextSchema
>;

/* ------------------------------------------------------------ feedback */

export const feedbackBodySchema = z
  .string()
  .trim()
  .min(monitoringLimits.feedbackMinLength)
  .max(monitoringLimits.feedbackMaxLength);

/**
 * A stored feedback message.
 *
 * Deliberately without the author's name. The student is told a teacher is
 * monitoring, never which one, and a message that named its author would
 * hand back exactly what the indicator withholds. The teacher's own client
 * recognizes its own messages by comparing `teacherMembershipRef` with the
 * membership it is signed in as.
 */
export const monitoringFeedbackSchema = z.object({
  id: z.uuid(),
  classId: z.uuid(),
  teacherMembershipRef: z.uuid(),
  studentMembershipRef: z.uuid(),
  materialId: z.uuid().nullable(),
  body: z.string(),
  createdAt: z.iso.datetime(),
});
export type MonitoringFeedback = z.infer<typeof monitoringFeedbackSchema>;

/* -------------------------------------------------------------- inputs */

export const monitoringAcademyInputSchema = z.object({ academyId: z.uuid() });

export const monitoringClassInputSchema = monitoringAcademyInputSchema.extend({
  classId: z.uuid(),
});

export const monitoringStudentInputSchema = monitoringClassInputSchema.extend({
  membershipId: z.uuid(),
});

export const monitoringStudentContextInputSchema =
  monitoringStudentInputSchema.extend({
    /**
     * Which exercise to load beside the student. Optional because the roster
     * knows the student before it knows what they have open — the socket watch
     * ack supplies the material, and the page then asks for it here.
     */
    materialId: z.uuid().optional(),
  });

export const listFeedbackInputSchema = monitoringStudentInputSchema.extend({
  materialId: z.uuid().optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(monitoringLimits.feedbackPageSize)
    .default(monitoringLimits.feedbackPageSize),
  /** Keyset paging on `createdAt`; feedback is append-only. */
  before: z.iso.datetime().optional(),
});

/* ------------------------------------------------------- visit lifecycle */

/**
 * Why a watch ended. Recorded on the visit and sent to both clients, so a
 * teacher whose access was revoked mid-session sees the reason instead of a
 * silent disconnection.
 */
export const monitoringVisitEndReasons = [
  "TEACHER_LEFT",
  "WATCH_REPLACED",
  "STUDENT_LEFT",
  "ASSIGNMENT_CHANGED",
  "CLASS_ARCHIVED",
  "ENROLLMENT_REMOVED",
  "MEMBERSHIP_INACTIVE",
  "ROLE_CHANGED",
  "MATERIAL_UNAVAILABLE",
  "CONNECTION_EXPIRED",
  "FEATURE_DISABLED",
] as const;
export const monitoringVisitEndReasonSchema = z.enum(monitoringVisitEndReasons);
export type MonitoringVisitEndReason = z.infer<
  typeof monitoringVisitEndReasonSchema
>;

/** Which end reasons mean "this teacher may no longer be here at all". */
const revocationEndReasons = new Set<MonitoringVisitEndReason>([
  "ASSIGNMENT_CHANGED",
  "CLASS_ARCHIVED",
  "ENROLLMENT_REMOVED",
  "MEMBERSHIP_INACTIVE",
  "ROLE_CHANGED",
  "MATERIAL_UNAVAILABLE",
  "FEATURE_DISABLED",
]);

export function isAccessRevocation(reason: MonitoringVisitEndReason): boolean {
  return revocationEndReasons.has(reason);
}

/**
 * What the student is told while a teacher is in the room.
 *
 * `HELPING` after teacher-originated document activity, `MONITORING` before
 * it. Neither carries a name.
 */
export const studentIndicatorStates = [
  "NONE",
  "MONITORING",
  "HELPING",
  "RECONNECTING",
] as const;
export const studentIndicatorStateSchema = z.enum(studentIndicatorStates);
export type StudentIndicatorState = z.infer<typeof studentIndicatorStateSchema>;
