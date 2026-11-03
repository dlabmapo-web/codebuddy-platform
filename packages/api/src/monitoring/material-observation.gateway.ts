import { Inject, Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { monitoringNamespace, monitoringRooms, monitoringWatchLease, observationEvents, observationStartSchema,
  observationPublishSchema, observationAwarenessSchema, observationAccessEnded, publicChoiceSchema, resolveLiveState, type ObservationSnapshot, type ObservationWork } from '@cove/shared';
import type { Server, Socket } from 'socket.io';
import type { SupabaseIdentity } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';
import { MonitoringAccessService, type MonitoringStudentClaim } from './monitoring-access.service.js';
import { MonitoringVisitService } from './monitoring-visit.service.js';
import { WatchSessionRegistry, type WatchLease } from './watch-session.registry.js';
import { PresenceRegistry, presenceKey } from './presence.registry.js';
import { MONITORING_REDIS, monitoringKeyPrefix, type MonitoringRedis } from './monitoring.tokens.js';
import { toPublicErrorCode } from './monitoring-event-mapper.js';
import type { SocketRateLimiter } from './socket-rate-limit.js';

type Scope = { academyId: string; classId: string; membershipId: string };
type Observation = { claim: MonitoringStudentClaim; lease: WatchLease };
type ObservationSocket = Socket & { data: {
  identity: SupabaseIdentity; generation: string; limiter: SocketRateLimiter;
  observation?: Observation; observationStarts?: Promise<unknown>;
  student?: { academyId: string; membershipId: string; classId: string | null; materialId: string | null; classes: Array<{ classId: string }> } | null;
  observationSequence?: number;
} };
const keyFor = (scope: Scope) => `${monitoringKeyPrefix}observation:${scope.academyId}:${scope.classId}:${scope.membershipId}`;

/** Authenticated by the monitoring namespace middleware. No editor authority. */
@WebSocketGateway({ namespace: monitoringNamespace })
export class MaterialObservationGateway {
  @WebSocketServer() server!: Server;
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly logger = new Logger(MaterialObservationGateway.name);
  constructor(private readonly prisma: PrismaService, private readonly access: MonitoringAccessService,
    private readonly presence: PresenceRegistry, private readonly watches: WatchSessionRegistry,
    private readonly visits: MonitoringVisitService,
    @Inject(MONITORING_REDIS) private readonly redis: MonitoringRedis) {}

  private async authorize(socket: ObservationSocket, scope: Scope) {
    await this.access.requireFeature(scope.academyId);
    const actor = await this.access.requireTeacher(socket.data.identity, scope.academyId);
    this.access.requireLiveWatch(actor);
    const classroom = await this.access.requireAssignedClass(actor, scope.classId);
    return this.access.requireMonitorableStudent(classroom, scope.membershipId);
  }

  @SubscribeMessage(observationEvents.start)
  async start(@ConnectedSocket() socket: ObservationSocket, @MessageBody() body: unknown) {
    const parsed = observationStartSchema.safeParse(body);
    if (!parsed.success || !socket.data.limiter.take('observation.start')) return { ok: false, code: 'MONITORING_ACCESS_DENIED' };
    const operation = async () => {
      try {
        if (!this.redis || !this.watches.isAvailable) throw new Error('unavailable');
        const scope = parsed.data;
        const claim = await this.authorize(socket, scope);
        await this.stop(socket);
        const generation = await this.watches.nextGeneration(claim.membershipId, scope.sessionId);
        const visit = await this.visits.start(claim, { sessionId: scope.sessionId, replacesVisitId: null });
        const lease: WatchLease = { ...scope, visitId: visit.id, generation, teacherMembershipId: claim.membershipId,
          studentMembershipId: claim.studentMembershipId, draftId: null, mode: 'MONITORING' };
        const registered = await this.watches.register(lease);
        if (!registered.ok || socket.disconnected) {
          await this.watches.end(lease); await this.visits.end(visit.id, 'CONNECTION_EXPIRED'); throw new Error('unavailable');
        }
        if (registered.replacedVisitId) await this.visits.end(registered.replacedVisitId, 'WATCH_REPLACED');
        socket.data.observation = { claim, lease };
        await socket.join([monitoringRooms.teacher(scope.academyId, claim.membershipId),
          monitoringRooms.watchContext(scope.academyId, scope.classId, scope.membershipId)]);
        let renewing = false;
        this.timers.set(socket.id, setInterval(() => {
          if (renewing) return; renewing = true;
          const current = socket.data.observation;
          void this.renew(socket, current).catch(async error => {
            if (!current || socket.data.observation !== current) return;
            const denied = observationAccessEnded(toPublicErrorCode(error));
            if (denied) socket.emit('access.revoked', { classId: scope.classId, studentMembershipId: scope.membershipId });
            await this.stop(socket);
            if (!denied && socket.connected) socket.emit(observationEvents.resync, scope);
          }).finally(() => { renewing = false; });
        }, monitoringWatchLease.renewIntervalMs));
        await this.indicator(scope);
        this.server.to(monitoringRooms.student(scope.academyId, scope.membershipId)).emit(observationEvents.request, { classId: scope.classId });
        return { ok: true, snapshot: await this.snapshot(scope), visitId: visit.id, generation };
      } catch (error) { return { ok: false, code: toPublicErrorCode(error) }; }
    };
    const pending = (socket.data.observationStarts ?? Promise.resolve()).then(operation, operation);
    socket.data.observationStarts = pending;
    return pending;
  }

  private async renew(socket: ObservationSocket, current: Observation | undefined) {
    if (!current) return;
    const scope = { academyId: current.claim.academyId, classId: current.claim.classId, membershipId: current.claim.studentMembershipId };
    await this.authorize(socket, scope);
    if (!(await this.watches.renew(current.lease))) throw new Error('expired');
    const snapshot = await this.snapshot(scope);
    if (socket.data.observation !== current) return;
    socket.emit(observationEvents.snapshot, snapshot);
    await this.indicator(scope);
  }

  @SubscribeMessage(observationEvents.stop)
  async stop(@ConnectedSocket() socket: ObservationSocket) {
    const timer = this.timers.get(socket.id); if (timer) clearInterval(timer); this.timers.delete(socket.id);
    const current = socket.data.observation; delete socket.data.observation;
    if (!current) return;
    await socket.leave(monitoringRooms.watchContext(current.claim.academyId, current.claim.classId, current.claim.studentMembershipId));
    const ended = await Promise.allSettled([this.watches.end(current.lease), this.visits.end(current.lease.visitId, 'CONNECTION_EXPIRED')]);
    if (ended.some(result => result.status === 'rejected')) this.logger.warn('Observation cleanup incomplete; its lease will expire');
    try { await this.indicator({ academyId: current.claim.academyId, classId: current.claim.classId, membershipId: current.claim.studentMembershipId }); }
    catch { this.logger.warn('Observation indicator unavailable during cleanup'); }
  }
  async handleDisconnect(socket: ObservationSocket) {
    await socket.data.observationStarts;
    await this.stop(socket);
  }
  onModuleDestroy() { for (const timer of this.timers.values()) clearInterval(timer); }

  async activityChanged(scope: Scope) {
    if (!this.redis || !this.server) return;
    const snapshot = await this.snapshot(scope);
    this.server.to(monitoringRooms.watchContext(scope.academyId, scope.classId, scope.membershipId))
      .emit(observationEvents.snapshot, snapshot);
    // Student heartbeats also clear indicators for crashed/expired watchers.
    await this.indicator(scope);
  }

  async snapshot(scope: Scope): Promise<ObservationSnapshot> {
    const source = await this.presence.currentSource(scope.academyId, scope.classId, scope.membershipId);
    const state = source ? resolveLiveState({ connection: source.interruptedAt === null ? 'CONNECTED' : 'INTERRUPTED',
      interruptedAt: source.interruptedAt, materialId: source.materialId, visibility: source.visibility, lastActivityAt: source.lastActivityAt }, Date.now()) : 'OFFLINE';
    const sequenceKey = keyFor(scope) + ':sequence';
    const sequence = this.redis ? await this.redis.incr(sequenceKey) : 0;
    await this.redis?.pexpire(sequenceKey, monitoringWatchLease.ttlMs * 4);
    const base: ObservationSnapshot = { ...scope, materialId: null, type: null, path: null,
      source: source?.socketGeneration ?? null, revision: 0, sequence, state, work: null, observedAt: new Date().toISOString() };
    if (!source?.materialId || base.state === 'OFFLINE') return base;
    // Recheck the complete read predicate; stale presence never grants content access.
    const row = await this.prisma.material.findFirst({ where: { id: source.materialId,
      AND: [ { isVisible: true, lecture: { isVisible: true, courseModule: { isVisible: true,
        course: { academyId: scope.academyId, isVisible: true, classAssignments: { some: { classId: scope.classId } } } } } } ] },
      select: { id: true, title: true, type: true, lecture: { select: { id: true, title: true,
        courseModule: { select: { id: true, title: true, course: { select: { id: true, title: true } } } } } } } });
    if (!row) return base;
    const raw = await this.redis?.get(keyFor(scope));
    let stored: { materialId: string; source: string; revision: number; work: ObservationWork } | null = null;
    try { stored = raw ? JSON.parse(raw) : null; } catch { /* A missing transient snapshot is recoverable. */ }
    const current = stored?.materialId === row.id && stored.source === source.socketGeneration;
    return { ...base, materialId: row.id, type: row.type, path: { course: row.lecture.courseModule.course,
      module: { id: row.lecture.courseModule.id, title: row.lecture.courseModule.title },
      lecture: { id: row.lecture.id, title: row.lecture.title }, exercise: { materialId: row.id, title: row.title } },
      revision: current && stored ? stored.revision : 0, work: current && stored ? stored.work : null };
  }

  @SubscribeMessage(observationEvents.publish)
  async publish(@ConnectedSocket() socket: ObservationSocket, @MessageBody() body: unknown) {
    const parsed = observationPublishSchema.safeParse(body);
    if (!parsed.success || !this.redis || !socket.data.limiter.take('observation.publish')) return;
    try {
      const input = parsed.data;
      const self = await this.access.requireStudentSelf(socket.data.identity, input.academyId);
      const scope = { academyId: input.academyId, classId: input.classId, membershipId: self.membershipId };
      const source = await this.presence.currentSource(scope.academyId, scope.classId, scope.membershipId);
      if (!source || source.socketGeneration !== socket.data.generation || source.materialId !== input.materialId) return;
      const enrolled = await this.prisma.classEnrollment.findFirst({ where: { classId: input.classId, membershipId: self.membershipId,
        class: { academyId: input.academyId, status: 'ACTIVE' } }, select: { classId: true } });
      if (!enrolled) return;
      const material = await this.prisma.material.findUnique({ where: { id: input.materialId }, select: { type: true, manualMaterial: { select: { multipleChoice: true } } } });
      const work = input.work;
      // Drop fields that do not belong to this server-resolved material type.
      let safe: ObservationWork = {};
      if (material?.type === 'PDF_DOCUMENT') safe = { pdfPage: work.pdfPage };
      else if (material?.type === 'VIDEO_LESSON') safe = { videoPosition: work.videoPosition, videoState: work.videoState };
      else if (material?.type === 'TURTLE_EXERCISE') safe = { files: work.files, activeFile: work.activeFile && work.files && Object.hasOwn(work.files, work.activeFile) ? work.activeFile : undefined, entryPoint: work.entryPoint, execution: work.execution, output: work.output, drawing: work.drawing };
      else if (material?.type === 'WRITTEN_RESPONSE') safe = { answer: work.answer };
      else if (material?.type === 'MULTIPLE_CHOICE') {
        const choice = publicChoiceSchema.safeParse(material.manualMaterial?.multipleChoice);
        if (!choice.success || work.choices?.some(id => !choice.data.options.some(option => option.id === id)) ||
          (choice.data.selectionMode === 'SINGLE' && (work.choices?.length ?? 0) > 1)) return;
        safe = { choices: work.choices ?? [] };
      }
      const payload = JSON.stringify({ materialId: input.materialId, source: source.socketGeneration, revision: input.revision, work: safe });
      const accepted = await this.redis.eval(`
        local source = redis.call('GET', KEYS[1])
        if not source then return 0 end
        source = cjson.decode(source)
        if source.socketGeneration ~= ARGV[1] or source.materialId ~= ARGV[2] then return 0 end
        local old = redis.call('GET', KEYS[2])
        if old then old = cjson.decode(old)
          if old.source == ARGV[1] and old.materialId == ARGV[2] and old.revision >= tonumber(ARGV[3]) then return 0 end
        end
        redis.call('SET', KEYS[2], ARGV[4], 'PX', ARGV[5]) return 1`, 2,
        presenceKey(scope.academyId, scope.classId, scope.membershipId), keyFor(scope),
        source.socketGeneration, input.materialId, String(input.revision), payload, String(monitoringWatchLease.ttlMs));
      if (accepted === 1) await this.activityChanged(scope);
      return accepted === 1;
    } catch { /* Transient observation failure must not break student saving. */ }
  }

  @SubscribeMessage(observationEvents.awareness)
  async awareness(@ConnectedSocket() socket: ObservationSocket, @MessageBody() body: unknown) {
    const parsed = observationAwarenessSchema.safeParse(body);
    if (!parsed.success || !this.redis || !socket.data.limiter.take('observation.awareness')) return;
    const input = parsed.data;
    // This claim is established by authenticated presence, and refreshed by its
    // heartbeats. A client cannot nominate another membership in this event.
    const self = socket.data.student;
    if (!self || self.academyId !== input.academyId || self.classId !== input.classId ||
      self.materialId !== input.materialId || !self.classes.some((item: { classId: string }) => item.classId === input.classId) ||
      input.sequence <= (socket.data.observationSequence ?? -1)) return;
    socket.data.observationSequence = input.sequence;
    const source = await this.presence.currentSource(input.academyId, input.classId, self.membershipId).catch(() => null);
    if (!source || source.socketGeneration !== socket.data.generation || source.materialId !== input.materialId ||
      input.sequence !== socket.data.observationSequence) return;
    this.server.to(monitoringRooms.watchContext(input.academyId, input.classId, self.membershipId)).volatile.emit(
      observationEvents.awareness, { ...input, membershipId: self.membershipId, source: source.socketGeneration, sentAt: Date.now() });
  }

  private async indicator(scope: Scope) {
    const summary = await this.watches.summarize({ academyId: scope.academyId, classId: null, studentMembershipId: scope.membershipId, draftId: null });
    this.server.to(monitoringRooms.student(scope.academyId, scope.membershipId)).emit(observationEvents.indicator, { watching: summary.watcherCount > 0, revision: summary.revision });
  }
}
