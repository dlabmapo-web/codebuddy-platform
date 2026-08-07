import { z } from "zod";

import { navigatorPathSchema } from "../content/learn.js";
import { appErrorCodeSchema } from "../errors/codes.js";
import {
  collaborationCursorSchema,
  collaborationPointerSchema,
  feedbackBodySchema,
  monitoringFeedbackSchema,
  monitoringLimits,
  monitoringVisitEndReasonSchema,
  presenceDeltaSchema,
  presenceSnapshotSchema,
  studentIndicatorStateSchema,
  workspaceVisibilitySchema,
} from "./monitoring.js";

/**
 * The monitoring namespace's wire contract.
 *
 * Every payload in both directions is described here and validated on arrival.
 * The server never reads an actor identity out of a payload — `userId`,
 * membership, academy, and room all come from the authenticated socket — so
 * these schemas describe intent, never authority.
 */

export const monitoringNamespace = "/monitoring";

/* ------------------------------------------------------------ room names */

/**
 * Room names are produced here and never accepted from a client. A client
 * sends a class id; the server decides which room that means. They carry ids
 * only: no email, no name, no source text, no token.
 */
export const monitoringRooms = {
  teacher: (academyId: string, teacherMembershipId: string) =>
    `academy:${academyId}:teacher:${teacherMembershipId}`,
  classPresence: (academyId: string, classId: string) =>
    `academy:${academyId}:class:${classId}:presence`,
  draft: (academyId: string, exerciseDraftId: string) =>
    `academy:${academyId}:draft:${exerciseDraftId}`,
  student: (academyId: string, studentMembershipId: string) =>
    `academy:${academyId}:student:${studentMembershipId}`,
  /**
   * The audience for one already-authorized focused watch.
   *
   * Deliberately not the student's own room and not the class presence room:
   * the movement event is for a teacher who has already passed `watchStart`,
   * and joining is a server action taken after that check rather than
   * something a client may ask for. Students never join it, so a student's
   * own socket cannot observe that anybody is watching them.
   *
   * Keyed by class as well as by student because reachability is: a student
   * sitting in two classes may move onto a course only one of them is taught,
   * and each teacher must be told about their own class's curriculum only.
   */
  watchContext: (
    academyId: string,
    classId: string,
    studentMembershipId: string,
  ) =>
    `academy:${academyId}:class:${classId}:student:${studentMembershipId}:watch-context`,
} as const;

/* ------------------------------------------------ acknowledgements */

/**
 * One acknowledgement shape for every command.
 *
 * The event id is echoed so a client can retire a retry, and a failure carries
 * a public error code and nothing else — a Prisma, Redis, Yjs, or Socket.IO
 * error never crosses this boundary.
 */
export function monitoringAckSchema<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), eventId: z.uuid(), data }),
    z.object({
      ok: z.literal(false),
      eventId: z.uuid(),
      code: appErrorCodeSchema,
    }),
  ]);
}

export type MonitoringAck<T> =
  | { ok: true; eventId: string; data: T }
  | { ok: false; eventId: string; code: z.infer<typeof appErrorCodeSchema> };

/** Every command carries a client-generated id so retries stay idempotent. */
const commandBase = z.object({ eventId: z.uuid() });

/* --------------------------------------------------- client to server */

export const classJoinPayloadSchema = commandBase.extend({
  academyId: z.uuid(),
  classId: z.uuid(),
});

export const classLeavePayloadSchema = classJoinPayloadSchema;

export const watchStartPayloadSchema = commandBase.extend({
  academyId: z.uuid(),
  classId: z.uuid(),
  studentMembershipId: z.uuid(),
});

export const watchStopPayloadSchema = commandBase;

/**
 * A student's own signals. The state label is the server's to decide, so this
 * carries facts — which exercise, foreground or not, did something happen —
 * and never a `SOLVING` claim.
 */
export const presencePublishPayloadSchema = z.object({
  academyId: z.uuid(),
  materialId: z.uuid().nullable(),
  courseId: z.uuid().nullable(),
  visibility: workspaceVisibilitySchema,
  /** True when the student edited, ran, pointed, or navigated since the last beat. */
  active: z.boolean(),
});

const binaryUpdateSchema = z
  .instanceof(Uint8Array)
  .refine((value) => value.byteLength <= monitoringLimits.documentUpdateMaxBytes, {
    message: "update exceeds the maximum size",
  });

const stateVectorSchema = z
  .instanceof(Uint8Array)
  .refine((value) => value.byteLength <= monitoringLimits.stateVectorMaxBytes, {
    message: "state vector exceeds the maximum size",
  });

export const documentSyncPayloadSchema = commandBase.extend({
  draftId: z.uuid(),
  stateVector: stateVectorSchema,
});

export const documentUpdatePayloadSchema = commandBase.extend({
  draftId: z.uuid(),
  update: binaryUpdateSchema,
});

