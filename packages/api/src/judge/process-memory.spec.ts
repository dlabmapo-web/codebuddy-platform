import { describe, expect, it } from "vitest";
import { linuxMemoryMb, readProcessMemoryMb } from "./process-memory.js";

describe("process memory accounting", () => {
  it("keeps swapped allocations charged rather than treating them as freed", () => {
    expect(linuxMemoryMb("VmRSS: 65536 kB\nVmSwap: 131072 kB\n")).toBe(192);
  });
  it("fails closed on missing counters", () => {
    expect(linuxMemoryMb("VmRSS: 65536 kB\n")).toBeNull();
    expect(linuxMemoryMb("")).toBeNull();
    expect(readProcessMemoryMb(-1)).toBeNull();
  });
  it("reads the current process through OS telemetry", () => {
    expect(readProcessMemoryMb(process.pid)).toBeGreaterThan(0);
  });
});
