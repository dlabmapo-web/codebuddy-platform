import type { ExecutionEngine } from './execution-engine.js';
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { RuntimeDescriptor } from '@cove/shared';
import { BrokerExecutionEngine, BrokerFailure, type ExecutionLeaseIdentity } from './broker-engine.js';
import type { RuntimeCoordinator } from './runtime-coordinator.js';

const index = 'cove:grading:sample-leases';
const epochs = 'cove:grading:sample-epochs';
const key = (id: string) => `cove:grading:sample-lease:${id}`;
type SavedSampleLease = { lease: ExecutionLeaseIdentity; sourceReleased: boolean; terminalCommitId: string | null; receiptId?: string; checkpointId?: string };
/** Private execution authority outlives public sample TTL; deleted only after broker retirement. */
export class SampleExecution {
  private recoverResult: ((id: string, engine: ExecutionEngine) => Promise<void>) | undefined;
  setRecovery(recover: (id: string, engine: ExecutionEngine) => Promise<void>) { this.recoverResult = recover; }
  private reconciling: Promise<void> | null = null;
  private readonly active = new Set<string>();
  constructor(private readonly redis: () => Promise<Redis>, readonly coordinator: RuntimeCoordinator) {
    coordinator.setSampleRecovery(() => this.reconcile(), () => this.count(), epoch => this.epochCount(epoch), epoch => this.sealed(epoch));
  }
  async count() { return (await this.redis()).scard(index); }
  async epochCount(epoch: number) { return Number(await (await this.redis()).hget(epochs, String(epoch)) ?? 0); }
  async begin(attemptId: string, runtime: RuntimeDescriptor, memoryLimitMb: number) {
    const saved = await this.coordinator.sampleClaim(async health => {
      const lease: ExecutionLeaseIdentity = { id: randomUUID(), attemptId, kind: 'sample', generation: 1,
        leaseToken: randomUUID(), workerGeneration: this.coordinator.workerGeneration, brokerGeneration: health.brokerGeneration,
        admissionEpoch: health.admissionEpoch, runtime, memoryLimitMb, reservationId: null };
      const saved: SavedSampleLease = { lease, sourceReleased: false, terminalCommitId: null };
      const client = await this.redis();
      const result = Number(await client.eval(`
        if redis.call('EXISTS',KEYS[1])==1 then return 0 end
        if redis.call('SCARD',KEYS[2])>=512 then return -1 end
        redis.call('SET',KEYS[1],ARGV[1]); redis.call('SADD',KEYS[2],ARGV[2]); redis.call('HINCRBY',KEYS[3],ARGV[3],1); return 1
      `, 3, key(attemptId), index, epochs, JSON.stringify(saved), attemptId, String(health.admissionEpoch)));
      if (result !== 1) throw new BrokerFailure('SAMPLE_ALREADY_CLAIMED');
      return saved;
    });
    this.active.add(attemptId);
    return this.session(saved);
  }
  private session(saved: SavedSampleLease) {
    const engine = new BrokerExecutionEngine(this.coordinator.client, saved.lease, {
      reservation: async id => { saved.lease.reservationId = id; await this.save(saved); },
      releaseSource: async () => {
        if (saved.sourceReleased) return false;
        saved.sourceReleased = true; await this.save(saved); return true;
      },
    });
    return { engine, abandon: () => this.active.delete(saved.lease.attemptId), finish: async () => {
      // Called only after public result/terminal acknowledgement, or explicit private expiry resolution.
      saved.terminalCommitId ??= randomUUID(); await this.save(saved);
      this.active.delete(saved.lease.attemptId);
      void this.reconcile().catch(() => undefined);
    } };
  }
  private async save(saved: SavedSampleLease) {
    const changed = Number(await (await this.redis()).eval(`
      local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end
      local old=cjson.decode(raw); local new=cjson.decode(ARGV[2]);
      if old.lease.leaseToken~=ARGV[1] then return 0 end
      if old.terminalCommitId~=cjson.null and old.terminalCommitId~=new.terminalCommitId then return 0 end
      if old.sourceReleased and not new.sourceReleased then return 0 end
      if old.lease.reservationId~=cjson.null and old.lease.reservationId~=new.lease.reservationId then return 0 end
      redis.call('SET',KEYS[1],ARGV[2]); return 1
    `, 1, key(saved.lease.attemptId), saved.lease.leaseToken, JSON.stringify(saved)));
    if (!changed) throw new BrokerFailure('SAMPLE_LEASE_LOST');
  }
  async reconcile(): Promise<void> {
    if (this.reconciling) return this.reconciling;
    this.reconciling = this.performReconciliation();
    try { await this.reconciling; } finally { this.reconciling = null; }
  }
  private async performReconciliation() {
    const client = await this.redis();
    const ids = await client.smembers(index);
    for (const id of ids) {
      if (this.active.has(id)) continue;
      const raw = await client.get(key(id));
      if (!raw) throw new BrokerFailure('SAMPLE_AUTHORITY_LOST');
      const saved = JSON.parse(raw) as SavedSampleLease;
      if (!saved.terminalCommitId && this.recoverResult) {
        const recovery = this.session(saved).engine;
        await this.recoverResult(id, Object.freeze({ version: recovery.version, descriptor: recovery.descriptor,
          run: () => recovery.recover(1), dispose: async () => undefined }));
      }
      saved.terminalCommitId ??= randomUUID();
      // Explicit private non-scoring resolution survives public record expiry.
      await this.save(saved);
      const { engine } = this.session(saved);
      if (!saved.lease.reservationId) {
        const health = await engine.health();
        const response = await this.coordinator.client.request({ type: 'cancel', brokerGeneration: health.brokerGeneration, context: engine.context(), runtime: engine.descriptor });
        if (response.type === 'error' && response.code === 'NOT_FOUND') {
          await client.multi().del(key(id)).srem(index, id).exec(); continue;
        }
        if (response.type !== 'released' || !response.reservationId) throw new BrokerFailure('SAMPLE_RESERVE_UNCERTAIN');
        saved.lease.reservationId = response.reservationId; await this.save(saved);
      }
      if (saved.sourceReleased) {
        const response = await this.coordinator.client.request({ type: 'receipt', ...await engine.bound() });
        if (response.type === 'receipt') {
          saved.receiptId = response.receipt.receiptId; saved.checkpointId ??= saved.terminalCommitId;
          await this.save(saved);
          await engine.acknowledge(1, saved.receiptId, saved.checkpointId);
        } else if (!(response.type === 'pending' && ['acknowledged', 'reserved'].includes(response.state)) && response.type !== 'retired' && !(response.type === 'error' && response.code === 'UNCERTAIN')) {
          throw new BrokerFailure('SAMPLE_RECEIPT_UNCERTAIN');
        }
      }
      const cancelled = await this.coordinator.client.request({ type: 'cancel', ...await engine.bound() });
      if (cancelled.type !== 'released') throw new BrokerFailure('SAMPLE_CLEANUP_UNCERTAIN');
      await engine.retire(saved.terminalCommitId);
      await client.multi().del(key(id)).srem(index, id).exec();
    }
  }
  async sealed(epoch: number) {
    const client = await this.redis();
    const obsolete = (await client.hkeys(epochs)).filter(value => Number(value) <= epoch);
    if (obsolete.length) await client.hdel(epochs, ...obsolete);
  }
}
