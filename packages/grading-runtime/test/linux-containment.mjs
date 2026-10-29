/** Explicitly invoked on an isolated, provisioned Linux host; never auto-runs. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { BrokerClient } from "../dist/index.js";
assert.equal(
  process.platform,
  "linux",
  "Linux containment acceptance requires Linux",
);
assert.equal(
  process.env.GRADING_LINUX_ACCEPTANCE,
  "1",
  "Explicit isolated-host acceptance opt-in required",
);
const client = new BrokerClient(process.env.JUDGE_SANDBOX_SOCKET);
const health = await client.request({ type: "health" });
assert.equal(health.type, "health");
const results = [];
for (const runtime of health.capabilities.runtimes) {
  const context = {
    attemptId: randomUUID(),
    kind: "submission",
    caseId: "1",
    generation: 1,
    leaseToken: randomUUID(),
    workerGeneration: health.workerGeneration,
  };
  const bound = { brokerGeneration: health.brokerGeneration, context, runtime };
  const reserved = await client.request({
    type: "reserve",
    admissionEpoch: health.admissionEpoch,
    ...bound,
    memoryLimitMb: 128,
  });
  assert.equal(reserved.type, "reserved");
  const cases = [
    {
      name: "unicode prompt",
      code: 'print(input("prompt:"))',
      stdin: "한😀\n",
      expected: "한😀\n",
    },
    {
      name: "maximum consumed stdin",
      code: "import sys; print(len(sys.stdin.read()))",
      stdin: "x".repeat(8388608),
      expected: "8388608\n",
    },
    {
      name: "maximum unconsumed stdin",
      code: 'print("done")',
      stdin: "x".repeat(8388608),
      expected: "done\n",
    },
    {
      name: "full stdout control bytes",
      code: 'import sys; sys.stdout.write("\\0" * 8388608)',
      stdin: "",
      expected: "\0".repeat(8388608),
    },
    {
      name: "wall timeout",
      code: "while True: pass",
      stdin: "",
      outcome: "TIME_LIMIT",
      timeLimitMs: 50,
    },
  ];
  if (runtime.engine === "cpython")
    cases.push(
      {
        name: "native kernel allocation burst",
        code: "x=bytearray(512*1024*1024)",
        stdin: "",
        outcome: "MEMORY_LIMIT",
      },
      {
        name: "closed control and read-only cgroups",
        code: 'import os\ntry: os.fstat(3)\nexcept OSError: print("closed")\ntry: open("/sys/fs/cgroup/cgroup.procs", "w")\nexcept OSError: print("readonly")',
        stdin: "",
        expected: "closed\nreadonly\n",
      },
    );
  for (let i = 0; i < cases.length; i++) {
    const fixture = cases[i];
    const scope = {
      ...bound,
      context: { ...context, caseId: String(i + 1) },
      reservationId: reserved.reservationId,
    };
    const input = {
      code: fixture.code,
      stdin: fixture.stdin,
      inputPromptPolicy: "IGNORE",
      memoryLimitMb: 128,
      timeLimitMs: fixture.timeLimitMs ?? 5000,
      outputLimitBytes: 8388608,
    };
    let reply;
    for (let retry = 0; retry < 100; retry++) {
      reply = await client.request({ type: "run", ...scope, input });
      if (reply.type !== "error" || reply.code !== "BUSY") break;
      await new Promise((r) => setTimeout(r, 50));
    }
    for (let poll = 0; poll < 1800 && reply.type === "pending"; poll++) {
      await new Promise((r) => setTimeout(r, 50));
      reply = await client.request({ type: "receipt", ...scope });
    }
    assert.equal(
      reply.type,
      "receipt",
      JSON.stringify({
        engine: runtime.engine,
        case: fixture.name,
        response: reply.type,
        code: reply.code,
      }),
    );
    assert.equal(reply.receipt.cleanup, "removed");
    assert.equal(reply.receipt.result.outcome, fixture.outcome ?? "PASSED");
    if (fixture.expected !== undefined)
      assert.equal(reply.receipt.result.stdout, fixture.expected);
    assert.equal(
      (
        await client.request({
          type: "ack",
          ...scope,
          receiptId: reply.receipt.receiptId,
          checkpointId: randomUUID(),
        })
      ).type,
      "acknowledged",
    );
    results.push({
      engine: runtime.engine,
      case: fixture.name,
      outcome: reply.receipt.result.outcome,
      runtimeMs: reply.receipt.result.runtimeMs,
    });
  }
  let released;
  for (let i = 0; i < 100; i++) {
    released = await client.request({
      type: "release",
      ...bound,
      reservationId: reserved.reservationId,
    });
    if (released.type === "released") break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(released.type, "released");
}
console.log(
  JSON.stringify(
    { brokerGeneration: health.brokerGeneration, results },
    null,
    2,
  ),
);
