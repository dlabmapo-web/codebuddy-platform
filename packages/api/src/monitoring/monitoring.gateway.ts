import { randomUUID } from "node:crypto";

import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from "@nestjs/websockets";
import {
  awarenessUpdatePayloadSchema,
  classJoinPayloadSchema,
  documentSyncPayloadSchema,
  documentUpdatePayloadSchema,
  feedbackSendPayloadSchema,
  monitoringClientEvents,
  monitoringLimits,
  monitoringNamespace,
  monitoringRooms,
  monitoringServerEvents,
  monitoringTiming,
  presencePublishPayloadSchema,
  resultPublishPayloadSchema,
  runActivityPayloadSchema,
  shouldPersistLastSeen,
  terminalAppendMessageSchema,
  terminalClearMessageSchema,
  terminalFinishMessageSchema,
  terminalLinesByteLength,
  terminalResyncPayloadSchema,
  terminalSnapshotMessageSchema,
  terminalStartMessageSchema,
  terminalStateMessageSchema,
  watchStartPayloadSchema,
  type AppErrorCode,
  type MonitoringAck,
  type MonitoringVisitEndReason,
  type PresenceEntry,
} from "@cove/shared";
import type { Server, Socket } from "socket.io";
import type { z } from "zod";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { effectivelyVisibleMaterialWhere } from "../learn/curriculum-visibility.js";
import { CollaborationDocumentService } from "./collaboration-document.service.js";
import { ActiveWatchRegistry } from "./active-watch.registry.js";
import {
  MonitoringAccessService,
  type MonitoringClassClaim,
  type MonitoringMaterialClaim,
} from "./monitoring-access.service.js";
import {
  monitoringLogLine,
  toPublicErrorCode,
} from "./monitoring-event-mapper.js";
import { MonitoringFeedbackBroadcaster } from "./monitoring-feedback-broadcaster.js";
import { MonitoringFeedbackService } from "./monitoring-feedback.service.js";
import { MonitoringMetricsService } from "./monitoring-metrics.service.js";
import { MonitoringRevocationService } from "./monitoring-revocation.service.js";
import { MonitoringVisitService } from "./monitoring-visit.service.js";
import { PresenceRegistry } from "./presence.registry.js";
import {
  SocketRateLimiter,
  invalidPayloadAllowance,
  monitoringRateRules,
} from "./socket-rate-limit.js";

/**
 * The monitoring namespace.
 *
 * The gateway owns socket lifecycle and delegation, and nothing else: no
 * Prisma query it writes itself, no Yjs merge, no Redis command. Identity is
 * established once, from the access token, and stored on the socket — an event
 * payload names what to act on, never who is acting. That is the single
 * property v1 lacked, and the reason its channels could be spoofed by editing
 * a browser payload.
 */

type WatchState = {
  claim: MonitoringMaterialClaim;
  visitId: string;
  draftId: string;
  /** Set by the first teacher-originated edit; drives the student indicator. */
  helping: boolean;
};

type TeacherState = {
  claims: Map<string, MonitoringClassClaim>;
  watch: WatchState | null;
};

type StudentClassMembership = {
  classId: string;
  membershipId: string;
};

/**
 * The whole of what the server keeps about a mirrored terminal.
 *
 * A run id, two counters, one boundary flag, and no transcript. The gateway
 * proves that a delta
 * belongs to the run it claims, continues that run's order, and stays inside
 * the run's byte budget — none of which requires holding the text, and holding
 * the text would turn every watched student into server-side memory that grows
 * with their output.
 */
type TerminalRunState = {
  clientRunId: string;
  /** The highest sequence accepted for this run. */
  sequence: number;
  /** Terminal bytes accepted for this run, against the transcript budget. */
  bytes: number;
  /** True after the one delta that crossed the content budget was accepted. */
  truncated: boolean;
};

type StudentState = {
  academyId: string;
  membershipId: string;
  classes: StudentClassMembership[];
  materialId: string | null;
  draftId: string | null;
  /** Throttles the durable `lastLearningSeenAt` write. */
  lastSeenPersistedAt: number | null;
  /** One mirrored run at a time, or none. */
  terminal: TerminalRunState | null;
};

type MonitoringSocketData = {
  identity: SupabaseIdentity;
  /** New on every connection, so an old tab's disconnect cannot clear a new one. */
  generation: string;
  limiter: SocketRateLimiter;
  invalidPayloads: number;
  teacher: TeacherState | null;
  student: StudentState | null;
};

type MonitoringSocket = Socket & { data: MonitoringSocketData };

