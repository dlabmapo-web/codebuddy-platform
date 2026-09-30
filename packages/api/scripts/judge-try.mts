/**
 * Manual harness for the judge runner.
 *
 * Runs one program through the real execution engine — the same code path a
 * submission takes — and prints the verdict, so the sandbox and integrity
 * behaviour can be checked by hand without a database, Redis or the web app.
 *
 *   pnpm judge:try 'print(2 + 2)'
 *   pnpm judge:try 'print(int(input()) * 2)' --stdin '21'
 *   pnpm judge:try --file /tmp/solution.py --time 2000 --memory 128
 *   pnpm judge:try --suite            # the adversarial cases, with verdicts
 *   pnpm judge:try --built 'print(1)' # against packages/judge-worker/dist
 */
import { readFileSync } from "node:fs";

type Engine = {
  warmUp(): Promise<void>;
  run(request: {
    code: string;
    stdin: string;
    timeLimitMs: number;
    memoryLimitMb: number;
  }): Promise<{
    stdout: string;
    stderr: string;
    outcome: string;
    runtimeMs: number;
  }>;
  dispose(): Promise<void>;
};

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
};
const has = (name: string): boolean => argv.includes(`--${name}`);

const NL = String.fromCharCode(10);

/** Each case names what it is checking, so a surprising verdict is readable. */
const SUITE: Array<{ what: string; expect: string; code: string; stdin?: string }> = [
  { what: "ordinary program", expect: "PASSED", code: "print(int(input()) * 2)", stdin: "21" },
  { what: "wrong answer is still a normal run", expect: "PASSED", code: "print('anything')" },
  { what: "uncaught exception", expect: "RUNTIME_ERROR", code: "raise ValueError('boom')" },
  { what: "infinite loop hits the deadline", expect: "TIME_LIMIT", code: "while True:" + NL + "    pass" },
  { what: "output with no trailing newline survives", expect: "PASSED / stdout '123'", code: "print(123, end='')" },
  { what: "non-ASCII output survives", expect: "PASSED / stdout '한글'", code: "print('한글', end='')" },
  { what: "stdin read to EOF", expect: "PASSED / stdout \"'a" + "\\" + "n'\"", code: "import sys" + NL + "print(repr(sys.stdin.read()), end='')", stdin: "a" + NL },
  { what: "reading past EOF", expect: "RUNTIME_ERROR (EOFError)", code: "input()" + NL + "input()", stdin: "one" + NL },
  { what: "forging the result by rebinding json.dumps", expect: "PASSED / stdout 'real'", code: "import json" + NL + "json.dumps = lambda *a, **k: '{}'" + NL + "print('real', end='')" },
  { what: "suppressing a crash by replacing process.exit", expect: "RUNTIME_ERROR", code: "import js" + NL + "js.process.exit = js.Function('return () => {}')()" + NL + "print(123)" + NL + "raise ValueError('must fail')" },
  { what: "reading the judge's environment", expect: "PASSED / stdout 'None None'", code: "import js" + NL + "print(getattr(js.process.env, 'DATABASE_URL', None), getattr(js.process.env, 'REDIS_URL', None), end='')" },
  { what: "signalling the judge process", expect: "PASSED / stdout 'None None'", code: "import js" + NL + "print(getattr(js.process, 'kill', None), getattr(js.process, 'ppid', None), end='')" },
  { what: "reaching the network", expect: "PASSED / stdout 'DENIED None'", code: "import js" + NL + "print(js.Function('try { require(\"node:net\"); return \"REACHED\" } catch (e) { return \"DENIED\" }')(), getattr(js, 'fetch', None), end='')" },
  { what: "reading a host file from Python", expect: "PASSED / stdout 'DENIED'", code: "try:" + NL + "    open('/etc/hostname').read()" + NL + "    print('REACHED', end='')" + NL + "except OSError:" + NL + "    print('DENIED', end='')" },
  { what: "exceeding the memory limit", expect: "MEMORY_LIMIT", code: "import asyncio" + NL + "blocks = []" + NL + "for _ in range(40):" + NL + "    blocks.append(bytearray(16 * 1024 * 1024))" + NL + "    await asyncio.sleep(0.02)" },
];

async function main(): Promise<void> {
  const built = has("built");
  const modulePath = built
    ? new URL("../../judge-worker/dist/api/src/judge/pyodide-engine.js", import.meta.url).href
    : new URL("../src/judge/pyodide-engine.ts", import.meta.url).href;
  const { PyodideExecutionEngine } = (await import(modulePath)) as {
    PyodideExecutionEngine: new (v?: string, c?: number, s?: number) => Engine;
  };

  const timeLimitMs = Number(flag("time") ?? 5_000);
  const memoryLimitMb = Number(flag("memory") ?? 256);
  const file = flag("file");
  const positional = argv.find((value) => !value.startsWith("--"));

  console.log(`runner: ${built ? "compiled (judge-worker/dist)" : "source (packages/api/src)"}`);
  const engine = new PyodideExecutionEngine("0.27.5", 2, 1);
  const startedAt = Date.now();
  await engine.warmUp();
  console.log(`warm in ${Date.now() - startedAt}ms${NL}`);

  const cases = has("suite")
    ? SUITE
    : [
        {
          what: "your program",
          expect: "—",
          code: file ? readFileSync(file, "utf8") : (positional ?? "print('hello')"),
          stdin: flag("stdin"),
        },
      ];

  let failures = 0;
  try {
    for (const item of cases) {
      const result = await engine.run({
        code: item.code,
        stdin: item.stdin ? `${item.stdin}${item.stdin.endsWith(NL) ? "" : NL}` : "",
        timeLimitMs: item.what.includes("memory") ? 20_000 : timeLimitMs,
        memoryLimitMb,
      });
      const show = (value: string): string =>
        JSON.stringify(value.length > 200 ? `${value.slice(0, 200)}…` : value);
      console.log(`▸ ${item.what}`);
      if (has("suite")) console.log(`  expect  ${item.expect}`);
      console.log(`  outcome ${result.outcome}  (${result.runtimeMs}ms)`);
      console.log(`  stdout  ${show(result.stdout)}`);
      if (result.stderr.trim()) console.log(`  stderr  ${show(result.stderr)}`);
      console.log("");
    }
  } catch (error) {
    failures += 1;
    console.error("run failed:", error);
  } finally {
    await engine.dispose();
  }
  process.exit(failures > 0 ? 1 : 0);
}

void main();
