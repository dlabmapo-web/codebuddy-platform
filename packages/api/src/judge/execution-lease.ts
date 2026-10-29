import { randomUUID } from 'node:crypto';
import { runtimeDescriptorSchema } from '@cove/shared';
import type { PrismaService } from '../database/prisma.service.js';
import type { GradingExecutionLease, Prisma } from '../generated/prisma/client.js';
import type { BrokerClient } from '@cove/grading-runtime';
import { BrokerExecutionEngine, BrokerFailure, type ExecutionLeaseIdentity } from './broker-engine.js';
import type { CaseRow, GradingWork } from './grading.service.js';
import { ExecutionTelemetry } from './execution-telemetry.js';

type Tx = Prisma.TransactionClient;
export type ExecutionOwner = { submissionId: string; staffPracticeAttemptId?: never } | { submissionId?: never; staffPracticeAttemptId: string };
export function ownerOf(lease: GradingExecutionLease): ExecutionOwner {
  return lease.submissionId ? { submissionId: lease.submissionId } : { staffPracticeAttemptId: lease.staffPracticeAttemptId! };
}
export function identityOf(lease: GradingExecutionLease): ExecutionLeaseIdentity {
  return { ...lease, attemptId: lease.submissionId ?? lease.staffPracticeAttemptId!, kind: lease.kind as ExecutionLeaseIdentity['kind'],
    admissionEpoch: Number(lease.admissionEpoch), runtime: Object.freeze(runtimeDescriptorSchema.parse(lease.runtime)) };
}
/** Lock the owner before checking its fence; every checkpoint and terminal write shares this lock. */
export async function fenceOwner(tx: Tx, owner: ExecutionOwner, generation: number, token: string) {
  const rows = owner.submissionId
    ? await tx.$queryRaw<Array<{ execution_generation: number; execution_lease_token: string; status: string }>>`SELECT execution_generation, execution_lease_token, status FROM submissions WHERE id=${owner.submissionId}::uuid FOR UPDATE`
    : await tx.$queryRaw<Array<{ execution_generation: number; execution_lease_token: string; status: string }>>`SELECT execution_generation, execution_lease_token, status FROM staff_practice_attempts WHERE id=${owner.staffPracticeAttemptId}::uuid FOR UPDATE`;
  if (rows[0]?.execution_generation !== generation || rows[0]?.execution_lease_token !== token || rows[0]?.status !== 'RUNNING') throw new BrokerFailure('STALE_OWNER');
}
export class ExecutionSession {
  readonly engine: BrokerExecutionEngine;
  readonly owner: ExecutionOwner;
  readonly terminalCommitId: string;
  readonly recovered = new Map<number, CaseRow>();
  readonly recoveredExecutionMs = new Map<number, number>();
  private readonly origins = new Map<number, BrokerExecutionEngine>();
  private prior: ExecutionSession[] = [];
  constructor(readonly db: PrismaService, readonly lease: GradingExecutionLease, client: BrokerClient,
    readonly telemetry = new ExecutionTelemetry()) {
    this.owner = ownerOf(lease); this.terminalCommitId = lease.terminalCommitId ?? randomUUID();
    this.engine = new BrokerExecutionEngine(client, identityOf(lease), {
      reservation: async id => {
        await db.$transaction(async tx => {
          await this.fence(tx);
          const result = await tx.gradingExecutionLease.updateMany({ where: { id: lease.id, OR: [{ reservationId: null }, { reservationId: id }] }, data: { reservationId: id } });
          if (!result.count) throw new BrokerFailure('RESERVATION_CHANGED');
        });
        this.lease.reservationId = id;
      },
      releaseSource: position => db.$transaction(async tx => {
        await this.fence(tx);
        const prior = await tx.gradingExecutionCase.findUnique({ where: { leaseId_position: { leaseId: lease.id, position } } });
        if (prior) return false;
        await tx.gradingExecutionCase.create({ data: { leaseId: lease.id, position } });
        return true;
      }),
    });
  }
  async restore() {
    const history = await this.db.gradingExecutionLease.findMany({ where: { ...this.owner, generation: { lt: this.lease.generation } }, orderBy: { generation: 'asc' }, include: { cases: true } });
    this.prior = history.map(lease => new ExecutionSession(this.db, lease, this.engine.client, this.telemetry));
    const checkpoints = await this.db.gradingCaseCheckpoint.findMany({ where: this.owner, orderBy: { generation: 'asc' } });
    for (const row of checkpoints) this.recoveredExecutionMs.set(row.casePosition, row.measuredRuntimeMs ?? row.runtimeMs ?? 0);
    for (const row of checkpoints) this.recovered.set(row.casePosition, { position: row.casePosition, isSample: row.isSample,
      outcome: row.outcome, runtimeMs: row.runtimeMs ?? 0, actualOutput: row.actualOutput, awardedWeight: row.awardedWeight, executionState: row.executionState });
    // A lost ack is retried before any generation takeover; the original identity is retained.
    for (let index = 0; index < history.length; index++) for (const item of history[index]!.cases) {
      if (item.acknowledgedAt) continue;
      const prior = this.prior[index]!;
      if (!prior.lease.reservationId) throw new BrokerFailure('MISSING_ORIGINAL_RESERVATION');
      if (item.checkpointId && item.receiptId) {
        await prior.engine.acknowledge(item.position, item.receiptId, item.checkpointId);
        await this.db.gradingExecutionCase.update({ where: { id: item.id }, data: { acknowledgedAt: new Date() } });
      } else this.origins.set(item.position, prior.engine);
    }
  }
  /** Evaluator uses this immutable facade; recovered receipts still use their original lease. */
  executionEngine() {
    return Object.freeze({ version: this.engine.version, descriptor: this.engine.descriptor,
      dispose: () => this.engine.dispose(), run: async (request: import('./execution-engine.js').ExecutionRequest) => {
        const origin = this.origins.get(request.casePosition!);
        if (origin) return origin.recover(request.casePosition!);
        if (!this.engine.lease.reservationId) {
          // All known source releases must be checkpointed before replacement can become current.
          for (const old of this.prior) {
            const unacked = await this.db.gradingExecutionCase.count({ where: { leaseId: old.lease.id, acknowledgedAt: null } });
            if (unacked) throw new BrokerFailure('UNRECOVERED_CASE');
          }
          const current = [...this.prior].reverse().find(old => old.lease.reservationId);
          if (current) await current.engine.dispose();
          await this.engine.reserve();
        }
        return this.engine.run(request);
      } });
  }
  get fenceWhere() { return { executionGeneration: this.lease.generation, executionLeaseToken: this.lease.leaseToken }; }
  async fence(tx: Tx) {
    const health = await this.engine.health();
    if (health.brokerGeneration !== this.lease.brokerGeneration) throw new BrokerFailure('BROKER_RESTARTED');
    return fenceOwner(tx, this.owner, this.lease.generation, this.lease.leaseToken);
  }
  async consume(tx: Tx, expected: CaseRow[]): Promise<CaseRow[]> {
    const checkpoints = await tx.gradingCaseCheckpoint.findMany({ where: this.owner, orderBy: { generation: 'asc' } });
    const byPosition = new Map<number, CaseRow>();
    for (const row of checkpoints) byPosition.set(row.casePosition, { position: row.casePosition, isSample: row.isSample,
      outcome: row.outcome, runtimeMs: row.runtimeMs ?? 0, actualOutput: row.actualOutput, awardedWeight: row.awardedWeight, executionState: row.executionState });
    const rows = expected.map(row => byPosition.get(row.position));
    if (rows.some((row, index) => !row || Object.keys(expected[index]!).some(key => row[key as keyof CaseRow] !== expected[index]![key as keyof CaseRow]))) throw new BrokerFailure('CHECKPOINT_MISMATCH');
    return rows as CaseRow[];
  }
  async terminal(tx: Tx) {
    await tx.gradingExecutionLease.updateMany({ where: { ...this.owner, terminalCommitId: null }, data: { terminalCommitId: this.terminalCommitId } });
  }
  async checkpoint(row: CaseRow, testCase: GradingWork['gradingCases'][number]) {
    await this.telemetry.time('checkpoint', async () => {
      const origin = this.origins.get(row.position) ?? this.engine;
      const receipt = origin.receipts.get(row.position);
      if (row.executionState === 'EXECUTED' && !receipt) throw new BrokerFailure('MISSING_RECEIPT');
      const checkpoint = await this.db.$transaction(async tx => {
        await this.fence(tx);
        const saved = await tx.gradingCaseCheckpoint.create({ data: {
          ...this.owner, generation: this.lease.generation, leaseToken: this.lease.leaseToken,
          casePosition: row.position, receiptId: receipt?.receiptId,
          executionRuntimeSnapshot: this.engine.descriptor, comparator: testCase.comparator,
          outcome: row.outcome, outputMatched: row.outcome === 'PASSED' || row.outcome === 'PASSED_WITH_WARNING' ? true : row.outcome === 'WRONG_OUTPUT' ? false : null,
          softLimitExceeded: row.outcome === 'PASSED_WITH_WARNING', runtimeMs: row.runtimeMs, measuredRuntimeMs: receipt?.result.runtimeMs ?? 0,
          weight: testCase.weight, softPenalty: testCase.softPenalty, awardedWeight: row.awardedWeight,
          executionState: row.executionState, isSample: row.isSample, actualOutput: row.actualOutput,
        } });
        if (receipt) await tx.gradingExecutionCase.update({ where: { leaseId_position: { leaseId: origin.lease.id, position: row.position } }, data: { receiptId: receipt.receiptId, checkpointId: saved.id } });
        return saved;
      });
      if (receipt) {
        await origin.acknowledge(row.position, receipt.receiptId, checkpoint.id);
        await this.db.gradingExecutionCase.update({ where: { leaseId_position: { leaseId: origin.lease.id, position: row.position } }, data: { acknowledgedAt: new Date() } });
      }
    });
  }
  /** Terminal durability authorizes discarding an unjudged receipt, never a fabricated student verdict. */
  async cleanup(): Promise<void> {
    // Takeover changes only the broker's current fence, not the application's historical contexts.
    const latest = await this.db.gradingExecutionLease.findFirst({ where: { ...this.owner, reservationId: { not: null } }, orderBy: { generation: 'desc' } });
    if (latest && latest.id !== this.lease.id) return new ExecutionSession(this.db, latest, this.engine.client, this.telemetry).cleanup();
    const current = await this.db.gradingExecutionLease.findUniqueOrThrow({ where: { id: this.lease.id }, include: { cases: true } });
    if (!current.terminalCommitId) throw new BrokerFailure('TERMINAL_NOT_DURABLE');
    for (const item of current.cases) {
      if (item.acknowledgedAt) continue;
      const response = await this.engine.client.request({ type: 'receipt', ...await this.engine.bound(item.position) });
      if (response.type === 'receipt') {
        const checkpointId = item.checkpointId ?? current.terminalCommitId;
        await this.db.gradingExecutionCase.update({ where: { id: item.id }, data: { receiptId: response.receipt.receiptId, checkpointId } });
        await this.engine.acknowledge(item.position, response.receipt.receiptId, checkpointId);
      } else if (response.type === 'error' && response.code === 'UNCERTAIN') {
        // Cancel below must confirm removal before retirement. No source replay.
      } else if (response.type !== 'retired' && !(response.type === 'pending' && response.state === 'acknowledged')) {
        if (response.type === 'error' && response.code === 'NOT_FOUND') throw new BrokerFailure('MISSING_KNOWN_CASE');
        // A persisted source intent may precede delivery; reserved means no case exists.
        if (!(response.type === 'pending' && response.state === 'reserved')) throw new BrokerFailure('RECEIPT_UNCERTAIN');
      }
      await this.db.gradingExecutionCase.update({ where: { id: item.id }, data: { acknowledgedAt: new Date() } });
    }
    await this.telemetry.time('retire', async () => {
      const cancelled = await this.engine.client.request({ type: 'cancel', ...await this.engine.bound() });
      if (cancelled.type !== 'released') throw new BrokerFailure('CLEANUP_UNCERTAIN');
      await this.engine.retire(current.terminalCommitId!);
      await this.db.gradingExecutionLease.updateMany({ where: this.owner, data: { retiredAt: new Date() } });
    });
  }
}
