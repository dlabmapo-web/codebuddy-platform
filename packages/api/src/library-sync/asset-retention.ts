import type { Prisma } from "../generated/prisma/client.js";
import { isBig, type CanonicalValue } from "./canonical.js";

/**
 * Asset retention for library sync (design §12).
 *
 * A release can be the only thing still referring to a PDF or video after
 * head office replaces it in the working tree, before any academy has synced.
 * Cleanup must therefore ask this table too, under the asset's own lock.
 * Retention never grants access: reads still go through an authorized
 * release, copy or conflict.
 */

export type RetainedAssetKind =
  | "PDF"
  | "VIDEO"
  | "CAPTION"
  | "MANUAL"
  | "LESSON_IMAGE";

/** Whether any retained snapshot value still refers to the asset. Call under the asset's row lock. */
export async function isAssetRetained(
  tx: Prisma.TransactionClient,
  kind: RetainedAssetKind,
  assetId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ retained: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM library_sync_asset_references
      WHERE asset_kind = ${kind}::"LibrarySyncAssetKind" AND asset_id = ${assetId}::uuid
    ) AS retained`;
  return rows?.[0]?.retained === true;
}

/**
 * Lesson images and multiple-choice images share one reference form, both
 * pointing at `ManualAsset` rows (`lesson-images.ts`, `choiceAssetIds`).
 */
const LESSON_IMAGE =
  /\bsrc\s*=\s*["']cove-asset:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})["']/gi;

export type AssetRef = { kind: RetainedAssetKind; assetId: string };

/**
 * Every asset a unit's full value refers to.
 *
 * Reads only full values: a digest has no text to scan, so retention is
 * always computed from values the store holds in full.
 */
export function assetRefsOf(
  unitKey: string,
  value: CanonicalValue,
): AssetRef[] {
  const refs: AssetRef[] = [];
  const scanText = (text: string) => {
    for (const match of text.matchAll(LESSON_IMAGE))
      refs.push({ kind: "LESSON_IMAGE", assetId: match[1]!.toLowerCase() });
  };
  const walk = (node: CanonicalValue) => {
    if (node === null || node === undefined) return;
    if (typeof node === "string") return scanText(node);
    if (typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (isBig(node)) {
      if ("$t" in node) scanText(node.$t);
      return;
    }
    for (const child of Object.values(node)) walk(child);
  };
  walk(value);

  const object =
    value && typeof value === "object" && !Array.isArray(value) && !isBig(value)
      ? (value as Record<string, CanonicalValue>)
      : null;
  if (unitKey === "pdf.file" && object && typeof object.assetId === "string")
    refs.push({ kind: "PDF", assetId: object.assetId });
  if (unitKey === "video.media" && object) {
    if (typeof object.assetId === "string")
      refs.push({ kind: "VIDEO", assetId: object.assetId });
  }
  if (
    unitKey === "video.instructions" &&
    object &&
    Array.isArray(object.assets)
  )
    for (const asset of object.assets as Array<Record<string, CanonicalValue>>)
      if (typeof asset.assetId === "string")
        refs.push({ kind: "MANUAL", assetId: asset.assetId });
  const itemAsset = /^manual\.(?:solution)?[aA]sset:(.+)$/.exec(unitKey);
  if (itemAsset) refs.push({ kind: "MANUAL", assetId: itemAsset[1]! });

  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.kind}:${ref.assetId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
