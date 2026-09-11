import { describe, expect, it } from "vitest";

import { ExecutionCapacity } from "./execution-capacity.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe("ExecutionCapacity", () => {
  it("never makes official grading wait, even with background work queued", async () => {
    const gate = new ExecutionCapacity(2);
    const hold = await gate.tryBackground(Date.now() + 1_000);
    expect(hold).not.toBeNull();

    let ran = false;
    await gate.runOfficial(async () => {
      ran = true;
    });
    expect(ran).toBe(true);
    hold!();
  });

  it("keeps one slot for submissions: background work may hold total − 1", async () => {
    const gate = new ExecutionCapacity(3);
    const first = await gate.tryBackground(Date.now() + 1_000);
    const second = await gate.tryBackground(Date.now() + 1_000);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    // A third would take the reserved slot.
    expect(await gate.tryBackground(Date.now() + 30)).toBeNull();
    expect(gate.stats()).toEqual({ official: 0, background: 2, waiting: 0 });
    first!();
    second!();
  });

  it("counts regrades and sample checks against the same background limit", async () => {
    const gate = new ExecutionCapacity(2);
    const regrade = deferred();
    const running = gate.runBackground(() => regrade.promise);
    await tick();

    // The regrade holds the one background slot; practice cannot join it.
    expect(await gate.tryBackground(Date.now() + 30)).toBeNull();

    regrade.resolve();
    await running;
    const sample = await gate.tryBackground(Date.now() + 1_000);
    expect(sample).not.toBeNull();
    sample!();
  });

  it("with one slot, dispatches background work only while no official work runs", async () => {
    const gate = new ExecutionCapacity(1);
    const official = deferred();
    const grading = gate.runOfficial(() => official.promise);
    await tick();

    const waiting = gate.tryBackground(Date.now() + 1_000);
    await tick();
    expect(gate.stats().waiting).toBe(1);

    official.resolve();
    await grading;
    const release = await waiting;
    expect(release).not.toBeNull();
    release!();
  });

  it("admits waiting background work first come, first served", async () => {
    const gate = new ExecutionCapacity(2);
    const hold = await gate.tryBackground(Date.now() + 1_000);
    const order: string[] = [];
    const a = gate.tryBackground(Date.now() + 1_000).then((release) => {
      order.push("a");
      return release;
    });
    const b = gate.tryBackground(Date.now() + 1_000).then((release) => {
      order.push("b");
      return release;
    });
    await tick();

    hold!();
    (await a)!();
    (await b)!();
    expect(order).toEqual(["a", "b"]);
  });

  it("gives up at the deadline and leaves no waiter behind", async () => {
    const gate = new ExecutionCapacity(2);
    const hold = await gate.tryBackground(Date.now() + 1_000);

    expect(await gate.tryBackground(Date.now() + 20)).toBeNull();
    expect(gate.stats().waiting).toBe(0);
    hold!();
  });

  it("releases a slot once, however many times release is called", async () => {
    const gate = new ExecutionCapacity(2);
    const release = await gate.tryBackground(Date.now() + 1_000);
    release!();
    release!();
    expect(gate.stats().background).toBe(0);
  });
});
