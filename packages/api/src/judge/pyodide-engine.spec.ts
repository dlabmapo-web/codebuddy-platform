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
});
