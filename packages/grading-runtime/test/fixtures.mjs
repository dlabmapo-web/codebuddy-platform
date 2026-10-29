import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Broker, Journal } from "../dist/index.js";
export const native = {
  version: 1,
  engine: "cpython",
  engineVersion: "3.12.16",
  pythonVersion: "3.12.16",
  platform: "linux",
  architecture: "amd64",
  imageDigest: "sha256:" + "1".repeat(64),
  packageManifestHash: "sha256:" + "2".repeat(64),
  shimVersion: "test-1",
  memoryPolicy: "native-cgroup-growth-v1",
  executionPolicy: "wall-v1",
};
export const compatibility = {
  ...native,
  engine: "pyodide",
  engineVersion: "0.27.5",
  pythonVersion: "3.12.7",
  imageDigest: "sha256:" + "3".repeat(64),
  memoryPolicy: "pyodide-charged-growth-v1",
};
export const manifest = {
  version: 1,
  compatibility,
  native,
  academyAllowances: [],
  certifications: [],
  historical: [],
  capabilities: {
    version: 1,
    protocol: 1,
    runtimes: [native, compatibility],
    nativeMemoryPolicy: "native-cgroup-growth-v1",
    maxActive: 2,
    maxBackground: 1,
    maxSpare: 0,
    nativeProfile: {
      packageProfile: "standard-library",
      pythonFamily: "3.12",
      memoryLimitMb: { min: 32, max: 256 },
      timeLimitMs: { min: 100, max: 60000 },
    },
    compatibilityProfile: {
      memoryLimitMb: { min: 16, max: 4096 },
      timeLimitMs: { min: 1, max: 60000 },
    },
    codeChars: 100000,
    stdinChars: 8388608,
    stdoutBytes: 8388608,
    stderrBytes: 262144,
  },
};
export const result = {
  stdout: "ok\n",
  stderr: "",
  outcome: "PASSED",
  runtimeMs: 1,
  outputTruncated: false,
};
export const input = {
  code: 'print("ok")',
  stdin: "",
  inputPromptPolicy: "INCLUDE",
  timeLimitMs: 1,
  memoryLimitMb: 128,
  outputLimitBytes: 8388608,
};
export class FakeDriver {
  events = [];
  guests = new Set();
  removeFails = false;
  runGate;
  createGate;
  async verify() {
    this.events.push(["verify"]);
  }
  async discover() {
    return [...this.guests];
  }
  async create(a, signal) {
    this.events.push(["create", a.id]);
    this.guests.add(a.id);
    if (this.createGate) await this.createGate;
    signal.throwIfAborted();
  }
  async ready(a, signal) {
    signal.throwIfAborted();
    this.events.push(["ready", a.id]);
  }
  async execute(a, request, signal) {
    this.events.push(["execute", a.id, request]);
    if (this.runGate) await this.runGate;
    signal.throwIfAborted();
    return this.result ?? result;
  }
  async remove(id) {
    this.events.push(["remove", id]);
    if (this.removeFails) throw new Error("unconfirmed");
    this.guests.delete(id);
  }
}
export async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "cove-broker-test-"));
  const driver = options.driver ?? new FakeDriver();
  const worker = randomUUID();
  const broker = new Broker(
    manifest,
    driver,
    new Journal(directory),
    worker,
    options.profiles ?? [
      { runtime: native, memoryLimitMb: 128, targetReady: 1 },
    ],
  );
  await broker.start();
  t.after(async () => {
    driver.removeFails = false;
    await broker.stop();
    await rm(directory, { recursive: true, force: true });
  });
  const context = {
    attemptId: randomUUID(),
    kind: "submission",
    caseId: "1",
    generation: 1,
    leaseToken: randomUUID(),
    workerGeneration: worker,
  };
  const send = (type, extra = {}) =>
    broker.handle({
      protocol: 1,
      requestId: randomUUID(),
      type,
      ...(type === "reserve" ? { admissionEpoch: 1 } : {}),
      ...(type === "health"
        ? {}
        : { brokerGeneration: broker.generation, context, runtime: native }),
      ...extra,
    });
  return { broker, driver, directory, worker, context, send };
}
export async function receipt(send, reservationId) {
  for (let i = 0; i < 100; i++) {
    const r = await send("receipt", { reservationId });
    if (r.type === "receipt" || r.type === "error") return r;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("Receipt polling bound exceeded");
}
