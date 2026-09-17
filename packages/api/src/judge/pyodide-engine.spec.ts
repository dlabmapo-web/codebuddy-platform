import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PyodideExecutionEngine } from "./pyodide-engine.js";

describe("PyodideExecutionEngine", () => {
  const engine = new PyodideExecutionEngine("0.27.5", 1);

  beforeAll(async () => {
    await engine.warmUp();
  }, 60_000);

  afterAll(async () => {
    await engine.dispose();
  });

  it("interrupts a busy loop without waiting for the worker event loop", async () => {
    const result = await engine.run({
      code: "while True:\n    pass",
      stdin: "",
      timeLimitMs: 100,
      memoryLimitMb: 256,
    });

    expect(result.outcome).toBe("TIME_LIMIT");
    expect(result.runtimeMs).toBeLessThan(2_000);
  });

  it("caps stdout before it is accumulated", async () => {
    const result = await engine.run({
      code: "print('x' * 400_000)",
      stdin: "",
      timeLimitMs: 2_000,
      memoryLimitMb: 256,
    });

    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(256 * 1024);
  });

  it("does not leak globals between runs on the warm interpreter", async () => {
    await engine.run({
      code: "student_secret = 42",
      stdin: "",
      timeLimitMs: 1_000,
      memoryLimitMb: 256,
    });
    const result = await engine.run({
      code: "print('student_secret' in globals())",
      stdin: "",
      timeLimitMs: 1_000,
      memoryLimitMb: 256,
    });

    expect(result.stdout.trim()).toBe("False");
  });
  describe("stdin", () => {
    const runWith = (code: string, stdin = "3\n4\n") =>
      engine.run({ code, stdin, timeLimitMs: 2_000, memoryLimitMb: 256 });

    it.each([
      ["input()", "print(int(input()) + int(input()))"],
      ["sys.stdin.readline", "import sys\ninput = sys.stdin.readline\nprint(int(input()) + int(input()))"],
      ["sys.stdin.read()", "import sys\nprint(sum(map(int, sys.stdin.read().split())))"],
      ["open(0)", "print(sum(map(int, open(0).read().split())))"],
    ])("gives %s the case input", async (_name, code) => {
      const result = await runWith(code);

      expect(result.outcome).toBe("PASSED");
      expect(result.stdout).toBe("7\n");
    });

    it("raises EOFError when the program reads past the case input", async () => {
      const result = await runWith("input(); input(); input()");

      expect(result.outcome).toBe("RUNTIME_ERROR");
      expect(result.stderr).toContain("EOFError");
    });

    it("keeps Korean input intact", async () => {
      const result = await runWith("a, b = input().split()\nprint(b, a)", "윷 모\n");

      expect(result.stdout).toBe("모 윷\n");
    });

    it("gives the next run its own input after a run closed fd 0", async () => {
      await runWith("print(open(0).read())");
      const result = await runWith("print(int(input()) + int(input()))", "5\n6\n");

      expect(result.outcome).toBe("PASSED");
      expect(result.stdout).toBe("11\n");
    });
  });
});
