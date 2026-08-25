import { describe, expect, it } from "vitest";

import { mergePreferredPositions } from "./content-positions.js";

describe("mergePreferredPositions", () => {
  it("places explicit workbook positions and preserves omitted sibling order", () => {
    expect(
      mergePreferredPositions(
        ["existing-a", "existing-b", "moved", "new-item"],
        [
          { id: "moved", position: 1 },
          { id: "new-item", position: 3 },
        ],
      ),
    ).toEqual(["moved", "existing-a", "new-item", "existing-b"]);
  });

  it("keeps blank-order creates appended in workbook write order", () => {
    expect(
      mergePreferredPositions(["existing", "new-a", "new-b"], [
        { id: "new-a", position: null },
        { id: "new-b", position: null },
      ]),
    ).toEqual(["existing", "new-a", "new-b"]);
  });

  it("treats an explicit position past the end as append", () => {
    expect(
      mergePreferredPositions(["existing", "new-item"], [
        { id: "new-item", position: 100 },
      ]),
    ).toEqual(["existing", "new-item"]);
  });
});
