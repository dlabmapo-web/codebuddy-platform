import { unitHash } from "../canonical.js";
import {
  isItemUnit,
  isMetaUnit,
  isOrderUnit,
  KEYED_LISTS,
  type NodeKind,
} from "../catalog.js";
import { mergeOrder } from "./order.js";
import {
  ABSENT,
  decideUnit,
  mergedHash,
  valueRef,
  type BaseRef,
  type ConflictKind,
  type UnitOutcome,
} from "./units.js";

/**
 * One copy's three-way merge, as a plan (design §§8–10). Pure.
 *
 * Inputs are hashes and structure only. The runner turns the plan into rows:
 * it fetches the values the plan needs, composes, validates, and writes.
 *
 * Removal is archive-only in this version: a node the library removed is
 * hidden and kept, never physically deleted, until the history-writer lock
 * protocol is proved (plan Phase 6 step 6).
 */

export type ReleaseNodeView = {
  key: string;
  kind: NodeKind;
  materialType: string | null;
  parentKey: string | null;
  ordinal: number;
  unitHashes: Record<string, string>;
};

export type OursNodeView = ReleaseNodeView & {
  localId: string;
  isVisible: boolean;
  /** LINKED or ARCHIVED for a linked row; null for an academy-local row. */
  linkState: "LINKED" | "ARCHIVED" | null;
  /** Item order lists, by order unit key, for this node's materials. */
  orders: Record<string, string[]>;
};

export type TombstoneState = "LOCAL_DELETED" | "DETACHED" | "CLOSED";

export type PlanInput = {
  courseKey: string;
  quarantined?: ReadonlySet<string>;
  structuralBase?: ReadonlyMap<string, string | null | string[]>;
  base: ReadonlyMap<string, ReleaseNodeView>;
  /** Exceptions to base, per node then unit (design D7). */
  exceptions: ReadonlyMap<string, ReadonlyMap<string, BaseRef>>;
  theirs: ReadonlyMap<string, ReleaseNodeView>;
  ours: ReadonlyMap<string, OursNodeView>;
  tombstones: ReadonlyMap<string, TombstoneState>;
  /** Base and theirs item order lists, resolved from the value store. */
  orderList(
    side: "base" | "theirs",
    nodeKey: string,
    unitKey: string,
  ): string[];
};

export type PlannedUnit = {
  nodeKey: string;
  unitKey: string;
  outcome: UnitOutcome;
  conflictKind?: ConflictKind;
  base: BaseRef;
  oursHash: string | null;
  theirsHash: string | null;
};

export type NodeConflict = {
  nodeKey: string;
  unitKey: "@presence" | "@parent" | "@order";
  kind: ConflictKind;
  detail?: Record<string, unknown>;
};

export type Plan = {
  units: PlannedUnit[];
  /** Library nodes to insert, parents before children. */
  adds: string[];
  /** Linked nodes to hide and keep because the library removed them. */
  archives: string[];
  /** Archived nodes the library offers again. */
  restores: string[];
  /** Links whose node is gone on both sides. */
  closes: string[];
  /** Final parent of every node whose parent changes, and of every addition. */
  parents: Map<string, string>;
  /** Final child order of every parent whose children change. */
  orders: Map<string, string[]>;
  /** Final item order per material and order unit, when it changes. */
  itemOrders: Map<string, Map<string, string[]>>;
  nodeConflicts: NodeConflict[];
  /** Base exceptions to keep after this run. */
  exceptions: Array<{ nodeKey: string; unitKey: string; base: BaseRef }>;
};

const PRESENCE = "@presence";

/** A turtle's solution-file map and its files, which live and die with it. */
const SOLUTION_FILES = "manual.solutionFiles@presence";
const SOLUTION_FILE = "manual.solutionFile:";
const SOLUTION_FILES_REMOVED = unitHash(SOLUTION_FILES, false);

