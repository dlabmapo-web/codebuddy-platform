import { describe, expect, it, vi } from "vitest";

import { RateLimitService } from "./rate-limit.service.js";

describe("RateLimitService", () => {
  it("rejects requests above a fixed-window limit", () => {
    const limiter = new RateLimitService();
    limiter.assert("key", 2, 1_000);
    limiter.assert("key", 2, 1_000);
    expect(() => limiter.assert("key", 2, 1_000))
      .toThrowError(/Too many requests/);
  });

  it("starts a new window after expiry", () => {
    vi.useFakeTimers();
    const limiter = new RateLimitService();
    limiter.assert("key", 1, 1_000);
    vi.advanceTimersByTime(1_001);
    expect(() => limiter.assert("key", 1, 1_000)).not.toThrow();
    vi.useRealTimers();
  });
});
