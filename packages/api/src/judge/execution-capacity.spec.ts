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
  it("lets a student's check go before AI learning and regrades already waiting (the campus courses design, §8)", async () => {
    const gate = new ExecutionCapacity(2);
    const running = deferred();
    const order: string[] = [];
    // One learning check holds the background slot; two more wait behind it.
    const first = gate.runBackground(async () => { order.push("learn 1"); await running.promise; }, "batch");
    await tick();
    const second = gate.runBackground(async () => { order.push("learn 2"); }, "batch");
    const third = gate.runBackground(async () => { order.push("regrade"); }, "batch");
    // A student presses AI help: it waits only for the check already running.
    const student = gate.tryBackground(Date.now() + 1_000).then((release) => { order.push("student"); release!(); });
    await tick();
    expect(gate.stats()).toEqual({ official: 0, background: 1, waiting: 3 });

    running.resolve();
    await Promise.all([first, second, third, student]);
    expect(order).toEqual(["learn 1", "student", "learn 2", "regrade"]);
  });

  it("still never makes Submit wait while interactive and batch work queue", async () => {
    const gate = new ExecutionCapacity(2);
    const running = deferred();
    const learning = gate.runBackground(() => running.promise, "batch");
    await tick();
    const waiting = gate.tryBackground(Date.now() + 1_000);
    let graded = false;
    await gate.runOfficial(async () => { graded = true; });
    expect(graded).toBe(true);
    running.resolve();
    await learning;
    (await waiting)!();
  });

  it("drops a student's check that waited past its deadline from the interactive line", async () => {
    const gate = new ExecutionCapacity(2);
    const running = deferred();
    const learning = gate.runBackground(() => running.promise, "batch");
    await tick();
    expect(await gate.tryBackground(Date.now() + 20)).toBeNull();
    expect(gate.stats().waiting).toBe(0);
    running.resolve();
    await learning;
  });

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
