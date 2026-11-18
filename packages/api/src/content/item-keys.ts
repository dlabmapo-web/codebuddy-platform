import { randomUUID } from "node:crypto";
import { HttpStatus } from "@nestjs/common";

import { AppException } from "../common/app-exception.js";

/**
 * Stable identity for replace-all lists: test cases, hints and solutions
 * (library sync design §5, plan Phase 2).
 *
 * Their rows are deleted and recreated on every save, so the row id is no
 * identity. `syncKey` is: a key the client round-trips is kept when it names
 * one of this parent's current items, and only once. A payload without keys —
 * an older client, a workbook — keeps an item's key only when its content
 * matches exactly one current item and no other incoming item: proved
 * correspondence, never position. Everything else gets a new key, which reads
 * as "removed and added", the conservative answer for library sync.
 */
export function resolveItemKeys(
  existing: ReadonlyArray<{ syncKey: string; fingerprint: string }>,
  incoming: ReadonlyArray<{ syncKey?: string | null; fingerprint: string }>,
): string[] {
  const current = new Set(existing.map((item) => item.syncKey));
  const used = new Set<string>();
  const keys: Array<string | null> = incoming.map((item) => {
    if (!item.syncKey) return null;
    if (!current.has(item.syncKey))
      throw new AppException("EXERCISE_VALIDATION_FAILED", HttpStatus.BAD_REQUEST, "syncKey: not an item of this exercise.");
    // A duplicated item is a new item.
    if (used.has(item.syncKey)) return randomUUID();
    used.add(item.syncKey);
    return item.syncKey;
  });

  const count = (values: readonly string[], value: string) => values.filter((candidate) => candidate === value).length;
  const existingPrints = existing.filter((item) => !used.has(item.syncKey)).map((item) => item.fingerprint);
  const incomingPrints = incoming.filter((_item, index) => keys[index] === null).map((item) => item.fingerprint);
  return keys.map((key, index) => {
    if (key) return key;
    const print = incoming[index]!.fingerprint;
    if (count(existingPrints, print) === 1 && count(incomingPrints, print) === 1) {
      const match = existing.find((item) => !used.has(item.syncKey) && item.fingerprint === print)!;
      used.add(match.syncKey);
      return match.syncKey;
    }
    return randomUUID();
  });
}

/** A content fingerprint over the fields that make an item what it is. */
export const fingerprint = (fields: Record<string, unknown>) =>
  JSON.stringify(Object.keys(fields).sort().map((key) => [key, fields[key] ?? null]));
