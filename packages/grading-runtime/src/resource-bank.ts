import { BrokerError } from "./errors.js";
export const MiB = 1024 * 1024;
export type Budget = {
  bytes: number;
  pids: number;
};
export type Funding = {
  readonly budget: Budget;
  release(): void;
};
/** Strict FIFO prevents small requests from bypassing an older funded profile. */
export class ResourceBank {
  private bytes: number;
  private pids: number;
  private allocations = 0;
  private queue: {
    budget: Budget;
    queuedAt: number;
    resolve: (v: Funding) => void;
    reject: (e: Error) => void;
    signal?: AbortSignal;
    abort: () => void;
  }[] = [];
  constructor(
    readonly capacity: Budget = { bytes: 1280 * MiB, pids: 256 },
    readonly control: Budget = { bytes: 256 * MiB, pids: 96 },
  ) {
    this.bytes = control.bytes;
    this.pids = control.pids;
    this.check({ bytes: 1, pids: 1 });
  }
  private check(b: Budget) {
    if (
      !Number.isSafeInteger(b.bytes) ||
      !Number.isSafeInteger(b.pids) ||
      b.bytes <= 0 ||
      b.pids <= 0 ||
      b.bytes > this.capacity.bytes - this.control.bytes ||
      b.pids > this.capacity.pids - this.control.pids
    )
      throw new BrokerError(
        "UNSUPPORTED",
        "Profile cannot be funded within execution family",
      );
  }
  private fits(b: Budget) {
    return (
      this.allocations < 2 &&
      this.bytes + b.bytes <= this.capacity.bytes &&
      this.pids + b.pids <= this.capacity.pids
    );
  }
  private take(b: Budget): Funding {
    this.allocations++;
    this.bytes += b.bytes;
    this.pids += b.pids;
    let released = false;
    return {
      budget: Object.freeze({ ...b }),
      release: () => {
        if (released) return;
        released = true;
        this.allocations--;
        this.bytes -= b.bytes;
        this.pids -= b.pids;
        this.pump();
      },
    };
  }
  tryReserve(b: Budget): Funding | null {
    this.check(b);
    return !this.queue.length && this.fits(b) ? this.take(b) : null;
  }
  reserve(b: Budget, signal?: AbortSignal): Promise<Funding> {
    this.check(b);
    if (signal?.aborted)
      return Promise.reject(new BrokerError("INFRASTRUCTURE", "Cancelled"));
    const immediate = this.tryReserve(b);
    if (immediate) return Promise.resolve(immediate);
    if (this.queue.length >= 2)
      return Promise.reject(new BrokerError("BUSY", "Funding queue full"));
    return new Promise((resolve, reject) => {
      const entry = {
        budget: { ...b },
        queuedAt: performance.now(),
        resolve,
        reject,
        signal,
        abort: () => {
          const i = this.queue.indexOf(entry);
          if (i >= 0) this.queue.splice(i, 1);
          reject(new BrokerError("INFRASTRUCTURE", "Cancelled"));
          this.pump();
        },
      };
      this.queue.push(entry);
      signal?.addEventListener("abort", entry.abort, { once: true });
    });
  }
  private pump() {
    while (this.queue[0] && this.fits(this.queue[0].budget)) {
      const q = this.queue.shift()!;
      q.signal?.removeEventListener("abort", q.abort);
      q.resolve(this.take(q.budget));
    }
  }
  census() {
    return {
      allocations: this.allocations,
      bytes: this.bytes,
      pids: this.pids,
      waiting: this.queue.length,
      oldestWaitMs: this.queue[0] ? Math.max(0, performance.now() - this.queue[0].queuedAt) : 0,
    };
  }
}
export function guestBudget(
  engine: "cpython" | "pyodide",
  memoryLimitMb: number,
): Budget {
  if (
    !Number.isInteger(memoryLimitMb) ||
    memoryLimitMb < 16 ||
    memoryLimitMb > 4096
  )
    throw new BrokerError(
      "UNSUPPORTED",
      "Memory profile must be an integer in 16–4096 MiB",
    );
  if (engine === "cpython" && (memoryLimitMb < 32 || memoryLimitMb > 256))
    throw new BrokerError("UNSUPPORTED", "Native profile requires 32–256 MiB");
  // Includes initialization ceiling, supervisor, pipe/output and tmpfs headroom.
  return {
    bytes: (memoryLimitMb + (engine === "cpython" ? 128 : 320)) * MiB,
    pids: 32,
  };
}
/** Versioned physical admission assumptions; Linux acceptance must measure them. */
export const EXECUTION_RESOURCE_MANIFEST = Object.freeze({
  version: 1,
  parent: Object.freeze({
    memoryBytes: 1280 * MiB,
    cpus: 1.5,
    pids: 256,
    swapBytes: 0,
  }),
  control: Object.freeze({ memoryBytes: 256 * MiB, pids: 96 }),
  guest: Object.freeze({
    nativeHeadroomBytes: 128 * MiB,
    compatibilityHeadroomBytes: 320 * MiB,
    tmpfsBytes: 16 * MiB,
    pids: 32,
  }),
  maxActive: 2,
  maxBackground: 1,
  maxSpare: 0,
  journalDiskBytes: 64 * MiB,
});