function unitBase(
  input: PlanInput,
  base: ReleaseNodeView | undefined,
  nodeKey: string,
  unitKey: string,
): BaseRef {
  const exception = input.exceptions.get(nodeKey)?.get(unitKey);
  if (exception) return exception;
  return base ? valueRef(base.unitHashes[unitKey]) : ABSENT;
}

/** A node's base: the base release's, or one kept alive by a presence exception. */
function baseNode(
  input: PlanInput,
  key: string,
  ours?: OursNodeView,
): ReleaseNodeView | undefined {
  const node = input.base.get(key);
  if (node) return node;
  const exceptions = input.exceptions.get(key);
  if (!exceptions?.has(PRESENCE)) return undefined;
  const unitHashes: Record<string, string> = {};
  for (const [unitKey, ref] of exceptions)
    if (ref.state === "VALUE" && unitKey !== PRESENCE)
      unitHashes[unitKey] = ref.hash;
  return {
    key,
    kind: ours?.kind ?? "MATERIAL",
    materialType: ours?.materialType ?? null,
    parentKey: ours?.parentKey ?? null,
    ordinal: ours?.ordinal ?? 0,
    unitHashes,
  };
}

const sameUnits = (
  left: Record<string, string>,
  right: Record<string, string>,
) => {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) if (left[key] !== right[key]) return false;
  return true;
};

