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
      memoryMb = 0;
    for (const allocation of this.allocations.values()) {
      memoryMb += allocation.memory;
      if (allocation.state === "active") active++;
      else if (allocation.state === "draining") draining++;
      else quarantined++;
    }
    return { active, draining, quarantined, memoryMb };
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
      this.allocations.size >= slots ||
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
