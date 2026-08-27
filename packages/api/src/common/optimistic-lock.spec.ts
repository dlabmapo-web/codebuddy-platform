import { describe, expect, it } from "vitest";

import { atRevision } from "./optimistic-lock.js";

describe("atRevision", () => {
  it("claims the millisecond it was given, not the instant", () => {
    const read = new Date("2026-07-31T01:22:42.700Z");

    // The row's stored value may carry microseconds Prisma never showed us —
    // 01:22:42.700123 reads back as .700Z. Equality against that Date matches
    // nothing; a half-open millisecond window matches it and nothing later.
    expect(atRevision(read)).toEqual({
      gte: new Date("2026-07-31T01:22:42.700Z"),
      lt: new Date("2026-07-31T01:22:42.701Z"),
    });
  });

  it("excludes the next millisecond, so a later write still loses the claim", () => {
    const { gte, lt } = atRevision(new Date("2026-07-31T01:22:42.700Z"));
    const rewritten = new Date("2026-07-31T01:22:42.701Z");

    expect(rewritten >= gte && rewritten < lt).toBe(false);
  });
});
