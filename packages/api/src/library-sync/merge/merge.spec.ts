import { describe, expect, it } from "vitest";

import { mergeOrder } from "./order.js";
import {
  planMerge,
  type OursNodeView,
  type PlanInput,
  type ReleaseNodeView,
} from "./plan.js";
import { ABSENT, decideUnit, UNKNOWN, valueRef } from "./units.js";

describe("decideUnit — the five rules (design §8.1)", () => {
  it.each([
    ["both unchanged", valueRef("b"), "b", "b", "CONVERGED"],
    ["only the library changed", valueRef("b"), "b", "t", "APPLIED"],
    ["only the academy changed", valueRef("b"), "o", "b", "KEPT"],
    ["both changed the same way", valueRef("b"), "x", "x", "CONVERGED"],
    ["both changed differently", valueRef("b"), "o", "t", "CONFLICT"],
  ] as const)("%s", (_label, base, ours, theirs, outcome) => {
    expect(decideUnit(base, ours, theirs).outcome).toBe(outcome);
  });

  it("asks when the base is unknown and the sides differ, and converges when they agree", () => {
    expect(decideUnit(UNKNOWN, "o", "t")).toEqual({
      outcome: "CONFLICT",
      conflictKind: "UNKNOWN_BASE",
    });
    expect(decideUnit(UNKNOWN, "x", "x").outcome).toBe("CONVERGED");
  });

  it.each([
    ["library adds an item", ABSENT, null, "t", "APPLIED"],
    ["academy adds an item", ABSENT, "o", null, "KEPT"],
    ["library removes an untouched item", valueRef("b"), "b", null, "APPLIED"],
    ["both removed it", valueRef("b"), null, null, "CONVERGED"],
    [
      "library keeps an item the academy removed",
      valueRef("b"),
      null,
      "b",
      "KEPT",
    ],
    ["add/add with different values", ABSENT, "o", "t", "CONFLICT"],
  ] as const)("keyed lists: %s", (_label, base, ours, theirs, outcome) => {
    expect(decideUnit(base, ours, theirs).outcome).toBe(outcome);
  });

  it("names removal and deletion conflicts", () => {
    expect(decideUnit(valueRef("b"), "o", null).conflictKind).toBe(
      "REMOVED_UPSTREAM_EDITED_LOCALLY",
    );
    expect(decideUnit(valueRef("b"), null, "t").conflictKind).toBe(
      "EDITED_UPSTREAM_DELETED_LOCALLY",
    );
  });
});

describe("mergeOrder (design §9.2)", () => {
  const members = (...keys: string[]) => new Set(keys);
  it("takes the library's reorder when the academy did not reorder", () => {
    expect(
      mergeOrder({
        base: ["a", "b", "c"],
        ours: ["a", "b", "c"],
        theirs: ["c", "a", "b"],
        members: members("a", "b", "c"),
      }),
    ).toEqual({ order: ["c", "a", "b"], outcome: "APPLIED" });
  });
  it("keeps the academy's reorder when the library did not reorder", () => {
    expect(
      mergeOrder({
        base: ["a", "b", "c"],
        ours: ["b", "a", "c"],
        theirs: ["a", "b", "c"],
        members: members("a", "b", "c"),
      }),
    ).toEqual({ order: ["b", "a", "c"], outcome: "KEPT" });
  });
  it("converges on the same reorder and flags different ones, keeping the academy's", () => {
    expect(
      mergeOrder({
        base: ["a", "b"],
        ours: ["b", "a"],
        theirs: ["b", "a"],
        members: members("a", "b"),
      }).outcome,
    ).toBe("CONVERGED");
    expect(
      mergeOrder({
        base: ["a", "b", "c"],
        ours: ["b", "a", "c"],
        theirs: ["a", "c", "b"],
        members: members("a", "b", "c"),
      }),
    ).toEqual({ order: ["b", "a", "c"], outcome: "CONFLICT" });
  });
  it("places additions after their own side's predecessor, library first at a shared anchor", () => {
    const result = mergeOrder({
      base: ["a", "b"],
      ours: ["a", "local", "b"],
      theirs: ["a", "new", "b"],
      members: members("a", "b", "local", "new"),
    });
    expect(result.order).toEqual(["a", "new", "local", "b"]);
  });
  it("never loses or duplicates a member", () => {
    const result = mergeOrder({
      base: ["a"],
      ours: ["x", "a"],
      theirs: ["a", "y"],
      members: members("a", "x", "y", "z"),
    });
    expect([...result.order].sort()).toEqual(["a", "x", "y", "z"]);
    expect(new Set(result.order).size).toBe(4);
  });
});

