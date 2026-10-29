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
import { Journal, JOURNAL_SNAPSHOT_MAX_BYTES } from "./journal.js";
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
  terminalCommitId?: string;
};
type Disk = {
  version: 1;
  records: RecordEntry[];
  prepared?: Allocation[];
  admissionEpoch: number;
  lastSeal?: {
    admissionEpoch: number;
    nextAdmissionEpoch: number;
    reconciliationId: string;
  };
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
  private admissionEpoch = 1;
  private lastSeal: Disk["lastSeal"];
  private closing = new Set<string>();
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
        admissionEpoch: this.admissionEpoch,
        lastSeal: this.lastSeal,
        prepared: this.prepared.map((p) => p.allocation),
      });
    } catch (e) {
      this.faulted = true;
      throw e;
    }
  }
  private requireJournalHeadroom(records = this.records) {
    const metadata: Disk = {
      version: 1,
      admissionEpoch: this.admissionEpoch,
      lastSeal: this.lastSeal,
      prepared: this.prepared.map((p) => p.allocation),
      records: records.map((r) => ({
        ...r,
        cases: r.cases.map((c) =>
          c.receipt
            ? {
                ...c,
                receipt: {
                  ...c.receipt,
                  result: { ...c.receipt.result, stdout: "", stderr: "" },
                },
              }
            : c,
        ),
      })),
    };
    // Exact serialized metadata size plus both maximum UTF-8 captures. The
    // extra 128 KiB covers two pending receipt envelopes and bounded allocation
    // facts/case transitions until the next serialized admission check.
    const reserve =
      2 *
        (this.manifest.capabilities.stdoutBytes +
          this.manifest.capabilities.stderrBytes) +
      128 * 1024;
    if (
      this.journal.encodedSize(metadata) + reserve >
      JOURNAL_SNAPSHOT_MAX_BYTES
    )
      throw new BrokerError(
        "BUSY",
        "Journal headroom requires terminal retirement before admission",
      );
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
      this.admissionEpoch = old.admissionEpoch ?? 1;
      invariant(
        Number.isSafeInteger(this.admissionEpoch) && this.admissionEpoch > 0,
        "Invalid admission epoch",
      );
      this.lastSeal = old.lastSeal;
      if (this.lastSeal)
        invariant(
          this.lastSeal.nextAdmissionEpoch === this.admissionEpoch &&
            this.lastSeal.admissionEpoch === this.admissionEpoch - 1,
          "Invalid sealed epoch history",
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
      records: this.records.length,
      admissionEpoch: this.admissionEpoch,
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
        type: "health" | "seal";
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
        type: "health" | "reserve" | "seal";
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
      if (request.type === "health")
        return await this.lock(async () => {
          if (!this.accepting || this.faulted)
            throw new BrokerError("INFRASTRUCTURE", "Broker is not ready");
          return {
            ...envelope,
            type: "health",
            brokerGeneration: this.generation,
            workerGeneration: this.workerGeneration,
            admissionEpoch: this.admissionEpoch,
            capabilities: brokerCapabilityManifestSchema.parse(
              this.manifest.capabilities,
            ),
          };
        });
      if (request.brokerGeneration !== this.generation)
        throw new BrokerError(
          "STALE_GENERATION",
          "Broker generation changed; reconcile",
        );
      if (request.type === "seal")
        return await this.lock(async () => {
          if (this.faulted)
            throw new BrokerError(
              "INFRASTRUCTURE",
              "Journal durability requires restart reconciliation",
            );
          if (request.workerGeneration !== this.workerGeneration)
            throw new BrokerError(
              "STALE_GENERATION",
              "Inactive terminal reconciliation worker",
            );
          if (request.admissionEpoch !== this.admissionEpoch) {
            if (
              this.lastSeal?.admissionEpoch === request.admissionEpoch &&
              this.lastSeal.reconciliationId === request.reconciliationId
            )
              return {
                ...envelope,
                type: "sealed",
                brokerGeneration: this.generation,
                workerGeneration: this.workerGeneration,
                ...this.lastSeal,
              };
            throw new BrokerError(
              "STALE_GENERATION",
              "Admission epoch already sealed or unknown",
            );
          }
          if (
            this.faulted ||
            this.closing.size ||
            this.active.size ||
            this.acquisitions.size ||
            this.replenishments.size ||
            this.retirements.size ||
            this.prepared.some((p) => p.state !== "READY_UNUSED") ||
            this.records.some((r) => !r.released || !r.terminalCommitId)
          )
            throw new BrokerError(
              "BUSY",
              "Epoch requires quiescent cleanup and durable terminal reconciliation of every reservation",
            );
          invariant(
            this.admissionEpoch < Number.MAX_SAFE_INTEGER,
            "Admission epoch exhausted",
          );
          this.lastSeal = {
            admissionEpoch: this.admissionEpoch,
            nextAdmissionEpoch: this.admissionEpoch + 1,
            reconciliationId: request.reconciliationId,
          };
          this.admissionEpoch++;
          this.records = [];
          this.durableReceipts.clear();
          await this.persist();
          return {
            ...envelope,
            type: "sealed",
            brokerGeneration: this.generation,
            workerGeneration: this.workerGeneration,
            ...this.lastSeal,
          };
        });
      registered(this.manifest, request.runtime);
      if (request.type === "reserve") {
        const reservation = await this.lock(async () => {
          if (request.admissionEpoch !== this.admissionEpoch)
            throw new BrokerError(
              "STALE_GENERATION",
              "Admission epoch sealed; never replay a retired admission in a newer epoch",
            );
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
            if (existing.terminalCommitId)
              throw new BrokerError(
                "STALE_GENERATION",
                "Attempt durably retired",
              );
            if (this.closing.has(existing.id))
              throw new BrokerError(
                "BUSY",
                "Reservation cleanup transition is fenced",
              );
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
          if (this.records.length >= 1024)
            throw new BrokerError(
              "BUSY",
              "Admission epoch full; retire terminal reservations and seal the epoch",
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
          this.requireJournalHeadroom([...this.records, r]);
          this.records.push(r);
          await this.persist();
          return r;
        });
        // Fence preparation ownership before launching side effects, while
        // retaining the nonblocking funding path outside the ledger mutex.
        const preparation = await this.lock(async () => {
          if (
            request.admissionEpoch !== this.admissionEpoch ||
            !sameLease(reservation.context, request.context)
          )
            throw new BrokerError(
              "IDENTITY_MISMATCH",
              "Reservation changed before preparation",
            );
          if (this.closing.has(reservation.id) || reservation.released)
            throw new BrokerError("BUSY", "Reservation closing");
          return {
            done:
              !this.active.has(reservation.id) &&
              !this.replenishments.has(reservation.id)
                ? this.acquire(reservation)
                : Promise.resolve(),
          };
        });
        await preparation.done;
        return await this.lock(async () => {
          if (
            request.admissionEpoch !== this.admissionEpoch ||
            !sameLease(reservation.context, request.context)
          )
            throw new BrokerError(
              "IDENTITY_MISMATCH",
              "Reservation changed during preparation",
            );
          if (reservation.released || this.closing.has(reservation.id))
            throw new BrokerError(
              "INFRASTRUCTURE",
              "Reservation cancelled during preparation",
            );
          return {
            ...envelope,
            type: "reserved",
            ...this.bound(request),
            reservationId: reservation.id,
            admissionEpoch: this.admissionEpoch,
          };
        });
      }
      if (request.type === "run") {
        await this.lock(async () => {
          const r = this.resolve(request);
          if (r.terminalCommitId)
            throw new BrokerError(
              "STALE_GENERATION",
              "Attempt durably retired",
            );
          if (this.closing.has(r.id))
            throw new BrokerError(
              "BUSY",
              "Reservation cleanup transition is fenced",
            );
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
          this.requireJournalHeadroom(
            this.records.map((v) =>
              v === r ? { ...r, cases: [...r.cases, next] } : v,
            ),
          );
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
      if (request.type === "receipt" || request.type === "run")
        return await this.lock(async () => {
          const r = this.resolve(request);
          const current = r.cases.find(
            (c) => c.context.caseId === request.context.caseId,
          );
          if (r.terminalCommitId)
            return {
              ...envelope,
              type: "retired",
              ...this.bound(request),
              reservationId: r.id,
              terminalCommitId: r.terminalCommitId,
            };
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
        });
      if (request.type === "ack")
        return await this.lock(async () => {
          const r = this.resolve(request);
          const current = r.cases.find(
            (c) => c.context.caseId === request.context.caseId,
          );
          if (this.closing.has(r.id))
            throw new BrokerError(
              "BUSY",
              "Reservation cleanup transition is fenced",
            );
          if (r.terminalCommitId)
            return {
              ...envelope,
              type: "retired",
              ...this.bound(request),
              reservationId: r.id,
              terminalCommitId: r.terminalCommitId,
            };
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
          this.durableReceipts.delete(request.receiptId);
          await this.persist();
          return {
            ...envelope,
            type: "acknowledged",
            ...this.bound(request),
            reservationId: r.id,
            receiptId: request.receiptId,
          };
        });
      if (request.type === "retire")
        return await this.lock(async () => {
          const r = this.resolve(request);
          if (
            this.closing.has(r.id) ||
            this.active.has(r.id) ||
            this.acquisitions.has(r.id) ||
            !r.released ||
            r.cases.some(
              (c) =>
                c.state !== "REMOVED" ||
                c.receipt ||
                (!c.checkpointId && !c.uncertain),
            )
          )
            throw new BrokerError(
              "BUSY",
              "Terminal retirement requires release, removed cases and durable checkpoint acknowledgement",
            );
          if (
            r.terminalCommitId &&
            r.terminalCommitId !== request.terminalCommitId
          )
            throw new BrokerError(
              "IDENTITY_MISMATCH",
              "Terminal commit acknowledgement changed",
            );
          r.terminalCommitId = request.terminalCommitId;
          for (const c of r.cases)
            if (c.receiptId) this.durableReceipts.delete(c.receiptId);
          r.cases = [];
          await this.persist();
          return {
            ...envelope,
            type: "retired",
            ...this.bound(request),
            reservationId: r.id,
            terminalCommitId: request.terminalCommitId,
          };
        });
      if (request.type === "cancel" || request.type === "release")
        return await this.closeReservation(request, envelope);
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
  private async closeReservation(
    request: Extract<BrokerRequest, { type: "cancel" | "release" }>,
    envelope: { protocol: 1; requestId: string },
  ): Promise<BrokerResponse> {
    const pending = await this.lock(async () => {
      const r = this.resolve(request);
      if (this.closing.has(r.id))
        throw new BrokerError(
          "BUSY",
          "Reservation cleanup transition is fenced",
        );
      const acquisition = this.acquisitions.get(r.id);
      const active = this.active.get(r.id);
      if (
        request.type === "release" &&
        (acquisition ||
          (active && r.cases.some((c) => c.state !== "REMOVED" || c.receipt)))
      )
        throw new BrokerError("BUSY", "Case is still active or unacknowledged");
      this.closing.add(r.id);
      acquisition?.abort.abort();
      active?.abort.abort();
      return {
        id: r.id,
        done: Promise.all([acquisition?.done.catch(() => {}), active?.done]),
      };
    });
    try {
      await pending.done;
      return await this.lock(async () => {
        const r = this.resolve(request);
        if (r.cases.some((c) => c.state !== "REMOVED"))
          throw new BrokerError(
            "UNCERTAIN",
            "Cleanup or execution remains uncertain",
          );
        if (r.cases.some((c) => c.receipt))
          throw new BrokerError("BUSY", "Receipt must be durably acknowledged");
        const replacement = this.replenishments.get(r.id);
        const funded = this.prepared.some((p) => p.reservationId === r.id);
        const configured = this.warmProfiles.some(
          (p) =>
            p.memoryLimitMb === r.memoryLimitMb &&
            runtimeDescriptorIdentity(p.runtime) ===
              runtimeDescriptorIdentity(r.runtime),
        );
        if (replacement && (!configured || !funded)) replacement.abort.abort();
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
    } finally {
      await this.lock(async () => {
        this.closing.delete(pending.id);
      });
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
      invariant(
        this.journal.encodedSize(allocation) <= 16 * 1024,
        "Allocation facts exceed journal transition budget",
      );
      await this.persist();
      await this.driver.ready(allocation, signal);
      allocation.creationState = "ready";
      invariant(
        this.journal.encodedSize(allocation) <= 16 * 1024,
        "Allocation facts exceed journal transition budget",
      );
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
      await this.lock(async () => this.requireJournalHeadroom());
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
      invariant(
        this.journal.encodedSize({
          ...receipt,
          result: { ...receipt.result, stdout: "", stderr: "" },
        }) <=
          16 * 1024,
        "Receipt metadata exceeds journal transition budget",
      );
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
