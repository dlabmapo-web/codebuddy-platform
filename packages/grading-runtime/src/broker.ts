import { randomUUID } from "node:crypto";
import {
  brokerCapabilityManifestSchema,
  brokerRequestSchema,
  brokerResponseSchema,
  executionReceiptSchema,
  runtimeDescriptorIdentity,
  type BrokerRequest,
  type BrokerResponse,
  type RuntimeManifest,
  type ExecutionAttemptContext,
  type RuntimeDescriptor,
  type ExecutionReceipt,
  type BrokerExecutionInput,
} from "@cove/shared";
import { ResourceBank, guestBudget, type Funding } from "./resource-bank.js";
import { Journal } from "./journal.js";
import { registered, freeze } from "./manifest.js";
import { BrokerError, invariant } from "./errors.js";
import type { Allocation, GuestDriver } from "./driver.js";
type State =
  | "RESERVED"
  | "CREATING"
  | "READY_UNUSED"
  | "RUNNING"
  | "DRAINING"
  | "REMOVED"
  | "QUARANTINED";
type Case = {
  context: ExecutionAttemptContext;
  state: State;
  allocation?: Allocation;
  receipt?: ExecutionReceipt;
  receiptId?: string;
  checkpointId?: string;
  uncertain?: boolean;
};
type RecordEntry = {
  id: string;
  runtime: RuntimeDescriptor;
  context: ExecutionAttemptContext;
  released: boolean;
  memoryLimitMb: number;
  cases: Case[];
};
type Disk = {
  version: 1;
  records: RecordEntry[];
  prepared?: Allocation[];
};
export type WarmProfile = {
  runtime: RuntimeDescriptor;
  memoryLimitMb: number;
  targetReady: number;
};
type Prepared = {
  state: "CREATING" | "READY_UNUSED" | "DRAINING" | "QUARANTINED";
  allocation: Allocation;
  memoryLimitMb: number;
  reservationId?: string;
};
const sameLease = (a: ExecutionAttemptContext, b: ExecutionAttemptContext) =>
  a.attemptId === b.attemptId &&
  a.kind === b.kind &&
  a.generation === b.generation &&
  a.leaseToken === b.leaseToken &&
  a.workerGeneration === b.workerGeneration;