export const awarenessUpdatePayloadSchema = z.object({
  draftId: z.uuid(),
  /** Monotonic for one Socket.IO client; prevents async authorization reorder. */
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  cursor: collaborationCursorSchema.nullable(),
  pointer: collaborationPointerSchema.nullable(),
});

/**
 * What a student's local sample run may report.
 *
 * Counts and already-visible output only. Hidden case inputs and expected
 * outputs are not absent by convention here — there is no field to put them in.
 */
export const runActivityPayloadSchema = z.object({
  draftId: z.uuid(),
  clientRunId: z.uuid(),
  lifecycle: z.enum(["STARTED", "COMPLETED", "FAILED", "CANCELLED"]),
  sampleCount: z.number().int().nonnegative(),
  passedCount: z.number().int().nonnegative(),
  output: z.string().max(monitoringLimits.runOutputMaxLength),
  at: z.iso.datetime(),
});

/**
 * The student telling the room a verdict exists.
 *
 * Only an id: the server reloads the submission and derives the public summary
 * itself, so a modified client can announce that grading finished but cannot
 * choose what the teacher is told about it.
 */
export const resultPublishPayloadSchema = z.object({
  draftId: z.uuid(),
  submissionId: z.uuid(),
});

export const feedbackSendPayloadSchema = commandBase.extend({
  draftId: z.uuid(),
  /** The durable idempotency key. A retry of the same send stores one row. */
  idempotencyKey: z.uuid(),
  body: feedbackBodySchema,
});

/* --------------------------------------------------- server to client */

export const classSnapshotEventSchema = presenceSnapshotSchema;
export const presenceChangedEventSchema = presenceDeltaSchema;

export const watchStartedEventSchema = z.object({
  classId: z.uuid(),
  studentMembershipId: z.uuid(),
  materialId: z.uuid(),
  draftId: z.uuid(),
  /** The student's copy carries the indicator state and nothing identifying. */
  indicator: studentIndicatorStateSchema,
  startedAt: z.iso.datetime(),
});

export const watchEndedEventSchema = z.object({
  classId: z.uuid(),
  studentMembershipId: z.uuid(),
  reason: monitoringVisitEndReasonSchema,
  endedAt: z.iso.datetime(),
});

export const documentSyncedEventSchema = z.object({
  draftId: z.uuid(),
  /** Only what the peer is missing, empty when it is already current. */
  update: binaryUpdateSchema,
  /** The server's own vector, so the client can offer what the server lacks. */
  stateVector: stateVectorSchema,
});

export const documentUpdatedEventSchema = z.object({
  draftId: z.uuid(),
  update: binaryUpdateSchema,
  /** Teacher-originated edits switch the student indicator to helping. */
  origin: z.enum(["STUDENT", "TEACHER"]),
});

export const awarenessChangedEventSchema = awarenessUpdatePayloadSchema.extend({
  // Server-authored lifecycle clears have no client sequence.
  sequence: awarenessUpdatePayloadSchema.shape.sequence.optional(),
  origin: z.enum(["STUDENT", "TEACHER"]),
});

export const runChangedEventSchema = runActivityPayloadSchema;

/**
 * The public half of a graded submission. Hidden case inputs, expected
 * outputs, internal failure reasons, and worker diagnostics have no field.
 */
export const resultChangedEventSchema = z.object({
  draftId: z.uuid(),
  submissionId: z.uuid(),
  status: z.enum(["QUEUED", "RUNNING", "PASSED", "FAILED", "ERRORED", "CANCELLED"]),
  score: z.number().int().min(0).max(100),
  passedCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  runtimeMs: z.number().int().nonnegative().nullable(),
  gradedAt: z.iso.datetime().nullable(),
});

/**
 * Durability, reported separately from convergence.
 *
 * An acknowledged update is in the document; it is not yet in Postgres. The
 * teacher's "unsaved changes" indicator clears on this event and on nothing
 * else, so it can never claim a save that did not happen.
 */
export const documentPersistedEventSchema = z.object({
  draftId: z.uuid(),
  /** A BigInt on the server, so it crosses the wire as a string. */
  snapshotVersion: z.string(),
  persisted: z.boolean(),
});

export const feedbackCreatedEventSchema = z.object({
  draftId: z.uuid(),
  feedback: monitoringFeedbackSchema,
});

/**
 * The watched student opened a different exercise.
 *
 * Metadata, never permission. It moves the teacher's LIVE marker and nothing
 * else: no code, no draft id, no test data, no feedback, and no identity
 * beyond the membership the teacher already watches. Following it performs a
 * fresh `watchStart`, so a client that fabricated one would gain nothing.
 */
export const studentContextChangedEventSchema = z.object({
  studentMembershipId: z.uuid(),
  materialId: z.uuid().nullable(),
  courseId: z.uuid().nullable(),
  path: navigatorPathSchema.nullable(),
  /** False when the student is between exercises or on something unmonitorable. */
  available: z.boolean(),
  changedAt: z.iso.datetime(),
});
export type StudentContextChangedEvent = z.infer<
  typeof studentContextChangedEventSchema
