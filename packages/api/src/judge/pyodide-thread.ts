import { parentPort, workerData } from "node:worker_threads";
import { createRequire } from "node:module";
import { dirname, sep } from "node:path";

import { loadPyodide, type PyodideInterface } from "pyodide";

import type { ExecutionRequest, ExecutionResult } from "./execution-engine.js";

const MAX_OUTPUT_BYTES = 256 * 1024;
const interrupt = workerData.interrupt as Uint8Array;

// The case input is served from Pyodide's stdin device (see `serveCaseInput`),
// so it sits behind file descriptor 0 itself and not only behind `sys.stdin`:
// `open(0).read()` bypasses `sys.stdin`. Each run reads through a fresh text
// wrapper so read-ahead cannot carry one case's input into the next, and a fd 0
// closed by user code (`open(0)` closes it when collected) is reopened before
// and after every run.
const HARNESS = `
import sys, io, json, os, traceback

def _cove_ensure_stdin_fd():
    try:
        os.fstat(0)
    except OSError:
        os.open('/dev/stdin', os.O_RDONLY)

class _CoveOutput(io.TextIOBase):
    def __init__(self, max_bytes):
        self.max_bytes = max_bytes
        self.parts = []
        self.size = 0
    def writable(self):
        return True
    def write(self, value):
        encoded = str(value).encode('utf-8')
        remaining = self.max_bytes - self.size
        if remaining > 0:
            kept = encoded[:remaining]
            self.parts.append(kept.decode('utf-8', errors='ignore'))
            self.size += len(kept)
        return len(value)
    def getvalue(self):
        return ''.join(self.parts)

def _cove_run(user_code, max_bytes):
    saved_stdout, saved_stderr, saved_stdin = sys.stdout, sys.stderr, sys.stdin
    out, err = _CoveOutput(max_bytes), _CoveOutput(max_bytes)
    _cove_ensure_stdin_fd()
    sys.stdout, sys.stderr = out, err
    case_stdin = open(0, 'r', encoding='utf-8', closefd=False)
    sys.stdin = case_stdin
    error = None
    try:
        exec(compile(user_code, 'solution.py', 'exec'), {'__name__': '__main__'})
    except BaseException as exc:
        frames = [f for f in traceback.extract_tb(exc.__traceback__)
                  if f.filename == 'solution.py']
        error = {
            'type': type(exc).__name__,
            'message': str(exc),
            'line': frames[-1].lineno if frames else getattr(exc, 'lineno', None),
        }
    finally:
        sys.stdout, sys.stderr, sys.stdin = saved_stdout, saved_stderr, saved_stdin
        case_stdin.close()
        _cove_ensure_stdin_fd()
    return json.dumps({
        'stdout': out.getvalue(),
        'stderr': err.getvalue(),
        'error': error,
    })
`;

let pyodide: PyodideInterface;

const utf8 = new TextEncoder();
let caseInput = new Uint8Array(0);
let caseOffset = 0;

/** What fd 0 holds for the next run: exactly this text, then EOF. */
function serveCaseInput(stdin: string): void {
  caseInput = utf8.encode(stdin);
  caseOffset = 0;
}

async function initialize(): Promise<void> {
  const require = createRequire(import.meta.url);
  const indexURL = `${dirname(require.resolve("pyodide/package.json"))}${sep}`;
  pyodide = await loadPyodide({ indexURL });
  pyodide.setInterruptBuffer(interrupt);
  pyodide.setStdin({
    read: (buffer) => {
      const size = Math.min(buffer.length, caseInput.length - caseOffset);
      buffer.set(caseInput.subarray(caseOffset, caseOffset + size));
      caseOffset += size;
      return size;
    },
  });
  await pyodide.runPythonAsync(HARNESS);
  parentPort?.postMessage({ type: "ready" });
}

async function run(
  id: number,
  request: ExecutionRequest,
): Promise<void> {
  const startedAt = Date.now();
  let result: ExecutionResult;
  try {
    serveCaseInput(request.stdin);
    const raw = (await pyodide.runPythonAsync(
      `_cove_run(${JSON.stringify(request.code)}, ${MAX_OUTPUT_BYTES})`,
    )) as string;
    const parsed = JSON.parse(raw) as {
      stdout: string;
      stderr: string;
      error: { type: string; message: string } | null;
    };
    const timedOut = parsed.error?.type === "KeyboardInterrupt";
    result = {
      stdout: parsed.stdout,
      stderr: timedOut
        ? ""
        : parsed.error
          ? `${parsed.error.type}: ${parsed.error.message}`
          : parsed.stderr,
      outcome: timedOut
        ? "TIME_LIMIT"
        : parsed.error
          ? "RUNTIME_ERROR"
          : "PASSED",
      runtimeMs: Date.now() - startedAt,
    };
  } catch (error) {
    const interrupted =
      error instanceof Error && /KeyboardInterrupt/.test(error.message);
    result = {
      stdout: "",
      stderr: interrupted ? "" : String(error),
      outcome: interrupted ? "TIME_LIMIT" : "RUNTIME_ERROR",
      runtimeMs: Date.now() - startedAt,
    };
  } finally {
    Atomics.store(interrupt, 0, 0);
    serveCaseInput("");
    await pyodide
      .runPythonAsync("globals().clear()\n" + HARNESS)
      .catch(() => undefined);
  }
  parentPort?.postMessage({ type: "result", id, result });
}

parentPort?.on(
  "message",
  (message: { type: "run"; id: number; request: ExecutionRequest }) => {
    if (message.type === "run") {
      void run(message.id, message.request).catch((error) => {
        parentPort?.postMessage({
          type: "fatal",
          id: message.id,
          message: String(error),
        });
      });
    }
  },
);

void initialize().catch((error) => {
  parentPort?.postMessage({ type: "fatal", message: String(error) });
});
