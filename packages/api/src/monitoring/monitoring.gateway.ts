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
  monitoringProtocolVersion,
  monitoringRooms,
  monitoringServerEvents,
  monitoringTiming,
  monitoringWatchLease,
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
  toSharedDocumentText,
  watchModePayloadSchema,
  watchStartPayloadSchema,
  watchStopPayloadSchema,
  watchSummaryFetchPayloadSchema,
  type AppErrorCode,
  type DocumentSyncResult,
  type MonitoringAck,
  type MonitoringVisitEndReason,
  type MonitoringWatchMode,
  type MonitoringWatchSummary,
  type NavigatorPath,
  type PresenceEntry,
  type WatchIdentity,
} from "@cove/shared";
import type { Server, Socket } from "socket.io";
import type { z } from "zod";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { StudentSessionService } from "../auth/student-session.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { effectivelyVisibleMaterialWhere } from "../learn/curriculum-visibility.js";
import { LearningActivityAccumulator } from "../teach/learning-activity.accumulator.js";
import { CollaborationDocumentService } from "./collaboration-document.service.js";
import { WatchSessionRegistry, type WatchLease } from "./watch-session.registry.js";
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

/**
 * One live workspace, as this connection sees it.
 *
 * The three identity fields are not redundant. `sessionId` is the workspace's
 * own correlation value and survives a transport reconnect; `visitId` names
 * the audit row this watch currently owns; `generation` is what makes a
 * command from before a reconnect distinguishable from one after it, even when
 * both name the same draft. Every privileged message is checked against all
 * three and against the registry lease behind them.
 */
type WatchState = {
  claim: MonitoringMaterialClaim;
  sessionId: string;
  visitId: string;
  generation: number;
  draftId: string;
  /**
   * Read-only until an acknowledged command says otherwise.
   *
   * The authority is the registry lease, not this field — a client that
   * unlocked its own editor still has its writes refused, because
   * `documentUpdate` reads the mode back from the lease rather than from the
   * socket's optimistic copy.
   */
  mode: MonitoringWatchMode;
  /** Server-assigned awareness identity. Five tabs are five distinct peers. */
  peerId: string;
  peerLabel: string | null;
  /** Keeps the lease alive while this socket is connected and authorized. */

};