describe("planMerge — structure (design §9, §10)", () => {
  const node = (
    key: string,
    kind: ReleaseNodeView["kind"],
    parentKey: string | null,
    ordinal: number,
    unitHashes: Record<string, string> = {},
  ): ReleaseNodeView => ({
    key,
    kind,
    materialType: kind === "MATERIAL" ? "EXPLANATION" : null,
    parentKey,
    ordinal,
    unitHashes,
  });
  const ours = (
    view: ReleaseNodeView,
    linkState: OursNodeView["linkState"] = "LINKED",
  ): OursNodeView => ({
    ...view,
    localId: `row-${view.key}`,
    isVisible: true,
    linkState,
    orders: {},
  });
  const tree = (materials: ReleaseNodeView[]) => [
    node("C", "COURSE", null, 0),
    node("M", "MODULE", "C", 0),
    node("L", "LECTURE", "M", 0),
    ...materials,
  ];
  const input = (
    base: ReleaseNodeView[],
    theirs: ReleaseNodeView[],
    mine: OursNodeView[],
    extra: Partial<PlanInput> = {},
  ): PlanInput => ({
    courseKey: "C",
    base: new Map(base.map((view) => [view.key, view])),
    exceptions: new Map(),
    theirs: new Map(theirs.map((view) => [view.key, view])),
    ours: new Map(mine.map((view) => [view.key, view])),
    tombstones: new Map(),
    orderList: () => [],
    ...extra,
  });

  it("adds a library material and archives an untouched removed one", () => {
    const kept = node("A", "MATERIAL", "L", 0, { "material.title": "a" });
    const removed = node("B", "MATERIAL", "L", 1, { "material.title": "b" });
    const added = node("N", "MATERIAL", "L", 1, { "material.title": "n" });
    const base = tree([kept, removed]);
    const plan = planMerge(
      input(
        base,
        tree([kept, added]),
        base.map((view) => ours(view)),
      ),
    );
    expect(plan.adds).toEqual(["N"]);
    expect(plan.archives).toEqual(["B"]);
    expect(plan.nodeConflicts).toEqual([]);
  });

  it("asks before removing what the academy edited, and keeps local content", () => {
    const edited = node("B", "MATERIAL", "L", 0, { "material.title": "b" });
    const base = tree([edited]);
    const mine = base.map((view) =>
      ours(
        view.key === "B"
          ? { ...view, unitHashes: { "material.title": "mine" } }
          : view,
      ),
    );
    const plan = planMerge(input(base, tree([]), mine));
    expect(plan.archives).toEqual([]);
    expect(plan.nodeConflicts).toEqual([
      {
        nodeKey: "B",
        unitKey: "@presence",
        kind: "REMOVED_UPSTREAM_EDITED_LOCALLY",
      },
    ]);

    const local = ours(node("local:x", "MATERIAL", "L", 1), null);
    const lectureGone = planMerge(
      input(
        base,
        [node("C", "COURSE", null, 0), node("M", "MODULE", "C", 0)],
        [...base.map((view) => ours(view)), local],
      ),
    );
    expect(
      lectureGone.nodeConflicts.map((conflict) => conflict.kind),
    ).toContain("REMOVED_UPSTREAM_HAS_LOCAL_CONTENT");
  });

  it("does not recreate a parent the academy deleted", () => {
    const base = tree([]);
    const theirs = [
      ...base,
      node("N", "MATERIAL", "L", 0, { "material.title": "n" }),
    ];
    const mine = base
      .filter((view) => view.key !== "L")
      .map((view) => ours(view));
    const plan = planMerge(
      input(base, theirs, mine, {
        tombstones: new Map([["L", "LOCAL_DELETED"]]),
      }),
    );
    expect(plan.adds).toEqual([]);
    expect(plan.nodeConflicts).toEqual([
      {
        nodeKey: "N",
        unitKey: "@presence",
        kind: "PARENT_MISSING",
        detail: { parentKey: "L" },
      },
    ]);
  });

  it("keeps an academy deletion the library did not change, and asks when it did", () => {
    const material = node("A", "MATERIAL", "L", 0, { "material.title": "a" });
    const base = tree([material]);
    const mine = base
      .filter((view) => view.key !== "A")
      .map((view) => ours(view));
    const tombstones = new Map([["A", "LOCAL_DELETED" as const]]);
    expect(
      planMerge(input(base, base, mine, { tombstones })).nodeConflicts,
    ).toEqual([]);
    const changed = tree([
      { ...material, unitHashes: { "material.title": "new" } },
    ]);
    expect(
      planMerge(input(base, changed, mine, { tombstones })).nodeConflicts[0]
        ?.kind,
    ).toBe("EDITED_UPSTREAM_DELETED_LOCALLY");
  });

  it("merges independent fields of one material without a conflict", () => {
    const base = tree([
      node("E", "MATERIAL", "L", 0, {
        "exercise.description": "d",
        "exercise.testCase:k": "t1",
      }),
    ]);
    const theirs = tree([
      node("E", "MATERIAL", "L", 0, {
        "exercise.description": "d",
        "exercise.testCase:k": "t2",
      }),
    ]);
    const mine = tree([
      node("E", "MATERIAL", "L", 0, {
        "exercise.description": "mine",
        "exercise.testCase:k": "t1",
      }),
    ]).map((view) => ours(view));
    const plan = planMerge(input(base, theirs, mine));
    const outcomes = Object.fromEntries(
      plan.units
        .filter((unit) => unit.nodeKey === "E")
        .map((unit) => [unit.unitKey, unit.outcome]),
    );
    expect(outcomes).toEqual({
      "exercise.description": "KEPT",
      "exercise.testCase:k": "APPLIED",
    });
    expect(plan.nodeConflicts).toEqual([]);
  });
});
