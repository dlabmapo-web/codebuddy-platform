import { describe, expect, it } from "vitest";

import {
  mergePreferredPositions,
  orderingWithItemAt,
} from "./content-positions.js";

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

describe("orderingWithItemAt", () => {
  const siblings = ["a", "b", "c"];

  it("inserts an item arriving from another parent at the index", () => {
    expect(orderingWithItemAt(siblings, "x", 0)).toEqual(["x", "a", "b", "c"]);
    expect(orderingWithItemAt(siblings, "x", 2)).toEqual(["a", "b", "x", "c"]);
    expect(orderingWithItemAt(siblings, "x", 3)).toEqual(["a", "b", "c", "x"]);
  });

  it("treats an index past the end as last", () => {
    expect(orderingWithItemAt(siblings, "x", 99)).toEqual(["a", "b", "c", "x"]);
  });

  it("moves an item already in the parent without duplicating it", () => {
    expect(orderingWithItemAt(siblings, "a", 2)).toEqual(["b", "c", "a"]);
    expect(orderingWithItemAt(siblings, "c", 0)).toEqual(["c", "a", "b"]);
    expect(orderingWithItemAt(siblings, "b", 1)).toEqual(["a", "b", "c"]);
  });

  it("places an item into an empty parent", () => {
    expect(orderingWithItemAt([], "x", 5)).toEqual(["x"]);
  });
});