type TeacherState = {
  /**
   * Whose socket this is.
   *
   * Held so a scoped revocation can tell one teacher's roster subscription
   * from a colleague's without re-deriving identity from a claim that may
   * already have been removed.
   */
  membershipId: string;
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

/**
 * What a watching teacher was last told about this student, per class.
 *
 * Movement is published from a comparison rather than from every heartbeat: a
 * student sitting on one exercise beats every fifteen seconds for an hour, and
 * a teacher's LIVE marker must move when they move and at no other time.
 */
type PublishedContext = {
  materialId: string | null;
  courseId: string | null;
  available: boolean;
};

type StudentState = {
  awarenessGeneration?: number;
  academyId: string;
  membershipId: string;
  classes: StudentClassMembership[];
  materialId: string | null;
  /**
   * The course the last verified material belonged to.
   *
   * Kept so a disconnect can close the open activity interval. The heartbeat
   * verifies it; nothing here trusts a client's own course id.
   */
  courseId: string | null;
  classId: string | null;
  draftId: string | null;
  /** Throttles the durable `lastLearningSeenAt` write. */
  lastSeenPersistedAt: number | null;
  /** One mirrored run at a time, or none. */
  terminal: TerminalRunState | null;
  /** The last context announced per class, keyed by class id. */
  publishedContext: Map<string, PublishedContext>;
};

type MonitoringSocketData = {
  identity: SupabaseIdentity;
  /** New on every connection, so an old tab's disconnect cannot clear a new one. */
  generation: string;
  limiter: SocketRateLimiter;
  invalidPayloads: number;
  /** Latest awareness packet delivered after asynchronous authorization. */
  awarenessSequence: number;
  teacher: TeacherState | null;
  student: StudentState | null;
  /**
   * Serializes watch starts on this connection.
   *
   * `Return to live`, a reconnect, and a student moving can each begin a watch
   * while one is still opening. Interleaved, they can register a lease against
   * a generation the other has already superseded and leave the audit log with
   * two open visits for one session. Chaining them costs a few milliseconds on
   * a path that already does several round trips.
   */
  watchStarts: Promise<unknown>;
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
  private readonly localWatches = new Map<string, { socket: MonitoringSocket; watch: WatchState }>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private sweepRunning = false;
  private readonly renewTimers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: SupabaseAuthService,
    private readonly studentSessions: StudentSessionService,
    private readonly access: MonitoringAccessService,
    private readonly presence: PresenceRegistry,
    private readonly documents: CollaborationDocumentService,
    private readonly watchSessions: WatchSessionRegistry,
    private readonly visits: MonitoringVisitService,
    private readonly feedback: MonitoringFeedbackService,
    private readonly feedbackBroadcaster: MonitoringFeedbackBroadcaster,
    private readonly revocation: MonitoringRevocationService,
    private readonly metrics: MonitoringMetricsService,
    /**
     * The one consumer of monitoring signals that outlives the lesson.
     *
     * Presence is ephemeral by design; the overview needs a durable daily
     * total, and this is the only path between the two. Analytics never reads
     * live presence back as historical time.
     */
    private readonly activity: LearningActivityAccumulator,
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
            awarenessSequence: -1,
            teacher: null,
            student: null,
            watchStarts: Promise.resolve(),
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
    const revokeLocal = async (visitId: string, reason: MonitoringVisitEndReason) => {
      const owner = this.localWatches.get(visitId);
      if (owner && owner.socket.data.teacher?.watch === owner.watch) await this.endWatch(owner.socket, reason);
    };
    server.on("monitoring:revoke-visit", (visitId: string, reason: MonitoringVisitEndReason) => {
      void revokeLocal(visitId, reason).catch(() => this.metrics.increment("watch.summary.failed"));
    });
    this.revocation.attach(server, async (visitId, reason) => {
      server.serverSideEmit("monitoring:revoke-visit", visitId, reason);
      await revokeLocal(visitId, reason);
    });
    this.sweepTimer = setInterval(() => {
      if (this.sweepRunning) return;
      this.sweepRunning = true;
      void this.sweepExpiredVisits().catch(() => this.metrics.increment("watch.summary.failed"))
        .finally(() => { this.sweepRunning = false; });
    }, monitoringWatchLease.renewIntervalMs);
    this.sweepTimer.unref?.();
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
        codeHash: event.codeHash,
      });
    });
    /**
     * A change the server made reaches every peer in the room.
     *
     * Delivered as an ordinary document update because that is exactly what it
     * is. A client left holding text the server has replaced would compute
     * offsets against a string nobody else has, which is the fault this exists
     * to remove — so it must never be applied on the server alone.
     */
    this.documents.onServerUpdate((event) => {
      const room = this.draftRooms.get(event.draftId);
      if (!room) return;
      this.metrics.increment("document.server_update");
      server.to(room).emit(monitoringServerEvents.documentUpdated, {
        draftId: event.draftId,
        update: event.update,
        origin: "SERVER",
      });
    });
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    for (const timer of this.renewTimers.values()) clearInterval(timer);
  }

  private async sweepExpiredVisits(): Promise<void> {
    if (!this.watchSessions.isAvailable) return;
    const visits = await this.prisma.teacherMonitoringVisit.findMany({
      where: { endedAt: null, startedAt: { lt: new Date(Date.now() - monitoringWatchLease.ttlMs) } },
      select: { id: true },
    });
    for (const visit of visits) {
      if (await this.watchSessions.read(visit.id)) continue;
      const owner = this.localWatches.get(visit.id);
      if (owner && owner.socket.data.teacher?.watch === owner.watch) {
        await this.endWatch(owner.socket, "CONNECTION_EXPIRED");
      } else {
        await this.visits.end(visit.id, "CONNECTION_EXPIRED");
      }
    }
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
    // Finish in-flight acknowledged commands before cleaning up their holds.
    await data.watchStarts;

    if (data.student) {
      // Best effort, and deliberately before the presence work: a clean tab
      // close should keep the minute the student earned, while a crash simply
      // lets the key lapse and undercounts by it.
      if (data.student.courseId && data.student.classId) {
        await this.activity.close(
          data.student.membershipId,
          data.student.classId,
          data.student.courseId,
        );
      }
      // Interrupted, not gone: the roster shows reconnecting for the grace
      // window, because a tunnel is not a student going home.
      await Promise.all(
        data.student.classes.map((entry) =>
          this.presence.markInterrupted(
            data.student!.academyId,
            entry.classId,
            entry.membershipId,
            data.generation,
          ).then(async (entryState) => {
            await this.publishPresence(
              data.student!.academyId,
              entry.classId,
              entryState,
            );
            if (entryState?.state === "RECONNECTING") {
              this.scheduleWatchContextExpiry(data.student!, entry.classId);
            }
          })
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
          studentPeerId(data.student.membershipId),
          data.student.awarenessGeneration,
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
        const teacher = socket.data.teacher ?? {
      membershipId: claim.membershipId,
      claims: new Map(),
      watch: null,
    };
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
   * Opens one live workspace, independently of every other one.
   *
   * The exercise is taken from the server's own presence state, never from the
   * payload: a teacher may open what the student actually has in front of
   * them, not any material they can name.
   *
   * What changed for multi-tab: this no longer displaces the teacher's other
   * watches. A session replaces only the visit *it* previously held — a
   * reconnect, or following this student to another exercise — so five tabs
   * hold five leases, five audit visits, and five independent lifecycles.
   */
  @SubscribeMessage(monitoringClientEvents.watchStart)
  async watchStart(
    @ConnectedSocket() socket: MonitoringSocket,
    @MessageBody() body: unknown,
  ): Promise<
    MonitoringAck<{
      draftId: string;
      materialId: string;
      visitId: string;
      sessionId: string;
      generation: number;
      mode: MonitoringWatchMode;
    }>
  > {
    if (!body || typeof body !== "object" || !("protocolVersion" in body) || body.protocolVersion !== monitoringProtocolVersion) {
      socket.emit(monitoringServerEvents.protocolRefreshRequired, { required: true, serverProtocolVersion: monitoringProtocolVersion });
      return { ok: false, eventId: eventIdOf(body), code: "MONITORING_REFRESH_REQUIRED" };
    }
    return this.command(
      socket,
      monitoringClientEvents.watchStart,
      watchStartPayloadSchema,
      body,
      async (payload) => {
        // An old client's singleton `watch.ended` semantics and this protocol's
        // aggregate ones cannot both hold for one student. Refuse explicitly
        // and name the remedy rather than admitting it into a session where
        // the first tab to close would unbind a document others are editing.
        if ((payload.protocolVersion ?? 0) < monitoringProtocolVersion) {
          socket.emit(monitoringServerEvents.protocolRefreshRequired, {
            required: true as const,
            serverProtocolVersion: monitoringProtocolVersion,
          });
          this.metrics.increment("watch.protocol_stale");
          throw publicError("MONITORING_REFRESH_REQUIRED");
        }
        // Fail closed. Without cross-instance lease state there is no way to
        // know who else is watching, and guessing in either direction is worse
        // than refusing: too low hands a live document back to the student,
        // too high strands them in a session nobody is in.
        if (!this.watchSessions.isAvailable) {
          this.metrics.increment("watch.degraded");
          throw publicError("MONITORING_REALTIME_UNAVAILABLE");
        }

        return this.openWatch(socket, payload);
      },
    );
  }

  /**
   * The whole of opening a watch, after authorization has passed.
   *
   * Split out so the serialization above wraps one function rather than the
   * acknowledgement machinery around it.
   */
  private async openWatch(
    socket: MonitoringSocket,
    payload: {
      academyId: string;
      classId: string;
      studentMembershipId: string;
      sessionId: string;
    },
  ): Promise<{
    draftId: string;
    materialId: string;
    visitId: string;
    sessionId: string;
    generation: number;
    mode: MonitoringWatchMode;
  }> {
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
    if (socket.disconnected) throw publicError("MONITORING_REALTIME_UNAVAILABLE");

    // This connection's previous watch, if it had one. Ended here rather than
    // left to the registry, because its rooms and its document hold are local
    // facts this process owns — and because the teacher is moving, not
    // leaving, so the student's summary must be recomputed either way.
    if (socket.data.teacher?.watch) {
      await this.endWatch(socket, "WATCH_REPLACED");
    }

    const generation = await this.watchSessions.nextGeneration(
      claim.membershipId,
      payload.sessionId,
    );
    const visit = await this.visits.start(claim, {
      sessionId: payload.sessionId,
      replacesVisitId: null,
    });
    const lease: WatchLease = {
      visitId: visit.id,
      sessionId: payload.sessionId,
      generation,
      teacherMembershipId: claim.membershipId,
      academyId: claim.academyId,
      classId: claim.classId,
      studentMembershipId: claim.studentMembershipId,
      draftId,
      mode: "MONITORING",
    };
    const registered = await this.watchSessions.register(lease);
    if (!registered.ok) {
      // A newer start from this same session won the race while this one was
      // in flight. Close the row it opened and let the winner stand.
      await this.visits.end(visit.id, "WATCH_REPLACED");
      this.metrics.increment("watch.superseded");
      throw publicError("MONITORING_WATCH_REPLACED");
    }
    // A reload overlaps the old lease and the new one. The old one belongs to
    // this same session — never to another tab — so releasing it here is what
    // keeps the audit log to one open visit per session without touching
    // anybody else's.
    if (registered.replacedVisitId && registered.replacedVisitId !== visit.id) {
      await this.releaseSupersededVisit(registered.replacedVisitId);
      this.metrics.increment("watch.replaced");
    }

    if (socket.disconnected) {
      await this.watchSessions.end(lease);
      await this.visits.end(visit.id, "CONNECTION_EXPIRED");
      throw publicError("MONITORING_REALTIME_UNAVAILABLE");
    }
    await socket.join([
      monitoringRooms.teacher(claim.academyId, claim.membershipId),
      monitoringRooms.draft(claim.academyId, draftId),
      // Joined by the server, after the whole predicate has passed. The
      // room name is never accepted from a client, and a teacher without
      // an authorized watch is never in it.
      monitoringRooms.watchContext(
        claim.academyId,
        claim.classId,
        claim.studentMembershipId,
      ),
    ]);
    const teacher = socket.data.teacher ?? {
          membershipId: claim.membershipId,
          claims: new Map(),
          watch: null,
        };
    teacher.claims.set(classClaim.classId, classClaim);
    this.documents.beginWatch(draftId, visit.id);
    teacher.watch = {
      claim,
      sessionId: payload.sessionId,
      visitId: visit.id,
      generation,
      draftId,
      mode: "MONITORING",
      // Derived from the visit, so five tabs of one teacher are five peers
      // that cannot overwrite each other's caret — and so a client can never
      // claim to be somebody else's pointer by editing a payload.
      peerId: `teacher:${visit.id}`,
      // Deliberately unnamed. The student is told that somebody is watching
      // and whether they can type, and nothing else — the same rule the
      // indicator has always followed. Peers stay distinguishable to the
      // renderer through `peerId`, which identifies a session rather than a
      // person.
      peerLabel: null,

    };
    socket.data.teacher = teacher;
    this.localWatches.set(visit.id, { socket, watch: teacher.watch });
    this.scheduleLeaseRenewal(socket, teacher.watch);

    const startedAt = visit.startedAt.toISOString();
    socket.emit(monitoringServerEvents.watchStarted, {
      classId: claim.classId,
      studentMembershipId: claim.studentMembershipId,
      materialId: claim.materialId,
      draftId,
      visitId: visit.id,
      indicator: "MONITORING",
      startedAt,
    });
    // The student's own room, so the indicator follows the person rather
    // than whichever socket happened to be in the draft room. A second
    // watcher arriving is an addition: the student uses the visit id to
    // recognise it as one and keeps the document it has already bound.
    this.server
      .to(monitoringRooms.student(claim.academyId, claim.studentMembershipId))
      .emit(monitoringServerEvents.watchStarted, {
        classId: claim.classId,
        studentMembershipId: claim.studentMembershipId,
        materialId: claim.materialId,
        draftId,
        visitId: visit.id,
        indicator: "MONITORING",
        startedAt,
      });
    await this.publishWatchSummary({
      academyId: claim.academyId,
      classId: claim.classId,
      studentMembershipId: claim.studentMembershipId,
      draftId,
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
      sessionId: payload.sessionId,
      generation,
      mode: "MONITORING" as const,
    };
  }

  /**
   * Stopping names the watch it means to stop.
   *
   * A tab that is closing races its own replacement on reload, and an
   * unqualified stop would close whichever watch this socket happened to hold
   * by the time it arrived.
   */
  @SubscribeMessage(monitoringClientEvents.watchStop)
  async watchStop(
    @ConnectedSocket() socket: MonitoringSocket,
    @MessageBody() body: unknown,
  ): Promise<MonitoringAck<{ ended: true }>> {
    const eventId = eventIdOf(body);
    const parsed = watchStopPayloadSchema.safeParse(body);
    const identity = parsed.success ? parsed.data.identity : undefined;
    const watch = socket.data?.teacher?.watch;
    if (watch && identity && matchesWatch(watch, identity)) {
      await this.endWatch(socket, "TEACHER_LEFT");
    }
    return { ok: true, eventId, data: { ended: true } };
  }

  /**
   * Turning edit permission on and off for one watch.
   *
   * The acknowledgement is the permission: Monaco stays read-only until this
   * returns, and `documentUpdate` reads the mode back from the lease, so the
   * UI control is a request rather than the gate. Withdrawing it takes effect
   * at the server immediately — a write already in flight is refused on
   * arrival rather than merged and then undone.
   */
  @SubscribeMessage(monitoringClientEvents.watchMode)
  async watchMode(
    @ConnectedSocket() socket: MonitoringSocket,
    @MessageBody() body: unknown,
  ): Promise<MonitoringAck<{ mode: MonitoringWatchMode }>> {
    return this.command(
      socket,
      monitoringClientEvents.watchMode,
      watchModePayloadSchema,
      body,
      async (payload) => {
        const watch = await this.requireCurrentWatch(socket, payload.identity);
        // The claim is re-run rather than trusted: enabling editing is the
        // moment a read-only session becomes a writing one, and an assignment
        // that changed since the watch opened must be caught here.
        await this.revalidate(socket, watch.claim);
        const renewed = await this.watchSessions.renew(leaseOf(watch), payload.mode);
        if (!renewed) throw publicError("MONITORING_ACCESS_DENIED");
        watch.mode = payload.mode;
        socket.emit(monitoringServerEvents.watchModeChanged, {
          visitId: watch.visitId,
          generation: watch.generation,
          mode: payload.mode,
        });
        await this.publishWatchSummary({
          academyId: watch.claim.academyId,
          classId: watch.claim.classId,
          studentMembershipId: watch.claim.studentMembershipId,
          draftId: watch.draftId,
        });
        this.metrics.increment(
          payload.mode === "HELPING" ? "watch.help.enabled" : "watch.help.disabled",
        );
        return { mode: payload.mode };
      },
    );
  }

  /**
   * A student asking what is currently true, rather than replaying what it
   * missed.
   *
   * A reconnecting workspace cannot know which summaries were delivered while
   * its transport was down, and an indicator rebuilt from an incomplete event
   * stream is wrong in both directions. This is the authoritative answer.
   */
  @SubscribeMessage(monitoringClientEvents.watchSummaryFetch)
  async watchSummaryFetch(
    @ConnectedSocket() socket: MonitoringSocket,
    @MessageBody() body: unknown,
  ): Promise<MonitoringAck<MonitoringWatchSummary>> {
    return this.command(
      socket,
      monitoringClientEvents.watchSummaryFetch,
      watchSummaryFetchPayloadSchema,
      body,
      async (payload) => {
        const student = await this.resolveStudent(socket, payload.academyId);
        // Only about one's own draft. The summary is a count, but a count of
        // who is watching a named student is still a fact about that student.
        if (!student) throw publicError("MONITORING_ACCESS_DENIED");
        await this.requireDraftAccess(socket, payload.draftId, "identity" in payload ? payload.identity as WatchIdentity : undefined);
        const scope = {
          academyId: student.academyId, classId: null,
          studentMembershipId: student.membershipId, draftId: payload.draftId,
        };
        const before = await this.watchSessions.summarize(scope);
        const snapshot = before.watcherCount === 0
          ? await this.documents.endWatch(payload.draftId, "summary-recovery", { remoteWatchers: 0 })
          : null;
        const summary = await this.watchSessions.summarize({ ...scope, classId: null });
        return { ...summary, snapshot: summary.watcherCount === 0 ? snapshot : null };
      },
    );
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
    if (parsed.data.protocolVersion !== monitoringProtocolVersion) {
      socket.emit(monitoringServerEvents.protocolRefreshRequired, { required: true, serverProtocolVersion: monitoringProtocolVersion });
      return;
    }

    if (!this.presence.isAvailable) return;

    const student = await this.resolveStudent(socket, parsed.data.academyId);
    if (!student) return;
    try {
      await this.studentSessions.requireActive(socket.data.identity);
    } catch {
      // The HTTP guard will preserve the draft and sign the page out. The
      // socket must stop accepting learning signals immediately meanwhile.
      socket.disconnect(true);
      return;
    }
    // The same verification the roster needs, selecting the titles the
    // watch-context event needs as well: a movement event has to name where
    // the student went, and re-reading the curriculum to find out would put a
    // second query on the heartbeat path.
    const material = parsed.data.materialId
      ? await this.prisma.material.findFirst({
          where: {
            id: parsed.data.materialId,
            ...effectivelyVisibleMaterialWhere(student.academyId),
          },
          select: {
            id: true,
            title: true,
            lecture: {
              select: {
                id: true,
                title: true,
                courseModule: {
                  select: {
                    id: true,
                    title: true,
                    courseId: true,
                    course: { select: { id: true, title: true } },
                  },
                },
              },
            },
          },
        })
      : null;
    const requestedCourseId = parsed.data.materialId
      ? material?.lecture.courseModule.courseId ?? null
      : parsed.data.courseId;
    const eligibleClassIds = requestedCourseId
      ? new Set(
          (
            await this.prisma.classCourse.findMany({
              where: {
                courseId: requestedCourseId,
                classId: { in: student.classes.map((entry) => entry.classId) },
                class: { status: "ACTIVE" },
              },
              select: { classId: true },
            })
          ).map((assignment) => assignment.classId),
        )
      : new Set<string>();
    const verifiedCourseId =
      requestedCourseId && eligibleClassIds.size > 0 ? requestedCourseId : null;
    const verifiedClassId =
      verifiedCourseId && parsed.data.classId && eligibleClassIds.has(parsed.data.classId)
        ? parsed.data.classId
        : null;
    const nextMaterialId = material && verifiedClassId ? material.id : null;
    if (student.materialId !== nextMaterialId) student.draftId = null;
    student.materialId = nextMaterialId;
    // Moving to another course closes the interval that belonged to the last
    // one, so time is attributed to the course the student was actually in.
    if (
      student.courseId &&
      student.classId &&
      (student.courseId !== verifiedCourseId || student.classId !== verifiedClassId)
    ) {
      await this.activity.close(
        student.membershipId,
        student.classId,
        student.courseId,
      );
    }
    student.courseId = verifiedClassId ? verifiedCourseId : null;
    student.classId = verifiedClassId;

    for (const entry of student.classes) {
      const visibleInClass =
        verifiedCourseId !== null && verifiedClassId === entry.classId;
      const state = await this.presence.publish({
        academyId: student.academyId,
        classId: entry.classId,
        studentMembershipId: entry.membershipId,
        socketGeneration: socket.data.generation,
        materialId: visibleInClass ? material?.id ?? null : null,
        courseId: visibleInClass ? verifiedCourseId : null,
        visibility: parsed.data.visibility,
        active: parsed.data.active,
      });
      await this.publishPresence(student.academyId, entry.classId, state);
      this.publishWatchContext(student, entry.classId, {
        available: visibleInClass,
        materialId: visibleInClass ? material?.id ?? null : null,
        courseId: visibleInClass ? verifiedCourseId : null,
        path:
          visibleInClass && material
            ? {
                course: {
                  id: material.lecture.courseModule.course.id,
                  title: material.lecture.courseModule.course.title,
                },
                module: {
                  id: material.lecture.courseModule.id,
                  title: material.lecture.courseModule.title,
                },
                lecture: {
                  id: material.lecture.id,
                  title: material.lecture.title,
                },
                exercise: { materialId: material.id, title: material.title },
              }
            : null,
      });
    }

    // Reopen a student's binding after reload even when no teacher starts a
    // new watch. Their new connection missed the original watchStarted event.
    if (student.materialId && verifiedClassId && !student.draftId) {
      const leases = await this.watchSessions.list({
        academyId: student.academyId, classId: verifiedClassId,
        studentMembershipId: student.membershipId,
      });
      if (leases.length) {
        const draft = await this.prisma.exerciseDraft.findFirst({
          where: { id: { in: leases.map((lease) => lease.draftId) }, materialId: student.materialId },
          select: { id: true },
        });
        if (draft) {
          socket.emit(monitoringServerEvents.watchStarted, {
            classId: verifiedClassId, studentMembershipId: student.membershipId,
            materialId: student.materialId, draftId: draft.id,
            indicator: "MONITORING", startedAt: new Date().toISOString(),
          });
          await this.publishWatchSummary({ academyId: student.academyId, classId: verifiedClassId,
            studentMembershipId: student.membershipId, draftId: draft.id });
        }
      }
    }

    // Counted active learning time, §7.1.
    //
    // Interaction earns time only while the learning page is foreground-visible.
    // A hidden signal closes the open interval instead of billing a background
    // tab for an interaction that happened before the visibility transition.
    if (verifiedCourseId && verifiedClassId) {
      await this.activity.record({
        academyId: student.academyId,
        membershipId: student.membershipId,
        classId: verifiedClassId,
        courseId: verifiedCourseId,
        active:
          parsed.data.active && parsed.data.visibility === "VISIBLE",
      });
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
          classId: verifiedClassId ?? "00000000-0000-0000-0000-000000000000",
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
    if (!watch || watch.draftId !== parsed.data.draftId || !parsed.data.identity || !matchesWatch(watch, parsed.data.identity)) return;
    // The lease, not the socket's memory: a watch whose access was revoked on
    // another instance must stop being able to ask the student for their
    // transcript, and this socket has not been told yet.
    if (!(await this.watchSessions.isCurrent(watch))) return;
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
  ): Promise<MonitoringAck<DocumentSyncResult>> {
    return this.command(
      socket,
      monitoringClientEvents.documentSync,
      documentSyncPayloadSchema,
      body,
      async (payload) => {
        const room = await this.requireDraftAccess(socket, payload.draftId, "identity" in payload ? payload.identity as WatchIdentity : undefined);
        await socket.join(room);
        this.draftRooms.set(payload.draftId, room);
        const sync = await this.documents.sync(
          payload.draftId,
          payload.stateVector,
        );
        const result: DocumentSyncResult = {
          draftId: payload.draftId,
          update: sync.update,
          stateVector: sync.stateVector,
          persistedCodeHash: sync.persistedCodeHash,
        };
        socket.emit(monitoringServerEvents.documentSynced, result);
        this.metrics.increment("document.resync");
        return result;
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
        const room = await this.requireDraftAccess(socket, payload.draftId, "identity" in payload ? payload.identity as WatchIdentity : undefined);
        const watch = socket.data.teacher?.watch;

        if (watch) {
          // The authorization gate the previous version did not have: a
          // teacher write was accepted on the strength of holding a watch, and
          // "helping" was then *inferred* from the write having happened. So a
          // client that unlocked its own Monaco could edit a student's code
          // without the student's indicator ever being a promise about
          // permission. Now permission is a server-recorded mode, checked
          // here, before a byte is merged.
          const lease = await this.requireEditPermission(watch, payload.identity);
          if (lease.mode !== "HELPING") {
            this.metrics.increment("document.update.unauthorized");
            // A refusal is not a silent drop: the client's document has
            // already applied this locally, so it has to be brought back to
            // the canonical text rather than left holding a divergent buffer.
            // Resynchronizing is the repair — never a whole-buffer overwrite
            // from a client that was not allowed to write in the first place.
            const sync = await this.documents.sync(
              payload.draftId,
              new Uint8Array([0]),
            );
            socket.emit(monitoringServerEvents.documentSynced, {
              draftId: payload.draftId,
              update: sync.update,
              stateVector: sync.stateVector,
              persistedCodeHash: sync.persistedCodeHash,
            });
            throw publicError("MONITORING_EDIT_NOT_ENABLED");
          }
        }

        await this.documents.applyUpdate(payload.draftId, payload.update);
        const origin = watch ? "TEACHER" : "STUDENT";

        socket.to(room).emit(monitoringServerEvents.documentUpdated, {
          draftId: payload.draftId,
          update: payload.update,
          origin,
        });

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
    if (parsed.data.editorPointer?.code?.draftId !== undefined &&
        parsed.data.editorPointer.code.draftId !== parsed.data.draftId) return void this.rejectPayload(socket);
    let room: string;
    try {
      room = await this.requireDraftAccess(socket, parsed.data.draftId, parsed.data.identity);
    } catch {
      return;
    }
    // Ownership checks can finish out of order under database or Redis load.
    // Never let an older caret/pointer overwrite a newer position (or clear).
    if (parsed.data.sequence <= socket.data.awarenessSequence) return;
    socket.data.awarenessSequence = parsed.data.sequence;
    const watch = socket.data?.teacher?.watch;
    if (watch) {
      // A teacher's pointer belongs to the watch that is current, not to
      // whichever one this payload names. A packet stamped with a superseded
      // generation is dropped rather than forwarded, so a reconnect's arrow
      // cannot be erased by the arrow that preceded it.
      if (!parsed.data.identity || !matchesWatch(watch, parsed.data.identity)) {
        return;
      }
      // Pointing is not editing. A read-only teacher may show a student where
      // to look — that is the whole of what monitoring is for — and the caret
      // they publish grants them nothing, because permission lives in the
      // lease and is checked on write.
    }
    // Volatile by design: a cursor that arrives late is worse than one that
    // never arrives, and none of this is ever persisted.
    socket.to(room).emit(monitoringServerEvents.awarenessChanged, {
      ...parsed.data,
      identity: undefined,
      origin: watch ? "TEACHER" : "STUDENT",
      // Assigned here, never accepted from the payload. Five tabs are five
      // peers; a client that could name its own peer id could overwrite
      // another teacher's cursor or erase it.
      peerId: watch
        ? watch.peerId
        : studentPeerId(socket.data.student?.membershipId ?? "unknown"),
      peerLabel: watch ? watch.peerLabel : null,
      generation: watch?.generation ?? socket.data.student?.awarenessGeneration,
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
        await this.requireCurrentWatch(socket, payload.identity);
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
      const previous = socket.data.watchStarts ?? Promise.resolve();
      const pending = previous.then(() => run(parsed.data));
      socket.data.watchStarts = pending.catch(() => undefined);
      return { ok: true, eventId, data: await pending };
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
    this.access.requireLiveWatch(actor);
    await this.access.requireFeature(academyId);
    return this.access.requireAssignedClass(actor, classId);
  }

  /** Re-runs the whole predicate when a claim is older than its lifetime. */
  private async revalidate(
    socket: MonitoringSocket,
    claim: MonitoringClassClaim,
  ): Promise<void> {
    if (Date.now() - claim.grantedAt < monitoringTiming.accessClaimTtlMs) return;
    const renewed = await this.requireClassClaim(socket, claim.academyId, claim.classId);
    // A class grant alone says nothing about a student who was unenrolled or
    // material that stopped belonging to this class. This is also the backstop
    // when a revocation notification could not reach the owning instance.
    if ("studentMembershipId" in claim && typeof claim.studentMembershipId === "string") {
      const student = await this.access.requireMonitorableStudent(renewed, claim.studentMembershipId);
      if ("materialId" in claim && typeof claim.materialId === "string") {
        await this.access.requireMonitorableMaterial(student, claim.materialId);
      }
    }
    claim.grantedAt = renewed.grantedAt;
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
    identity?: WatchIdentity,
  ): Promise<string> {
    const watch = socket.data?.teacher?.watch;
    if (watch) {
      if (!identity || !matchesWatch(watch, identity)) throw publicError("MONITORING_ACCESS_DENIED");
      if (watch.draftId !== draftId) throw publicError("MONITORING_ACCESS_DENIED");
      if (!(await this.watchSessions.isCurrent(watch))) {
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
      awarenessGeneration: this.watchSessions.isAvailable ? await this.watchSessions.nextGeneration(membership.id, "student") : undefined,
      academyId,
      membershipId: membership.id,
      classes: membership.classEnrollments.map((enrollment) => ({
        classId: enrollment.classId,
        membershipId: membership.id,
      })),
      materialId: null,
      courseId: null,
      classId: null,
      draftId: null,
      lastSeenPersistedAt: null,
      terminal: null,
      publishedContext: new Map(),
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
    try {
      const draft = await this.prisma.exerciseDraft.create({
        data: {
          userId: claim.studentUserId,
          materialId: claim.materialId,
          sourceMaterialId: claim.materialId,
          courseId: claim.courseId,
          code: toSharedDocumentText(exercise?.starterCode ?? ""),
        },
        select: { id: true },
      });
      return draft.id;
    } catch (error) {
      // The student's first autosave or another watch can create this row
      // between our read and insert. Adopt that draft without replacing its text.
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        const concurrent = await this.prisma.exerciseDraft.findUnique({
          where: { userId_materialId: { userId: claim.studentUserId, materialId: claim.materialId } },
          select: { id: true },
        });
        if (concurrent) return concurrent.id;
      }
      throw error;
    }
  }

  /**
   * The watched student moved, or stopped being watchable.
   *
   * Emitted on a verified change and on nothing else — not on a heartbeat, not
   * on an activity beat, and not on a material the class is not taught, which
   * becomes unavailable rather than being broadcast. The payload carries where
   * the student is and nothing about what they are doing there: no code, no
   * draft id, no test data, no feedback, and no identity beyond the membership
   * the teacher already watches.
   *
   * Advisory by design. A teacher following it performs a fresh `watchStart`,
   * so this event is never the authorization for anything.
   */
  private publishWatchContext(
    student: StudentState,
    classId: string,
    context: {
      materialId: string | null;
      courseId: string | null;
      path: NavigatorPath | null;
      available: boolean;
    },
  ): void {
    const previous = student.publishedContext.get(classId);
    if (
      previous &&
      previous.materialId === context.materialId &&
      previous.courseId === context.courseId &&
      previous.available === context.available
    ) {
      return;
    }
    student.publishedContext.set(classId, {
      materialId: context.materialId,
      courseId: context.courseId,
      available: context.available,
    });

    this.server
      .to(
        monitoringRooms.watchContext(
          student.academyId,
          classId,
          student.membershipId,
        ),
      )
      .emit(monitoringServerEvents.studentContextChanged, {
        studentMembershipId: student.membershipId,
        materialId: context.materialId,
        courseId: context.courseId,
        path: context.path,
        available: context.available,
        changedAt: new Date().toISOString(),
      });
    this.metrics.increment("watch.context.changed");
  }

  /**
   * A dropped transport remains followable during Socket.IO's recovery grace.
   * If it does not recover, presence becomes authoritative for the absence and
   * the focused teacher must lose the LIVE marker too. The snapshot check is
   * essential: an old socket's timer must never clear a newer connection.
   */
  private scheduleWatchContextExpiry(
    student: StudentState,
    classId: string,
  ): void {
    const timer = setTimeout(() => {
      void this.expireWatchContext(student, classId);
    }, monitoringTiming.recoveryGraceMs + 1);
    timer.unref?.();
  }

  private async expireWatchContext(
    student: StudentState,
    classId: string,
  ): Promise<void> {
    const snapshot = await this.presence.snapshot(student.academyId, classId);
    if (!snapshot) return;
    const current = snapshot.entries.find(
      (entry) => entry.studentMembershipId === student.membershipId,
    );
    if (current && current.state !== "OFFLINE") return;
    this.publishWatchContext(student, classId, {
      materialId: null,
      courseId: null,
      path: null,
      available: false,
    });
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
  /**
   * One peer's markers, withdrawn.
   *
   * `peerId` is what makes this safe with several teachers in the room. The
   * previous version cleared every `TEACHER` marker on the draft, so the
   * moment one of five tabs closed, the student's screen lost all five
   * arrows — and the four still-live teachers had to move the mouse before
   * reappearing. The generation travels with it so a clear that was delayed
   * behind a reconnect cannot erase the session that replaced it.
   */
  private clearAwareness(
    academyId: string,
    draftId: string,
    origin: "STUDENT" | "TEACHER",
    peerId: string,
    generation?: number,
  ): void {
    this.server
      .to(monitoringRooms.draft(academyId, draftId))
      .emit(monitoringServerEvents.awarenessChanged, {
        draftId,
        cursor: null,
        pointer: null,
        origin,
        peerId,
        ...(generation === undefined ? {} : { generation }),
      });
  }

  /**
   * Ends the watch this connection holds, and nothing else.
   *
   * Every step is scoped to one visit: the audit row, the lease, this socket's
   * rooms, this process's document hold, and this teacher's own
   * `watch.ended`. What the *student* is told is a recomputed aggregate, never
   * this event — one of five watchers leaving is not the student's session
   * ending, and sending a bare ending would unbind a document the other four
   * are still reading.
   */
  private async endWatch(
    socket: MonitoringSocket,
    reason: MonitoringVisitEndReason,
  ): Promise<void> {
    const watch = socket.data?.teacher?.watch;
    if (!watch) return;
    socket.data.teacher!.watch = null;
    clearInterval(this.renewTimers.get(watch.visitId));
    this.renewTimers.delete(watch.visitId);

    // Said while the room still exists and this socket is still in it. After
    // the leave below there is no longer anything to send it through, and the
    // student would be left with this teacher's last caret on their screen.
    // Addressed to this peer alone: another tab's arrow is not this one's to
    // remove, and a lifecycle clear that erased every teacher marker is
    // precisely how duplicate watches used to wipe each other out.
    this.clearAwareness(
      watch.claim.academyId,
      watch.draftId,
      "TEACHER",
      watch.peerId,
      watch.generation,
    );
    await socket.leave(
      monitoringRooms.draft(watch.claim.academyId, watch.draftId),
    );
    // Movement is only ever delivered to a watch that is still open. A
    // replaced watch leaves here and joins the new student's room in
    // `watchStart`, so a teacher never receives two students' movement.
    await socket.leave(
      monitoringRooms.watchContext(
        watch.claim.academyId,
        watch.claim.classId,
        watch.claim.studentMembershipId,
      ),
    );
    await this.finishEndedWatch(watch, reason);
  }

  private async finishEndedWatch(watch: WatchState, reason: MonitoringVisitEndReason): Promise<void> {
    try {
      await this.visits.end(watch.visitId, reason);
      await this.watchSessions.end(leaseOf(watch));
      await this.releaseDocumentHold(watch, reason);
      this.localWatches.delete(watch.visitId);
      this.renewTimers.delete(watch.visitId);
    } catch {
      // Room eviction has already happened. Retry persistence/lease cleanup
      // without ever reopening this socket or losing the document hold.
      this.metrics.increment("watch.summary.failed");
      const timer = setTimeout(() => { void this.finishEndedWatch(watch, reason); }, monitoringWatchLease.renewIntervalMs);
      timer.unref?.();
      this.renewTimers.set(watch.visitId, timer);
    }
  }

  /**
   * Hands the document back only when the last watch anywhere has gone.
   *
   * The local visit set answers "may this process drop its cache"; the
   * registry answers "is anybody still watching", and only the second may
   * authorize the student to resume ordinary autosave. A failed flush returns
   * no snapshot, and the student is told the count rather than being handed a
   * revision that was never written.
   */
  private async releaseDocumentHold(
    watch: WatchState,
    reason: MonitoringVisitEndReason,
  ): Promise<void> {
    const remoteWatchers = await this.watchSessions.watcherCount(watch.draftId);
    const snapshot = await this.documents.endWatch(watch.draftId, watch.visitId, {
      remoteWatchers,
    });
    const endedAt = new Date().toISOString();
    const payload = {
      snapshot,
      classId: watch.claim.classId,
      studentMembershipId: watch.claim.studentMembershipId,
      draftId: watch.draftId,
      visitId: watch.visitId,
      reason,
      endedAt,
    };
    // The teacher's own tab is told its own watch ended. The other four tabs
    // hold different visit ids and discard this.
    this.server
      .to(monitoringRooms.teacher(watch.claim.academyId, watch.claim.membershipId))
      .emit(monitoringServerEvents.watchEnded, payload);
    await this.publishWatchSummary(
      {
        academyId: watch.claim.academyId,
        classId: watch.claim.classId,
        studentMembershipId: watch.claim.studentMembershipId,
        draftId: watch.draftId,
      },
      // Offered on the final release and only then: a snapshot is a promise
      // that the authoritative text is durable, and it is the one thing that
      // lets the student's editor stop deferring to the shared document.
      snapshot,
    );
  }

  /**
   * Closes a visit this same session is replacing after a reload.
   *
   * The old socket may be on another instance, or already gone. Either way the
   * lease and the audit row are this session's to close, and the student's
   * count has to be recomputed so a reload does not read as a new watcher
   * arriving while the old one lingers.
   */
  private async releaseSupersededVisit(visitId: string): Promise<void> {
    const lease = await this.watchSessions.endByVisitId(visitId);
    if (!lease) return;
    await this.visits.end(visitId, "WATCH_REPLACED");
    this.server.serverSideEmit("monitoring:revoke-visit", visitId, "WATCH_REPLACED");
    const previousOwner = this.localWatches.get(visitId);
    if (previousOwner?.socket.data.teacher?.watch === previousOwner?.watch && previousOwner) {
      await this.endWatch(previousOwner.socket, "WATCH_REPLACED");
      return;
    }
    const remoteWatchers = await this.watchSessions.watcherCount(lease.draftId);
    await this.documents.endWatch(lease.draftId, visitId, { remoteWatchers });
    this.clearAwareness(
      lease.academyId,
      lease.draftId,
      "TEACHER",
      `teacher:${visitId}`,
      lease.generation,
    );
    await this.publishWatchSummary({
      academyId: lease.academyId,
      classId: lease.classId,
      studentMembershipId: lease.studentMembershipId,
      draftId: lease.draftId,
    });
  }

  /**
   * The student's authoritative count, published after anything that changes it.
   *
   * Versioned rather than ordered by arrival: two instances can publish about
   * one student within the same millisecond, and the client discards by
   * revision instead of trusting the wire.
   */
  private async publishWatchSummary(
    scope: {
      academyId: string;
      classId: string | null;
      studentMembershipId: string;
      draftId: string | null;
    },
    snapshot?: { code: string; updatedAt: string } | null,
  ): Promise<void> {
    if (!this.watchSessions.isAvailable) return;
    try {
      const summary = await this.watchSessions.summarize({ ...scope, classId: null });
      this.server
        .to(
          monitoringRooms.student(scope.academyId, scope.studentMembershipId),
        )
        .emit(monitoringServerEvents.watchSummary, {
          ...summary,
          ...(snapshot === undefined ? {} : { snapshot }),
        });
    } catch (error) {
      // A summary that cannot be built must not take the watch down with it.
      // The student keeps the state they have; the next change republishes.
      this.metrics.increment("watch.summary.failed");
      this.logger.warn(
        monitoringLogLine({
          event: "monitoring.summary_failed",
          academyId: scope.academyId,
          reason: toPublicErrorCode(error),
        }),
      );
    }
  }

  /**
   * Keeps one lease alive while its socket is connected and authorized.
   *
   * Browser activity is deliberately not a condition: a teacher reading a
   * student's code for four minutes without touching the mouse is watching,
   * and a lease that expired under them would clear the student's indicator
   * while somebody was still looking.
   *
   * A refused renewal means this generation no longer owns the session — it
   * was superseded, or the lease lapsed while the process was unreachable —
   * and the watch is closed here rather than left believing it is live.
   */
  private scheduleLeaseRenewal(
    socket: MonitoringSocket,
    watch: WatchState,
  ): void {
    const timer = setInterval(() => {
      void (async () => {
        if (socket.data?.teacher?.watch !== watch) {
          clearInterval(this.renewTimers.get(watch.visitId));
    this.renewTimers.delete(watch.visitId);
    this.localWatches.delete(watch.visitId);
          return;
        }
        let renewed = false;
        try {
          await this.revalidate(socket, watch.claim);
          renewed = await this.watchSessions.renew(leaseOf(watch));
        } catch {
          renewed = false;
        }
        if (renewed && !socket.disconnected) return;
        this.metrics.increment("watch.lease.lost");
        if (socket.data.teacher?.watch === watch) await this.endWatch(socket, "CONNECTION_EXPIRED");
      })().catch(() => this.metrics.increment("watch.summary.failed"));
    }, monitoringWatchLease.renewIntervalMs);
    // A renewal timer must never be the reason a process stays alive.
    this.renewTimers.set(watch.visitId, timer);
    timer.unref?.();
  }

  /**
   * The lease a teacher write must satisfy, read fresh.
   *
   * Never the socket's optimistic copy of the mode: withdrawing edit
   * permission has to bind immediately and across instances, and a write that
   * was already on the wire when the teacher stepped back must be refused on
   * arrival. Where the client names an identity, it must be this watch's — a
   * write from a superseded generation is not a write from this session.
   */
  private async requireEditPermission(
    watch: WatchState,
    identity?: WatchIdentity,
  ): Promise<WatchLease> {
    if (!identity || !matchesWatch(watch, identity)) {
      throw publicError("MONITORING_ACCESS_DENIED");
    }
    const lease = await this.watchSessions.isCurrent(watch);
    if (!lease) throw publicError("MONITORING_ACCESS_DENIED");
    // Keeps the socket's own copy honest for the UI it drives, without ever
    // being the thing that authorized the write.
    watch.mode = lease.mode;
    return lease;
  }

  /**
   * The watch a privileged teacher message claims to belong to.
   *
   * Checked against three things in order: the socket's own server-held state,
   * the identity the payload names, and the registry lease behind it. The
   * first is what a client cannot forge, the second is what tells two visits
   * to the same draft apart, and the third is what makes a revoked or expired
   * watch stop working on every instance at once.
   */
  private async requireCurrentWatch(
    socket: MonitoringSocket,
    identity: WatchIdentity,
  ): Promise<WatchState> {
    const watch = socket.data?.teacher?.watch;
    if (!watch || !matchesWatch(watch, identity)) {
      throw publicError("MONITORING_ACCESS_DENIED");
    }
    const lease = await this.watchSessions.isCurrent(identity);
    if (!lease) throw publicError("MONITORING_ACCESS_DENIED");
    return watch;
  }
}

/**
 * A watch as the registry stores it.
 *
 * The gateway holds the claim, which carries the teacher's membership; the
 * registry indexes on that membership directly. Converting in one place keeps
 * the two shapes from drifting into a silent mismatch on an index key.
 */
function leaseOf(watch: WatchState): WatchLease {
  return {
    visitId: watch.visitId,
    sessionId: watch.sessionId,
    generation: watch.generation,
    teacherMembershipId: watch.claim.membershipId,
    academyId: watch.claim.academyId,
    classId: watch.claim.classId,
    studentMembershipId: watch.claim.studentMembershipId,
    draftId: watch.draftId,
    mode: watch.mode,
  };
}

/**
 * The student's awareness peer id.
 *
 * One per student per draft rather than per socket: a student has a single
 * caret and a single arrow, and every teacher watching them renders the same
 * one. A reconnect must therefore reuse the id, not create a second peer the
 * teachers would draw beside the first.
 */
function studentPeerId(studentMembershipId: string): string {
  return `student:${studentMembershipId}`;
}

/** Identity is all three values together, never the visit alone. */
function matchesWatch(watch: WatchState, identity: WatchIdentity): boolean {
  return (
    watch.visitId === identity.visitId &&
    watch.generation === identity.generation &&
    watch.sessionId === identity.sessionId
  );
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
