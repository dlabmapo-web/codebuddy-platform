import { randomUUID } from 'node:crypto';
import { BrokerClient } from '@cove/grading-runtime';
import { executionEngineVersion, runtimeDescriptorIdentity, type RuntimeDescriptor, type RuntimeManifest } from '@cove/shared';
import type { PrismaService } from '../database/prisma.service.js';
import type { GradingExecutionLease } from '../generated/prisma/client.js';
import { createRuntimeRegistry } from './runtime-registry.js';
import { brokerRequest, BrokerFailure } from './broker-engine.js';
import { ExecutionSession, ownerOf, type ExecutionOwner } from './execution-lease.js';
import { ExecutionTelemetry } from './execution-telemetry.js';

/** Sole host coordinator. DB epoch lock serializes claims with durable sealing intent. */
export class RuntimeCoordinator {
  readonly registry;
  readonly active = new Set<string>();
  readonly ownedAttempts = new Set<string>();
  private maintenance: Promise<void> | null = null;
  private sampleReconcile: (() => Promise<void>) | undefined;
  private sampleSealed: ((epoch: number) => Promise<void>) | undefined;
  private sampleEpochCount: ((epoch: number) => Promise<number>) | undefined;
  private sampleCount: (() => Promise<number>) | undefined;
  constructor(readonly db: PrismaService, readonly client: BrokerClient, readonly workerGeneration: string,
    manifest: RuntimeManifest, readonly telemetry = new ExecutionTelemetry()) {
    this.registry = createRuntimeRegistry({ enabled: false, manifest,
      clientFactory: descriptor => ({ descriptor, version: executionEngineVersion(descriptor) }) });
  }
  setSampleRecovery(reconcile: () => Promise<void>, count: () => Promise<number>, epochCount: (epoch: number) => Promise<number>, sealed: (epoch: number) => Promise<void>) { this.sampleSealed = sealed; this.sampleReconcile = reconcile; this.sampleCount = count; this.sampleEpochCount = epochCount; }
  async health() {
    const health = await brokerRequest(this.client, { type: 'health' });
    if (health.type !== 'health' || health.workerGeneration !== this.workerGeneration) throw new BrokerFailure('WORKER_GENERATION_MISMATCH');
    const expected = this.registry.manifest.capabilities.runtimes.map(runtimeDescriptorIdentity).sort();
    if (JSON.stringify(expected) !== JSON.stringify(health.capabilities.runtimes.map(runtimeDescriptorIdentity).sort())) throw new BrokerFailure('CAPABILITY_MISMATCH');
    return health;
  }
  descriptor(work: { executionRuntimeSnapshot?: unknown; engineVersion: string }) {
    const resolution = this.registry.resolveHistoricalRuntime({ ...work,
      engineVersion: /^\d/.test(work.engineVersion) ? `pyodide-${work.engineVersion}` : work.engineVersion });
    return resolution.provenance === 'recorded' ? resolution.descriptor : resolution.adapter;
  }
  async initialize() {
    await this.health();
    // Reconcile durable terminal records before startup runners resume unfinished owners.
    await this.reconcile();
  }
  async sampleClaim<T>(save: (health: Awaited<ReturnType<RuntimeCoordinator['health']>>) => Promise<T>): Promise<T> {
    if (this.maintenance) await this.maintenance;
    const health = await this.health();
    return this.db.$transaction(async tx => {
      if (await tx.gradingAdmissionEpoch.findFirst({ where: { reconciliationId: { not: null }, sealedAt: null } })) throw new BrokerFailure("EPOCH_RECONCILING");
      await tx.gradingAdmissionEpoch.upsert({ where: { epoch: BigInt(health.admissionEpoch) }, create: { epoch: BigInt(health.admissionEpoch), workerGeneration: this.workerGeneration }, update: {} });
      await tx.$queryRaw`SELECT epoch FROM grading_admission_epochs WHERE epoch=${BigInt(health.admissionEpoch)} FOR UPDATE`;
      const epoch = await tx.gradingAdmissionEpoch.findUniqueOrThrow({ where: { epoch: BigInt(health.admissionEpoch) } });
      if (epoch.reconciliationId || epoch.sealedAt || await tx.gradingExecutionLease.count({ where: { admissionEpoch: epoch.epoch } }) + (await this.sampleEpochCount?.(health.admissionEpoch) ?? 0) >= 512) throw new BrokerFailure('EPOCH_RECONCILING');
      return save(health);
    });
  }
  async claim(owner: ExecutionOwner, work: { runtime: RuntimeDescriptor; memoryLimitMb: number; kind: 'submission' | 'practice' | 'maintenance' }, recovery = false): Promise<ExecutionSession | null> {
    if (this.maintenance) await this.maintenance;
    const health = await this.health();
    const lease = await this.db.$transaction(async tx => {
      if (await tx.gradingAdmissionEpoch.findFirst({ where: { reconciliationId: { not: null }, sealedAt: null } })) throw new BrokerFailure("EPOCH_RECONCILING");
      await tx.gradingAdmissionEpoch.upsert({ where: { epoch: BigInt(health.admissionEpoch) }, create: { epoch: BigInt(health.admissionEpoch), workerGeneration: this.workerGeneration }, update: {} });
      await tx.$queryRaw`SELECT epoch FROM grading_admission_epochs WHERE epoch=${BigInt(health.admissionEpoch)} FOR UPDATE`;
      const epoch = await tx.gradingAdmissionEpoch.findUniqueOrThrow({ where: { epoch: BigInt(health.admissionEpoch) } });
      if (epoch.reconciliationId || epoch.sealedAt) throw new BrokerFailure('EPOCH_RECONCILING');
      const count = await tx.gradingExecutionLease.count({ where: { admissionEpoch: epoch.epoch } });
      if (!recovery && count + (await this.sampleEpochCount?.(health.admissionEpoch) ?? 0) >= 512) throw new BrokerFailure('EPOCH_RECONCILING');
      const leaseToken = randomUUID();
      const prior = owner.submissionId
        ? await tx.submission.findUnique({ where: { id: owner.submissionId } })
        : await tx.staffPracticeAttempt.findUnique({ where: { id: owner.staffPracticeAttemptId } });
      if (!prior || (prior.status !== 'QUEUED' && !(recovery && prior.status === 'RUNNING'))) return null;
      const generation = (prior.executionGeneration ?? 0) + 1;
      const changed = owner.submissionId
        ? await tx.submission.updateMany({ where: { id: owner.submissionId, status: prior.status, executionGeneration: prior.executionGeneration, executionLeaseToken: prior.executionLeaseToken }, data: { status: 'RUNNING', startedAt: recovery ? prior.startedAt! : new Date(), executionGeneration: generation, executionLeaseToken: leaseToken } })
        : await tx.staffPracticeAttempt.updateMany({ where: { id: owner.staffPracticeAttemptId, status: prior.status, executionGeneration: prior.executionGeneration, executionLeaseToken: prior.executionLeaseToken }, data: { status: 'RUNNING', startedAt: recovery ? prior.startedAt! : new Date(), executionGeneration: generation, executionLeaseToken: leaseToken } });
      if (!changed.count) return null;
      return tx.gradingExecutionLease.create({ data: { ...owner, generation, leaseToken,
        workerGeneration: this.workerGeneration, brokerGeneration: health.brokerGeneration, admissionEpoch: recovery ? (await tx.gradingExecutionLease.findFirstOrThrow({ where: owner, orderBy: { generation: 'desc' } })).admissionEpoch : epoch.epoch,
        runtime: work.runtime, kind: work.kind, memoryLimitMb: work.memoryLimitMb } });
    });
    if (!lease) return null;
    this.active.add(lease.id);
    this.ownedAttempts.add(lease.submissionId ?? lease.staffPracticeAttemptId!);
    return new ExecutionSession(this.db, lease, this.client, this.telemetry);
  }
  async finished(session: ExecutionSession) {
    this.active.delete(session.lease.id);
    this.ownedAttempts.delete(session.lease.submissionId ?? session.lease.staffPracticeAttemptId!);
    // Cleanup is independent of the committed result. No future warm preparation gates completion.
    void this.reconcile().catch(() => undefined);
  }
  async reconcile() {
    if (this.maintenance) return this.maintenance;
    this.maintenance = this.telemetry.time('recovery', () => this.performReconciliation());
    try { await this.maintenance; } finally { this.maintenance = null; }
  }
  private async performReconciliation() {
    await this.collectSealedHistory();
    const pending = await this.db.gradingExecutionLease.findMany({ where: { retiredAt: null }, orderBy: { createdAt: 'asc' }, take: 512 });
    for (const lease of pending) {
      if (this.active.has(lease.id)) continue;
      if (!lease.terminalCommitId) {
        continue; // Startup runners resume these through the original frozen evaluator/deadline.
      }
      await this.reconcileLease(lease.id);
    }
    await this.sampleReconcile?.();
    const lastSealed = await this.db.gradingAdmissionEpoch.findFirst({ where: { sealedAt: { not: null } }, orderBy: { epoch: "desc" } });
    if (lastSealed) await this.sampleSealed?.(Number(lastSealed.epoch));
    if (this.active.size || (await this.sampleCount?.() ?? 0) > 0) return;
    const health = await this.health();
    // A private Redis admission can survive a failed surrounding DB transaction.
    // Recreate only current broker control metadata, never a new execution admission.
    await this.db.gradingAdmissionEpoch.upsert({ where: { epoch: BigInt(health.admissionEpoch) },
      create: { epoch: BigInt(health.admissionEpoch), workerGeneration: this.workerGeneration }, update: {} });
    const previousIntent = await this.db.gradingAdmissionEpoch.findFirst({ where: { reconciliationId: { not: null }, sealedAt: null }, orderBy: { epoch: 'asc' } });
    const count = await this.db.gradingExecutionLease.count({ where: { admissionEpoch: BigInt(health.admissionEpoch) } });
    const agedTerminal = count > 0 && await this.db.gradingExecutionLease.findFirst({
      where: { admissionEpoch: BigInt(health.admissionEpoch), terminalCommitId: { not: null }, retiredAt: { not: null },
        createdAt: { lte: new Date(Date.now() - 60_000) } }, select: { id: true },
    });
    // Low traffic must not indefinitely retain FKs after all execution is reconciled.
    if (!previousIntent && !agedTerminal && count + (await this.sampleEpochCount?.(health.admissionEpoch) ?? 0) < 256) return;
    const epoch = previousIntent ?? await this.db.$transaction(async tx => {
      const current = await tx.gradingAdmissionEpoch.findUnique({ where: { epoch: BigInt(health.admissionEpoch) } });
      if (!current) return null;
      await tx.$queryRaw`SELECT epoch FROM grading_admission_epochs WHERE epoch=${current.epoch} FOR UPDATE`;
      if (await tx.gradingExecutionLease.count({ where: { admissionEpoch: current.epoch, retiredAt: null } }) || (await this.sampleCount?.() ?? 0) > 0) return null;
      return tx.gradingAdmissionEpoch.update({ where: { epoch: current.epoch }, data: { reconciliationId: current.reconciliationId ?? randomUUID() } });
    });
    if (!epoch?.reconciliationId || (await this.sampleCount?.() ?? 0) > 0) return;
    if (await this.db.gradingExecutionLease.count({ where: { admissionEpoch: epoch.epoch, retiredAt: null } })) return;
    await this.telemetry.time('seal', async () => {
      const response = await brokerRequest(this.client, { type: 'seal', brokerGeneration: health.brokerGeneration,
        workerGeneration: this.workerGeneration, admissionEpoch: Number(epoch.epoch), reconciliationId: epoch.reconciliationId! });
      if (response.type !== 'sealed') throw new BrokerFailure('SEAL_UNCERTAIN');
      await this.db.gradingAdmissionEpoch.update({ where: { epoch: epoch.epoch }, data: { sealedAt: new Date() } });
      await this.sampleSealed?.(Number(epoch.epoch));
    });
    await this.collectSealedHistory();
  }
  private async collectSealedHistory(): Promise<void> {
    // Restrict protects active recovery. Only acknowledged epoch retirement permits
    // removing private authority and restoring ordinary owner/material deletion.
    await this.db.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT l.id FROM grading_execution_leases l
        JOIN grading_admission_epochs e ON e.epoch = l.admission_epoch
        WHERE e.sealed_at IS NOT NULL AND l.retired_at IS NOT NULL
          AND l.terminal_commit_id IS NOT NULL
        ORDER BY l.created_at, l.id LIMIT 512 FOR UPDATE OF l SKIP LOCKED`;
      if (!rows.length) return;
      const ids = rows.map(row => row.id);
      await tx.gradingExecutionCase.deleteMany({ where: { leaseId: { in: ids } } });
      await tx.gradingExecutionLease.deleteMany({ where: { id: { in: ids } } });
    });
  }
  private async reconcileLease(id: string): Promise<void> {
    const lease = await this.db.gradingExecutionLease.findUniqueOrThrow({ where: { id } });
    if (!lease.terminalCommitId || lease.retiredAt) return;
    const latest = await this.db.gradingExecutionLease.findFirst({ where: { ...ownerOf(lease), reservationId: { not: null } }, orderBy: { generation: "desc" } });
    if (latest && latest.id !== id) return this.reconcileLease(latest.id);
    const session = new ExecutionSession(this.db, lease, this.client, this.telemetry);
    if (!lease.reservationId) {
      const health = await this.health();
      // No source can have been delivered without the persisted reservation. Cancel discovers a lost reserve reply.
      const response = await this.client.request({ type: 'cancel', brokerGeneration: health.brokerGeneration, context: session.engine.context(), runtime: session.engine.descriptor });
      if (response.type === 'error' && response.code === 'NOT_FOUND') {
        await this.db.gradingExecutionLease.update({ where: { id }, data: { retiredAt: new Date() } }); return;
      }
      if (response.type !== 'released' || !response.reservationId) throw new BrokerFailure('RESERVE_RECONCILIATION_UNCERTAIN');
      await this.db.gradingExecutionLease.update({ where: { id }, data: { reservationId: response.reservationId } });
      session.engine.lease.reservationId = response.reservationId;
    }
    await session.cleanup();
  }
}
