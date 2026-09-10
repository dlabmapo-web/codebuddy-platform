import { writeSync } from "node:fs";
import { createRequire } from "node:module";
import { Socket } from "node:net";
import { dirname, sep } from "node:path";

import { loadPyodide } from "pyodide";

/**
 * One student program, in a process of its own, used once and discarded.
 *
 * Nothing the student can reach participates in reporting the verdict. Their
 * output leaves through this process's real stdout and is read by the parent
 * from the OS pipe; whether the program failed is this process's exit status.
 * Rebinding `sys.stdout`, `json.dumps` or any other Python name can only change
 * what this student's own program writes — it cannot reach a later student, and
 * it cannot reach the comparison, because the expected output and the
 * comparator never enter this process.
 *
 * `CONTROL_FD` carries the job in and the readiness signal out, so that neither
 * shares a channel with program output. The parent stops reading it once the
 * job is delivered, so anything the student writes there afterwards is ignored.
 */
const CONTROL_FD = 3;

/**
 * The host's own reporting and termination path, captured before any student
 * code exists to modify it.
 *
 * `process.exit` is the verdict: a Python exception surfaces to the host frame
 * here and this process exits non-zero because of it. Reading it off `process`
 * at the point of use meant reading whatever the student had put there —
 * replacing it through the `js` bridge turned a raised `ValueError` into a
 * `PASSED`, with the traceback still printed on stderr. The same applies to the
 * writes that carry their output: a rebound `process.stdout.write` would let a
 * program edit what the parent receives.
 *
 * Bound copies cannot be reached from `globalThis`, so they survive anything
 * done to `process` afterwards. `lockDownHost` then deletes `process.exit` and
 * `process.reallyExit` outright — deciding the exit status is the host's job,
 * never the program's. Termination goes through `reallyExit` rather than
 * `exit` precisely because `exit` reaches `process.reallyExit` by name at call
 * time, and that name is about to be gone; output is flushed explicitly first.
 */
const hostExit: (code: number) => never = (
  process as unknown as { reallyExit: (code: number) => never }
).reallyExit.bind(process);
const hostStdoutWrite = process.stdout.write.bind(process.stdout);
const hostStderrWrite = process.stderr.write.bind(process.stderr);
const hostBufferFrom = Buffer.from.bind(Buffer);

type Job = { code: string; stdin: string };

/**
 * Host lockdown, applied after Pyodide is warm and before student code runs.
 *
 * Pyodide exposes the host `globalThis` to Python as the `js` module and
 * `js.Function` is arbitrary JavaScript, so every Node API the runner can reach
 * is reachable from a student's program. Python's own view of the filesystem is
 * already confined to Pyodide's in-memory FS — `open("/etc/passwd")` fails
 * before this runs — but the JavaScript bridge is not.
 *
 * Node's permission model would be the enforcement mechanism of choice. It
 * cannot be used: Pyodide calls `process.binding`, which `--permission` denies
 * unconditionally and no `--allow-*` flag re-enables, so the runtime cannot
 * boot under it at all. What is left is to remove the entry points.
 *
 * Patching the CommonJS export objects covers `import("node:fs")` too, ESM
 * namespaces for builtins being built from those same objects — verified
 * including through `new Function('return import("node:fs")')`. `worker_threads`
 * matters as much as the rest: a worker would come up with a fresh module
 * registry and none of these patches.
 *
 * Only connecting and host-touching entry points are replaced. Replacing
 * `net.Socket` wholesale breaks Node's own stdout, which is built on it.
 *
 * This is a denylist over a large surface, so treat it as defence in depth and
 * not as a sandbox: it raises the cost of an escape, it does not prove one is
 * impossible. OS-level isolation — a container, nsjail, seccomp — is still the
 * boundary that should be relied on, and is a deployment concern rather than
 * something this file can assert.
 */
function lockDownHost(): void {
  const require = createRequire(import.meta.url);
  const deny = (): never => {
    throw new Error("ERR_COVE_HOST_DENIED");
  };
  const replace = (target: unknown, keys: string[]): void => {
    if (typeof target !== "object" || target === null) return;
    for (const key of keys) {
      try {
        (target as Record<string, unknown>)[key] = deny;
      } catch {
        // Non-writable: leave it and keep going.
      }
    }
  };
  const load = (name: string): unknown => {
    try {
      return require(`node:${name}`);
    } catch {
      return null;
    }
  };

  const net = load("net") as { Socket?: { prototype: unknown } } | null;
  replace(net, ["connect", "createConnection"]);
  replace(net?.Socket?.prototype, ["connect"]);
  replace(load("http"), ["request", "get"]);
  replace(load("https"), ["request", "get"]);
  replace(load("http2"), ["connect"]);
  replace(load("tls"), ["connect"]);
  replace(load("dgram"), ["createSocket"]);
  replace(load("dns"), ["lookup", "resolve", "resolve4", "resolve6"]);

  // A worker would get an unpatched module registry, undoing everything above.
  replace(load("worker_threads"), ["Worker"]);
  replace(load("child_process"), [
    "spawn",
    "spawnSync",
    "exec",
    "execSync",
    "execFile",
    "execFileSync",
    "fork",
  ]);

  const fs = load("fs") as { promises?: unknown } | null;
  const fsCalls = [
    "readFile",
    "readFileSync",
    "writeFile",
    "writeFileSync",
    "appendFile",
    "appendFileSync",
    "open",
    "openSync",
    "readdir",
    "readdirSync",
    "opendir",
    "opendirSync",
    "unlink",
    "unlinkSync",
    "rename",
    "renameSync",
    "rm",
    "rmSync",
    "createReadStream",
    "createWriteStream",
    "copyFile",
    "copyFileSync",
    "realpath",
    "realpathSync",
    "stat",
    "statSync",
  ];
  replace(fs, fsCalls);
  replace(fs?.promises, fsCalls);
  replace(load("vm"), ["runInNewContext", "runInThisContext", "compileFunction"]);

  for (const name of ["fetch", "WebSocket", "XMLHttpRequest", "EventSource"]) {
    try {
      delete (globalThis as unknown as Record<string, unknown>)[name];
    } catch {
      // Non-configurable: the connecting APIs above are already gone.
    }
  }
  // Raw native bindings would route around every patch above. `kill` and
  // `ppid` matter for a different reason: this process shares the judge's OS
  // identity, so `process.kill(process.ppid)` is a student stopping the judge
  // itself. `exit` stays — a student ending their own run is contained.
  for (const name of [
    "binding",
    "dlopen",
    "kill",
    "abort",
    "ppid",
    "pid",
    // The exit status is the verdict. A program that can set it can pass
    // itself; `hostExit` above is the only way out of this process.
    "exit",
    "reallyExit",
  ]) {
    try {
      delete (process as unknown as Record<string, unknown>)[name];
    } catch {
      // Nothing further to do.
    }
  }
}

