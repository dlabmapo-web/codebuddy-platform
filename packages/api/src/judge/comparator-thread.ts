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

async function initialize(): Promise<void> {
  const require = createRequire(import.meta.url);
  const indexURL = `${dirname(require.resolve("pyodide/package.json"))}${sep}`;
  pyodide = await loadPyodide({ indexURL });
  pyodide.setInterruptBuffer(interrupt);
  await pyodide.runPythonAsync(harness);
  // The interpreter's own account of what it is, not a configured claim: the
  // judge compares it with the runtime recorded on each submission.
  parentPort?.postMessage({ type: "ready", version: pyodide.version });
}

parentPort?.on(
  "message",
  (message: { type: "compare"; id: number; payload: string }) => {
    if (message.type !== "compare") return;
    void (async () => {
      let result: string;
      try {
        // The payload crosses as data and is bound to a Python variable, never
        // interpolated into source: an expected output containing quotes or a
        // newline must not be able to become code.
        pyodide.globals.set("_cove_payload", message.payload);
        result = (await pyodide.runPythonAsync(
          "_cove_compare(_cove_payload)",
        )) as string;
      } catch (error) {
        // The parent's deadline arrives as a KeyboardInterrupt raised inside
        // Python. Pyodide surfaces it as a PythonError carrying the type on the
        // object; the message begins with a traceback, so matching on the text
        // alone missed it and reported a grader error for an ordinary timeout.
        const type =
          typeof error === "object" && error !== null && "type" in error
            ? String((error as { type: unknown }).type)
            : "";
        const interrupted =
          type === "KeyboardInterrupt" ||
          (error instanceof Error && /KeyboardInterrupt/.test(error.message));
        result = JSON.stringify(
          interrupted
            ? { kind: "timeout" }
            : { kind: "error", detail: String(error).slice(0, 200) },
        );
      } finally {
        Atomics.store(interrupt, 0, 0);
      }
      parentPort?.postMessage({ type: "result", id: message.id, result });
    })();
  },
);

void initialize().catch((error: unknown) => {
  parentPort?.postMessage({ type: "fatal", message: String(error) });
});
