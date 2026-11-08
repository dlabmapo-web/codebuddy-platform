import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect, createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  NativeExecutionService,
  CleanupUncertainError,
  type NativeBackend,
} from "../src/service.js";
import { NativeExecutionClient } from "../src/client.js";
import { encodeFrame, FrameDecoder } from "../src/framing.js";
import { manifest, request, result } from "./fixtures.js";
async function fixture(backend: NativeBackend, opts = {}) {
  // macOS Unix socket sun_path is short; use /tmp rather than long $TMPDIR.
  const directory = await mkdtemp("/tmp/cove-native-");
  const socketPath = join(directory, "s");
  const service = new NativeExecutionService({
    socketPath,
    manifest,
    backend,
    ...opts,
  });
  await service.listen();
  const client = new NativeExecutionClient({
    socketPath,
    descriptor: manifest.descriptor,
    lane: "official",
    acquisitionTimeoutMs: 1000,
  });
  return {
    directory,
    socketPath,
    service,
    client,
    close: async () => {
      await client.dispose();
      await service.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
const backend: NativeBackend = {
  prepare: async () => {},
  execute: async () => result,
};
test("real Unix socket health and execution retain full identity; socket is private", async () => {
  const f = await fixture(backend);
  try {
    assert.equal((await stat(f.socketPath)).mode & 0o777, 0o600);
    assert.equal((await f.client.health()).ready, true);
    assert.deepEqual(await f.client.run(request), result);
    const bad = new NativeExecutionClient({
      socketPath: f.socketPath,
      descriptor: { ...manifest.descriptor, pythonVersion: "3.12.99" },
      lane: "official",
    });
    await assert.rejects(bad.health());
    await bad.dispose();
  } finally {
    await f.close();
  }
});
test("fragmented request is accepted; oversized and slow frames close without executing", async () => {
  let calls = 0;
  const f = await fixture(
    {
      ...backend,
      execute: async () => {
        calls++;
        return result;
      },
    },
    { frameTimeoutMs: 40 },
  );
  try {
    const raw = {
      protocol: 1,
      id: randomUUID(),
      descriptor: manifest.descriptor,
      operation: "run",
      lane: "official",
      request,
    };
    const response = await new Promise<unknown>((resolve, reject) => {
      const socket = connect(f.socketPath);
      const decoder = new FrameDecoder();
      socket.on("error", reject);
      socket.on("data", (chunk) => {
        const x = decoder.push(chunk);
        if (x !== undefined) {
          resolve(x);
          socket.destroy();
        }
      });
      socket.once("connect", () => {
        const frame = encodeFrame(raw);
        for (let i = 0; i < frame.length; i += 7)
          socket.write(frame.subarray(i, i + 7));
      });
    });
    assert.ok(response);
    assert.equal(calls, 1);
    for (const bytes of [Buffer.from([255, 255, 255, 255]), Buffer.from([0])])
      await new Promise<void>((resolve, reject) => {
        const socket = connect(f.socketPath);
        socket.on("error", () => {});
        socket.once("connect", () => socket.write(bytes));
        socket.once("close", () => resolve());
        setTimeout(() => {
          socket.destroy();
          reject(new Error("Frame not bounded"));
        }, 500).unref();
      });
    assert.equal(calls, 1);
  } finally {
    await f.close();
  }
});
test("disconnect cancels execution; allocation remains draining through delayed cleanup", async () => {
  let started!: () => void, clean!: () => void;
  const start = new Promise<void>((r) => (started = r)),
    cleanup = new Promise<void>((r) => (clean = r));
  const f = await fixture({
    ...backend,
    execute: async (_request, signal, draining) => {
      started();
      await new Promise<void>((r) =>
        signal.addEventListener("abort", () => r(), { once: true }),
      );
      draining();
      await cleanup;
      throw new Error("cancelled");
    },
  });
  try {
    const controller = new AbortController();
    const run = f.client.run({ ...request, signal: controller.signal });
    await start;
    controller.abort();
    await assert.rejects(run);
    await delay(30);
    assert.equal(f.service.bank.snapshot().draining, 1);
    clean();
    await delay(30);
    assert.equal(f.service.bank.snapshot().draining, 0);
    assert.equal(f.service.bank.ready, true);
  } finally {
    clean();
    await f.close();
  }
});
test("server deadline aborts a held backend and waits for cleanup before reply", async () => {
  let cancelled = false;
  const f = await fixture(
    {
      ...backend,
      execute: async (_req, signal, draining) => {
        await new Promise<void>((r) =>
          signal.addEventListener("abort", () => r(), { once: true }),
        );
        cancelled = true;
        draining();
        await delay(20);
        throw new Error("cancelled");
      },
    },
    { startupAllowanceMs: 5, cleanupAllowanceMs: 5 },
  );
  try {
    await assert.rejects(f.client.run({ ...request, timeLimitMs: 5 }));
    assert.equal(cancelled, true);
    assert.equal(f.service.bank.snapshot().active, 0);
  } finally {
    await f.close();
  }
});
test("cleanup uncertainty quarantines held allocation and removes readiness", async () => {
  const f = await fixture({
    ...backend,
    execute: async () => {
      throw new CleanupUncertainError("lost child");
    },
  });
  try {
    await assert.rejects(f.client.run(request));
    const health = await f.client.health();
    assert.equal(health.ready, false);
    assert.equal(health.quarantined, 1);
  } finally {
    await f.close();
  }
});
test("client retries healthy busy capacity independently of learner allowance", async () => {
  const f = await fixture(backend);
  try {
    const a = f.service.bank.acquire(128, "official"),
      b = f.service.bank.acquire(128, "official");
    setTimeout(() => {
      a.cleaned();
      b.cleaned();
    }, 40);
    assert.deepEqual(
      await f.client.run({ ...request, timeLimitMs: 1 }),
      result,
    );
  } finally {
    await f.close();
  }
});
test("forged stdout cannot produce health and mismatched response correlation is rejected", async () => {
  const f = await fixture({
    ...backend,
    execute: async () => ({
      ...result,
      stdout: '{"ready":true,"generation":"forged"}',
    }),
  });
  try {
    assert.equal(
      (await f.client.run(request)).stdout.includes('"ready":true'),
      true,
    );
    assert.notEqual((await f.client.health()).generation, "forged");
  } finally {
    await f.close();
  }
  const dir = await mkdtemp("/tmp/cove-forged-");
  const path = join(dir, "s");
  const server = createServer((socket) =>
    socket.on("data", () =>
      socket.end(
        encodeFrame({
          protocol: 1,
          id: randomUUID(),
          descriptor: manifest.descriptor,
          generation: randomUUID(),
          result,
        }),
      ),
    ),
  );
  await new Promise<void>((r) => server.listen(path, r));
  const client = new NativeExecutionClient({
    socketPath: path,
    descriptor: manifest.descriptor,
    lane: "official",
  });
  try {
    await assert.rejects(client.run(request), /identity mismatch/);
  } finally {
    await client.dispose();
    await new Promise<void>((r) => server.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  }
});

test("client exposes trusted stage timings and separate busy acquisition", async () => {
  const f = await fixture({
    ...backend,
    execute: async () => ({
      ...result,
      timings: { startupMs: 3, executionMs: 1, cleanupMs: 7 },
    }),
  });
  try {
    const a = f.service.bank.acquire(128, "official"),
      b = f.service.bank.acquire(128, "official");
    setTimeout(() => {
      a.cleaned();
      b.cleaned();
    }, 20);
    const actual = await f.client.run(request);
    assert.equal(actual.timings?.startupMs, 3);
    assert.equal(actual.timings?.cleanupMs, 7);
    assert.equal(actual.timings?.executionMs, 1);
    assert.ok(actual.timings!.acquisitionMs! > 0);
  } finally {
    await f.close();
  }
});

test("a result is delivered before cleanup, which keeps memory charged until it ends", async () => {
  let clean!: () => void;
  const cleanup = new Promise<void>((r) => (clean = r));
  const f = await fixture({
    ...backend,
    execute: async (_request, _signal, draining, deliver) => {
      draining();
      deliver?.(result);
      await cleanup;
      return result;
    },
  });
  try {
    assert.deepEqual(await f.client.run(request), result);
    // Exited work holds no CPU slot, only its memory, until cleanup is proven.
    assert.deepEqual(
      { ...f.service.bank.snapshot(), idle: f.service.bank.idleSlots },
      { active: 0, draining: 1, quarantined: 0, standby: 0, memoryMb: 272, idle: 2 },
    );
    clean();
    await delay(20);
    assert.equal(f.service.bank.snapshot().draining, 0);
    assert.equal(f.service.bank.ready, true);
  } finally {
    clean();
    await f.close();
  }
});
test("cleanup uncertainty after an early result still quarantines the node", async () => {
  const f = await fixture({
    ...backend,
    execute: async (_request, _signal, draining, deliver) => {
      draining();
      deliver?.(result);
      await delay(10);
      throw new CleanupUncertainError("lost child");
    },
  });
  try {
    assert.deepEqual(await f.client.run(request), result);
    await delay(30);
    const health = await f.client.health();
    assert.equal(health.ready, false);
    assert.equal(health.quarantined, 1);
  } finally {
    await f.close();
  }
});
test("more workers than slots are answered busy and retried, never reset", async () => {
  const f = await fixture({
    ...backend,
    execute: async (_request, _signal, draining, deliver) => {
      await delay(2);
      draining();
      deliver?.(result);
      await delay(3);
      return result;
    },
  });
  const clients = Array.from({ length: 8 }, () => new NativeExecutionClient({
    socketPath: f.socketPath, descriptor: manifest.descriptor, lane: "official", acquisitionTimeoutMs: 5000,
  }));
  try {
    const results = await Promise.all(clients.map(async (client) => {
      for (let i = 0; i < 25; i++) assert.deepEqual(await client.run(request), result);
      return true;
    }));
    assert.equal(results.length, 8);
  } finally {
    await Promise.all(clients.map((client) => client.dispose()));
    await f.close();
  }
});
