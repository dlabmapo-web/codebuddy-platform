import { unitHash, type CanonicalValue } from "./canonical.js";
import { isOrderUnit, type SyncNode } from "./catalog.js";
import type { OursNodeView, ReleaseNodeView } from "./merge/plan.js";

/** A node's unit hashes. */
export function hashUnits(
  units: Record<string, CanonicalValue>,
): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const [unitKey, value] of Object.entries(units))
    hashes[unitKey] = unitHash(unitKey, value);
  return hashes;
}

export function releaseView(node: SyncNode): ReleaseNodeView {
  return {
    key: node.key,
    kind: node.kind,
    materialType: node.materialType,
    parentKey: node.parentKey,
    ordinal: node.ordinal,
    unitHashes: hashUnits(node.units),
  };
}

export function oursView(
  node: SyncNode,
  linkState: OursNodeView["linkState"],
): OursNodeView {
  const orders: Record<string, string[]> = {};
  for (const [unitKey, value] of Object.entries(node.units))
    if (isOrderUnit(unitKey) && Array.isArray(value))
      orders[unitKey] = value as string[];
  return {
    ...releaseView(node),
    localId: node.localId,
    isVisible: node.isVisible,
    linkState,
    orders,
  };
}

/** Release node rows as stored, back into views. */
export function storedReleaseView(row: {
  nodeKey: string;
  kind: string;
  materialType: string | null;
  parentKey: string | null;
  ordinal: number;
  unitHashes: unknown;
}): ReleaseNodeView {
  return {
    key: row.nodeKey,
    kind: row.kind as ReleaseNodeView["kind"],
    materialType: row.materialType,
    parentKey: row.parentKey,
    ordinal: row.ordinal,
    unitHashes: (row.unitHashes ?? {}) as Record<string, string>,
  };
}
