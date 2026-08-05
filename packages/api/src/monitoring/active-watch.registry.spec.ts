import { describe, expect, it, vi } from "vitest";

import { ActiveWatchRegistry } from "./active-watch.registry.js";

function createRegistry(initial: string | null = null) {
  let active = initial;
  const redis = {
    eval: vi.fn(async (script: string, _keys: number, _key: string, value: string) => {
      if (script.includes("SET")) {
        const previous = active;
        active = value;
        return previous;
      }
      if (active === value) active = null;
      return 1;
    }),
    get: vi.fn(async () => active),
  };
  return { registry: new ActiveWatchRegistry(redis as never), redis };
}

describe("ActiveWatchRegistry", () => {
  it("atomically returns and replaces the previous visit", async () => {
    const { registry } = createRegistry("visit-old");
    await expect(registry.replace("teacher", "visit-new")).resolves.toBe(
      "visit-old",
    );
    await expect(registry.isActive("teacher", "visit-new")).resolves.toBe(true);
  });

  it("does not let an old socket clear the replacement", async () => {
    const { registry } = createRegistry("visit-new");
    await registry.clear("teacher", "visit-old");
    await expect(registry.isActive("teacher", "visit-new")).resolves.toBe(true);
  });

  it("fails closed without Redis", async () => {
    const registry = new ActiveWatchRegistry(null);
    await expect(registry.isActive("teacher", "visit")).resolves.toBe(false);
  });
});