/** A durable single-use ledger; known/uncertain cases can never execute again. */
export class Broker {
  readonly generation = randomUUID();
  readonly bank = new ResourceBank();
  private records: RecordEntry[] = [];
  private durableReceipts = new Set<string>();
  private active = new Map<
    string,
    {
      abort: AbortController;
      done: Promise<void>;
    }
  >();
  private funding = new Map<string, Funding>();
  private replenishments = new Map<
    string,
    { abort: AbortController; done: Promise<void> }
  >();
  private retirements = new Set<Promise<void>>();
  private acquisitions = new Map<
    string,
    { abort: AbortController; done: Promise<Prepared> }
  >();
  private prepared: Prepared[] = [];
  private accepting = false;
  private faulted = false;
  private serial: Promise<void> = Promise.resolve();
  constructor(
    readonly manifest: RuntimeManifest,
    readonly driver: GuestDriver,
    readonly journal: Journal<Disk>,
    readonly workerGeneration: string,
    readonly warmProfiles: readonly WarmProfile[],
  ) {
    this.manifest = freeze(structuredClone(manifest));
    this.warmProfiles = freeze(structuredClone(warmProfiles));
    invariant(
      /^[a-f0-9-]{36}$/.test(workerGeneration),
      "Invalid worker generation",
    );
  }
  private async persist() {
    try {
      await this.journal.write({
        version: 1,
        records: this.records,
        prepared: this.prepared.map((p) => p.allocation),
      });
    } catch (e) {
      this.faulted = true;
      throw e;
    }
  }
  private lock<T>(work: () => Promise<T>): Promise<T> {
    const result = this.serial.then(work);
    this.serial = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  async start() {
    await this.driver.verify();
    const old = await this.journal.read();
    if (old) {
      invariant(
        old.version === 1 &&
          Array.isArray(old.records) &&
          old.records.length <= 10000,
        "Invalid journal",
      );
      this.records = old.records;
      for (const r of this.records) {
        registered(this.manifest, r.runtime);
        for (const c of r.cases) {
          if (c.receipt) {
            executionReceiptSchema.parse(c.receipt);
            this.durableReceipts.add(c.receipt.receiptId);
          }
          if (!c.allocation && c.state !== "REMOVED") {
            c.state = "REMOVED";
            c.uncertain = true;
          }
          if (c.allocation && c.state !== "REMOVED") {
            c.state = "QUARANTINED";
            c.uncertain = true;
            const funds = this.bank.tryReserve(c.allocation.budget);
            invariant(
              funds,
              "Recovered allocation inventory exceeds resource bank",
            );
            this.funding.set(c.allocation.id, funds);
          }
        }
      }
    }
    invariant(
      !old?.prepared ||
        (Array.isArray(old.prepared) && old.prepared.length <= 2),
      "Invalid preparation inventory",
    );
    for (const allocation of old?.prepared ?? []) {
      registered(this.manifest, allocation.runtime);
      const funds = this.bank.tryReserve(allocation.budget);
      invariant(funds, "Recovered preparation exceeds resource bank");
      this.funding.set(allocation.id, funds);
      this.prepared.push({
        state: "QUARANTINED",
        allocation,
        memoryLimitMb: allocation.memoryLimitMb,
      });
    }
    const found = await this.driver.discover();
    for (const id of found) {
      const facts =
        this.prepared.find((p) => p.allocation.id === id)?.allocation ??
        this.records
          .flatMap((r) => r.cases)
          .find((c) => c.allocation?.id === id)?.allocation;
      await this.driver.remove(id, facts);
    }
    for (const prepared of [...this.prepared]) await this.retire(prepared);
    for (const r of this.records)
      for (const c of r.cases)
        if (c.allocation && c.state !== "REMOVED") {
          await this.driver.remove(c.allocation.id, c.allocation);
          this.funding.get(c.allocation.id)?.release();
          this.funding.delete(c.allocation.id);
          c.state = "REMOVED";
          c.uncertain = true;
        } // Missing result stays uncertain even after proven cleanup.
    await this.persist();
    invariant(
      this.warmProfiles.length > 0 &&
        this.warmProfiles.reduce((n, p) => n + p.targetReady, 0) <= 2,
      "Configure one or two funded prepared guests",
    );
    const probe = new ResourceBank();
    for (const profile of this.warmProfiles) {
      registered(this.manifest, profile.runtime);
      invariant(
        Number.isInteger(profile.targetReady) && profile.targetReady > 0,
        "Invalid warm target",
      );
      for (let i = 0; i < profile.targetReady; i++)
        invariant(
          probe.tryReserve(
            guestBudget(profile.runtime.engine, profile.memoryLimitMb),
          ),
          "Warm profiles cannot be funded together",
        );
    }
    for (const profile of this.warmProfiles)
      for (let i = 0; i < profile.targetReady; i++)
        await this.prepare(profile.runtime, profile.memoryLimitMb);
    this.accepting = true;
  }
  census() {
    const cases = this.records.flatMap((r) => r.cases);
    return {
      active: this.records.filter((r) => !r.released).length,
      quarantined:
        cases.filter((c) => c.state === "QUARANTINED").length +
        this.prepared.filter((p) => p.state === "QUARANTINED").length,
      running: this.active.size,
      preparing: this.replenishments.size + this.acquisitions.size,
      prepared: this.prepared.filter((p) => p.state === "READY_UNUSED").length,
      resources: this.bank.census(),
      ready: this.accepting && !this.faulted,
    };
  }
  private bound(
    request: Exclude<
      BrokerRequest,
      {
        type: "health";
      }
    >,
  ) {
    return {
      brokerGeneration: this.generation,
      context: request.context,
      runtime: request.runtime,
    };
  }
  private resolve(
    request: Exclude<
      BrokerRequest,
      {
        type: "health" | "reserve";
      }
    >,
  ): RecordEntry {
    const r =
      "reservationId" in request && request.reservationId
        ? this.records.find((r) => r.id === request.reservationId)
        : this.records.find((r) => sameLease(r.context, request.context));
    if (!r)
      throw new BrokerError(
        "NOT_FOUND",
        "Unknown reservation; this does not authorize execution",
      );
    if (
      !sameLease(r.context, request.context) ||
      runtimeDescriptorIdentity(r.runtime) !==
        runtimeDescriptorIdentity(request.runtime)
    )
      throw new BrokerError("IDENTITY_MISMATCH", "Reservation fence mismatch");
    return r;
  }
  async handle(value: BrokerRequest): Promise<BrokerResponse> {
    const request = brokerRequestSchema.parse(value);
    const envelope = { protocol: 1 as const, requestId: request.requestId };
    try {
      if (request.type === "health") {
        if (!this.accepting || this.faulted)
          throw new BrokerError("INFRASTRUCTURE", "Broker is not ready");
        return {
          ...envelope,
          type: "health",
          brokerGeneration: this.generation,
          workerGeneration: this.workerGeneration,
          capabilities: brokerCapabilityManifestSchema.parse(
            this.manifest.capabilities,
          ),
        };
      }
      if (request.brokerGeneration !== this.generation)
        throw new BrokerError(
          "STALE_GENERATION",
          "Broker generation changed; reconcile",
        );
      registered(this.manifest, request.runtime);
      if (request.type === "reserve") {
        const reservation = await this.lock(async () => {
          if (!this.accepting || this.faulted)
            throw new BrokerError(
              "INFRASTRUCTURE",
              "Broker is not accepting work",
            );
          if (request.context.workerGeneration !== this.workerGeneration)
            throw new BrokerError(
              "STALE_GENERATION",
              "Worker generation is not active",
            );
          const existing = this.records.find(
            (r) => r.context.attemptId === request.context.attemptId,
          );
          if (existing) {
            if (
              existing.memoryLimitMb !== request.memoryLimitMb ||
              runtimeDescriptorIdentity(existing.runtime) !==
                runtimeDescriptorIdentity(request.runtime) ||
              existing.context.kind !== request.context.kind
            )
              throw new BrokerError(
                "IDENTITY_MISMATCH",
                "Frozen attempt profile differs",
              );
            if (
              sameLease(existing.context, request.context) &&
              !existing.released
            )
              return existing;
            if (
              request.context.generation <= existing.context.generation ||
              request.context.leaseToken === existing.context.leaseToken
            )
              throw new BrokerError(
                "STALE_GENERATION",
                "Attempt already known; recover before generation takeover",
              );
            if (
              existing.cases.some(
                (c) => c.uncertain || c.state === "QUARANTINED",
              )
            )
              throw new BrokerError(
                "UNCERTAIN",
                "Uncertain attempt cannot resume execution",
              );
            if (
              this.active.has(existing.id) ||
              this.acquisitions.has(existing.id) ||
              existing.cases.some((c) => c.state !== "REMOVED" || c.receipt)
            )
              throw new BrokerError(
                "BUSY",
                "Prior generation must finish cleanup and checkpoint acknowledgement",
              );
            const others = this.records.filter(
              (r) => r !== existing && !r.released,
            );
            if (
              others.length >= 2 ||
              (request.context.kind !== "submission" &&
                others.some((r) => r.context.kind !== "submission"))
            )
              throw new BrokerError("BUSY", "Execution slots occupied");
            existing.context = request.context;
            existing.released = false;
            await this.persist();
            return existing;
          }
          const live = this.records.filter((r) => !r.released);
          if (
            live.length >= 2 ||
            (request.context.kind !== "submission" &&
              live.some((r) => r.context.kind !== "submission"))
          )
            throw new BrokerError("BUSY", "Execution slots occupied");
          if (this.records.length >= 10000)
            throw new BrokerError(
              "BUSY",
              "Reconciliation metadata full; operator retirement required",
            );
          const r: RecordEntry = {
            id: randomUUID(),
            runtime: request.runtime,
            context: request.context,
            released: false,
            memoryLimitMb: request.memoryLimitMb,
            cases: [],
          };
          const budget = guestBudget(r.runtime.engine, r.memoryLimitMb);
          if (budget.bytes > this.bank.capacity.bytes - this.bank.control.bytes)
            throw new BrokerError(
              "UNSUPPORTED",
              "Profile cannot fit physical execution bank",
            );
          this.records.push(r);
          await this.persist();
          return r;
        });
        // Funding/initialization never holds the ledger mutex: a larger waiting
        // profile must not prevent the current owner from running/releasing.
        if (
          !this.active.has(reservation.id) &&
          !this.replenishments.has(reservation.id)
        )
          await this.acquire(reservation);
        if (reservation.released)
          throw new BrokerError(
            "INFRASTRUCTURE",
            "Reservation cancelled during preparation",
          );
        return {
          ...envelope,
          type: "reserved",
          ...this.bound(request),
          reservationId: reservation.id,
        };
      }
      const r = this.resolve(request);
      if (request.type === "run") {
        await this.lock(async () => {
          if (r.cases.some((c) => c.context.caseId === request.context.caseId))
            return;
          if (this.active.has(r.id) || this.replenishments.has(r.id))
            throw new BrokerError("BUSY", "Guest replacement is preparing");
          if (r.released || this.faulted || !this.accepting)
            throw new BrokerError("INFRASTRUCTURE", "Reservation cannot run");
          if (request.context.workerGeneration !== this.workerGeneration)
            throw new BrokerError("STALE_GENERATION", "Inactive worker");
          if (r.cases.some((c) => c.state !== "REMOVED" || c.receipt))
            throw new BrokerError(
              "BUSY",
              "Previous case must be removed and acknowledged",
            );
          if (r.cases.length >= 1000)
            throw new BrokerError("BUSY", "Case ledger bound reached");
          if (request.input.memoryLimitMb !== r.memoryLimitMb)
            throw new BrokerError(
              "IDENTITY_MISMATCH",
              "Run memory budget differs from reservation",
            );
          guestBudget(request.runtime.engine, request.input.memoryLimitMb);
          const next: Case = { context: request.context, state: "RESERVED" };
          r.cases.push(next);
          await this.persist();
          const abort = new AbortController();
          const done = this.execute(r, next, request.input, abort.signal);
          this.active.set(r.id, { abort, done });
          void done
            .finally(() => {
              if (this.active.get(r.id)?.done === done)
                this.active.delete(r.id);
            })
            .catch(() => {});
        });
      }
      const current = r.cases.find(
        (c) => c.context.caseId === request.context.caseId,
      );
      if (request.type === "receipt" || request.type === "run") {
        if (
          current?.receipt &&
          this.durableReceipts.has(current.receipt.receiptId)
        )
          return brokerResponseSchema.parse({
            ...envelope,
            type: "receipt",
            receipt: current.receipt,
          });
        if (current?.uncertain || current?.state === "QUARANTINED")
          throw new BrokerError(
            "UNCERTAIN",
            "Known execution is uncertain; never rerun",
          );
        return {
          ...envelope,
          type: "pending",
          ...this.bound(request),
          reservationId: r.id,
          state: current?.checkpointId
            ? "acknowledged"
            : current
              ? "running"
              : "reserved",
        };
      }
      if (request.type === "ack")
        return await this.lock(async () => {
          if (
            !current ||
            current.receiptId !== request.receiptId ||
            (!current.checkpointId &&
              !this.durableReceipts.has(request.receiptId))
          )
            throw new BrokerError("NOT_FOUND", "Receipt mismatch");
          if (
            current.checkpointId &&
            current.checkpointId !== request.checkpointId
          )
            throw new BrokerError("IDENTITY_MISMATCH", "Checkpoint mismatch");
          current.checkpointId = request.checkpointId;
          delete current.receipt;
          await this.persist();
          return {
            ...envelope,
            type: "acknowledged",
            ...this.bound(request),
            reservationId: r.id,
            receiptId: request.receiptId,
          };
        });
      if (request.type === "cancel" || request.type === "release") {
        const acquisition = this.acquisitions.get(r.id);
        if (acquisition) {
          if (request.type === "release")
            throw new BrokerError("BUSY", "Guest preparation is active");
          acquisition.abort.abort();
          await acquisition.done.catch(() => {});
        }
        const active = this.active.get(r.id);
        if (active) {
          if (
            request.type === "release" &&
            r.cases.some((c) => c.state !== "REMOVED" || c.receipt)
          )
            throw new BrokerError(
              "BUSY",
              "Case is still active or unacknowledged",
            );
          active.abort.abort();
          await active.done;
        }
        return await this.lock(async () => {
          if (r.cases.some((c) => c.state !== "REMOVED"))
            throw new BrokerError(
              "UNCERTAIN",
              "Cleanup or execution remains uncertain",
            );
          if (r.cases.some((c) => c.receipt))
            throw new BrokerError(
              "BUSY",
              "Receipt must be durably acknowledged",
            );
          // Future unused preparation is broker inventory, not current-case
          // cleanup. Its cancellation/removal must not delay committed feedback.
          const replacement = this.replenishments.get(r.id);
          const fundedReplacement = this.prepared.some(
            (p) => p.reservationId === r.id,
          );
          const configured = this.warmProfiles.some(
            (p) =>
              p.memoryLimitMb === r.memoryLimitMb &&
              runtimeDescriptorIdentity(p.runtime) ===
                runtimeDescriptorIdentity(r.runtime),
          );
          if (replacement && (!configured || !fundedReplacement))
            replacement.abort.abort();
          const idle = this.prepared.find(
            (p) => p.reservationId === r.id && p.state === "READY_UNUSED",
          );
          if (idle) {
            delete idle.reservationId;
            if (!this.shouldKeepWarm(idle)) this.retireLater(idle);
          }
          r.released = true;
          await this.persist();
          return {
            ...envelope,
            type: "released",
            ...this.bound(request),
            reservationId: r.id,
            cleanup: "removed",
          };
        });
      }
      throw new BrokerError("UNSUPPORTED", "Unknown command");
    } catch (e) {
      return {
        ...envelope,
        type: "error",
        code: e instanceof BrokerError ? e.code : "INFRASTRUCTURE",
        message:
          e instanceof BrokerError
            ? e.message
            : "Broker operation failed; reconcile private state",
      };
    }
  }
  private shouldKeepWarm(p: Prepared) {
    const profile = this.warmProfiles.find(
      (w) =>
        w.memoryLimitMb === p.memoryLimitMb &&
        runtimeDescriptorIdentity(w.runtime) ===
          runtimeDescriptorIdentity(p.allocation.runtime),
    );
    const others = this.prepared.filter(
      (v) =>
        v !== p &&
        !v.reservationId &&
        v.state === "READY_UNUSED" &&
        v.memoryLimitMb === p.memoryLimitMb &&
        runtimeDescriptorIdentity(v.allocation.runtime) ===
          runtimeDescriptorIdentity(p.allocation.runtime),
    ).length;
    return !!profile && others < profile.targetReady;
  }
  private retireLater(p: Prepared) {
    const done = this.retire(p)
      .then(() => this.persist())
      .catch(() => {
        this.faulted = true;
      });
    this.retirements.add(done);
    void done.finally(() => this.retirements.delete(done));
  }
  private replenish(r: RecordEntry) {
    const abort = new AbortController();
    const done = this.prepare(r.runtime, r.memoryLimitMb, r.id, abort.signal)
      .then(async (p) => {
        if (r.released) {
          delete p.reservationId;
          if (this.bank.census().waiting > 0 || !this.shouldKeepWarm(p))
            await this.retire(p);
        }
        await this.persist();
      })
      .catch(async () => {
        if (!abort.signal.aborted) this.faulted = true;
        await this.persist().catch(() => {});
      });
    this.replenishments.set(r.id, { abort, done });
    void done.finally(() => {
      if (this.replenishments.get(r.id)?.done === done)
        this.replenishments.delete(r.id);
    });
  }
  private async retire(p: Prepared) {
    p.state = "DRAINING";
    try {
      await this.driver.remove(p.allocation.id, p.allocation);
    } catch (e) {
      p.state = "QUARANTINED";
      this.faulted = true;
      throw e;
    }
    this.funding.get(p.allocation.id)?.release();
    this.funding.delete(p.allocation.id);
    this.prepared = this.prepared.filter((v) => v !== p);
  }
  private async prepare(
    runtime: RuntimeDescriptor,
    memoryLimitMb: number,
    reservationId?: string,
    cancellation?: AbortSignal,
  ): Promise<Prepared> {
    const signal = cancellation
      ? AbortSignal.any([cancellation, AbortSignal.timeout(45000)])
      : AbortSignal.timeout(45000);
    const budget = guestBudget(runtime.engine, memoryLimitMb);
    const funds = await this.bank.reserve(budget, signal);
    const allocation: Allocation = {
      id: randomUUID(),
      generation: this.generation,
      runtime,
      budget,
      memoryLimitMb,
      creationState: "creating",
    };
    this.funding.set(allocation.id, funds);
    const p: Prepared = {
      state: "CREATING",
      allocation,
      memoryLimitMb,
      reservationId,
    };
    this.prepared.push(p);
    try {
      await this.persist();
      await this.driver.create(allocation, signal);
      allocation.creationState = "created";
      await this.persist();
      await this.driver.ready(allocation, signal);
      allocation.creationState = "ready";
      await this.persist();
      signal.throwIfAborted();
      p.state = "READY_UNUSED";
      return p;
    } catch (e) {
      if (!cancellation?.aborted) this.faulted = true;
      try {
        await this.retire(p);
      } catch {}
      throw e;
    }
  }
  private acquire(r: RecordEntry): Promise<Prepared> {
    const pending = this.acquisitions.get(r.id);
    if (pending) return pending.done;
    const abort = new AbortController();
    const done = this.acquireInner(r, abort.signal);
    this.acquisitions.set(r.id, { abort, done });
    void done
      .finally(() => {
        if (this.acquisitions.get(r.id)?.done === done)
          this.acquisitions.delete(r.id);
      })
      .catch(() => {});
    return done;
  }
  private async acquireInner(
    r: RecordEntry,
    signal: AbortSignal,
  ): Promise<Prepared> {
    let p = this.prepared.find(
      (p) => p.reservationId === r.id && p.state === "READY_UNUSED",
    );
    if (p) return p;
    p = this.prepared.find(
      (p) =>
        !p.reservationId &&
        p.state === "READY_UNUSED" &&
        p.memoryLimitMb === r.memoryLimitMb &&
        runtimeDescriptorIdentity(p.allocation.runtime) ===
          runtimeDescriptorIdentity(r.runtime),
    );
    if (p) {
      p.reservationId = r.id;
      return p;
    }
    // A released job's funded matching replacement may finish in the background;
    // claim that clean interpreter instead of creating a duplicate allocation.
    const warming = this.prepared.find(
      (p) =>
        p.state === "CREATING" &&
        p.reservationId &&
        this.records.find((r) => r.id === p.reservationId)?.released &&
        p.memoryLimitMb === r.memoryLimitMb &&
        runtimeDescriptorIdentity(p.allocation.runtime) ===
          runtimeDescriptorIdentity(r.runtime),
    );
    if (warming?.reservationId) {
      const pending = this.replenishments.get(warming.reservationId);
      if (pending) {
        await pending.done;
        signal.throwIfAborted();
        if (this.faulted)
          throw new BrokerError("INFRASTRUCTURE", "Preparation failed");
        return this.acquireInner(r, signal);
      }
    }
    // Only unused, unassigned guests may be retired for an older admitted profile.
    for (const idle of this.prepared.filter(
      (p) => !p.reservationId && p.state === "READY_UNUSED",
    ))
      await this.retire(idle);
    return this.prepare(r.runtime, r.memoryLimitMb, r.id, signal);
  }
  private async execute(
    r: RecordEntry,
    c: Case,
    input: BrokerExecutionInput,
    signal: AbortSignal,
  ) {
    let allocation: Allocation | undefined;
    try {
      const prepared = await this.acquire(r);
      allocation = prepared.allocation;
      this.prepared = this.prepared.filter((p) => p !== prepared);
      c.allocation = allocation;
      c.state = "READY_UNUSED";
      await this.persist();
      signal.throwIfAborted();
      c.state = "RUNNING";
      await this.persist();
      const result = await this.driver.execute(allocation, input, signal);
      invariant(
        Buffer.byteLength(result.stdout) <= input.outputLimitBytes,
        "Driver capture exceeded frozen output limit",
      );
      c.state = "DRAINING";
      await this.persist();
      await this.driver.remove(allocation.id, allocation);
      this.funding.get(allocation.id)!.release();
      this.funding.delete(allocation.id);
      c.state = "REMOVED";
      const receipt = executionReceiptSchema.parse({
        version: 1,
        brokerGeneration: this.generation,
        receiptId: randomUUID(),
        reservationId: r.id,
        context: c.context,
        runtime: r.runtime,
        result,
        cleanup: "removed",
      });
      c.receipt = receipt;
      c.receiptId = receipt.receiptId;
      await this.persist();
      this.durableReceipts.add(receipt.receiptId);
      // A fresh replacement can initialize while the worker commits its checkpoint.
      // No next-case source is released until the receipt is acknowledged.
      if (!signal.aborted && this.accepting) this.replenish(r);
    } catch {
      if (c.receiptId) {
        if (!signal.aborted) this.faulted = true;
        await this.persist();
        return;
      }
      c.state = "QUARANTINED";
      c.uncertain = true;
      if (!signal.aborted) this.faulted = true;
      if (allocation) {
        try {
          await this.driver.remove(allocation.id, allocation);
          this.funding.get(allocation.id)?.release();
          this.funding.delete(allocation.id);
          c.state = "REMOVED";
        } catch {
          this.faulted = true;
        }
      } else c.state = "REMOVED";
      await this.persist();
    }
  }
  async stop() {
    this.accepting = false;
    for (const p of this.replenishments.values()) p.abort.abort();
    for (const a of this.acquisitions.values()) a.abort.abort();
    await Promise.allSettled(
      [...this.acquisitions.values()].map((a) => a.done),
    );
    for (const a of this.active.values()) a.abort.abort();
    await Promise.all([...this.active.values()].map((a) => a.done));
    await Promise.all([...this.replenishments.values()].map((p) => p.done));
    await Promise.all([...this.retirements]);
    for (const p of [...this.prepared]) await this.retire(p);
    await this.persist();
  }
}
