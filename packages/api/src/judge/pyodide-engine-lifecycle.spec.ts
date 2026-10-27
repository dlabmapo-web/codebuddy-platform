import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", async (original) => ({
  ...await original<typeof import("node:child_process")>(), spawn: mocks.spawn,
}));
import { PyodideExecutionEngine } from "./pyodide-engine.js";

class Child extends EventEmitter {
  pid = 900_000;
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdio = [null, this.stdout, this.stderr, new PassThrough()];
  kill = vi.fn(() => { this.emit("exit", null, "SIGKILL"); this.emit("close"); return true; });
}
let children: Child[];
let engine: PyodideExecutionEngine | undefined;
let reportReady: boolean;
beforeEach(() => {
  vi.useFakeTimers();
  children = [];
  reportReady = true;
  mocks.spawn.mockImplementation(() => {
    const child = new Child(); child.pid += children.length; children.push(child);
    if (reportReady) queueMicrotask(() => child.stdio[3]!.emit("data", Buffer.from("READY")));
    return child;
  });
  // Never signal a real process in this deterministic lifecycle simulation.
  vi.spyOn(process, "kill").mockImplementation((pid) => {
    children.find(c => c.pid === Math.abs(pid))?.kill(); return true;
  });
});
afterEach(async () => { await engine?.dispose(); engine = undefined; vi.useRealTimers(); vi.restoreAllMocks(); });
const request = { code: "print('answer')", stdin: "", timeLimitMs: 3000, memoryLimitMb: 128 };

describe("runner memory monitoring during output drain", () => {
  it("removes a disconnected queued request without consuming a later interpreter", async () => {
    engine = new PyodideExecutionEngine("0.27.5", 1, 0, () => 100); await engine.warmUp();
    const active = engine.run(request); await vi.advanceTimersByTimeAsync(0);
    const controller = new AbortController();
    const queued = engine.run({ ...request, signal: controller.signal }).catch(error => error);
    await vi.advanceTimersByTimeAsync(0); expect(engine.diagnostics().waiting).toBe(1);
    controller.abort(); expect((await queued).message).toMatch(/cancelled/); expect(engine.diagnostics().waiting).toBe(0);
    children[0]!.emit("exit", 0, null); children[0]!.emit("close"); expect((await active).outcome).toBe("PASSED");
    expect(engine.diagnostics().executing).toBe(0);
  });
  it("cancels active infrastructure work without turning it into a student timeout or success", async () => {
    engine = new PyodideExecutionEngine("0.27.5", 1, 0, () => 100); await engine.warmUp();
    const controller = new AbortController();
    const result = engine.run({ ...request, signal: controller.signal }).catch(error => error);
    await vi.advanceTimersByTimeAsync(0); controller.abort();
    expect((await result).message).toMatch(/cancelled/);
    expect(engine.telemetry.failures.forcedTermination).toBe(0);
    expect(engine.diagnostics().executing).toBe(0);
  });
  it("recovers an exhausted refill without requiring another student request", async () => {
    engine = new PyodideExecutionEngine("0.27.5", 2, 1, () => 100);
    await engine.warmUp(); reportReady = false;
    const first = engine.run(request); await vi.advanceTimersByTimeAsync(0);
    children[2]!.emit("exit", 0, null); children[2]!.emit("close"); await first;
    for (const index of [3, 4, 5]) {
      children[index]!.emit("error", new Error("fixture boot failure"));
      await vi.advanceTimersByTimeAsync(index < 5 ? 1000 : 0);
    }
    expect(engine.diagnostics().retryExhausted).toBe(true);
    reportReady = true; await vi.advanceTimersByTimeAsync(5000);
    expect(engine.diagnostics()).toMatchObject({ idle: 3, warming: 0, retryExhausted: false });
    expect(engine.stats().total).toBe(3);
  });
  it("quarantines a runner whose exit cannot be confirmed instead of freeing a physical slot", async () => {
    engine = new PyodideExecutionEngine("0.27.5", 1, 0, () => 100);
    await engine.warmUp(); children[0]!.kill.mockImplementation(() => false);
    const result = engine.run(request).catch(error => error);
    await vi.advanceTimersByTimeAsync(5200);
    expect((await result).message).toMatch(/confirm process exit/);
    expect(engine.diagnostics()).toMatchObject({ draining: 1, retryExhausted: true });
    expect(engine.stats().total).toBe(1); expect(children).toHaveLength(1);
    await expect(engine.run(request)).rejects.toThrow(/cleanup remains unconfirmed/);
    children[0]!.emit("exit", null, "SIGKILL"); children[0]!.emit("close");
  });
  it("serializes replacement initialization without losing a waiter or exceeding the physical bound", async () => {
    engine = new PyodideExecutionEngine("0.27.5", 2, 1, () => 100);
    await engine.warmUp(); reportReady = false;
    for (const index of [2, 1, 0]) {
      const result = engine.run(request); await vi.advanceTimersByTimeAsync(0);
      children[index]!.emit("exit", 0, null); children[index]!.emit("close");
      expect((await result).outcome).toBe("PASSED");
      expect(children).toHaveLength(4);
      expect(engine.stats().total).toBeLessThanOrEqual(3);
    }
    const waiting = engine.run(request); await vi.advanceTimersByTimeAsync(0);
    expect(engine.diagnostics().waiting).toBe(1);
    children[3]!.stdio[3]!.emit("data", Buffer.from("READY")); await vi.advanceTimersByTimeAsync(0);
    expect(children).toHaveLength(5); expect(engine.diagnostics()).toMatchObject({ executing: 1, warming: 1, waiting: 0 });
    children[3]!.emit("exit", 0, null); children[3]!.emit("close");
    expect((await waiting).outcome).toBe("PASSED");
    expect(engine.stats().total).toBeLessThanOrEqual(3);
  });
  it.each([0, 1])("keeps exit code %s while pipes drain beyond the blind-sample window", async (code) => {
    engine = new PyodideExecutionEngine("0.27.5", 1, 0, () => 100);
    await engine.warmUp();
    let settled = false;
    const result = engine.run(request).then(value => { settled = true; return { value }; }, error => { settled = true; return { error }; });
    await vi.advanceTimersByTimeAsync(0);
    const child = children[0]!;
    child.emit("exit", code, null);
    // The OS process is gone, but its pipes are not yet drained. Five 100ms
    // polls must not turn that known exit into an unreadable-live-runner fault.
    await vi.advanceTimersByTimeAsync(600);
    expect(settled).toBe(false);
    child.stdout.emit("data", Buffer.from("last output"));
    child.stderr.emit("data", Buffer.from("last diagnostic"));
    child.emit("close");
    expect(await result).toMatchObject({ value: {
      outcome: code === 0 ? "PASSED" : "RUNTIME_ERROR",
      stdout: "last output", stderr: "last diagnostic",
    } });
  });

  it("still fails closed when a live runner loses measurable memory", async () => {
    let reads = 0;
    engine = new PyodideExecutionEngine("0.27.5", 1, 0, () => reads++ === 0 ? 100 : null);
    await engine.warmUp();
    const result = engine.run(request).catch(error => error);
    await vi.advanceTimersByTimeAsync(600);
    expect(await result).toBeInstanceOf(Error);
    expect((await result).message).toMatch(/could not be measured/);
    expect(children[0]!.kill).toHaveBeenCalled();
  });
});