export function planMerge(input: PlanInput): Plan {
  const plan: Plan = {
    units: [],
    adds: [],
    archives: [],
    restores: [],
    closes: [],
    parents: new Map(),
    orders: new Map(),
    itemOrders: new Map(),
    nodeConflicts: [],
    exceptions: [],
  };

  /** Nodes present after this run, with their final parent. */
  const finalParent = new Map<string, string | null>();
  const archivedAfter = new Set<string>();
  for (const node of input.ours.values()) {
    finalParent.set(node.key, node.parentKey);
    if (node.linkState === "ARCHIVED") archivedAfter.add(node.key);
  }

  const keys = new Set<string>([
    ...input.base.keys(),
    ...input.theirs.keys(),
    ...[...input.ours.values()]
      .filter((node) => node.linkState !== null)
      .map((node) => node.key),
    ...input.tombstones.keys(),
    ...input.exceptions.keys(),
  ]);

  const both: string[] = [];
  const removedUpstream: string[] = [];

  for (const key of keys) {
    if (input.quarantined?.has(key)) {
      keepExceptions(plan, input, key);
      continue;
    }
    const tomb = input.tombstones.get(key);
    if (tomb === "DETACHED" || tomb === "CLOSED") continue;
    const ours = input.ours.get(key);
    const linked = ours && ours.linkState !== null ? ours : undefined;
    const theirs = input.theirs.get(key);
    const base = baseNode(input, key, linked);

    if (linked?.linkState === "ARCHIVED") {
      if (theirs) {
        plan.restores.push(key);
        archivedAfter.delete(key);
        both.push(key);
      }
      continue;
    }
    if (linked) {
      if (theirs) both.push(key);
      else if (base) removedUpstream.push(key);
      continue;
    }
    // No live row for this key in the copy.
    if (tomb === "LOCAL_DELETED") {
      if (!base && !theirs) continue;
      if (base && !theirs) {
        plan.closes.push(key);
        continue;
      }
      if (
        base &&
        theirs &&
        sameUnits(base.unitHashes, theirs.unitHashes) &&
        base.parentKey === theirs.parentKey
      ) {
        // The academy deleted it and the library did not change it: stays deleted.
        keepExceptions(plan, input, key);
        continue;
      }
      plan.nodeConflicts.push({
        nodeKey: key,
        unitKey: "@presence",
        kind: "EDITED_UPSTREAM_DELETED_LOCALLY",
      });
      keepNodeBase(plan, input, key, base);
      continue;
    }
    if (theirs) plan.adds.push(key);
  }

  // Parents first, so an addition can land inside another addition.
  const depth = (key: string): number => {
    let level = 0;
    for (
      let cursor = input.theirs.get(key)?.parentKey;
      cursor;
      cursor = input.theirs.get(cursor)?.parentKey
    )
      level += 1;
    return level;
  };
  plan.adds.sort(
    (left, right) =>
      depth(left) - depth(right) || compareTheirs(input, left, right),
  );

  const available = (key: string | null | undefined) =>
    !!key && finalParent.has(key) && !archivedAfter.has(key);

  const acceptedAdds: string[] = [];
  for (const key of plan.adds) {
    const theirs = input.theirs.get(key)!;
    if (theirs.parentKey !== null && !available(theirs.parentKey)) {
      // Do not recreate a parent the academy removed; the children follow
      // once the parent's conflict is decided.
      if (
        !input.theirs.has(theirs.parentKey) ||
        finalParent.has(theirs.parentKey) ||
        input.tombstones.has(theirs.parentKey)
      )
        plan.nodeConflicts.push({
          nodeKey: key,
          unitKey: "@presence",
          kind: "PARENT_MISSING",
          detail: { parentKey: theirs.parentKey },
        });
      continue;
    }
    acceptedAdds.push(key);
    finalParent.set(key, theirs.parentKey);
    if (theirs.parentKey !== null) plan.parents.set(key, theirs.parentKey);
  }
  plan.adds = acceptedAdds;

  // Parents of nodes present on every side (design §9.2, first bullet).
  for (const key of both) {
    const ours = input.ours.get(key)!;
    const theirs = input.theirs.get(key)!;
    const base = baseNode(input, key, ours);
    if (ours.kind === "COURSE") continue;
    const oursParent = ours.parentKey;
    const theirsParent = theirs.parentKey;
    const savedParent = input.structuralBase?.get(key + "@parent");
    const baseParent =
      savedParent === undefined
        ? (base?.parentKey ?? null)
        : (savedParent as string | null);
    if (oursParent === theirsParent) continue;
    if (input.exceptions.get(key)?.get("@parent")?.state === "UNKNOWN") {
      plan.nodeConflicts.push({
        nodeKey: key,
        unitKey: "@parent",
        kind: "PLACEMENT",
      });
      plan.exceptions.push({
        nodeKey: key,
        unitKey: "@parent",
        base: { state: "UNKNOWN" },
      });
      continue;
    }
    if (oursParent === baseParent) {
      if (available(theirsParent)) {
        finalParent.set(key, theirsParent);
        plan.parents.set(key, theirsParent!);
      } else {
        plan.nodeConflicts.push({
          nodeKey: key,
          unitKey: "@parent",
          kind: "PARENT_MISSING",
          detail: { parentKey: theirsParent },
        });
      }
    } else if (theirsParent !== baseParent) {
      plan.nodeConflicts.push({
        nodeKey: key,
        unitKey: "@parent",
        kind: "PLACEMENT",
      });
    }
  }

  // Removals: archive what is untouched, ask about anything the academy changed.
  const childrenOf = (parentKey: string) =>
    [...finalParent.entries()]
      .filter(([, parent]) => parent === parentKey)
      .map(([child]) => child);
  const removed = new Set(removedUpstream);
  const untouched = (key: string): boolean => {
    const ours = input.ours.get(key)!;
    const base = baseNode(input, key, ours);
    if (!base) return false;
    const unitKeys = new Set([
      ...Object.keys(base.unitHashes),
      ...Object.keys(ours.unitHashes),
    ]);
    for (const unitKey of unitKeys) {
      if (isMetaUnit(unitKey)) continue;
      if (
        unitBaseHash(unitBase(input, base, key, unitKey)) !==
        (ours.unitHashes[unitKey] ?? null)
      )
        return false;
    }
    return ours.parentKey === base.parentKey;
  };
  const subtreeState = (key: string): "UNTOUCHED" | "EDITED" | "LOCAL" => {
    let state: "UNTOUCHED" | "EDITED" | "LOCAL" = untouched(key)
      ? "UNTOUCHED"
      : "EDITED";
    for (const child of childrenOf(key)) {
      const node = input.ours.get(child);
      if (!node || node.linkState === null) return "LOCAL";
      if (node.linkState === "ARCHIVED") continue;
      if (!removed.has(child)) return "LOCAL";
      const childState = subtreeState(child);
      if (childState === "LOCAL") return "LOCAL";
      if (childState === "EDITED") state = "EDITED";
    }
    return state;
  };
  const archivedNow = new Set<string>();
  const archiveSubtree = (key: string) => {
    if (archivedNow.has(key)) return;
    archivedNow.add(key);
    plan.archives.push(key);
    archivedAfter.add(key);
    keepNodeBase(plan, input, key, baseNode(input, key, input.ours.get(key)));
    for (const child of childrenOf(key))
      if (removed.has(child)) archiveSubtree(child);
  };
  // Top-down, so a removed module is decided before its removed lectures.
  const removalDepth = (key: string): number => {
    let level = 0;
    for (
      let cursor = input.ours.get(key)?.parentKey;
      cursor;
      cursor = input.ours.get(cursor)?.parentKey
    )
      level += 1;
    return level;
  };
  for (const key of [...removed].sort(
    (left, right) => removalDepth(left) - removalDepth(right),
  )) {
    if (archivedNow.has(key)) continue;
    const state = subtreeState(key);
    if (state === "UNTOUCHED") {
      archiveSubtree(key);
      continue;
    }
    plan.nodeConflicts.push({
      nodeKey: key,
      unitKey: "@presence",
      kind:
        state === "LOCAL"
          ? "REMOVED_UPSTREAM_HAS_LOCAL_CONTENT"
          : "REMOVED_UPSTREAM_EDITED_LOCALLY",
    });
    keepNodeBase(plan, input, key, baseNode(input, key, input.ours.get(key)));
  }

  // Units of nodes present on every side (and of restored ones).
  for (const key of both) planNodeUnits(plan, input, key);

  // Sibling order of every parent that still exists.
  const parents = new Set<string>();
  for (const parent of finalParent.values())
    if (parent !== null && finalParent.has(parent)) parents.add(parent);
  for (const node of input.ours.values())
    if (node.parentKey) parents.add(node.parentKey);
  for (const parentKey of parents) {
    if (!finalParent.has(parentKey)) continue;
    if (
      [...input.theirs.values()].some(
        (n) => n.parentKey === parentKey && input.quarantined?.has(n.key),
      )
    ) {
      const ref = input.exceptions.get(parentKey)?.get("@order");
      if (ref)
        plan.exceptions.push({
          nodeKey: parentKey,
          unitKey: "@order",
          base: ref,
        });
      // Preserve existing placement while identities are unresolved, but give
      // approved additions real, unique positions before the next run.
      const existing = [...input.ours.values()]
        .filter((n) => n.parentKey === parentKey)
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((n) => n.key);
      const added = childrenOf(parentKey).filter(
        (key) => !existing.includes(key),
      );
      if (added.length) plan.orders.set(parentKey, [...existing, ...added]);
      continue;
    }
    const members = new Set(childrenOf(parentKey));
    const ordered = (nodes: Iterable<ReleaseNodeView>) =>
      [...nodes]
        .filter((node) => node.parentKey === parentKey)
        .sort(
          (left, right) =>
            left.ordinal - right.ordinal || left.key.localeCompare(right.key),
        )
        .map((node) => node.key);
    const oursList = ordered(input.ours.values());
    if (input.exceptions.get(parentKey)?.get("@order")?.state === "UNKNOWN") {
      const linkedOrder = oursList.filter(
        (k) => input.theirs.get(k)?.parentKey === parentKey,
      );
      const incoming = ordered(input.theirs.values()).filter((k) =>
        linkedOrder.includes(k),
      );
      if (linkedOrder.some((k, i) => k !== incoming[i])) {
        plan.nodeConflicts.push({
          nodeKey: parentKey,
          unitKey: "@order",
          kind: "PLACEMENT",
        });
        plan.exceptions.push({
          nodeKey: parentKey,
          unitKey: "@order",
          base: { state: "UNKNOWN" },
        });
      }
      continue;
    }
    const merged = mergeOrder({
      base:
        (input.structuralBase?.get(parentKey + "@order") as
          | string[]
          | undefined) ?? ordered(input.base.values()),
      ours: oursList,
      theirs: ordered(input.theirs.values()),
      members,
    });
    if (merged.outcome === "CONFLICT")
      plan.nodeConflicts.push({
        nodeKey: parentKey,
        unitKey: "@order",
        kind: "PLACEMENT",
      });
    const changed =
      merged.order.length !== oursList.length ||
      merged.order.some((key, index) => key !== oursList[index]);
    if (changed) plan.orders.set(parentKey, merged.order);
  }

  // Exceptions of archived nodes that stay archived survive the run.
  for (const node of input.ours.values())
    if (node.linkState === "ARCHIVED" && !plan.restores.includes(node.key))
      keepExceptions(plan, input, node.key);

  return plan;
}

