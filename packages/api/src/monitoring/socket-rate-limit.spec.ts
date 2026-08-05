import { describe, expect, it } from "vitest";

import {
  SocketRateLimiter,
  monitoringRateRules,
} from "./socket-rate-limit.js";

describe("SocketRateLimiter", () => {
  const now = 1_700_000_000_000;

  it("allows a burst up to the capacity", () => {
    const limiter = new SocketRateLimiter({ test: { capacity: 3, windowMs: 1_000 } });
    expect([1, 2, 3].map(() => limiter.take("test", now))).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("refuses once the bucket is empty", () => {
    const limiter = new SocketRateLimiter({ test: { capacity: 2, windowMs: 1_000 } });
    limiter.take("test", now);
    limiter.take("test", now);
    expect(limiter.take("test", now)).toBe(false);
  });

  it("refills over the window rather than resetting on a boundary", () => {
    const limiter = new SocketRateLimiter({ test: { capacity: 2, windowMs: 1_000 } });
    limiter.take("test", now);
    limiter.take("test", now);
    expect(limiter.take("test", now + 400)).toBe(false);
    expect(limiter.take("test", now + 600)).toBe(true);
  });

  it("meters each event family separately", () => {
    const limiter = new SocketRateLimiter({
      a: { capacity: 1, windowMs: 1_000 },
      b: { capacity: 1, windowMs: 1_000 },
    });
    expect(limiter.take("a", now)).toBe(true);
    expect(limiter.take("a", now)).toBe(false);
    expect(limiter.take("b", now)).toBe(true);
  });

  it("does not limit an event without a rule", () => {
    const limiter = new SocketRateLimiter({});
    expect([1, 2, 3].every(() => limiter.take("unmetered", now))).toBe(true);
  });
});

describe("monitoringRateRules", () => {
  it("gives cursors far more headroom than durable commands", () => {
    expect(monitoringRateRules["awareness.update"]!.capacity).toBeGreaterThan(
      monitoringRateRules["feedback.send"]!.capacity,
    );
  });

  it("bounds every command a client can send", () => {
    for (const event of [
      "class.join",
      "student.watch.start",
      "presence.publish",
      "document.sync",
      "document.update",
      "awareness.update",
      "run.activity",
      "feedback.send",
    ]) {
      expect(monitoringRateRules[event]).toBeDefined();
    }
  });
});