@WebSocketGateway({
  namespace: monitoringNamespace,
  // Recovery keeps rooms and a bounded packet buffer across a short drop, but
  // `skipMiddlewares` stays off: a suspended or deleted identity must be
  // revalidated before it is restored, never waved through because it held a
  // session id.
  connectionStateRecovery: {
    maxDisconnectionDuration: monitoringTiming.recoveryGraceMs,
    skipMiddlewares: false,
  },
})
export class MonitoringGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(MonitoringGateway.name);

  @WebSocketServer() server!: Server;

  /**
   * Which room each open document belongs to.
   *
   * The flush listener fires on a timer with only a draft id, and the room name
   * needs the academy — which is a fact about who was authorized, not something
   * to re-derive from a client.
   */
  private readonly draftRooms = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: SupabaseAuthService,
    private readonly access: MonitoringAccessService,
    private readonly presence: PresenceRegistry,
    private readonly documents: CollaborationDocumentService,
    private readonly activeWatches: ActiveWatchRegistry,
    private readonly visits: MonitoringVisitService,
    private readonly feedback: MonitoringFeedbackService,
    private readonly feedbackBroadcaster: MonitoringFeedbackBroadcaster,
    private readonly revocation: MonitoringRevocationService,
    private readonly metrics: MonitoringMetricsService,
  ) {}

  afterInit(server: Server): void {
    server.use((rawSocket, next) => {
      const socket = rawSocket as MonitoringSocket;
      const token = bearerFromHandshake(socket);
      if (!token) {
        this.metrics.increment("socket.rejected");
        next(new Error("MONITORING_ACCESS_DENIED"));
        return;
      }
      void this.auth
        .verifyAccessToken(token)
        .then((identity) => {
          socket.data = {
            identity,
            generation: randomUUID(),
            limiter: new SocketRateLimiter(monitoringRateRules),
            invalidPayloads: 0,
            teacher: null,
            student: null,
          };
          next();
        })
        .catch(() => {
          this.metrics.increment("socket.rejected");
          next(new Error("MONITORING_ACCESS_DENIED"));
        });
    });
    // Revocation needs to reach rooms on every instance, which is the adapter's
    // job — so it borrows the server rather than opening its own channel.
    this.revocation.attach(server);
    // The read receipt travels the same way, and for the same reason: the
    // student's read is an HTTP write on whichever instance served it, and the
    // watching teacher may be connected to another one.
    this.feedbackBroadcaster.attach(server);
    // Persistence is announced separately from convergence, so the editor's
    // unsaved indicator answers to Postgres rather than to an acknowledgement.
    this.documents.onFlush((event) => {
      const room = this.draftRooms.get(event.draftId);
      if (!room) return;
      if (!event.persisted) this.metrics.increment("document.flush.failed");
      server.to(room).emit(monitoringServerEvents.documentPersisted, {
        draftId: event.draftId,
        snapshotVersion: event.snapshotVersion.toString(),
        persisted: event.persisted,
      });
    });
  }

  /**
   * Authentication happens once, here, before any event is accepted.
   *
   * The token is verified with the same service the HTTP surface uses, so a
   * socket cannot be a second, weaker way in.
   */
  handleConnection(_socket: MonitoringSocket): void {
    this.metrics.increment("socket.connected");
  }

  async handleDisconnect(socket: MonitoringSocket): Promise<void> {
    const data = socket.data as MonitoringSocketData | undefined;
    if (!data) return;

    if (data.student) {
      // Interrupted, not gone: the roster shows reconnecting for the grace
      // window, because a tunnel is not a student going home.
      await Promise.all(
        data.student.classes.map((entry) =>
          this.presence.markInterrupted(
            data.student!.academyId,
            entry.classId,
            entry.membershipId,
            data.generation,
          ).then((entryState) =>
            this.publishPresence(data.student!.academyId, entry.classId, entryState)
          )
        ),
      );
      if (data.student.draftId) {
        // The teacher's copy of this student's arrow does not expire on its
        // own, so a connection that ends without a leave event has to be
        // spoken for. Announced before the flush, because the flush is a
        // database round trip and the arrow is already wrong.
        this.clearAwareness(
          data.student.academyId,
          data.student.draftId,
          "STUDENT",
        );
        await this.documents.flush(data.student.draftId);
      }
    }

    if (data.teacher?.watch) {
      await this.endWatch(socket, "CONNECTION_EXPIRED");
    }
  }

  /* ------------------------------------------------------------- teacher */

  @SubscribeMessage(monitoringClientEvents.classJoin)
  async classJoin(
    @ConnectedSocket() socket: MonitoringSocket,
    @MessageBody() body: unknown,
  ): Promise<MonitoringAck<{ joined: true }>> {
    return this.command(
      socket,
      monitoringClientEvents.classJoin,
      classJoinPayloadSchema,
      body,
      async (payload) => {
        if (!this.presence.isAvailable) {
          // Never a silent single-node fallback: without cross-instance delivery
          // a "live" roster would only be live for whoever shares this process.
          this.metrics.increment("presence.degraded");
          throw publicError("MONITORING_REALTIME_UNAVAILABLE");
        }
        const claim = await this.requireClassClaim(
          socket,
          payload.academyId,
          payload.classId,
        );
        await socket.join([
          monitoringRooms.teacher(claim.academyId, claim.membershipId),
          monitoringRooms.classPresence(claim.academyId, claim.classId),
        ]);
        const teacher = socket.data.teacher ?? { claims: new Map(), watch: null };
        teacher.claims.set(claim.classId, claim);
        socket.data.teacher = teacher;

        const snapshot = await this.presence.snapshot(
          claim.academyId,
          claim.classId,
        );
        if (snapshot) {
          socket.emit(monitoringServerEvents.classSnapshot, snapshot);
        }
        this.metrics.increment("class.joined");
        return { joined: true as const };
      },
    );
  }

  @SubscribeMessage(monitoringClientEvents.classLeave)
  async classLeave(
    @ConnectedSocket() socket: MonitoringSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const parsed = classJoinPayloadSchema.safeParse(body);
    if (!parsed.success || !socket.data?.teacher) return;
    const { academyId, classId } = parsed.data;
    const teacher = socket.data.teacher;
    if (teacher.watch?.claim.classId === classId) {
      await this.endWatch(socket, "TEACHER_LEFT");
    }
    await socket.leave(
      monitoringRooms.classPresence(academyId, classId),
    );
    teacher.claims.delete(classId);
    if (teacher.claims.size === 0 && !teacher.watch) socket.data.teacher = null;
  }

  /**
   * Opens one live workspace.
   *
   * The exercise is taken from the server's own presence state, never from the
   * payload: a teacher may open what the student actually has in front of
   * them, not any material they can name.
   */
  @SubscribeMessage(monitoringClientEvents.watchStart)
  async watchStart(
    @ConnectedSocket() socket: MonitoringSocket,
    @MessageBody() body: unknown,
  ): Promise<
    MonitoringAck<{ draftId: string; materialId: string; visitId: string }>
  > {
    return this.command(
      socket,
      monitoringClientEvents.watchStart,
      watchStartPayloadSchema,
      body,
      async (payload) => {
        const classClaim = await this.requireClassClaim(
          socket,
          payload.academyId,
          payload.classId,
        );
        const studentClaim = await this.access.requireMonitorableStudent(
          classClaim,
          payload.studentMembershipId,
        );

        const snapshot = await this.presence.snapshot(
          classClaim.academyId,
          classClaim.classId,
        );
        const entry = snapshot?.entries.find(
          (candidate) =>
            candidate.studentMembershipId === payload.studentMembershipId,
        );
        if (!entry?.materialId) {
          this.metrics.increment("watch.denied");
          throw publicError("MONITORING_STUDENT_UNAVAILABLE");
        }

        const claim = await this.access.requireMonitorableMaterial(
          studentClaim,
          entry.materialId,
        );
        const draftId = await this.ensureDraft(claim);

        // Replacing the previous watch is part of opening this one, so a second
        // tab moves the session instead of quietly watching two students.
        if (socket.data.teacher?.watch) {
          await this.endWatch(socket, "WATCH_REPLACED");
        }
        const visit = await this.visits.start(claim);
        const redisReplacedVisitId = await this.activeWatches.replace(
          claim.membershipId,
          visit.id,
        );
        const replacedVisitId = redisReplacedVisitId ?? visit.replaced?.id ?? null;
        if (replacedVisitId && replacedVisitId !== visit.id) {
          await this.disconnectReplacedWatch(
            claim.academyId,
            claim.membershipId,
            replacedVisitId,
          );
          this.metrics.increment("watch.replaced");
        }

        await socket.join(monitoringRooms.draft(claim.academyId, draftId));
        const teacher = socket.data.teacher ?? { claims: new Map(), watch: null };
        teacher.claims.set(classClaim.classId, classClaim);
        teacher.watch = { claim, visitId: visit.id, draftId, helping: false };
        socket.data.teacher = teacher;

        const startedAt = visit.startedAt.toISOString();
        socket.emit(monitoringServerEvents.watchStarted, {
          classId: claim.classId,
          studentMembershipId: claim.studentMembershipId,
          materialId: claim.materialId,
          draftId,
          indicator: "MONITORING",
          startedAt,
        });
        // The student's own room, so the indicator follows the person rather
        // than whichever socket happened to be in the draft room.
        this.server
          .to(monitoringRooms.student(claim.academyId, claim.studentMembershipId))
          .emit(monitoringServerEvents.watchStarted, {
            classId: claim.classId,
            studentMembershipId: claim.studentMembershipId,
            materialId: claim.materialId,
            draftId,
            indicator: "MONITORING",
            startedAt,
          });

        // A student may already be mid-run. Asking now is what makes the
        // mirrored terminal show the transcript they are looking at rather than
        // an empty pane until their next execution.
        this.requestTerminalSnapshot(
          claim.academyId,
          claim.studentMembershipId,
          draftId,
        );

        this.metrics.increment("watch.started");
        return {
          draftId,
          materialId: claim.materialId,
          visitId: visit.id,
        };
      },
    );
  }

  @SubscribeMessage(monitoringClientEvents.watchStop)
  async watchStop(
    @ConnectedSocket() socket: MonitoringSocket,
    @MessageBody() body: unknown,
  ): Promise<MonitoringAck<{ ended: true }>> {
    const eventId = eventIdOf(body);
    await this.endWatch(socket, "TEACHER_LEFT");
    return { ok: true, eventId, data: { ended: true } };
  }

  /* ------------------------------------------------------------- student */

  /**
   * A student's own signals.
   *
   * The membership, the classes, and the resulting state are all resolved
   * server side. The payload says what the student has open; it does not say
   * who they are or how they should be labelled.
   */
  @SubscribeMessage(monitoringClientEvents.presencePublish)
  async presencePublish(
    @ConnectedSocket() socket: MonitoringSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    if (!this.allow(socket, "presence.publish")) return;
    const parsed = presencePublishPayloadSchema.safeParse(body);
    if (!parsed.success) return void this.rejectPayload(socket);
    if (!this.presence.isAvailable) return;

    const student = await this.resolveStudent(socket, parsed.data.academyId);
    if (!student) return;
    const material = parsed.data.materialId
      ? await this.prisma.material.findFirst({
          where: {
            id: parsed.data.materialId,
            ...effectivelyVisibleMaterialWhere(student.academyId),
          },
          select: { lecture: { select: { courseModule: { select: { courseId: true } } } } },
        })
      : null;
    const verifiedCourseId = material?.lecture.courseModule.courseId ?? null;
    student.materialId = verifiedCourseId ? parsed.data.materialId : null;
    const eligibleClassIds = verifiedCourseId
      ? new Set(
          (
            await this.prisma.classCourse.findMany({
              where: {
                courseId: verifiedCourseId,
                classId: { in: student.classes.map((entry) => entry.classId) },
                class: { status: "ACTIVE" },
              },
              select: { classId: true },
            })
          ).map((assignment) => assignment.classId),
        )
      : new Set<string>();

    for (const entry of student.classes) {
      const visibleInClass =
        verifiedCourseId !== null && eligibleClassIds.has(entry.classId);
      const state = await this.presence.publish({
        academyId: student.academyId,
        classId: entry.classId,
        studentMembershipId: entry.membershipId,
        socketGeneration: socket.data.generation,
        materialId: visibleInClass ? parsed.data.materialId : null,
        courseId: visibleInClass ? verifiedCourseId : null,
        visibility: parsed.data.visibility,
        active: parsed.data.active,
      });
      await this.publishPresence(student.academyId, entry.classId, state);
    }

    // History for an offline label, written at most once a minute rather than
    // on every fifteen-second beat.
    if (
      parsed.data.active &&
      shouldPersistLastSeen(student.lastSeenPersistedAt, Date.now())
    ) {
      student.lastSeenPersistedAt = Date.now();
      await this.prisma.classEnrollment.updateMany({
        where: {
          membershipId: student.membershipId,
          classId: { in: student.classes.map((entry) => entry.classId) },
        },
        data: { lastLearningSeenAt: new Date() },
      });
    }
  }

  @SubscribeMessage(monitoringClientEvents.runActivity)
  async runActivity(
    @ConnectedSocket() socket: MonitoringSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    if (!this.allow(socket, "run.activity")) return;
    const parsed = runActivityPayloadSchema.safeParse(body);
    if (!parsed.success) return void this.rejectPayload(socket);
    // A teacher cannot run anything, so a run event from one is not a state to
    // record — it is a payload to drop.
    const student = socket.data?.student;
    if (!student || student.draftId !== parsed.data.draftId) return;

    for (const entry of student.classes) {
      const state = await this.presence.recordRun(
        student.academyId,
        entry.classId,
        entry.membershipId,
        {
          lifecycle: parsed.data.lifecycle,
          passedCount: parsed.data.passedCount,
          sampleCount: parsed.data.sampleCount,
          at: parsed.data.at,
        },
      );
      await this.publishPresence(student.academyId, entry.classId, state);
    }
    socket
      .to(monitoringRooms.draft(student.academyId, parsed.data.draftId))
      .emit(monitoringServerEvents.runChanged, parsed.data);
  }

  /* ----------------------------------------------------- terminal mirroring */

  /**
   * A student's terminal, as the student's own screen shows it.
   *
   * The five handlers below carry no authority of their own: the origin, the
   * academy, the room, and the student are all read from the authenticated
   * socket, and the payload only says which draft and which run. A teacher's
   * terminal never travels — running code beside a student is private to them,
   * and a mirror message from that side is dropped rather than relabelled.
   */
  @SubscribeMessage(monitoringClientEvents.terminalStart)
  async terminalStart(
    @ConnectedSocket() socket: MonitoringSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    await this.forwardTerminal(
      socket,
      "terminal.start",
      terminalStartMessageSchema,
      body,
      (student, payload) => {
        // A new run replaces the previous one, budget and numbering included.
        student.terminal = {
          clientRunId: payload.clientRunId,
          sequence: 0,
          bytes: terminalLinesByteLength(payload.lines),
          truncated: false,
        };
        this.metrics.increment("terminal.run.started");
        return true;
      },
    );
  }

  @SubscribeMessage(monitoringClientEvents.terminalAppend)
  async terminalAppend(
    @ConnectedSocket() socket: MonitoringSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    await this.forwardTerminal(
      socket,
      "terminal.delta",
      terminalAppendMessageSchema,
      body,
      (student, payload) =>
        this.acceptTerminalDelta(
          student,
          payload,
          terminalLinesByteLength(payload.lines),
        ),
    );
  }

  @SubscribeMessage(monitoringClientEvents.terminalState)
  async terminalState(
    @ConnectedSocket() socket: MonitoringSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    await this.forwardTerminal(
      socket,
      "terminal.delta",
      terminalStateMessageSchema,
      body,
      (student, payload) => this.acceptTerminalDelta(student, payload, 0),
    );
  }

  @SubscribeMessage(monitoringClientEvents.terminalFinish)
  async terminalFinish(
    @ConnectedSocket() socket: MonitoringSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    await this.forwardTerminal(
      socket,
      "terminal.delta",
      terminalFinishMessageSchema,
      body,
      (student, payload) => this.acceptTerminalDelta(student, payload, 0),
    );
  }

  @SubscribeMessage(monitoringClientEvents.terminalClear)
  async terminalClear(
    @ConnectedSocket() socket: MonitoringSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    await this.forwardTerminal(
      socket,
      "terminal.delta",
      terminalClearMessageSchema,
      body,
      (student) => {
        student.terminal = null;
        return true;
      },
    );
  }

  /**
   * The whole transcript, in answer to a request.
   *
   * The one terminal message that may arrive before the shared document has
   * been established — a teacher can open a workspace mid-run — so ownership of
   * the draft is proven here rather than assumed from earlier traffic.
   */
  @SubscribeMessage(monitoringClientEvents.terminalSnapshot)
  async terminalSnapshot(
    @ConnectedSocket() socket: MonitoringSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    if (!this.allow(socket, "terminal.snapshot")) return;
    const parsed = terminalSnapshotMessageSchema.safeParse(body);
    if (!parsed.success) return void this.rejectPayload(socket);
    if (socket.data?.teacher?.watch) return;
    const student = await this.requireStudentForTerminalSnapshot(
      socket,
      parsed.data.draftId,
    );
    if (!student) return;

    // Authoritative: it is the student's own current state, so it re-bases the
    // run, the numbering, and the budget the deltas after it are measured from.
    student.terminal = {
      clientRunId: parsed.data.clientRunId,
      sequence: parsed.data.sequence,
      bytes: Math.min(
        terminalLinesByteLength(parsed.data.lines),
        monitoringLimits.terminalTranscriptMaxBytes,
      ),
      truncated: parsed.data.truncated,
    };
    socket
      .to(monitoringRooms.draft(student.academyId, parsed.data.draftId))
      .emit(monitoringServerEvents.terminalChanged, {
        ...parsed.data,
        origin: "STUDENT",
      });
    this.metrics.increment("terminal.snapshot.forwarded");
  }

  /**
   * A teacher asking for the transcript again, after a gap or a reconnection.
   *
   * The request that reaches the student carries a draft id and nothing else —
   * not which teacher asked, and not that a teacher asked at all.
   */
  @SubscribeMessage(monitoringClientEvents.terminalResync)
  async terminalResync(
    @ConnectedSocket() socket: MonitoringSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    if (!this.allow(socket, "terminal.resync")) return;
    const parsed = terminalResyncPayloadSchema.safeParse(body);
    if (!parsed.success) return void this.rejectPayload(socket);
    const watch = socket.data?.teacher?.watch;
    if (!watch || watch.draftId !== parsed.data.draftId) return;
    if (!(await this.activeWatches.isActive(watch.claim.membershipId, watch.visitId))) {
      return;
    }
    this.requestTerminalSnapshot(
      watch.claim.academyId,
      watch.claim.studentMembershipId,
      parsed.data.draftId,
    );
  }

  /* ---------------------------------------------------------- collaboration */

  @SubscribeMessage(monitoringClientEvents.documentSync)
  async documentSync(
    @ConnectedSocket() socket: MonitoringSocket,
    @MessageBody() body: unknown,
  ): Promise<MonitoringAck<{ draftId: string }>> {
    return this.command(
      socket,
      monitoringClientEvents.documentSync,
      documentSyncPayloadSchema,
      body,
      async (payload) => {
        const room = await this.requireDraftAccess(socket, payload.draftId);
        await socket.join(room);
        this.draftRooms.set(payload.draftId, room);
        const sync = await this.documents.sync(
          payload.draftId,
          payload.stateVector,
        );
        socket.emit(monitoringServerEvents.documentSynced, {
          draftId: payload.draftId,
          update: sync.update,
          stateVector: sync.stateVector,
        });
        this.metrics.increment("document.resync");
        return { draftId: payload.draftId };
      },
    );
  }

  @SubscribeMessage(monitoringClientEvents.documentUpdate)
  async documentUpdate(
    @ConnectedSocket() socket: MonitoringSocket,
    @MessageBody() body: unknown,
  ): Promise<MonitoringAck<{ applied: true }>> {
    return this.command(
      socket,
      monitoringClientEvents.documentUpdate,
      documentUpdatePayloadSchema,
      body,
      async (payload) => {
        const room = await this.requireDraftAccess(socket, payload.draftId);
        await this.documents.applyUpdate(payload.draftId, payload.update);
        const origin = socket.data.teacher?.watch ? "TEACHER" : "STUDENT";

        socket.to(room).emit(monitoringServerEvents.documentUpdated, {
          draftId: payload.draftId,
          update: payload.update,
          origin,
        });

        // The first teacher edit is what turns "monitoring" into "helping".
        // Individual edits are never written to the audit log; only this
        // transition is visible, and only to the student.
        const watch = socket.data.teacher?.watch;
        if (watch && !watch.helping) {
          watch.helping = true;
          this.server
            .to(
              monitoringRooms.student(
                watch.claim.academyId,
                watch.claim.studentMembershipId,
              ),
            )
            .emit(monitoringServerEvents.studentIndicator, { state: "HELPING" });
        }

        this.metrics.increment("document.update.applied");
        return { applied: true as const };
      },
    );
  }

  @SubscribeMessage(monitoringClientEvents.awarenessUpdate)
  async awarenessUpdate(
    @ConnectedSocket() socket: MonitoringSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    if (!this.allow(socket, "awareness.update")) return;
    const parsed = awarenessUpdatePayloadSchema.safeParse(body);
    if (!parsed.success) return void this.rejectPayload(socket);
    let room: string;
    try {
      room = await this.requireDraftAccess(socket, parsed.data.draftId);
    } catch {
      return;
    }
    // Volatile by design: a cursor that arrives late is worse than one that
    // never arrives, and none of this is ever persisted.
    socket.to(room).emit(monitoringServerEvents.awarenessChanged, {
      ...parsed.data,
      origin: socket.data.teacher?.watch ? "TEACHER" : "STUDENT",
    });
  }

  /**
   * The student announcing that a verdict exists.
   *
   * The payload carries an id and nothing else: the summary is read back from
   * the database and mapped here, so a modified client can say "grading
   * finished" but cannot choose the score the teacher is shown, and hidden
   * cases have no path into the room.
   */
  @SubscribeMessage(monitoringClientEvents.resultPublish)
  async resultPublish(
    @ConnectedSocket() socket: MonitoringSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    if (!this.allow(socket, "run.activity")) return;
    const parsed = resultPublishPayloadSchema.safeParse(body);
    if (!parsed.success) return void this.rejectPayload(socket);
    const student = socket.data?.student;
    if (!student || student.draftId !== parsed.data.draftId) return;

    const submission = await this.prisma.submission.findFirst({
      where: {
        id: parsed.data.submissionId,
        user: { authUserId: socket.data.identity.authUserId },
        material: { drafts: { some: { id: parsed.data.draftId } } },
      },
      select: {
        id: true,
        status: true,
        score: true,
        passedCount: true,
        totalCount: true,
        runtimeMs: true,
        gradedAt: true,
      },
    });
    if (!submission) return;

    for (const entry of student.classes) {
      await this.presence.recordSubmission(
        student.academyId,
        entry.classId,
        entry.membershipId,
        submission.id,
      );
    }
    socket
      .to(monitoringRooms.draft(student.academyId, parsed.data.draftId))
      .emit(monitoringServerEvents.resultChanged, {
        draftId: parsed.data.draftId,
        submissionId: submission.id,
        status: submission.status,
        score: submission.score,
        passedCount: submission.passedCount,
        totalCount: submission.totalCount,
        runtimeMs: submission.runtimeMs,
        gradedAt: submission.gradedAt?.toISOString() ?? null,
      });
  }

  @SubscribeMessage(monitoringClientEvents.feedbackSend)
  async feedbackSend(
    @ConnectedSocket() socket: MonitoringSocket,
    @MessageBody() body: unknown,
  ): Promise<MonitoringAck<{ feedbackId: string }>> {
    return this.command(
      socket,
      monitoringClientEvents.feedbackSend,
      feedbackSendPayloadSchema,
      body,
      async (payload) => {
        const watch = socket.data.teacher?.watch;
        if (!watch || watch.draftId !== payload.draftId) {
          throw publicError("MONITORING_ACCESS_DENIED");
        }
        // Revalidated on a durable command: the claim may be a minute old, and
        // a minute is long enough to have lost the class.
        await this.revalidate(socket, watch.claim);

        const record = await this.feedback.upsert(watch.claim, {
          idempotencyKey: payload.idempotencyKey,
          body: payload.body,
          visitId: watch.visitId,
        });
        // Stored first, broadcast second. Both clients render the row the
        // server returned, not an optimistic local guess at it.
        this.server
          .to(monitoringRooms.draft(watch.claim.academyId, payload.draftId))
          .emit(monitoringServerEvents.feedbackCreated, {
            draftId: payload.draftId,
            feedback: record,
          });
        this.metrics.increment("feedback.created");
        return { feedbackId: record.id };
      },
    );
  }

  /* ------------------------------------------------------------- internals */

  /**
   * Validate, rate-limit, authorize, run, and reduce any failure to a public
   * code. Every acknowledged command goes through here so none of them can
   * forget one of the five.
   */
  private async command<Schema extends z.ZodType, Result>(
    socket: MonitoringSocket,
    event: string,
    schema: Schema,
    body: unknown,
    run: (payload: z.infer<Schema>) => Promise<Result>,
  ): Promise<MonitoringAck<Result>> {
    const eventId = eventIdOf(body);
    if (!this.allow(socket, event)) {
      return { ok: false, eventId, code: "RATE_LIMITED" };
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      this.rejectPayload(socket);
      // An oversized binary update is the payload failure a client can act on:
      // it resynchronizes in full rather than retrying the same update.
      return { ok: false, eventId, code: "MONITORING_PAYLOAD_TOO_LARGE" };
    }
    try {
      return { ok: true, eventId, data: await run(parsed.data) };
    } catch (error) {
      const code = toPublicErrorCode(error);
      this.metrics.incrementWithReason("watch.denied", code);
      // Ids and public reasons only. No payload, no name, no code.
      this.logger.debug(monitoringLogLine({ event, reason: code }));
      return { ok: false, eventId, code };
    }
  }

  /**
   * Validate, authorize, account, and forward one terminal message.
   *
   * Every mirror event on the hot path goes through here, so none of them can
   * forget the student check, the draft check, or the per-run accounting — and
   * none of them performs a database or Redis round trip to do it.
   */
  private async forwardTerminal<Payload extends { draftId: string }>(
    socket: MonitoringSocket,
    rule: string,
    schema: z.ZodType<Payload>,
    body: unknown,
    accept: (student: StudentState, payload: Payload) => boolean,
  ): Promise<void> {
    if (!this.allow(socket, rule)) return;
    const parsed = schema.safeParse(body);
    if (!parsed.success) return void this.rejectPayload(socket);

    // A teacher cannot run a student's code, so a mirror message from a
    // watching socket is not a state to record — it is a payload to drop.
    if (socket.data?.teacher?.watch) return;
    const student = socket.data?.student;
    if (!student || student.draftId !== parsed.data.draftId) return;
    if (!accept(student, parsed.data)) return;

    socket
      .to(monitoringRooms.draft(student.academyId, parsed.data.draftId))
      .emit(monitoringServerEvents.terminalChanged, {
        ...parsed.data,
        origin: "STUDENT",
      });
    this.metrics.increment("terminal.delta.forwarded");
  }

  /**
   * Whether one delta may extend the run the socket is currently mirroring.
   *
   * Monotonic rather than strictly consecutive: a refused or dropped delta must
   * not wedge the rest of the run, and the teacher's reducer already treats a
   * hole as a gap and repairs it from a snapshot. What is refused here is a
   * sequence that walks backwards, a delta for a run this socket is not
   * mirroring, and output beyond the run's byte budget.
   */
  private acceptTerminalDelta(
    student: StudentState,
    payload: { clientRunId: string; sequence: number },
    bytes: number,
  ): boolean {
    const run = student.terminal;
    if (!run || run.clientRunId !== payload.clientRunId) {
      this.metrics.increment("terminal.delta.rejected");
      return false;
    }
    if (payload.sequence <= run.sequence) {
      this.metrics.increment("terminal.delta.rejected");
      return false;
    }
    if (bytes > 0 && run.truncated) {
      // Exactly one crossing delta is accepted. Both clients clip that delta
      // through the shared reducer; later output is no longer visible locally
      // and therefore has no legitimate reason to enter the room.
      this.metrics.increment("terminal.budget.exceeded");
      return false;
    }
    run.sequence = payload.sequence;
    if (
      bytes > 0 &&
      run.bytes + bytes > monitoringLimits.terminalTranscriptMaxBytes
    ) {
      run.bytes = monitoringLimits.terminalTranscriptMaxBytes;
      run.truncated = true;
    } else {
      run.bytes += bytes;
    }
    return true;
  }

  /**
   * Restores the minimum student state needed by a cold terminal snapshot.
   *
   * Socket.IO recovery normally retains socket data. After the recovery grace
   * period it does not, so the first snapshot performs the durable ownership
   * check once and re-establishes the student's draft. Deltas after it remain
   * entirely on the in-memory hot path.
   */
  private async requireStudentForTerminalSnapshot(
    socket: MonitoringSocket,
    draftId: string,
  ): Promise<StudentState | null> {
    const current = socket.data?.student;
    if (current?.draftId === draftId) return current;

    const ownedDraft = await this.prisma.exerciseDraft.findFirst({
      where: {
        id: draftId,
        user: { authUserId: socket.data.identity.authUserId },
      },
      select: { course: { select: { academyId: true } } },
    });
    if (!ownedDraft) return null;

    const student = await this.resolveStudent(
      socket,
      ownedDraft.course.academyId,
    );
    if (!student) return null;
    student.draftId = draftId;
    await socket.join(
      monitoringRooms.student(student.academyId, student.membershipId),
    );
    return student;
  }

  private requestTerminalSnapshot(
    academyId: string,
    studentMembershipId: string,
    draftId: string,
  ): void {
    this.server
      .to(monitoringRooms.student(academyId, studentMembershipId))
      .emit(monitoringServerEvents.terminalSnapshotRequest, { draftId });
    this.metrics.increment("terminal.snapshot.requested");
  }

  private allow(socket: MonitoringSocket, event: string): boolean {
    if (!socket.data) return false;
    const allowed = socket.data.limiter.take(event);
    if (!allowed) this.metrics.increment("rate.limited");
    return allowed;
  }

  /** Repeated malformed payloads are a broken or hostile client, not a typo. */
  private rejectPayload(socket: MonitoringSocket): void {
    this.metrics.increment("payload.rejected");
    if (!socket.data) return;
    socket.data.invalidPayloads += 1;
    if (socket.data.invalidPayloads > invalidPayloadAllowance) {
      socket.disconnect(true);
    }
  }

  private async requireClassClaim(
    socket: MonitoringSocket,
    academyId: string,
    classId: string,
  ): Promise<MonitoringClassClaim> {
    const actor = await this.access.requireTeacher(socket.data.identity, academyId);
    await this.access.requireFeature(academyId);
    return this.access.requireAssignedClass(actor, classId);
  }

  /** Re-runs the whole predicate when a claim is older than its lifetime. */
  private async revalidate(
    socket: MonitoringSocket,
    claim: MonitoringClassClaim,
  ): Promise<void> {
    if (Date.now() - claim.grantedAt < monitoringTiming.accessClaimTtlMs) return;
    await this.requireClassClaim(socket, claim.academyId, claim.classId);
  }

  /**
   * Who may touch one draft room.
   *
   * A teacher qualifies through the watch they opened; a student qualifies by
   * owning the draft. Room membership alone is never the answer — that is what
   * a leaked or guessed room name would give.
   */
  private async requireDraftAccess(
    socket: MonitoringSocket,
    draftId: string,
  ): Promise<string> {
    const watch = socket.data?.teacher?.watch;
    if (watch) {
      if (watch.draftId !== draftId) throw publicError("MONITORING_ACCESS_DENIED");
      if (!(await this.activeWatches.isActive(watch.claim.membershipId, watch.visitId))) {
        throw publicError("MONITORING_ACCESS_DENIED");
      }
      await this.revalidate(socket, watch.claim);
      return monitoringRooms.draft(watch.claim.academyId, draftId);
    }

    const student = socket.data?.student;
    const draft = await this.prisma.exerciseDraft.findFirst({
      where: { id: draftId },
      select: { id: true, userId: true },
    });
    if (!draft) throw publicError("MONITORING_ACCESS_DENIED");

    const owner = await this.prisma.user.findFirst({
      where: { id: draft.userId, authUserId: socket.data.identity.authUserId },
      select: { id: true },
    });
    if (!owner) throw publicError("MONITORING_ACCESS_DENIED");

    const academyId = student?.academyId;
    if (!academyId) throw publicError("MONITORING_ACCESS_DENIED");
    if (student) student.draftId = draftId;
    await socket.join(monitoringRooms.student(academyId, student!.membershipId));
    return monitoringRooms.draft(academyId, draftId);
  }

  /**
   * The student's membership and the classes their presence belongs to.
   *
   * Resolved once per connection: a student in two classes appears on both
   * rosters, and each roster only ever sees its own teacher.
   */
  private async resolveStudent(
    socket: MonitoringSocket,
    academyId: string,
  ): Promise<StudentState | null> {
    if (socket.data.student?.academyId === academyId) return socket.data.student;

    const membership = await this.prisma.academyMembership.findFirst({
      where: {
        academyId,
        role: "STUDENT",
        status: "ACTIVE",
        user: {
          authUserId: socket.data.identity.authUserId,
          status: "ACTIVE",
        },
      },
      select: {
        id: true,
        classEnrollments: {
          where: { class: { academyId, status: "ACTIVE" } },
          select: {
            classId: true,
          },
        },
      },
    });
    if (!membership) return null;

    const state: StudentState = {
      academyId,
      membershipId: membership.id,
      classes: membership.classEnrollments.map((enrollment) => ({
        classId: enrollment.classId,
        membershipId: membership.id,
      })),
      materialId: null,
      draftId: null,
      lastSeenPersistedAt: null,
      terminal: null,
    };
    socket.data.student = state;
    await socket.join(monitoringRooms.student(academyId, membership.id));
    return state;
  }

  /**
   * The draft a live workspace collaborates on.
   *
   * Created from the exercise's starter code when the student has not saved
   * yet: the student's editor already shows exactly that, so seeding it is the
   * state they are looking at rather than an invention.
   */
  private async ensureDraft(claim: MonitoringMaterialClaim): Promise<string> {
    const existing = await this.prisma.exerciseDraft.findUnique({
      where: {
        userId_materialId: {
          userId: claim.studentUserId,
          materialId: claim.materialId,
        },
      },
      select: { id: true },
    });
    if (existing) return existing.id;

    const exercise = await this.prisma.programmingExercise.findUnique({
      where: { materialId: claim.materialId },
      select: { starterCode: true },
    });
    const draft = await this.prisma.exerciseDraft.create({
      data: {
        userId: claim.studentUserId,
        materialId: claim.materialId,
        sourceMaterialId: claim.materialId,
        courseId: claim.courseId,
        code: exercise?.starterCode ?? "",
      },
      select: { id: true },
    });
    return draft.id;
  }

  private async publishPresence(
    academyId: string,
    classId: string,
    entry: PresenceEntry | null,
  ): Promise<void> {
    if (!entry) return;
    const version = await this.presence.nextVersion(academyId, classId);
    if (version === null) return;
    const snapshot = await this.presence.snapshot(academyId, classId);
    if (!snapshot) return;
    this.server
      .to(monitoringRooms.classPresence(academyId, classId))
      .emit(monitoringServerEvents.presenceChanged, {
        classId,
        version,
        previousVersion: version - 1,
        entry,
        onlineCount: snapshot.onlineCount,
        solvingCount: snapshot.solvingCount,
      });
  }

  /**
   * The server saying, on a peer's behalf, that their mouse and caret are gone.
   *
   * A client clears its own awareness when its collaborative workspace tears
   * down. It cannot do so when the transport dies under it or when its
   * authorization is withdrawn, and the teacher deliberately holds the
   * student's markers without an idle timer — so the end of a connection or a
   * watch is announced with the same event a client would have sent, stamped
   * with the origin the gateway knows rather than one a payload claimed.
   *
   * Nothing here is stored; this is the absence of state, published.
   */
  private clearAwareness(
    academyId: string,
    draftId: string,
    origin: "STUDENT" | "TEACHER",
  ): void {
    this.server
      .to(monitoringRooms.draft(academyId, draftId))
      .emit(monitoringServerEvents.awarenessChanged, {
        draftId,
        cursor: null,
        pointer: null,
        origin,
      });
  }

  private async endWatch(
    socket: MonitoringSocket,
    reason: MonitoringVisitEndReason,
  ): Promise<void> {
    const watch = socket.data?.teacher?.watch;
    if (!watch) return;
    socket.data.teacher!.watch = null;

    await this.visits.end(watch.visitId, reason);
    await this.activeWatches.clear(watch.claim.membershipId, watch.visitId);
    // Said while the room still exists and this socket is still in it. After
    // the leave below there is no longer anything to send it through, and the
    // student would be left with the teacher's last caret on their screen.
    this.clearAwareness(watch.claim.academyId, watch.draftId, "TEACHER");
    await socket.leave(
      monitoringRooms.draft(watch.claim.academyId, watch.draftId),
    );
    const endedAt = new Date().toISOString();
    const payload = {
      classId: watch.claim.classId,
      studentMembershipId: watch.claim.studentMembershipId,
      reason,
      endedAt,
    };
    socket.emit(monitoringServerEvents.watchEnded, payload);
    // The indicator disappears only on a confirmed end. A dropped connection
    // shows reconnecting instead, so a blink never reads as "they left".
    this.server
      .to(
        monitoringRooms.student(
          watch.claim.academyId,
          watch.claim.studentMembershipId,
        ),
      )
      .emit(monitoringServerEvents.watchEnded, payload);
  }

  private async disconnectReplacedWatch(
    academyId: string,
    teacherMembershipId: string,
    visitId: string,
  ): Promise<void> {
    const sockets = await this.server
      .in(monitoringRooms.teacher(academyId, teacherMembershipId))
      .fetchSockets();
    for (const candidate of sockets) {
      const data = candidate.data as Partial<MonitoringSocketData>;
      if (data.teacher?.watch?.visitId !== visitId) continue;
      candidate.emit(monitoringServerEvents.watchEnded, {
        classId: data.teacher.watch.claim.classId,
        studentMembershipId: data.teacher.watch.claim.studentMembershipId,
        reason: "WATCH_REPLACED",
        endedAt: new Date().toISOString(),
      });
      candidate.disconnect(true);
    }
  }
}

function bearerFromHandshake(socket: Socket): string | null {
  const auth = socket.handshake.auth as { token?: unknown } | undefined;
  if (typeof auth?.token === "string" && auth.token.trim().length > 0) {
    return auth.token.trim();
  }
  const header = socket.handshake.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim() || null;
  }
  return null;
}

/** A failure still has to be attributable to the command that caused it. */
function eventIdOf(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    typeof (body as { eventId?: unknown }).eventId === "string"
  ) {
    return (body as { eventId: string }).eventId;
  }
  return randomUUID();
}

function publicError(code: AppErrorCode): Error & { code: AppErrorCode } {
  return Object.assign(new Error(code), { code });
}
