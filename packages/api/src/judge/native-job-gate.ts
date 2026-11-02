import { ResourceBank, type Lane } from "@cove/grading-runtime";
import type { NativeNodeResources } from "@cove/shared";
import { setTimeout as delay } from "node:timers/promises";

export function nativeBackgroundCapable(r: NativeNodeResources) {
  return r.cpuSlots > r.officialReservedSlots && r.envelopeMemoryMb - r.serviceOverheadMb - r.officialReservedMemoryMb >= 512 + r.caseOverheadMb + r.scratchMb;
}
/** Conservative whole-job reservations before claiming any database row. Cases remain sequential. */
export class NativeJobGate {
  private readonly bank: ResourceBank;
  private stopped = false;
  constructor(resources: NativeNodeResources) {
    if (resources.maxCaseMemoryMb < 512) throw new Error("Native classroom queue requires capacity through 512 MiB");
    this.bank = new ResourceBank(resources);
  }
  stop() { this.stopped = true; }
  async run<T>(memoryMb: number, lane: Lane, action: () => Promise<T>): Promise<T> {
    if (!Number.isInteger(memoryMb) || memoryMb < 16 || memoryMb > 512) throw new Error("Work exceeds native classroom capacity");
    let reservation;
    while (!reservation) {
      if (this.stopped) throw new Error("Native worker draining");
      try { reservation = this.bank.acquire(memoryMb, lane); }
      catch { await delay(25); }
    }
    try { return await action(); }
    finally { reservation.cleaned(); }
  }
}