function unitBaseHash(ref: BaseRef) {
  return ref.state === "VALUE" ? ref.hash : null;
}

function compareTheirs(input: PlanInput, left: string, right: string) {
  const a = input.theirs.get(left)!;
  const b = input.theirs.get(right)!;
  return (
    (a.parentKey ?? "").localeCompare(b.parentKey ?? "") ||
    a.ordinal - b.ordinal
  );
}

/** Keep a node's current exceptions as they are. */
function keepExceptions(plan: Plan, input: PlanInput, key: string) {
  for (const [unitKey, base] of input.exceptions.get(key) ?? [])
    plan.exceptions.push({ nodeKey: key, unitKey, base });
}

/**
 * Pin a node's base while a structural decision is open, or while it is
 * archived: its units keep the base they had, and `@presence` keeps the node
 * in base after the release that removed it has become the base release.
 */
function keepNodeBase(
  plan: Plan,
  input: PlanInput,
  key: string,
  base: ReleaseNodeView | undefined,
) {
  const recorded = new Set<string>();
  for (const [unitKey, ref] of input.exceptions.get(key) ?? []) {
    plan.exceptions.push({ nodeKey: key, unitKey, base: ref });
    recorded.add(unitKey);
  }
  for (const [unitKey, hash] of Object.entries(base?.unitHashes ?? {}))
    if (!recorded.has(unitKey))
      plan.exceptions.push({
        nodeKey: key,
        unitKey,
        base: { state: "VALUE", hash },
      });
  if (!recorded.has(PRESENCE))
    plan.exceptions.push({
      nodeKey: key,
      unitKey: PRESENCE,
      base: { state: "VALUE", hash: `presence:${key}` },
    });
}