async function main(): Promise<void> {
  // The parent passes Pyodide's location: in development this module has been
  // transpiled into a temporary directory that cannot resolve a bare specifier,
  // and in production it saves a resolution the parent has already done.
  const argument = process.argv[2];
  const indexURL = argument
    ? `${argument}${argument.endsWith(sep) ? "" : sep}`
    : `${dirname(createRequire(import.meta.url).resolve("pyodide/package.json"))}${sep}`;

  let stdin = Buffer.alloc(0);
  let cursor = 0;
  const pyodide = await loadPyodide({
    indexURL,
    // What `python3 -u` gives Elice's runner. Without it Python block-buffers,
    // and `print(x, end="")` is still sitting in that buffer when the process
    // exits — the program's last line silently missing from its output.
    env: { PYTHONUNBUFFERED: "1", HOME: "/home/pyodide" },
  });

  // Bytes, not lines: a line-batched handler cannot represent output with no
  // trailing newline, and reconstructing one corrupts what the student wrote.
  pyodide.setStdout({
    write: (buffer: Uint8Array) => {
      hostStdoutWrite(hostBufferFrom(buffer));
      return buffer.length;
    },
  });
  pyodide.setStderr({
    write: (buffer: Uint8Array) => {
      hostStderrWrite(hostBufferFrom(buffer));
      return buffer.length;
    },
  });
  // Returning 0 is EOF. Returning an empty string through the line-oriented
  // callback is not: `sys.stdin.read()` never terminates on it, and the case
  // dies on the time limit instead of reading to the end of its input.
  pyodide.setStdin({
    read: (buffer: Uint8Array) => {
      if (cursor >= stdin.length) return 0;
      const written = stdin.copy(buffer, 0, cursor, stdin.length);
      cursor += written;
      return written;
    },
  });

  writeSync(CONTROL_FD, "READY\n");

  const job = await readJob();
  if (!job) hostExit(0);

  stdin = Buffer.from(job.stdin, "utf8");
  lockDownHost();

  try {
    // Awaited here rather than inside Python: the exception surfaces to this
    // host frame, so the exit status below is decided outside the interpreter.
    await pyodide.runPythonAsync(job.code);
  } catch (error) {
    hostStderrWrite(formatPythonError(error));
    await flush();
    hostExit(1);
  }
  await flush();
  hostExit(0);
}

/**
 * Reads the one job line from the control descriptor.
 *
 * A `net.Socket` rather than `fs.createReadStream`: a read stream on a pipe
 * goes through the libuv threadpool, and that thread sits in a blocking `read`
 * that the process cannot exit out of — which matters here because the exit
 * status *is* the verdict. The socket is destroyed as soon as the job arrives,
 * so nothing the student writes to this descriptor is ever read.
 */
function readJob(): Promise<Job | null> {
  return new Promise((resolve) => {
    const control = new Socket({ fd: CONTROL_FD, readable: true, writable: false });
    let buffer = "";
    control.setEncoding("utf8");
    control.on("data", (chunk: string) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;
      const line = buffer.slice(0, newline).trim();
      control.destroy();
      resolve(line ? (JSON.parse(line) as Job) : null);
    });
    control.on("error", () => resolve(null));
    control.on("close", () => resolve(null));
  });
}

/** `PythonError.type` plus the last line of its message, matching v1's shape. */
function formatPythonError(error: unknown): string {
  const type =
    typeof error === "object" && error !== null && "type" in error
      ? String((error as { type: unknown }).type)
      : "Error";
  const raw = error instanceof Error ? error.message : String(error);
  const lastLine =
    raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .pop() ?? "";
  // Pyodide's message ends with "TypeError: ..."; avoid printing the type twice.
  const message = lastLine.startsWith(`${type}:`)
    ? lastLine.slice(type.length + 1).trim()
    : lastLine;
  return `${type}: ${message}`;
}

/** stdout/stderr are pipes, so a pending write can outlive a bare `exit`. */
function flush(): Promise<void> {
  return new Promise((resolve) => {
    let pending = 2;
    const done = (): void => {
      pending -= 1;
      if (pending === 0) resolve();
    };
    hostStdoutWrite("", done);
    hostStderrWrite("", done);
  });
}

void main().catch((error: unknown) => {
  // A boot or protocol failure, not a verdict about the student. The parent
  // separates this from a graded outcome by the exit status.
  hostStderrWrite(`runner failed: ${String(error)}`);
  hostExit(70);
});
