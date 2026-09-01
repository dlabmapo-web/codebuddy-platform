import { describe, expect, it } from "vitest";

import {
  currentSupportGrantId,
  runInRequestContext,
  setRequestSupportGrant,
} from "./request-context.js";

describe("request context", () => {
  it("carries a grant to a reader deep in the same request", async () => {
    // The whole point: 18 services sit between the access check and the audit
    // write, and none of them has to know this exists.
    await runInRequestContext(async () => {
      setRequestSupportGrant("grant-1");
      await Promise.resolve();
      expect(currentSupportGrantId()).toBe("grant-1");
    });
  });

  it("keeps concurrent requests apart", async () => {
    // The failure this would cause is the worst one available: one operator's
    // grant attributed to another operator's edit.
    const [first, second] = await Promise.all([
      runInRequestContext(async () => {
        setRequestSupportGrant("grant-a");
        await new Promise((resolve) => setTimeout(resolve, 5));
        return currentSupportGrantId();
      }),
      runInRequestContext(async () => {
        setRequestSupportGrant("grant-b");
        return currentSupportGrantId();
      }),
    ]);

    expect(first).toBe("grant-a");
    expect(second).toBe("grant-b");
  });

  it("reports nothing for a request that used no grant", () => {
    runInRequestContext(() => {
      expect(currentSupportGrantId()).toBeUndefined();
    });
  });

  it("does not throw outside a request", () => {
    // Background jobs, socket frames, and unit tests all call through here.
    expect(() => setRequestSupportGrant("grant-x")).not.toThrow();
    expect(currentSupportGrantId()).toBeUndefined();
  });
});