function planNodeUnits(plan: Plan, input: PlanInput, key: string) {
  const ours = input.ours.get(key)!;
  const theirs = input.theirs.get(key)!;
  const base = baseNode(input, key, ours);
  const unitKeys = new Set<string>([
    ...Object.keys(base?.unitHashes ?? {}),
    ...[...(input.exceptions.get(key)?.keys() ?? [])].filter(
      (unitKey) => unitKey !== PRESENCE,
    ),
    ...Object.keys(theirs.unitHashes),
    ...Object.keys(ours.unitHashes),
  ]);

  const merged = new Map<string, string | null>();
  const planned = new Map<string, PlannedUnit>();
  for (const unitKey of unitKeys) {
    if (isOrderUnit(unitKey) || isMetaUnit(unitKey)) continue;
    const ref = unitBase(input, base, key, unitKey);
    const oursHash = ours.unitHashes[unitKey] ?? null;
    const theirsHash = theirs.unitHashes[unitKey] ?? null;
    const decision = decideUnit(ref, oursHash, theirsHash);
    const unit: PlannedUnit = {
      nodeKey: key,
      unitKey,
      ...decision,
      base: ref,
      oursHash,
      theirsHash,
    };
    plan.units.push(unit);
    planned.set(unitKey, unit);
    if (decision.outcome === "CONFLICT")
      plan.exceptions.push({ nodeKey: key, unitKey, base: ref });
    merged.set(unitKey, mergedHash(decision, oursHash, theirsHash));
  }

  // Removing the solution-file map drops every file in it, so it waits while
  // a file survives this merge: one the academy edited (its conflict keeps
  // it) or added. Its base stays pinned, so the removal applies once no file
  // is left, for instance after the academy accepts the library's removal.
  const map = planned.get(SOLUTION_FILES);
  if (
    map?.outcome === "APPLIED" &&
    map.theirsHash === SOLUTION_FILES_REMOVED &&
    [...merged].some(
      ([unitKey, hash]) => unitKey.startsWith(SOLUTION_FILE) && hash !== null,
    )
  ) {
    map.outcome = "KEPT";
    plan.exceptions.push({
      nodeKey: key,
      unitKey: SOLUTION_FILES,
      base: map.base,
    });
    merged.set(SOLUTION_FILES, map.oursHash);
  }

  // Item order: the shared items' relative order by the five rules, then
  // every surviving item placed (design §8.2).
  for (const list of KEYED_LISTS) {
    if (!list.order || !unitKeys.has(list.order)) continue;
    const prefix = list.item;
    const members = new Set(
      [...merged.entries()]
        .filter(
          ([unitKey, hash]) => unitKey.startsWith(prefix) && hash !== null,
        )
        .map(([unitKey]) => unitKey.slice(prefix.length)),
    );
    const oursList = ours.orders[list.order] ?? [];
    const result = mergeOrder({
      base:
        base?.unitHashes[list.order] ||
        input.exceptions.get(key)?.has(list.order)
          ? input.orderList("base", key, list.order)
          : [],
      ours: oursList,
      theirs: input.orderList("theirs", key, list.order),
      members,
    });
    const ref = unitBase(input, base, key, list.order);
    const oursHash = ours.unitHashes[list.order] ?? null;
    const theirsHash = theirs.unitHashes[list.order] ?? null;
    if (ref.state === "UNKNOWN" && oursHash !== theirsHash) {
      plan.units.push({
        nodeKey: key,
        unitKey: list.order,
        outcome: "CONFLICT",
        conflictKind: "UNKNOWN_BASE",
        base: ref,
        oursHash,
        theirsHash,
      });
      plan.exceptions.push({ nodeKey: key, unitKey: list.order, base: ref });
      continue;
    }
    const changed =
      result.order.length !== oursList.length ||
      result.order.some((item, index) => item !== oursList[index]);
    const outcome: UnitOutcome =
      result.outcome === "CONFLICT"
        ? "CONFLICT"
        : changed
          ? "APPLIED"
          : oursHash === theirsHash
            ? "CONVERGED"
            : "KEPT";
    plan.units.push({
      nodeKey: key,
      unitKey: list.order,
      outcome,
      ...(outcome === "CONFLICT" ? { conflictKind: "PLACEMENT" as const } : {}),
      base: ref,
      oursHash,
      theirsHash,
    });
    if (outcome === "CONFLICT")
      plan.exceptions.push({ nodeKey: key, unitKey: list.order, base: ref });
    if (changed) {
      const orders = plan.itemOrders.get(key) ?? new Map<string, string[]>();
      orders.set(list.order, result.order);
      plan.itemOrders.set(key, orders);
    }
  }
}

/** Whether any unit of a node is written by this plan. */
export function touchedNodes(plan: Plan): Set<string> {
  const touched = new Set<string>();
  for (const unit of plan.units)
    if (unit.outcome === "APPLIED") touched.add(unit.nodeKey);
  for (const key of plan.itemOrders.keys()) touched.add(key);
  return touched;
}

export { isItemUnit };
