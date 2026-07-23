import { describe, expect, it } from "vitest";

import { hasAnotherActiveManager } from "./academy-membership.service.js";

describe("last active manager protection", () => {
  it("rejects changing the only active manager", () => {
    expect(hasAnotherActiveManager([{ id: "manager-1" }], "manager-1"))
      .toBe(false);
  });

  it("allows a manager change when another active manager remains", () => {
    expect(hasAnotherActiveManager(
      [{ id: "manager-1" }, { id: "manager-2" }],
      "manager-1",
    )).toBe(true);
  });
});
