import { readFileSync } from "node:fs";
import type { ExecutionDiagnostics } from "./execution-telemetry.js";

/** Linux's private cgroup namespace exposes this container at this fixed root. */
export function sandboxResources(eventLoopP95Ms: number | null, read = (file: string) => readFileSync(`/sys/fs/cgroup/${file}`, "utf8")): ExecutionDiagnostics["resources"] {
  const file = (name: string) => { try { return read(name); } catch { return ""; } };
  const number = (text: string | undefined) => {
    if (!text?.trim()) return null;
    const value = Number(text.trim());
    return Number.isFinite(value) && value >= 0 ? value : null;
  };
  const fields = (text: string) => Object.fromEntries(text.trim().split("\n").map(line => line.split(/\s+/)));
  const cpu = fields(file("cpu.stat")), events = fields(file("memory.events"));
  const [quota, period] = file("cpu.max").trim().split(/\s+/).map(number);
  const pressure = /^full avg10=([\d.]+)/m.exec(file("cpu.pressure"))?.[1];
  return {
    cpuQuota: quota !== null && quota !== undefined && period ? quota / period : null,
    periods: number(cpu.nr_periods), throttledPeriods: number(cpu.nr_throttled),
    throttledSeconds: number(cpu.throttled_usec) === null ? null : Number(cpu.throttled_usec) / 1e6,
    cpuPressure: number(pressure), memoryBytes: number(file("memory.current")),
    memoryPeakBytes: number(file("memory.peak")), memoryLimitBytes: number(file("memory.max")),
    oom: number(events.oom), oomKill: number(events.oom_kill), tasks: number(file("pids.current")),
    eventLoopP95Ms,
  };
}
