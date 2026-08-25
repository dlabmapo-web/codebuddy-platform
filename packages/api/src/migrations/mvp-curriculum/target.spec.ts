import { describe, expect, it } from "vitest";

import { normalizeDatabaseValue } from "./target.js";

describe("normalizeDatabaseValue", () => {
  it("treats equivalent database and source timestamps as equal", () => {
    const databaseValue = new Date("2026-08-24T18:05:02.832Z");
    const sourceValue = "2026-08-25T03:05:02.832637+09:00";

    expect(normalizeDatabaseValue(databaseValue, "created_at")).toBe(
      normalizeDatabaseValue(sourceValue, "created_at"),
    );
  });

  it("does not interpret ordinary text fields as timestamps", () => {
    const value = "2026-08-24T18:05:02.832Z";

    expect(normalizeDatabaseValue(value, "title")).toBe(value);
  });
});
