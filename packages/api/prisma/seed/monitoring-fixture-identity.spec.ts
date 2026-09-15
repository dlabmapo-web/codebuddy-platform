import { describe, expect, it } from "vitest";
import { e2eContent } from "./e2e-content.js";
import { progressFixture } from "./progress-fixtures.js";

describe("monitoring browser fixtures", () => {
  it("keeps the stored CRLF exercise distinct from every other seeded problem", () => {
    const ids = [e2eContent.echoMaterialId, e2eContent.sumMaterialId, e2eContent.hiddenMaterialId, e2eContent.crlfMaterialId, progressFixture.materialId];
    expect(new Set(ids).size).toBe(ids.length);
    expect(e2eContent.crlfStarterCode).toContain("\r\n");
  });
});
