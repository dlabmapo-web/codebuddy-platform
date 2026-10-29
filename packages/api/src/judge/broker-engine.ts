import { executionEngineVersion, type RuntimeDescriptor, type ExecutionAttemptContext, type ExecutionReceipt, type BrokerResponse } from '@cove/shared';
import { BrokerClient, type ClientRequest } from '@cove/grading-runtime';
import { MAX_OUTPUT_BYTES, type ExecutionEngine, type ExecutionRequest, type ExecutionResult } from './execution-engine.js';

export type ExecutionLeaseIdentity = {
  id: string; attemptId: string; kind: ExecutionAttemptContext['kind']; generation: number; leaseToken: string;
  workerGeneration: string; brokerGeneration: string; reservationId: string | null;
  admissionEpoch: number; runtime: RuntimeDescriptor; memoryLimitMb: number;
};
export interface LeasePersistence {
  reservation(id: string): Promise<void>;
  /** Atomic source-release intent. False means a previous request may have executed. */
  releaseSource(position: number): Promise<boolean>;
}
export class BrokerFailure extends Error {
  constructor(readonly code: string) { super(`Grading broker: ${code}`); }
}
export async function brokerRequest(client: BrokerClient, request: ClientRequest, signal?: AbortSignal): Promise<Exclude<BrokerResponse, { type: 'error' }>> {
  const response = await client.request(request, signal);
  if (response.type === 'error') throw new BrokerFailure(response.code);
  return response;
}
/** One frozen job identity. dispose releases this reservation, never the shared broker. */
export class BrokerExecutionEngine implements ExecutionEngine {
  readonly version: string;
  readonly descriptor: RuntimeDescriptor;
  readonly receipts = new Map<number, ExecutionReceipt>();
  constructor(readonly client: BrokerClient, readonly lease: ExecutionLeaseIdentity, private readonly persistence: LeasePersistence) {
    this.descriptor = lease.runtime; this.version = executionEngineVersion(this.descriptor);
  }
  context(position = 1): ExecutionAttemptContext {
    return { attemptId: this.lease.attemptId, kind: this.lease.kind, generation: this.lease.generation,
      leaseToken: this.lease.leaseToken, workerGeneration: this.lease.workerGeneration, caseId: `case-${position}` };
  }
  private async waitBusy(request: ClientRequest) {
    const deadline = Date.now() + 60_000;
    for (;;) {
      try { return await brokerRequest(this.client, request); }
      catch (error) {
        if (!(error instanceof BrokerFailure) || error.code !== 'BUSY' || Date.now() >= deadline) throw error;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
  }
  async health() {
    const health = await brokerRequest(this.client, { type: 'health' });
    if (health.type !== 'health') throw new BrokerFailure('INVALID_HEALTH');
    return health;
  }
  async bound(position = 1) {
    if (!this.lease.reservationId) throw new BrokerFailure('RESERVATION_NOT_DURABLE');
    const health = await this.health();
    return { brokerGeneration: health.brokerGeneration, context: this.context(position), runtime: this.descriptor, reservationId: this.lease.reservationId };
  }
  async reserve() {
    const health = await this.health();
    if (health.brokerGeneration !== this.lease.brokerGeneration || health.workerGeneration !== this.lease.workerGeneration || health.admissionEpoch !== this.lease.admissionEpoch) throw new BrokerFailure('STALE_GENERATION');
    const request = { type: 'reserve' as const, brokerGeneration: health.brokerGeneration,
      context: this.context(), runtime: this.descriptor, memoryLimitMb: this.lease.memoryLimitMb, admissionEpoch: this.lease.admissionEpoch };
    let response;
    try { response = await this.waitBusy(request); }
    catch (error) {
      if (error instanceof BrokerFailure) throw error;
      // Source has not been released; repeat the same immutable reservation authority.
      response = await this.waitBusy(request);
    }
    if (response.type !== 'reserved') throw new BrokerFailure('INVALID_RESERVATION');
    await this.persistence.reservation(response.reservationId);
    this.lease.reservationId = response.reservationId;
  }
  async run(request: ExecutionRequest): Promise<ExecutionResult> {
    const position = request.casePosition;
    if (!position || !Number.isInteger(position)) throw new BrokerFailure('MISSING_CASE_POSITION');
    const bound = await this.bound(position);
    if (bound.brokerGeneration !== this.lease.brokerGeneration) throw new BrokerFailure("BROKER_RESTARTED");
    if (request.memoryLimitMb !== this.lease.memoryLimitMb) throw new BrokerFailure('BUDGET_MISMATCH');
    const fresh = await this.persistence.releaseSource(position);
    let response;
    if (fresh) {
      try {
        response = await this.waitBusy({ type: 'run', ...bound, input: {
          code: request.code, stdin: request.stdin, inputPromptPolicy: request.inputPromptPolicy ?? 'INCLUDE',
          memoryLimitMb: request.memoryLimitMb, timeLimitMs: Math.max(1, Math.floor(request.timeLimitMs)),
          outputLimitBytes: request.outputLimitBytes ?? MAX_OUTPUT_BYTES,
        } });
      } catch {
        // Lost reply: query the original case; never issue run a second time.
        response = await brokerRequest(this.client, { type: 'receipt', ...await this.bound(position) });
      }
    } else response = await brokerRequest(this.client, { type: 'receipt', ...bound });
    response = await this.settleReceipt(position, response);
    if (response.type !== 'receipt') throw new BrokerFailure('EXECUTION_UNCERTAIN');
    this.receipts.set(position, response.receipt);
    return response.receipt.result;
  }
  async recover(position: number): Promise<ExecutionResult> {
    const response = await this.settleReceipt(position, await brokerRequest(this.client, { type: 'receipt', ...await this.bound(position) }));
    if (response.type !== 'receipt') throw new BrokerFailure('EXECUTION_UNCERTAIN');
    this.receipts.set(position, response.receipt);
    return response.receipt.result;
  }
  private async settleReceipt(position: number, initial: Exclude<BrokerResponse, { type: 'error' }>) {
    let response = initial;
    const deadline = Date.now() + 120_000;
    while (response.type === 'pending' && response.state === 'running' && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 10));
      response = await brokerRequest(this.client, { type: 'receipt', ...await this.bound(position) });
    }
    return response;
  }
  async acknowledge(position: number, receiptId: string, checkpointId: string) {
    let response;
    try { response = await brokerRequest(this.client, { type: 'ack', ...await this.bound(position), receiptId, checkpointId }); }
    catch (error) {
      if (error instanceof BrokerFailure) throw error;
      response = await brokerRequest(this.client, { type: 'ack', ...await this.bound(position), receiptId, checkpointId });
    }
    if (response.type !== 'acknowledged' && response.type !== 'retired') throw new BrokerFailure('ACK_UNCERTAIN');
  }
  async dispose() {
    const response = await brokerRequest(this.client, { type: 'release', ...await this.bound() });
    if (response.type !== 'released') throw new BrokerFailure('CLEANUP_UNCERTAIN');
  }
  async retire(terminalCommitId: string) {
    await this.dispose();
    const response = await brokerRequest(this.client, { type: 'retire', ...await this.bound(), terminalCommitId });
    if (response.type !== 'retired') throw new BrokerFailure('RETIRE_UNCERTAIN');
  }
}
