import { parentPort, workerData } from "node:worker_threads";
import { createRequire } from "node:module";
import { dirname, sep } from "node:path";

import { loadPyodide, type PyodideInterface } from "pyodide";

/**
 * One Pyodide interpreter that only ever compares strings.
 *
 * It is a worker thread rather than a child process, and it is reused rather
 * than retired per use, because no submitted code runs here — the execution
 * boundary that forced processes on the runner does not apply. What does apply
 * is the budget: a pattern can still be pathological, so the parent owns a
 * deadline and writes an interrupt into shared memory, exactly as the runner's
 * deadline does. A timer beside Pyodide cannot fire while the regex engine
 * occupies that same event loop.
 */
const interrupt = workerData.interrupt as Uint8Array;
/** Passed in rather than imported: the worker resolves no project modules. */
const harness = workerData.harness as string;

let pyodide: PyodideInterface;
let compareOutput: (payload: string) => string;

async function initialize(): Promise<void> {
  const require = createRequire(import.meta.url);
  const indexURL = `${dirname(require.resolve("pyodide/package.json"))}${sep}`;
  pyodide = await loadPyodide({ indexURL });
  pyodide.setInterruptBuffer(interrupt);
  pyodide.runPython(harness);
  compareOutput = pyodide.globals.get("_cove_compare");
  compareOutput(JSON.stringify({ comparator: "STDOUT", actual: "warm", expected: "warm" }));
  // The interpreter's own account of what it is, not a configured claim: the
  // judge compares it with the runtime recorded on each submission.
  parentPort?.postMessage({ type: "ready", version: pyodide.version });
}

parentPort?.on(
  "message",
  (message: { type: "compare"; id: number; payload: string }) => {
    if (message.type !== "compare") return;
    // A trusted comparator worker, never a student runner. Dispatch latency
    // is infrastructure time; the per-pattern budget begins on this signal.
    parentPort?.postMessage({ type: "started", id: message.id });
    let result: string;
    try {
      result = compareOutput(message.payload);
    } catch (error) {
      const type = typeof error === "object" && error !== null && "type" in error
        ? String((error as { type: unknown }).type) : "";
      result = JSON.stringify(type === "KeyboardInterrupt"
        ? { kind: "timeout" }
        : { kind: "error", detail: String(error).slice(0, 200) });
    } finally {
      Atomics.store(interrupt, 0, 0);
    }
    parentPort?.postMessage({ type: "result", id: message.id, result });
  },
);

void initialize().catch((error: unknown) => {
  parentPort?.postMessage({ type: "fatal", message: String(error) });
});
