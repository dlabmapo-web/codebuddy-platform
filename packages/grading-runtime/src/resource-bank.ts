import {
  nativeNodeResourcesSchema,
  type NativeNodeResources,
} from "@cove/shared";
import { NativeInfrastructureError } from "./contract.js";
export type Lane = "official" | "background";
type State = "active" | "draining" | "quarantined";
/** Non-queueing admission: queue wait belongs to the trusted job worker. */
export class ResourceBank {
  readonly resources: Readonly<NativeNodeResources>;
  private allocations = new Map<symbol, { memory: number; state: State }>();
  private unhealthy = false;
  private standby = 0;
  private standbyMemoryMb = 0;
  constructor(resources: NativeNodeResources) {
    this.resources = Object.freeze(nativeNodeResourcesSchema.parse(resources));
  }
  get ready() {
    return !this.unhealthy;
  }
  quarantine() {
    this.unhealthy = true;
  }
  snapshot() {
    let active = 0,
      draining = 0,
      quarantined = 0,
      memoryMb = this.standbyMemoryMb;
    for (const allocation of this.allocations.values()) {
      memoryMb += allocation.memory;
      if (allocation.state === "active") active++;
      else if (allocation.state === "draining") draining++;
      else quarantined++;
    }
    return { active, draining, quarantined, standby: this.standby, memoryMb };
  }
  /**
   * A CPU slot is held while learner code can run. A draining allocation has
   * exited and holds only memory until its cleanup is proven; a quarantined one
   * keeps its slot, and the bank is unready anyway.
   */
  private get busySlots() {
    let busy = 0;
    for (const allocation of this.allocations.values())
      if (allocation.state !== "draining") busy++;
    return busy;
  }
  /** CPU slots no running case holds; prewarming prefers spare CPU. */
  get idleSlots() {
    return Math.max(0, this.resources.cpuSlots - this.busySlots);
  }
  /**
   * Idle prewarmed jails hold no CPU slot and are kernel-capped at `memoryMb`.
   * They draw only on a fixed budget: memory left over when every slot of either
   * lane holds a maximum-size case. No sequence of admissions and completions
   * can therefore leave a standby blocking a real admission.
   */
  reserveStandby(memoryMb: number, limit: number) {
    const r = this.resources;
    const maxCase = r.maxCaseMemoryMb + r.caseOverheadMb + r.scratchMb;
    const available = r.envelopeMemoryMb - r.serviceOverheadMb;
    const budget = Math.min(
      available - r.cpuSlots * maxCase,
      available -
        r.officialReservedMemoryMb -
        (r.cpuSlots - r.officialReservedSlots) * maxCase,
    );
    if (
      !this.ready ||
      this.standby >= limit ||
      this.standbyMemoryMb + memoryMb > budget
    )
      return undefined;
    this.standby++;
    this.standbyMemoryMb += memoryMb;
    let released = false;
    /** Call only once the standby's processes and cgroup are proven gone. */
    return () => {
      if (released) return;
      released = true;
      this.standby--;
      this.standbyMemoryMb -= memoryMb;
    };
  }
  acquire(memoryLimitMb: number, lane: Lane) {
    const r = this.resources;
    if (
      !Number.isInteger(memoryLimitMb) ||
      memoryLimitMb < 16 ||
      memoryLimitMb > r.maxCaseMemoryMb
    )
      throw new NativeInfrastructureError("Memory exceeds certified capacity");
    const memory = memoryLimitMb + r.caseOverheadMb + r.scratchMb;
    const used = this.snapshot();
    const slots =
      r.cpuSlots - (lane === "background" ? r.officialReservedSlots : 0);
    const available =
      r.envelopeMemoryMb -
      r.serviceOverheadMb -
      (lane === "background" ? r.officialReservedMemoryMb : 0);
    if (
      !this.ready ||
      this.busySlots >= slots ||
      used.memoryMb + memory > available
    )
      throw new NativeInfrastructureError("Native capacity unavailable");
    const key = Symbol();
    this.allocations.set(key, { memory, state: "active" });
    let complete = false;
    return {
      draining: () => {
        const a = this.allocations.get(key);
        if (a && a.state === "active") a.state = "draining";
      },
      /** Only called after the backend has verified empty cgroup and pipe drain. */
      cleaned: () => {
        if (complete) return;
        complete = true;
        this.allocations.delete(key);
      },
      quarantine: () => {
        const a = this.allocations.get(key);
        if (a) a.state = "quarantined";
        this.unhealthy = true;
        complete = true;
      },
    };
  }
}