>;

export const accessRevokedEventSchema = z.object({
  classId: z.uuid(),
  studentMembershipId: z.uuid().nullable(),
  reason: monitoringVisitEndReasonSchema,
});

/**
 * Explicit health. Realtime infrastructure that is unavailable is reported as
 * degraded service — never as a roster on which everybody happens to be
 * offline.
 */
export const serverDegradedEventSchema = z.object({
  scope: z.enum(["PRESENCE", "DOCUMENT", "PERSISTENCE"]),
  degraded: z.boolean(),
});

export const studentIndicatorEventSchema = z.object({
  state: studentIndicatorStateSchema,
});

/* --------------------------------------------------------- event names */

export const monitoringClientEvents = {
  classJoin: "class.join",
  classLeave: "class.leave",
  watchStart: "student.watch.start",
  watchStop: "student.watch.stop",
  presencePublish: "presence.publish",
  documentSync: "document.sync",
  documentUpdate: "document.update",
  awarenessUpdate: "awareness.update",
  runActivity: "run.activity",
  resultPublish: "result.publish",
  feedbackSend: "feedback.send",
  /**
   * The mirrored terminal, one event name per message kind.
   *
   * Separate names rather than one envelope because their ceilings differ:
   * starting a run is rate-limited on its own, and a delta is on the hot path
   * and must not pay for the validation a start needs.
   */
  terminalStart: "terminal.start",
  terminalAppend: "terminal.append",
  terminalState: "terminal.state",
  terminalFinish: "terminal.finish",
  terminalSnapshot: "terminal.snapshot",
  terminalClear: "terminal.clear",
  /** A teacher asking for a snapshot after a gap or a reconnection. */
  terminalResync: "terminal.resync",
} as const;

export const monitoringServerEvents = {
  classSnapshot: "class.snapshot",
  presenceChanged: "presence.changed",
  watchStarted: "watch.started",
  watchEnded: "watch.ended",
  /** Sent only into the watch-context room of an authorized focused watch. */
  studentContextChanged: "student.context.changed",
  documentSynced: "document.synced",
  documentUpdated: "document.updated",
  documentPersisted: "document.persisted",
  awarenessChanged: "awareness.changed",
  runChanged: "run.changed",
  resultChanged: "result.changed",
  feedbackCreated: "feedback.created",
  /** The student opened the thread. Sent only to a watching teacher. */
  feedbackRead: "feedback.read",
  accessRevoked: "access.revoked",
  serverDegraded: "server.degraded",
  studentIndicator: "student.indicator",
  /**
   * One event for every mirror message, because the teacher folds all of them
   * into a single transcript through a single reducer. A second handler that
   * could apply a delta without consulting the sequence is exactly the drift
   * this protocol exists to prevent.
   */
  terminalChanged: "terminal.changed",
  /** Sent only to a student, and only by the server. */
  terminalSnapshotRequest: "terminal.snapshot.request",
} as const;

export type MonitoringClientEvent =
  (typeof monitoringClientEvents)[keyof typeof monitoringClientEvents];
export type MonitoringServerEvent =
  (typeof monitoringServerEvents)[keyof typeof monitoringServerEvents];

/* ------------------------------------------------------------- payload types */

export type ClassJoinPayload = z.infer<typeof classJoinPayloadSchema>;
export type WatchStartPayload = z.infer<typeof watchStartPayloadSchema>;
export type PresencePublishPayload = z.infer<typeof presencePublishPayloadSchema>;
export type DocumentSyncPayload = z.infer<typeof documentSyncPayloadSchema>;
export type DocumentUpdatePayload = z.infer<typeof documentUpdatePayloadSchema>;
export type AwarenessUpdatePayload = z.infer<typeof awarenessUpdatePayloadSchema>;
export type RunActivityPayload = z.infer<typeof runActivityPayloadSchema>;
export type ResultPublishPayload = z.infer<typeof resultPublishPayloadSchema>;
export type DocumentPersistedEvent = z.infer<
  typeof documentPersistedEventSchema
>;
export type FeedbackSendPayload = z.infer<typeof feedbackSendPayloadSchema>;
export type WatchStartedEvent = z.infer<typeof watchStartedEventSchema>;
export type WatchEndedEvent = z.infer<typeof watchEndedEventSchema>;
export type DocumentSyncedEvent = z.infer<typeof documentSyncedEventSchema>;
export type DocumentUpdatedEvent = z.infer<typeof documentUpdatedEventSchema>;
export type AwarenessChangedEvent = z.infer<typeof awarenessChangedEventSchema>;
export type ResultChangedEvent = z.infer<typeof resultChangedEventSchema>;
export type FeedbackCreatedEvent = z.infer<typeof feedbackCreatedEventSchema>;
export type AccessRevokedEvent = z.infer<typeof accessRevokedEventSchema>;
export type ServerDegradedEvent = z.infer<typeof serverDegradedEventSchema>;
