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
beforeEach(() => {
  vi.useFakeTimers();
  children = [];
  mocks.spawn.mockImplementation(() => {
    const child = new Child(); child.pid += children.length; children.push(child);
    queueMicrotask(() => child.stdio[3]!.emit("data", Buffer.from("READY")));
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
